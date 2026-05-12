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
 * POST /api/devices/[id]/claude-set-credentials  { credentials: "<JSON>" }
 *
 * Копирует ~/.claude/.credentials.json с локального Mac/Linux юзера на
 * remote-устройство. Позволяет работать через Pro/Max-подписку вместо API key.
 *
 * credentials приходит как string — содержимое файла как есть.
 * Мы только:
 *   1) проверяем что это валидный JSON с правильной структурой
 *   2) пишем на устройство в /root/.claude/.credentials.json с chmod 600
 *
 * Сам JSON и любые токены внутри НЕ сохраняются в нашей БД.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'claude-set-creds', max: 5, windowMs: 60_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const body = await req.json().catch(() => ({}));
  const credentials = String(body?.credentials || '').trim();
  if (!credentials) return new Response('Bad request: credentials required', { status: 400 });

  // Валидация JSON и структуры. Claude CLI пишет credentials.json в виде:
  //   {"claudeAiOauth":{"accessToken":"...","refreshToken":"...","expiresAt":..., "scopes": [...]}}
  // или просто {"apiKey":"..."}. Мы принимаем оба.
  let parsed: unknown;
  try { parsed = JSON.parse(credentials); }
  catch { return new Response('Credentials must be valid JSON', { status: 400 }); }
  const looksValid =
    typeof parsed === 'object' && parsed !== null &&
    (('claudeAiOauth' in parsed) || ('apiKey' in parsed) || ('accessToken' in parsed));
  if (!looksValid) {
    return new Response('Unexpected credentials format (expected claudeAiOauth/apiKey/accessToken)', { status: 400 });
  }

  const device = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return new Response('Device not found', { status: 404 });
  if (!hub().isOnline(deviceId)) return new Response('Device offline', { status: 503 });

  const deviceIdSafe = device.id;
  const userIdSafe = user.id;

  // В bash-команду передаём JSON через base64 чтобы не заморачиваться с escape-символами
  const credsB64 = Buffer.from(credentials, 'utf8').toString('base64');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      const cmd = [
        `set -e`,
        `mkdir -p ~/.claude`,
        `chmod 700 ~/.claude`,
        `echo '${credsB64}' | base64 -d > ~/.claude/.credentials.json`,
        `chmod 600 ~/.claude/.credentials.json`,
        `echo "[info] credentials.json записан"`,
        `ls -la ~/.claude/.credentials.json`,
        // Проверяем — если claude доступен, попробуем простую команду
        `if bash -lc 'command -v claude' >/dev/null 2>&1; then`,
        `  echo "[check] claude --version:"`,
        `  bash -lc 'claude --version' 2>&1 | head -3 || echo "(claude не смог показать version)"`,
        `else`,
        `  echo "[warn] claude CLI не найден, но credentials сохранён — работоспособность проверится при первом запросе"`,
        `fi`,
      ].join('\n');

      const execId = uuidv4();
      const execMsg: ExecRequest = {
        type: 'exec', id: execId, cwd: '/root', cmd, timeout_ms: 15_000,
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
            `UPDATE pc.devices SET agent_logged_in = true WHERE id = $1`,
            [deviceIdSafe],
          ).catch(() => {});
          push({ type: 'ok', message: 'Credentials скопированы, claude работает через твою подписку' });
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
