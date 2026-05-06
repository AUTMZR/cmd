import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { ClaudeRequest, ClaudeEvent, ClaudeDone, ClaudeError, McpServerSpec } from '@autmzr/command-protocol';
import { safePath, SafetyError } from '../safety.js';
import { jobStart, jobAppend, jobFinish } from '../job-buffer.js';
import { spawnCodex } from './codex.js';

/**
 * Резолвим sentinel "pocket-claude-rfs" / "autmzr-command-rfs" в реальный путь к bundled rfs-mcp-скрипту.
 * Порядок поиска:
 *  1. $PC_RFS_MCP_PATH
 *  2. рядом с текущим agent.js (одна папка, для bundled варианта)
 *  3. ~/.autmzr-command/rfs-mcp.js или legacy ~/.pocket-claude/rfs-mcp.js (если connect.sh его положил)
 *  4. node_modules/@autmzr/command-rfs-mcp/dist/index.js (для dev)
 */
function resolveRfsMcpPath(): string | null {
  if (process.env.PC_RFS_MCP_PATH && existsSync(process.env.PC_RFS_MCP_PATH)) {
    return process.env.PC_RFS_MCP_PATH;
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, 'rfs-mcp.js'),
      join(homedir(), '.autmzr-command', 'rfs-mcp.js'),
      join(homedir(), '.pocket-claude', 'rfs-mcp.js'),
      join(here, '..', '..', 'rfs-mcp', 'dist', 'index.js'),
      join(here, '..', '..', '..', 'packages', 'rfs-mcp', 'dist', 'index.js'),
    ];
    for (const p of candidates) if (existsSync(p)) return p;
  } catch { /* ignore */ }
  return null;
}

function buildMcpConfig(mcp: Record<string, McpServerSpec>): string | null {
  const resolved: Record<string, McpServerSpec> = {};
  for (const [name, spec] of Object.entries(mcp)) {
    let command = spec.command;
    let args = spec.args || [];
    // Sentinel → resolve to our bundled rfs-mcp script.
    // Принимаем и старое имя (pocket-claude-rfs) для совместимости с уже
    // задеплоенными агентами, которые получают конфиг от обновлённого мастера.
    if (command === 'autmzr-command-rfs' || command === 'pocket-claude-rfs') {
      const p = resolveRfsMcpPath();
      if (!p) return null;
      command = process.execPath; // node
      args = [p, ...args];
    }
    resolved[name] = { command, args, env: spec.env };
  }
  return JSON.stringify({ mcpServers: resolved });
}

/**
 * Спавн локального `claude` CLI.
 * Использует OAuth из ~/.claude/ на этом устройстве.
 * Никуда не шлёт ни OAuth, ни промпты наружу (кроме обратно мастеру в виде events).
 */
export function handleClaude(
  req: ClaudeRequest,
  send: (m: ClaudeEvent | ClaudeDone | ClaudeError) => void,
): void {
  let cwd: string;
  try {
    cwd = safePath(req.cwd);
  } catch (e) {
    const err: ClaudeError = { type: 'claude.error', correlation_id: req.id, message: (e as SafetyError).message };
    jobStart(req); jobAppend(req.id, err); jobFinish(req.id, 'error');
    send(err);
    return;
  }

  // Start persistent buffer — files в ~/.autmzr-command/jobs/<id>.jsonl
  jobStart(req);
  // Обёртка send — одновременно пишем в файл и шлём по ws
  const origSend = send;
  const sendAndBuffer = (m: ClaudeEvent | ClaudeDone | ClaudeError) => {
    jobAppend(req.id, m);
    if (m.type === 'claude.done') jobFinish(req.id, 'done');
    else if (m.type === 'claude.error') jobFinish(req.id, 'error');
    origSend(m);
  };
  send = sendAndBuffer;

  // ========== Выбор CLI-провайдера ==========
  // Default = claude-code для обратной совместимости.
  const provider = req.provider || 'claude-code';
  let cliPath: string;
  let args: string[];

  if (provider === 'codex-cli') {
    if (req.resume_session_id) {
      send({
        type: 'claude.event', correlation_id: req.id,
        event: { type: 'stderr', text: '[autmzr-command] Codex CLI resume is not supported yet; starting a fresh exec run.\n' },
      });
    }
    if (req.mcp_servers && Object.keys(req.mcp_servers).length > 0) {
      send({
        type: 'claude.event', correlation_id: req.id,
        event: { type: 'stderr', text: '[autmzr-command] MCP proxy-mode is not supported for Codex CLI yet. Running without MCP.\n' },
      });
    }
    const proc = spawnCodex(req, cwd, send);
    wireProcess(req, provider, proc, send);
    return;
  }

  if (provider === 'gemini-cli') {
    // Gemini output-format 'stream-json' выдаёт JSON-lines совместимые с нашим
    // парсером (type/subtype/session_id/result на outer level). Проверено на
    // gemini 0.39.1.
    cliPath = process.env.PC_GEMINI_PATH || 'gemini';
    args = [
      '-p', req.prompt,
      '-o', 'stream-json',
      '--skip-trust',              // наши workspaces trusted автоматически (инфра-решение)
      '--approval-mode', 'yolo',   // auto-approve — без этого gemini заблокируется на first tool call
    ];
    if (req.model) args.push('-m', req.model);
    if (req.resume_session_id) args.push('-r', req.resume_session_id);
    // Gemini не знает --system-prompt, но принимает контекст через stdin при -p.
    // MCP: gemini использует `gemini mcp add` вместо --mcp-config — нужно конфигурить
    // OTBOF-процесс или через settings.json. Пока для Gemini proxy-mode НЕ поддерживаем —
    // если задан req.mcp_servers, сообщим ошибкой что только для claude.
    if (req.mcp_servers && Object.keys(req.mcp_servers).length > 0) {
      send({
        type: 'claude.event', correlation_id: req.id,
        event: { type: 'stderr', text: '[autmzr-command] MCP proxy-mode пока не поддерживается для Gemini CLI. Отправляю без MCP.\n' },
      });
    }
  } else {
    // === Claude Code (default) ===
    cliPath = process.env.PC_CLAUDE_PATH || 'claude';
    args = [
      '-p', req.prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];
    if (req.model) args.push('--model', req.model);
    if (req.resume_session_id) args.push('--resume', req.resume_session_id);
    if (req.system_prompt) args.push('--system-prompt', req.system_prompt);
    if (req.allowed_tools?.length) args.push('--allowedTools', req.allowed_tools.join(','));
    if (req.disallowed_tools?.length) args.push('--disallowedTools', req.disallowed_tools.join(','));
    if (typeof req.built_in_tools === 'string') args.push('--tools', req.built_in_tools);
    if (req.strict_mcp_config) args.push('--strict-mcp-config');
    if (req.mcp_servers && Object.keys(req.mcp_servers).length > 0) {
      const cfg = buildMcpConfig(req.mcp_servers);
      if (!cfg) {
        const errm: ClaudeError = {
          type: 'claude.error', correlation_id: req.id,
          message: 'autmzr-command-rfs bundle not found on this device; run connect.sh again to install it',
        };
        send(errm); return;
      }
      args.push('--mcp-config', cfg);
    }
    // claude CLI refuses to run with `bypassPermissions` under uid=0. Silently fall back.
    let pmode = req.permission_mode || 'bypassPermissions';
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    if (pmode === 'bypassPermissions' && isRoot) {
      pmode = 'acceptEdits';
      send({ type: 'claude.event', correlation_id: req.id, event: { type: 'stderr', text: '[autmzr-command] downgraded permission-mode to acceptEdits (running as root, bypass is disallowed by claude CLI)\n' } });
    }
    args.push('--permission-mode', pmode);
  }

  const proc = spawn(cliPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Gemini: нужен явный hint trust для non-interactive
      ...(provider === 'gemini-cli' ? { GEMINI_CLI_TRUST_WORKSPACE: 'true' } : {}),
    },
  });

  wireProcess(req, provider, proc, send);
}

