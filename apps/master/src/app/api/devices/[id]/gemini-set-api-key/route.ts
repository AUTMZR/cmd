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
 * POST /api/devices/[id]/gemini-set-api-key  { apiKey: "..." }
 *
 * Записывает GEMINI_API_KEY на устройстве:
 *   - в systemd-override (для agent-процесса)
 *   - в ~/.bashrc / ~/.profile (для интерактивных PTY-сессий)
 *   - в ~/.gemini/settings.json (для CLI-autodetect)
 *
 * Ключ в нашей БД не пишется — живёт только на устройстве.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'gemini-set-key', max: 5, windowMs: 60_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const body = await req.json().catch(() => ({}));
  const apiKey = String(body?.apiKey || '').trim();
  // Gemini API keys — обычно AIza... (39 символов), но Google может менять формат.
  if (apiKey.length < 20 || apiKey.length > 200) {
    return new Response('Bad API key (ожидаем строку 20-200 символов)', { status: 400 });
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

      const escapedKey = apiKey.replace(/'/g, `'\\''`);

      const cmd = [
        `set -e`,
        // 1. systemd override — определяем имя сервиса (new или legacy)
        `SVC=""`,
        `[ -f /etc/systemd/system/autmzr-command-agent.service ] && SVC=autmzr-command-agent.service`,
        `[ -z "$SVC" ] && [ -f /etc/systemd/system/pocket-claude-agent.service ] && SVC=pocket-claude-agent.service`,
        `if [ -n "$SVC" ]; then`,
        `  mkdir -p /etc/systemd/system/$SVC.d/`,
        `  cat > /etc/systemd/system/$SVC.d/gemini-key.conf <<EOF`,
        `[Service]`,
        `Environment=GEMINI_API_KEY=${escapedKey}`,
        `EOF`,
        `  chmod 600 /etc/systemd/system/$SVC.d/gemini-key.conf`,
        `  systemctl daemon-reload`,
        `  echo "[info] systemd override записан для $SVC"`,
        `fi`,
        // 2. В ~/.bashrc / ~/.profile (для интерактивных shell)
        `for f in ~/.bashrc ~/.profile; do`,
        `  touch "$f"`,
        `  sed -i '/^export GEMINI_API_KEY=/d' "$f"`,
        `  echo "export GEMINI_API_KEY='${escapedKey}'" >> "$f"`,
        `  chmod 600 "$f"`,
        `done`,
        `echo "[info] ~/.bashrc + ~/.profile обновлены"`,
        // 3. Опционально — прописать в settings.json (для gemini --model)
        `mkdir -p ~/.gemini`,
        `cat > ~/.gemini/settings.json <<SJSON`,
        `{`,
        `  "security": { "auth": { "selectedType": "gemini-api-key" } }`,
        `}`,
        `SJSON`,
        `chmod 600 ~/.gemini/settings.json`,
        `echo "[info] ~/.gemini/settings.json записан"`,
        // 4. Проверяем gemini --version (должен работать, но без key — он и так был)
        `if bash -lc 'gemini --version' 2>&1; then`,
        `  echo "[ok] gemini готов"`,
        `else`,
        `  echo "[warn] gemini --version дал ошибку, но ключ записан"`,
        `fi`,
        // 5. Рестартим agent через nohup+disown — ОТДЕЛЬНЫМ процессом с задержкой,
        //    чтобы наш текущий exec (который сам крутится в этом агенте!) успел
        //    вернуть exec.exit и SSE закрылся корректно. Без этого restart убивает
        //    агента прямо посреди команды → UI залипает в "busy".
        `if [ -n "$SVC" ] && systemctl is-active --quiet "$SVC" 2>/dev/null; then`,
        `  nohup bash -c "sleep 2 && systemctl restart $SVC" >/dev/null 2>&1 &`,
        `  disown 2>/dev/null || true`,
        `  echo "[info] agent будет перезапущен через 2с (detached)"`,
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
          await query(
            `UPDATE pc.devices SET gemini_logged_in = true WHERE id = $1`,
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
