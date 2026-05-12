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
 * POST /api/devices/[id]/claude-install
 * Устанавливает Claude Code CLI на устройстве через npm install -g.
 * Стримит вывод в браузер через SSE (text/event-stream).
 *
 * После успеха — запрашивает `claude --version` и обновляет agent_installed+agent_version в БД.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'claude-install', max: 1, windowMs: 30_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const device = await queryOne<{ id: string; name: string; user_id: string }>(
    `SELECT id, name, user_id FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return new Response('Device not found', { status: 404 });
  if (!hub().isOnline(deviceId)) return new Response('Device offline', { status: 503 });
  // Локальные non-null aliases для использования внутри stream-callback'ов (TS narrowing)
  const deviceIdSafe = device.id;
  const userIdSafe = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      // Пытаемся разные методы — сначала npm (если есть node+npm), fallback на official installer.
      const installCmd = [
        'if command -v npm >/dev/null 2>&1; then',
        '  echo "[info] ставлю через npm..."',
        '  npm install -g @anthropic-ai/claude-code 2>&1',
        'else',
        '  echo "[info] npm не найден, пробую curl-installer..."',
        '  curl -fsSL https://claude.ai/install.sh | bash 2>&1',
        'fi',
        'echo "[done]"',
        'command -v claude && claude --version || echo "[error] claude не найден в PATH после установки"',
      ].join('\n');

      const execId = uuidv4();
      const execMsg: ExecRequest = {
        type: 'exec', id: execId, cwd: '/root', cmd: installCmd, timeout_ms: 600_000, // 10 min
      };

      push({ type: 'start' });

      let lastVersion: string | null = null;
      let exitCode: number | null = null;

      const unsub = hub().send(deviceIdSafe, userIdSafe, execMsg, (reply) => {
        if (reply.type === 'exec.stdout') {
          const text = (reply as ExecStdout).text;
          push({ type: 'out', text });
          // Ловим строку вида "1.2.8 (Claude Code)" или просто "1.2.8"
          const m = text.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
          if (m && !lastVersion) lastVersion = m[1];
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
        // Если версию удалось распарсить — значит claude поставлен, обновим БД
        if (lastVersion && exitCode === 0) {
          await query(
            `UPDATE pc.devices SET agent_installed = true, agent_version = $1 WHERE id = $2`,
            [lastVersion, deviceIdSafe],
          ).catch(() => {});
          push({ type: 'installed', version: lastVersion });
        } else {
          push({ type: 'failed', code: exitCode });
        }
      }

      // Безопасный timeout — если агент молчит 11 минут, закрываем поток
      const killer = setTimeout(() => {
        try { unsub(); } catch {}
        push({ type: 'timeout' });
        try { controller.close(); } catch {}
      }, 660_000);
      // Привязываем cleanup к close
      req.signal?.addEventListener('abort', () => {
        clearTimeout(killer);
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
