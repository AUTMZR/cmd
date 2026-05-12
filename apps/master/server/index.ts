/**
 * Custom server: Next.js + WebSocket endpoint /ws/agent в одном процессе.
 * Запускается `npm run dev` (через tsx) или `npm run start`.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AnyMessage, HelloMessage, JobsRecap, JobsResume, JobsAck,
  PtyOpenRequest, PtyDataMessage, PtyResizeMessage, PtyCloseMessage,
} from '@autmzr/command-protocol';
import { PROTOCOL_VERSION } from '@autmzr/command-protocol';
import { hub } from '../src/lib/ws-hub';
import { queryOne, query } from '../src/lib/db';
import { hashToken } from '../src/lib/crypto';
import { processClaudeMessage, finalizeJob } from '../src/lib/job-tracker';
import { log } from '../src/lib/log';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Текущая версия agent-бандла, который раздаёт мастер.
 *  Читаем agent-version.json из public/ — генерится при `npm run build -w apps/agent`.
 *  Если файла нет (dev на чистом checkout) — пропускаем auto-update. */
const AGENT_LATEST_VERSION: string | null = (() => {
  try {
    const root = process.cwd();
    const path = join(root, 'public', 'agent-version.json');
    return JSON.parse(readFileSync(path, 'utf8')).version || null;
  } catch { return null; }
})();

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3100);
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Помечаем как abandoned jobs, которые висят без прогресса > 30 минут (мастер был выключен).
  // Если агент ещё жив — при recap они подхватятся заново и восстановят статус.
  try {
    await query(
      `UPDATE pc.chat_jobs SET status = 'abandoned', completed_at = NOW()
       WHERE status = 'running' AND last_event_at < NOW() - INTERVAL '30 minutes'`,
    );
  } catch {}

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '/', true);
      await handle(req, res, parsedUrl);
    } catch (e) {
      log.error('http.handler', { err: (e as Error).message, stack: (e as Error).stack });
      res.statusCode = 500;
      res.end('internal error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'x'}`);
    if (url.pathname === '/ws/agent') {
      const token = url.searchParams.get('token');
      const version = Number(url.searchParams.get('v') || '0');
      if (!token || version !== PROTOCOL_VERSION) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return;
      }
      const device = await queryOne<{ id: string; user_id: string; name: string }>(
        `SELECT id, user_id, name FROM pc.devices WHERE token_hash = $1`, [hashToken(token)],
      );
      if (!device) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => onAgentConnect(ws, device));
      return;
    }

    if (url.pathname === '/ws/pty') {
      // Origin check — без него /ws/pty уязвим к cross-origin shell через
      // CSRF (cookies прикрепляются к WS-upgrade автоматически в браузере).
      const origin = req.headers.origin || '';
      const publicUrl = process.env.PUBLIC_URL || '';
      const allowedOrigins = [publicUrl, 'http://localhost:3100', 'http://127.0.0.1:3100'].filter(Boolean);
      if (!origin || !allowedOrigins.includes(origin)) {
        log.warn('ws.pty.origin_blocked', { origin });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
      }

      // Авторизация по cookie pc_session (та же что у HTTP API).
      const sid = parseCookie(req.headers.cookie || '', 'pc_session');
      if (!sid) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      const user = await queryOne<{ user_id: string; is_admin: boolean; trial_until: string | null }>(
        `SELECT u.id AS user_id, u.is_admin, u.trial_until
         FROM pc.user_sessions s JOIN pc.users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [sid],
      );
      if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }

      // Trial-gate: expired non-admin не получает PTY-доступа.
      if (!user.is_admin && user.trial_until && new Date(user.trial_until).getTime() <= Date.now()) {
        log.warn('ws.pty.trial_expired', { userId: user.user_id });
        socket.write('HTTP/1.1 402 Payment Required\r\n\r\n'); socket.destroy(); return;
      }

      const deviceId = url.searchParams.get('device');
      if (!deviceId) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return; }
      const device = await queryOne<{ id: string; user_id: string; name: string }>(
        `SELECT id, user_id, name FROM pc.devices WHERE id = $1`, [deviceId],
      );
      if (!device || device.user_id !== user.user_id) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return;
      }

      const cwd = url.searchParams.get('cwd') || undefined;
      const cols = Number(url.searchParams.get('cols') || 80);
      const rows = Number(url.searchParams.get('rows') || 24);

      wss.handleUpgrade(req, socket, head, (ws) =>
        onClientPtyConnect(ws, { deviceId: device.id, userId: device.user_id, cwd, cols, rows }));
      return;
    }

    socket.destroy();
  });

  server.listen(port, hostname, () => {
    log.info('master.ready', { url: `http://${hostname}:${port}`, dev });
  });
});

