import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import { rateLimit } from '@/lib/rate-limit';
import { requireCsrf } from '@/lib/csrf';
import type { ExecRequest, ExecStdout, ExecStderr, ExecExit } from '@autmzr/command-protocol';

/**
 * POST /api/devices/[id]/codex-set-api-key  { apiKey: "sk-..." }
 *
 * Записывает OPENAI_API_KEY на устройстве (Codex CLI читает его):
 *   - в systemd-override для agent-процесса
 *   - в ~/.bashrc / ~/.profile для интерактивных PTY-сессий
 *
 * Ключ в нашей БД не пишется — живёт только на устройстве.
 *
 * Зеркалит /gemini-set-api-key — единственное отличие в имени env-переменной
 * (OPENAI_API_KEY вместо GEMINI_API_KEY) и проверке codex --version.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const limited = rateLimit(req, { key: 'codex-set-key', max: 5, windowMs: 60_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const body = await req.json().catch(() => ({}));
  const apiKey = String(body?.apiKey || '').trim();
  // OpenAI API keys: "sk-..." (старый формат, ~51 символ) или "sk-proj-..." (новый, 100+).
  // Не делаем строгий regex — OpenAI меняет формат, но проверяем длину и префикс.
  if (!apiKey.startsWith('sk-') || apiKey.length < 20 || apiKey.length > 300) {
    return new Response('Bad API key (expected sk-... 20-300 chars)', { status: 400 });
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
        `SVC=""`,
        `[ -f /etc/systemd/system/autmzr-command-agent.service ] && SVC=autmzr-command-agent.service`,
        `[ -z "$SVC" ] && [ -f /etc/systemd/system/pocket-claude-agent.service ] && SVC=pocket-claude-agent.service`,
        `if [ -n "$SVC" ]; then`,
        `  mkdir -p /etc/systemd/system/$SVC.d/`,
        `  cat > /etc/systemd/system/$SVC.d/codex-key.conf <<EOF`,
        `[Service]`,
        `Environment=OPENAI_API_KEY=${escapedKey}`,
        `EOF`,
        `  chmod 600 /etc/systemd/system/$SVC.d/codex-key.conf`,
        `  systemctl daemon-reload`,
        `  echo "[info] systemd override written for $SVC"`,
        `fi`,
        `for f in ~/.bashrc ~/.profile; do`,
        `  touch "$f"`,
        `  sed -i '/^export OPENAI_API_KEY=/d' "$f"`,
        `  echo "export OPENAI_API_KEY='${escapedKey}'" >> "$f"`,
        `  chmod 600 "$f"`,
        `done`,
        `echo "[info] ~/.bashrc + ~/.profile updated"`,
        `if bash -lc 'codex --version' 2>&1; then`,
        `  echo "[ok] codex ready"`,
        `else`,
        `  echo "[warn] codex --version errored, but key is written"`,
        `fi`,
        `if [ -n "$SVC" ] && systemctl is-active --quiet "$SVC" 2>/dev/null; then`,
        `  nohup bash -c "sleep 2 && systemctl restart $SVC" >/dev/null 2>&1 &`,
        `  disown 2>/dev/null || true`,
        `  echo "[info] agent will restart in 2s (detached)"`,
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
            `UPDATE pc.devices SET codex_logged_in = true WHERE id = $1`,
            [deviceIdSafe],
          ).catch(() => {});
          push({ type: 'ok', message: 'API key saved, agent restarted' });
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
