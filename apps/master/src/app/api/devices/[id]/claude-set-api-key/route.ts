import { NextRequest } from 'next/server';
import { getAuthUser } from "@/lib/auth";
import { requireActiveAccess } from "@/lib/access";
import { queryOne, query } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import { rateLimit } from '@/lib/rate-limit';
import { requireCsrf } from '@/lib/csrf';
import type { ExecRequest, ExecStdout, ExecStderr, ExecExit } from '@autmzr/command-protocol';

/**
 * POST /api/devices/[id]/claude-set-api-key  { apiKey: "sk-ant-..." }
 *
 * Через exec на agent создаём systemd-override:
 *   /etc/systemd/system/<service>.service.d/api-key.conf
 * с Environment=ANTHROPIC_API_KEY=…, daemon-reload, restart.
 * <service> = autmzr-command-agent (новое имя) или pocket-claude-agent (legacy).
 * После рестарта agent получает ключ в env и bash -lc 'claude' его видит.
 *
 * Plus: пишем в /root/.bashrc / /root/.profile (для интерактивных PTY-сессий).
 *
 * API-ключ в БД НЕ ПИШЕМ — живёт только на устройстве.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'claude-set-key', max: 5, windowMs: 60_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const body = await req.json().catch(() => ({}));
  const apiKey = String(body?.apiKey || '').trim();
  if (!apiKey.startsWith('sk-ant-')) {
    return new Response('Bad API key (must start with sk-ant-)', { status: 400 });
  }

  const device = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return new Response('Device not found', { status: 404 });
  if (!hub().isOnline(deviceId)) return new Response('Device offline', { status: 503 });

  const deviceIdSafe = device.id;
  const userIdSafe = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      // Экранируем ключ для bash single-quote.
      const escapedKey = apiKey.replace(/'/g, `'\\''`);

      // Команда собирает: systemd override + ~/.bashrc + ~/.profile
      // и проверяет что claude --version работает с этим ключом.
      // Поддерживаем оба имени сервиса (новое + legacy) — мигрировать одной командой
      // ВСЕХ существующих агентов мы не можем, поэтому пишем в тот, который реально стоит.
      const cmd = [
        `set -e`,
        // 1. systemd override для agent'а — определяем имя сервиса (новое или legacy)
        `SVC=""`,
        `if [ -f /etc/systemd/system/autmzr-command-agent.service ]; then SVC=autmzr-command-agent; fi`,
        `if [ -z "$SVC" ] && [ -f /etc/systemd/system/pocket-claude-agent.service ]; then SVC=pocket-claude-agent; fi`,
        `if [ -n "$SVC" ]; then`,
        `  mkdir -p /etc/systemd/system/$SVC.service.d/`,
        `  cat > /etc/systemd/system/$SVC.service.d/api-key.conf <<EOF`,
        `[Service]`,
        `Environment=ANTHROPIC_API_KEY=${escapedKey}`,
        `EOF`,
        `  chmod 600 /etc/systemd/system/$SVC.service.d/api-key.conf`,
        `  systemctl daemon-reload`,
        `  echo "[info] systemd override written for $SVC"`,
        `fi`,
        // 2. В ~/.bashrc / ~/.profile для интерактивных shell (чтобы PTY тоже видел)
        `for f in ~/.bashrc ~/.profile; do`,
        `  touch "$f"`,
        `  # Удалим старую строку если есть`,
        `  sed -i '/^export ANTHROPIC_API_KEY=/d' "$f"`,
        `  echo "export ANTHROPIC_API_KEY='${escapedKey}'" >> "$f"`,
        `  chmod 600 "$f"`,
        `done`,
        `echo "[info] ~/.bashrc + ~/.profile updated"`,
        // 3. Проверяем что claude --version работает (login-shell подтянет ключ)
        `if bash -lc 'claude --version' 2>&1; then`,
        `  echo "[ok] claude works"`,
        `else`,
        `  echo "[warn] claude --version дал ошибку, но ключ записан"`,
        `fi`,
        // 4. Рестартим agent через nohup+disown — detached, чтобы наш exec успел
        //    вернуть exit и SSE закрылся до того как systemd нас убьёт.
        `if [ -n "$SVC" ] && systemctl is-active --quiet "$SVC" 2>/dev/null; then`,
        `  nohup bash -c "sleep 2 && systemctl restart $SVC" >/dev/null 2>&1 &`,
        `  disown 2>/dev/null || true`,
        `  echo "[info] $SVC restart запланирован через 2с (detached)"`,
        `fi`,
      ].join('\n');

      const execId = uuidv4();
      const execMsg: ExecRequest = {
        type: 'exec', id: execId, cwd: '/root', cmd, timeout_ms: 30_000,
      };

      push({ type: 'start' });

      let exitCode: number | null = null;
      const unsub = hub().send(deviceIdSafe, userIdSafe, execMsg, (reply) => {
        if (reply.type === 'exec.stdout') {
          push({ type: 'out', text: (reply as ExecStdout).text });
        } else if (reply.type === 'exec.stderr') {
          push({ type: 'err', text: (reply as ExecStderr).text });
        } else if (reply.type === 'exec.exit') {
          exitCode = (reply as ExecExit).code;
          push({ type: 'exit', code: exitCode });
          unsub();
          finalize().finally(() => { try { controller.close(); } catch {} });
        }
      });

      async function finalize() {
        if (exitCode === 0) {
          // Обновляем статус в БД — logged_in=true. probeClaude при следующем
          // hello это всё равно пересчитает, но обновим сразу для отзывчивого UI.
          await query(
            `UPDATE pc.devices SET agent_logged_in = true WHERE id = $1`,
            [deviceIdSafe],
          ).catch(() => {});
          push({ type: 'ok', message: 'API-ключ сохранён, агент перезапущен' });
        } else {
          push({ type: 'error', message: `exit code ${exitCode}` });
        }
      }

      req.signal?.addEventListener('abort', () => {
        try { unsub(); } catch {}
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