async function handleJobsRecap(
  ws: WebSocket,
  device: { id: string; user_id: string; name: string },
  recap: JobsRecap,
): Promise<void> {
  for (const j of recap.jobs) {
    // Проверим: наш job? Уже финализирован?
    const row = await queryOne<{ status: string; user_id: string }>(
      `SELECT status, user_id FROM pc.chat_jobs WHERE id = $1`, [j.id]);
    if (!row) continue;
    if (row.user_id !== device.user_id) continue; // безопасность
    if (row.status === 'done' || row.status === 'error') {
      // У нас уже готово — просим агента удалить свой буфер
      const ack: JobsAck = { type: 'jobs.ack', id: uuidv4(), job_id: j.id };
      ws.send(JSON.stringify(ack));
      continue;
    }
    // Подпишемся на события replay и обработаем как обычные
    hub().register_job_subscriber(j.id, async (m) => {
      try { await processClaudeMessage(j.id, m); }
      catch (e) { log.error('recap.persist', { jobId: j.id, err: (e as Error).message }); }
      // Если пришёл done/error — отписываемся и шлём ack
      if (m.type === 'claude.done' || m.type === 'claude.error') {
        hub().unregister_job_subscriber(j.id);
        const ack: JobsAck = { type: 'jobs.ack', id: uuidv4(), job_id: j.id };
        ws.send(JSON.stringify(ack));
      }
    });
    // Просим агента переиграть все события
    const resume: JobsResume = { type: 'jobs.resume', id: uuidv4(), job_id: j.id };
    ws.send(JSON.stringify(resume));
    log.info('recap.resume', { jobId: j.id });
  }
}

function onAgentConnect(ws: WebSocket, device: { id: string; user_id: string; name: string }): void {
  log.info('ws.agent.connected', { deviceId: device.id, name: device.name });
  hub().register(device.id, device.user_id, device.name, ws as any);

  ws.on('message', (raw: Buffer) => {
    let msg: AnyMessage;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }

    if (msg.type === 'hello') {
      const h = msg as HelloMessage;
      query(
        `UPDATE pc.devices
         SET hostname=$1, os=$2, arch=$3, capabilities=$4::jsonb, last_version=$5,
             agent_logged_in=$6, agent_installed=$7, agent_version=$8,
             gemini_logged_in=$9, gemini_installed=$10, gemini_version=$11,
             codex_logged_in=$12, codex_installed=$13, codex_version=$14,
             plugin_providers=$15::jsonb,
             last_online=NOW()
         WHERE id=$16`,
        [
          h.hostname, h.os, h.arch, JSON.stringify(h.capabilities), h.version,
          h.claude.logged_in, h.claude.installed, h.claude.version ?? null,
          h.gemini?.logged_in ?? null, h.gemini?.installed ?? null, h.gemini?.version ?? null,
          h.codex?.logged_in ?? null, h.codex?.installed ?? null, h.codex?.version ?? null,
          JSON.stringify(h.plugin_providers || []),
          device.id,
        ],
      ).catch(() => {});
      const publicUrl = process.env.PUBLIC_URL || '';
      const bundleUrl = (publicUrl && AGENT_LATEST_VERSION)
        ? `${publicUrl.replace(/\/$/, '')}/agent.js`
        : undefined;
      ws.send(JSON.stringify({
        type: 'hello.ack',
        server_time: new Date().toISOString(),
        protocol: PROTOCOL_VERSION,
        agent_latest_version: AGENT_LATEST_VERSION ?? undefined,
        agent_bundle_url: bundleUrl,
      }));
      return;
    }
    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
    if (msg.type === 'pong') return;

    // Recap: агент прислал список своих активных/завершённых jobs при (re)connect.
    // Для каждого job в статусе running/done — просим replay событий из буфера агента.
    if (msg.type === 'jobs.recap') {
      handleJobsRecap(ws, device, msg as JobsRecap).catch((e) =>
        log.error('ws.recap', { deviceId: device.id, err: e.message }));
      return;
    }

    // Всё остальное — ответы на наши запросы
    hub().dispatch(msg);
  });

  ws.on('close', () => {
    log.info('ws.agent.disconnected', { deviceId: device.id, name: device.name });
    hub().unregister(device.id);
  });
  ws.on('error', (e) => log.error('ws.agent.error', { deviceId: device.id, err: e.message }));
}

