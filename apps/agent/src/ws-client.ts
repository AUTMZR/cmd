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
import { maybeSelfUpdate } from './self-update.js';
import { bootstrapPlugins, snapshotProviders, startChat, cancelChat } from './plugin-registry.js';
import type { AgentConfig } from './config.js';

let pluginsBooted = false;

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
    if (!pluginsBooted) {
      pluginsBooted = true;
      await bootstrapPlugins(log);
    }
    const [claude, gemini, codex, plugin_providers] = await Promise.all([
      probeClaude(), probeGemini(), probeCodex(), snapshotProviders(),
    ]);
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
      plugin_providers: plugin_providers.length ? plugin_providers : undefined,
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
    handle(ws, msg, cfg).catch((e) => log(`handler error: ${e.message}`));
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

async function handle(ws: WebSocket, msg: AnyMessage, cfg: AgentConfig): Promise<void> {
  switch (msg.type) {
    case 'hello.ack': {
      log('hello ack');
      const ack = msg as import('@autmzr/command-protocol').HelloAckMessage;
      void maybeSelfUpdate({
        currentVersion: AGENT_VERSION,
        latestVersion: ack.agent_latest_version,
        bundleUrl: ack.agent_bundle_url,
        masterUrl: cfg.master_url,
        log,
      });
      return;
    }
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

    case 'provider.chat': {
      const r = startChat({
        providerId: msg.provider_id,
        correlationId: msg.id,
        prompt: msg.prompt,
        cwd: msg.cwd,
        instructions: msg.instructions,
        model: msg.model,
        effort: msg.effort,
        permission_mode: msg.permission_mode,
        session_id: msg.session_id,
        emit: (event) => send(ws, {
          type: 'provider.chat.event', correlation_id: msg.id, event,
        }),
      });
      if (!r.ok) {
        send(ws, {
          type: 'provider.chat.event', correlation_id: msg.id,
          event: { type: 'error', message: r.reason, code: 'unknown_provider' },
        });
      }
      return;
    }

    case 'provider.chat.cancel': {
      cancelChat(msg.correlation_id);
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