function wireProcess(
  req: ClaudeRequest,
  provider: string,
  proc: ReturnType<typeof spawn>,
  send: (m: ClaudeEvent | ClaudeDone | ClaudeError) => void,
): void {
  const timeoutMs = Math.min(req.timeout_ms ?? 1_800_000, 3_600_000);
  const killer = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
    send({ type: 'claude.error', correlation_id: req.id, message: 'timeout' });
  }, timeoutMs);

  let buf = '';
  let lastSessionId: string | undefined;
  let lastResult: string | undefined;
  // Буфер stderr (последние 4 KB) — если CLI упадёт с non-zero, покажем
  // пользователю реальное сообщение, а не только exit-code.
  let stderrTail = '';
  const STDERR_MAX = 4096;

  proc.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as Record<string, unknown>;
        // перехватим session_id и result для done-события
        if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.session_id === 'string') {
          lastSessionId = ev.session_id;
        }
        if (ev.type === 'result' && typeof ev.result === 'string') {
          lastResult = ev.result;
        }
        send({ type: 'claude.event', correlation_id: req.id, event: ev });
      } catch {
        // невалидная строка, игнорим
      }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    // Копим хвост для включения в финальный error message
    stderrTail = (stderrTail + text).slice(-STDERR_MAX);
    // Плюс стримим live-событием чтобы UI мог показать прогресс
    send({ type: 'claude.event', correlation_id: req.id, event: { type: 'stderr', text } });
  });

  // Race-fix: при быстром крахе CLI (Gemini exit на проверке env) `close` иногда
  // физдит ДО последнего stderr 'data' — буфер pipe ещё не прочитан Node-ом.
  // Решение: ждём ОБА события (process exit + stderr stream end) перед финалом.
  let exitCode: number | null = null;
  let stderrEnded = false;
  let finalSent = false;

  const finalize = () => {
    if (finalSent) return;
    if (exitCode === null || !stderrEnded) return; // ждём оба
    finalSent = true;
    clearTimeout(killer);
    if (exitCode !== 0 && !lastResult) {
      const tail = stderrTail.trim();
      const message = tail
        ? `${provider} exited with code ${exitCode}:\n${tail}`
        : `${provider} exited with code ${exitCode}`;
      send({ type: 'claude.error', correlation_id: req.id, message });
      return;
    }
    send({ type: 'claude.done', correlation_id: req.id, session_id: lastSessionId, result: lastResult });
  };

  proc.stderr.on('end', () => { stderrEnded = true; finalize(); });
  proc.on('exit', (code) => { exitCode = code ?? -1; finalize(); });
  // Fallback: если по какой-то причине stderr 'end' не пришёл за 500мс после exit,
  // финалим без хвоста — лучше показать просто код, чем висеть.
  proc.on('exit', () => {
    setTimeout(() => {
      if (!stderrEnded && !finalSent) {
        stderrEnded = true;
        finalize();
      }
    }, 500);
  });

  proc.on('error', (err) => {
    clearTimeout(killer);
    send({ type: 'claude.error', correlation_id: req.id, message: err.message });
  });
}