/**
 * Клиентский WebSocket для PTY-терминала.
 * Один WS-коннект = одна PTY-сессия. Прокси:
 *   client -> master: pty.data/pty.resize/pty.close (как JSON)
 *   master -> agent:  те же сообщения с correlation_id этой сессии
 *   agent -> master:  pty.opened / pty.data / pty.exit / pty.error
 *   master -> client: те же сообщения как JSON
 */
function onClientPtyConnect(
  ws: WebSocket,
  opts: { deviceId: string; userId: string; cwd?: string; cols: number; rows: number },
): void {
  const cid = uuidv4();
  log.info('ws.pty.connected', { deviceId: opts.deviceId, cid });

  let closed = false;
  let unsubscribe: (() => void) | null = null;

  // Подписываемся на pty.* события от агента для этой сессии
  const onFromAgent = (m: AnyMessage) => {
    if (closed) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (m.type === 'pty.opened' || m.type === 'pty.data' ||
        m.type === 'pty.exit'   || m.type === 'pty.error') {
      try { ws.send(JSON.stringify(m)); } catch {}
      if (m.type === 'pty.exit' || m.type === 'pty.error') {
        // Сессия завершена агентом — закрываем client-WS
        try { ws.close(1000, m.type === 'pty.error' ? 'agent error' : 'shell exited'); } catch {}
      }
    }
  };

  try {
    const openReq: PtyOpenRequest = {
      type: 'pty.open', id: cid,
      cwd: opts.cwd, cols: opts.cols, rows: opts.rows,
    };
    unsubscribe = hub().send(opts.deviceId, opts.userId, openReq, onFromAgent);
  } catch (e) {
    const err = e as Error;
    try {
      ws.send(JSON.stringify({
        type: 'pty.error', correlation_id: cid,
        message: err.message || 'Не удалось подключиться к устройству',
        code: 'unknown',
      }));
    } catch {}
    try { ws.close(1011, err.message); } catch {}
    return;
  }

  // Heartbeat наш-клиенту чтобы nginx не рвал тихий коннект (proxy_read_timeout 300s).
  // Клиент тоже шлёт __ping — мы его игнорируем, но сам факт трафика держит коннект живым.
  const heartbeat = setInterval(() => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: '__ping' })); } catch {}
  }, 45_000);

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    // Heartbeat — молча игнорируем.
    if (msg.type === '__ping' || msg.type === '__pong') return;
    // Перезаписываем correlation_id (клиент не должен его выдумывать).
    msg.correlation_id = cid;
    if (msg.type === 'pty.data') {
      try { hub().send(opts.deviceId, opts.userId, msg as PtyDataMessage); } catch {}
    } else if (msg.type === 'pty.resize') {
      try { hub().send(opts.deviceId, opts.userId, msg as PtyResizeMessage); } catch {}
    } else if (msg.type === 'pty.close') {
      try { hub().send(opts.deviceId, opts.userId, msg as PtyCloseMessage); } catch {}
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    // Сообщаем агенту: клиент ушёл — убей shell
    try {
      const closeMsg: PtyCloseMessage = { type: 'pty.close', correlation_id: cid };
      hub().send(opts.deviceId, opts.userId, closeMsg);
    } catch {}
    if (unsubscribe) { try { unsubscribe(); } catch {} }
  };

  ws.on('close', () => { log.info('ws.pty.closed', { cid }); cleanup(); });
  ws.on('error', () => cleanup());
}

function parseCookie(raw: string, name: string): string | null {
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
