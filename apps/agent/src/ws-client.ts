import WebSocket from 'ws';
import { hostname, platform, arch } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AnyMessage, HelloMessage, JobsRecap, JobsResume, JobsAck } from '@autmzr/command-protocol';
import { PROTOCOL_VERSION } from '@autmzr/command-protocol';
import { handleExec } from './handlers/exec.js';
import { handleFsList, handleFsRead, handleFsWrite, handleFsMkdir, handleFsDelete } from './handlers/fs.js';
import { handleGitClone, makeProgressEmitter } from './handlers/git.js';
import { handleClaude } from './handlers/claude.js';
import { handleStatus, probeClaude, probeGemini, probeCodex } from './handlers/status.js';
import { handlePtyOpen, handlePtyData, handlePtyResize, handlePtyClose, killAllPty } from './handlers/pty.js';
import { jobList, jobRead, jobDelete, jobCleanup } from './job-buffer.js';
import type { AgentConfig } from './config.js';

const AGENT_VERSION = readAgentVersion();

function readAgentVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function connect(cfg: AgentConfig): void {
  const url = buildUrl(cfg);
  log(`connecting ${url}`);
  const ws = new WebSocket(url, { handshakeTimeout: 15_000 });

  let pingTimer: NodeJS.Timeout | null = null;
  let lastPong = Date.now();

  ws.on('open', async () => {
    log('connected');
    const [claude, gemini, codex] = await Promise.all([probeClaude(), probeGemini(), probeCodex()]);
    const capabilities: HelloMessage['capabilities'] = ['exec', 'claude', 'fs'];
    if (gemini.installed) capabilities.push('gemini');
    if (codex.installed) capabilities.push('codex');
    const hello: HelloMessage = {
      type: 'hello',
      agent: 'autmzr-command-agent',
      version: AGENT_VERSION,
      os: platform(),
      arch: arch(),
      hostname: hostname(),
      capabilities,
      claude,
      gemini,
      codex,
    };
    send(ws, hello);

    // GC старых jobs (> 24h)
    jobCleanup();

    // Replay: шлём recap со списком активных и только что завершённых jobs
    const pending = jobList();
    if (pending.length > 0) {
      const recap: JobsRecap = {
        type: 'jobs.recap',
        jobs: pending.map(j => ({
          id: j.meta.id,
          status: j.meta.status,
          started_at: j.meta.started_at,
          buffered_bytes: j.bytes,
        })),
      };
      log(`replay: ${pending.length} pending job(s)`);
      send(ws, recap);
    }

    pingTimer = setInterval(() => {
      if (Date.now() - lastPong > 120_000) {
        log('no traffic 120s, forcing reconnect');
        try { ws.terminate(); } catch {}
        return;
      }
      send(ws, { type: 'ping' });
    }, 30_000);
  });

  ws.on('message', (raw: Buffer) => {
    // Любое сообщение от мастера — признак живого соединения.
    lastPong = Date.now();
    let msg: AnyMessage;
    try { msg = JSON.parse(raw.toString('utf8')); } catch {
      log('bad message (not json)'); return;
    }
    handle(ws, msg).catch((e) => log(`handler error: ${e.message}`));
  });

  ws.on('close', (code, reason) => {
    log(`disconnected code=${code} reason=${reason.toString() || '(none)'}`);
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    // При обрыве связи убиваем все PTY-сессии — они привязаны к этому соединению.
    killAllPty();
    // Reconnect with backoff
    const delay = 1000 + Math.floor(Math.random() * 2000);
    setTimeout(() => connect(cfg), delay);
  });

  ws.on('error', (err) => {
    log(`ws error: ${err.message}`);
  });

  ws.on('pong', () => { lastPong = Date.now(); });
}

function buildUrl(cfg: AgentConfig): string {
  const u = new URL(cfg.master_url);
  u.searchParams.set('token', cfg.token);
  u.searchParams.set('v', String(PROTOCOL_VERSION));
  u.searchParams.set('name', cfg.name);
  return u.toString();
}

async function handle(ws: WebSocket, msg: AnyMessage): Promise<void> {
  switch (msg.type) {
    case 'hello.ack': log('hello ack'); return;
    case 'ping': send(ws, { type: 'pong' }); return;
    case 'pong': return;

    case 'exec':
      handleExec(msg, (out) => send(ws, out));
      return;

    case 'claude':
      handleClaude(msg, (out) => send(ws, out));
      return;

    case 'pty.open':
      handlePtyOpen(msg, (out) => send(ws, out));
      return;
    case 'pty.data':
      handlePtyData(msg);
      return;
    case 'pty.resize':
      handlePtyResize(msg);
      return;
    case 'pty.close':
      handlePtyClose(msg);
      return;

    case 'fs.list':   send(ws, await handleFsList(msg)); return;
    case 'fs.read':   send(ws, await handleFsRead(msg)); return;
    case 'fs.write':  send(ws, await handleFsWrite(msg)); return;
    case 'fs.mkdir':  send(ws, await handleFsMkdir(msg)); return;
    case 'fs.delete': send(ws, await handleFsDelete(msg)); return;

    case 'git.clone': {
      const emit = makeProgressEmitter((p) => send(ws, p), msg.id);
      const reply = await handleGitClone(msg, emit);
      send(ws, reply);
      return;
    }

    case 'status.request': send(ws, await handleStatus(msg)); return;

    case 'jobs.resume': {
      const jr = msg as JobsResume;
      const events = jobRead(jr.job_id);
      log(`resume job ${jr.job_id}: ${events.length} events`);
      for (const ev of events) send(ws, ev);
      return;
    }
    case 'jobs.ack': {
      const ja = msg as JobsAck;
      jobDelete(ja.job_id);
      log(`ack job ${ja.job_id}, buffer deleted`);
      return;
    }

    case 'error': log(`master error: ${msg.code} ${msg.message}`); return;

    default:
      log(`unknown message type: ${msg.type}`);
  }
}

function send(ws: WebSocket, msg: AnyMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function log(s: string): void {
  console.log(`[agent ${new Date().toISOString()}] ${s}`);
}
