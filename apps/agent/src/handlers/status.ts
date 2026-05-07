import { spawn } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { StatusRequest, StatusReply } from '@autmzr/command-protocol';

export interface AgentInfo { installed: boolean; version?: string; logged_in: boolean }

export async function handleStatus(req: StatusRequest): Promise<StatusReply> {
  const claude = await probeClaude();
  const codex = await probeCodex();
  let disk = { free_bytes: 0, total_bytes: 0 };
  try {
    const s = await statfs('/');
    disk = { free_bytes: Number(s.bavail) * s.bsize, total_bytes: Number(s.blocks) * s.bsize };
  } catch {}
  return {
    type: 'status.reply',
    correlation_id: req.id,
    claude,
    codex,
    disk,
    uptime_s: Math.round(process.uptime()),
  };
}

/**
 * Пробуем найти Claude CLI и выяснить залогинен ли он.
 *
 * Агент обычно запущен через systemd с минимальным PATH (/usr/bin:/usr/sbin:/bin:/sbin).
 * Если claude установлен через nvm / ~/.npm-global / /usr/local/bin — прямой
 * spawn('claude') его не найдёт, получим ENOENT.
 *
 * Поэтому:
 *  1) PC_CLAUDE_PATH env override (если юзер знает путь);
 *  2) direct spawn — быстро, если в PATH;
 *  3) fallback: `bash -lc 'which claude && claude --version'` — login-shell
 *     подхватит .bashrc/.profile/nvm-init и найдёт claude где бы он ни лежал.
 */
export async function probeClaude(): Promise<{ installed: boolean; version?: string; logged_in: boolean }> {
  const home = homedir();
  const loggedIn =
    existsSync(join(home, '.claude', '.credentials.json')) ||
    existsSync(join(home, '.config', 'claude', 'credentials.json')) ||
    existsSync(join(home, '.claude', 'credentials.json'));

  // Step 1: прямой spawn (быстро, если в PATH или через env override)
  const direct = await spawnClaudeVersion(process.env.PC_CLAUDE_PATH || 'claude', []);
  if (direct.installed) return { ...direct, logged_in: loggedIn };

  // Step 2: fallback — login-shell (медленнее на ~100ms, зато находит nvm/~/.npm-global/etc)
  const viaLogin = await spawnClaudeVersion('bash', ['-lc', 'claude --version']);
  if (viaLogin.installed) return { ...viaLogin, logged_in: loggedIn };

  return { installed: false, logged_in: loggedIn };
}

function spawnClaudeVersion(cmd: string, args: string[]): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5_000);
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.on('error', () => { clearTimeout(killer); resolve({ installed: false }); });
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0) return resolve({ installed: false });
      // bash -lc 'claude --version' печатает "1.2.8 (Claude Code)\n" или похожее
      const m = out.match(/(\d+\.\d+\.\d+(?:[-\w.]*)?)/);
      resolve({ installed: true, version: m ? m[1] : out.trim() });
    });
  });
}

/* ============================= GEMINI PROBE ============================= */

/**
 * Пробуем найти Gemini CLI и понять залогинен ли он.
 *
 * Gemini CLI (`@google/gemini-cli`) — binary `gemini`. Auth варианты:
 *  1. GEMINI_API_KEY env — самый простой, проверяем.
 *  2. ~/.gemini/settings.json с полем security.auth.selectedType (oauth-personal / vertex / gca)
 *     + OAuth creds cache от Google (обычно в ~/.config/google-auth/ или в процессе).
 *  3. GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_GENAI_USE_GCA env.
 *
 * Для MVP считаем logged_in=true если:
 *  - есть env GEMINI_API_KEY, ИЛИ
 *  - settings.json содержит selectedType, ИЛИ
 *  - setup через gcloud ADC (проверяем ~/.config/gcloud/application_default_credentials.json)
 */
export async function probeGemini(): Promise<AgentInfo> {
  const home = homedir();

  // Поиск признаков auth-состояния
  let loggedIn = false;
  if (process.env.GEMINI_API_KEY) loggedIn = true;
  if (!loggedIn) {
    try {
      const settingsPath = join(home, '.gemini', 'settings.json');
      if (existsSync(settingsPath)) {
        const { readFileSync } = await import('node:fs');
        const raw = readFileSync(settingsPath, 'utf8');
        const parsed = JSON.parse(raw) as { security?: { auth?: { selectedType?: string } } };
        if (parsed.security?.auth?.selectedType) loggedIn = true;
      }
    } catch {}
  }
  if (!loggedIn) {
    loggedIn = existsSync(join(home, '.config', 'gcloud', 'application_default_credentials.json'));
  }

  // direct spawn
  const direct = await spawnBinaryVersion(process.env.PC_GEMINI_PATH || 'gemini', ['--version']);
  if (direct.installed) return { ...direct, logged_in: loggedIn };

  // login-shell fallback (на случай если gemini в nvm/homebrew/etc пути)
  const viaLogin = await spawnBinaryVersion('bash', ['-lc', 'gemini --version']);
  if (viaLogin.installed) return { ...viaLogin, logged_in: loggedIn };

  return { installed: false, logged_in: loggedIn };
}

/* ============================= CODEX PROBE ============================= */

export async function probeCodex(): Promise<AgentInfo> {
  const home = homedir();
  const loggedIn =
    Boolean(process.env.OPENAI_API_KEY) ||
    existsSync(join(home, '.codex', 'auth.json')) ||
    existsSync(join(home, '.codex', 'config.toml'));

  const direct = await spawnBinaryVersion(process.env.PC_CODEX_PATH || 'codex', ['--version']);
  if (direct.installed) return { ...direct, logged_in: loggedIn };

  const viaLogin = await spawnBinaryVersion('bash', ['-lc', 'codex --version']);
  if (viaLogin.installed) return { ...viaLogin, logged_in: loggedIn };

  return { installed: false, logged_in: loggedIn };
}

/** Универсальная версия spawnClaudeVersion — просто читает числовую версию из stdout. */
function spawnBinaryVersion(cmd: string, args: string[]): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5_000);
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.on('error', () => { clearTimeout(killer); resolve({ installed: false }); });
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0) return resolve({ installed: false });
      const m = out.match(/(\d+\.\d+\.\d+(?:[-\w.]*)?)/);
      resolve({ installed: true, version: m ? m[1] : out.trim() });
    });
  });
}
