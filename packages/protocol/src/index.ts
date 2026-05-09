/**
 * Autmzr Command protocol v1.
 * Сообщения между master (Next.js) и agent (standalone Node).
 * Транспорт — WebSocket (WSS в prod, WS для localhost).
 */

export const PROTOCOL_VERSION = 1;

/** Общий конверт. Все сообщения идут как JSON-строка. */
export interface Envelope {
  /** Тип сообщения, см. MessageType */
  type: MessageType;
  /** UUID запроса. Стриминговые ответы несут correlation_id = id запроса. */
  id?: string;
  correlation_id?: string;
}

export type MessageType =
  // handshake
  | 'hello' | 'hello.ack' | 'error'
  // keep-alive
  | 'ping' | 'pong'
  // exec
  | 'exec' | 'exec.stdout' | 'exec.stderr' | 'exec.exit'
  // claude
  | 'claude' | 'claude.event' | 'claude.done' | 'claude.error'
  // filesystem
  | 'fs.list' | 'fs.list.reply'
  | 'fs.read' | 'fs.read.reply'
  | 'fs.write' | 'fs.write.reply'
  | 'fs.mkdir' | 'fs.mkdir.reply'
  | 'fs.delete' | 'fs.delete.reply'
  // status
  | 'status.request' | 'status.reply'
  // jobs (resilience across disconnects/restarts)
  | 'jobs.recap' | 'jobs.resume' | 'jobs.ack'
  // pty (persistent interactive terminal через псевдо-TTY)
  | 'pty.open' | 'pty.opened' | 'pty.data' | 'pty.resize' | 'pty.close' | 'pty.exit' | 'pty.error'
  // git
  | 'git.clone' | 'git.clone.progress' | 'git.clone.reply'
  // plugin providers
  | 'provider.chat' | 'provider.chat.event' | 'provider.chat.cancel';

// ============ handshake ============

export interface HelloMessage extends Envelope {
  type: 'hello';
  // Wire-level agent identifier. Принимаем оба варианта: старое имя
  // ('pocket-claude-agent', осталось у уже задеплоенных хостов) и новое
  // ('autmzr-command-agent', после ребрендинга).
  agent: 'pocket-claude-agent' | 'autmzr-command-agent';
  version: string;
  os: string;
  arch: string;
  hostname: string;
  capabilities: Array<'exec' | 'claude' | 'fs' | 'gemini' | 'codex'>;
  claude: {
    installed: boolean;
    version?: string;
    logged_in: boolean;
  };
  /** Опциональный блок — присутствует только если агент проверяет Gemini CLI (v >= 0.3) */
  gemini?: {
    installed: boolean;
    version?: string;
    logged_in: boolean;
  };
  /** Optional block for Codex CLI status. */
  codex?: {
    installed: boolean;
    version?: string;
    logged_in: boolean;
  };
  /** Plugin-provided AI providers (from ~/.autmzr-command/plugins/).
   *  Каждый плагин сам сообщает id/label/models — мастер их кеширует и
   *  показывает в UI наравне с захардкоженными claude/gemini/codex. */
  plugin_providers?: Array<{
    id: string;
    label: string;
    models: Array<{
      id: string; label: string; icon?: string; hint?: string;
      tier?: 'cheap' | 'balanced' | 'premium'; experimental?: boolean;
    }>;
    status: { installed: boolean; logged_in: boolean; version?: string; note?: string };
  }>;
}

export interface HelloAckMessage extends Envelope {
  type: 'hello.ack';
  server_time: string;
  protocol: number;
  /** Текущая версия агентского бандла на мастере. Если != своей —
   *  агент скачивает agent_bundle_url, перезаписывает agent.js и exit(0)
   *  (systemd/launchd рестартует с новой версией). */
  agent_latest_version?: string;
  /** Абсолютный URL до agent.js (например https://cmd.autmzr.com/agent.js).
   *  Не задан для self-host без публичного URL — агент тогда не апдейтится. */
  agent_bundle_url?: string;
}

export interface ErrorMessage extends Envelope {
  type: 'error';
  code: string;
  message: string;
}

// ============ keep-alive ============

export interface PingMessage extends Envelope { type: 'ping' }
export interface PongMessage extends Envelope { type: 'pong' }

// ============ exec ============

export interface ExecRequest extends Envelope {
  type: 'exec';
  id: string;
  cwd: string;
  cmd: string;
  timeout_ms?: number; // default 60000
}
export interface ExecStdout extends Envelope { type: 'exec.stdout'; correlation_id: string; text: string }
export interface ExecStderr extends Envelope { type: 'exec.stderr'; correlation_id: string; text: string }
export interface ExecExit extends Envelope {
  type: 'exec.exit';
  correlation_id: string;
  code: number | null;
  signal?: string | null;
}

// ============ claude ============

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
export type Effort = 'low' | 'medium' | 'high';

/** Какой CLI агент вызывать. Default = 'claude-code' для обратной совместимости. */
export type AgentProvider = 'claude-code' | 'gemini-cli' | 'codex-cli';

export interface ClaudeRequest extends Envelope {
  type: 'claude';
  id: string;
  cwd: string;
  prompt: string;
  /** Провайдер агента. Default 'claude-code' — для уже задеплоенных агентов. */
  provider?: AgentProvider;
  model?: string; // 'sonnet' | 'opus' | 'haiku' | 'gemini-2.5-pro' | etc
  resume_session_id?: string | null;
  system_prompt?: string;
  allowed_tools?: string[];
  disallowed_tools?: string[];      // passed as --disallowed-tools
  built_in_tools?: string | null;   // value for --tools flag; pass "" to disable all built-ins
  strict_mcp_config?: boolean;      // --strict-mcp-config
  /**
   * MCP-серверы, которые agent должен добавить CLI через --mcp-config (claude) или
   * `gemini mcp add` (gemini). Используется в proxy-режиме: autmzr-command подставляет
   * rfs-mcp-сервер, который роутит все fs/exec tool-вызовы обратно на fs-device.
   */
  mcp_servers?: Record<string, McpServerSpec>;
  permission_mode?: PermissionMode; // default 'bypassPermissions'
  effort?: Effort;                  // влияет на system prompt
  timeout_ms?: number; // default 1800000 (30 min)
}

/** Один MCP-сервер в формате claude CLI (stdio-транспорт). */
export interface McpServerSpec {
  /** Команда для запуска. Agent может резолвить sentinel 'autmzr-command-rfs' (или legacy 'pocket-claude-rfs') в путь к bundled mcp-скрипту. */
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Одно событие из стрима `claude --output-format stream-json`. */
export interface ClaudeEvent extends Envelope {
  type: 'claude.event';
  correlation_id: string;
  /** Любой JSON-объект из stream-json (type + fields). Переносим 1:1 без интерпретации. */
  event: Record<string, unknown>;
}

export interface ClaudeDone extends Envelope {
  type: 'claude.done';
  correlation_id: string;
  session_id?: string;
  result?: string;
  cost_usd?: number;
  num_turns?: number;
}

export interface ClaudeError extends Envelope {
  type: 'claude.error';
  correlation_id: string;
  message: string;
}

// ============ filesystem ============

export type FsEntryType = 'dir' | 'file';

export interface FsEntry {
  name: string;
  path: string; // relative to request path
  type: FsEntryType;
  size?: number;
  mtime?: string; // ISO
}

export interface FsListRequest extends Envelope {
  type: 'fs.list';
  id: string;
  path: string; // абсолютный путь на устройстве
  depth?: number; // default 1
}
export interface FsListReply extends Envelope {
  type: 'fs.list.reply';
  correlation_id: string;
  path: string;
  entries: FsEntry[];
  truncated?: boolean;
  error?: string;
}

export interface FsReadRequest extends Envelope {
  type: 'fs.read';
  id: string;
  path: string;
  max_bytes?: number; // default 5MB
}
export interface FsReadReply extends Envelope {
  type: 'fs.read.reply';
  correlation_id: string;
  path: string;
  content?: string; // utf8; если бинарный — пусто и binary=true
  binary?: boolean;
  size?: number;
  error?: string;
}

export interface FsWriteRequest extends Envelope {
  type: 'fs.write';
  id: string;
  path: string;
  content: string; // utf8
  create_dirs?: boolean;
}
export interface FsWriteReply extends Envelope {
  type: 'fs.write.reply';
  correlation_id: string;
  path: string;
  size?: number;
  error?: string;
}

export interface FsMkdirRequest extends Envelope {
  type: 'fs.mkdir';
  id: string;
  path: string;
  recursive?: boolean;
}
export interface FsMkdirReply extends Envelope {
  type: 'fs.mkdir.reply';
  correlation_id: string;
  error?: string;
}

export interface FsDeleteRequest extends Envelope {
  type: 'fs.delete';
  id: string;
  path: string;
  recursive?: boolean;
}
export interface FsDeleteReply extends Envelope {
  type: 'fs.delete.reply';
  correlation_id: string;
  error?: string;
}

// ============ status ============

export interface StatusRequest extends Envelope {
  type: 'status.request';
  id: string;
}
export interface StatusReply extends Envelope {
  type: 'status.reply';
  correlation_id: string;
  claude: { installed: boolean; version?: string; logged_in: boolean };
  codex?: { installed: boolean; version?: string; logged_in: boolean };
  disk: { free_bytes: number; total_bytes: number };
  uptime_s: number;
}

// ============ jobs ============

/** Agent → Master после (re)connect: список незавершённых/не-ack'нутых job'ов. */
export interface JobsRecap extends Envelope {
  type: 'jobs.recap';
  jobs: Array<{
    id: string;          // correlation_id = request.id
    status: 'running' | 'done' | 'error';
    started_at: string;  // ISO
    buffered_bytes?: number;
  }>;
}

/** Master → Agent: «перепосли мне все события этого job из буфера». */
export interface JobsResume extends Envelope {
  type: 'jobs.resume';
  id: string;
  job_id: string;
}

/** Master → Agent: «job сохранён, буфер можно удалить». */
export interface JobsAck extends Envelope {
  type: 'jobs.ack';
  id: string;
  job_id: string;
}

// ============ pty (persistent interactive terminal) ============

/**
 * Master → Agent: открыть новую PTY-сессию.
 * Агент создаёт псевдо-TTY через node-pty, запускает shell, отвечает pty.opened.
 */
export interface PtyOpenRequest extends Envelope {
  type: 'pty.open';
  id: string;            // correlation_id для всех последующих сообщений сессии
  cwd?: string;          // стартовая директория; если пусто → $HOME
  shell?: string;        // default: 'bash'
  cols?: number;         // default 80
  rows?: number;         // default 24
  env?: Record<string, string>; // доп. переменные окружения
}

/** Agent → Master: подтверждение открытия сессии. */
export interface PtyOpenedMessage extends Envelope {
  type: 'pty.opened';
  correlation_id: string;
  pid: number;
}

/**
 * Двунаправленное байтовое сообщение.
 * Master → Agent: байты в stdin (ввод с клавиатуры пользователя).
 * Agent → Master: байты из stdout+stderr (вывод программы).
 * data — base64, чтобы binary-safe пройти через JSON.
 */
export interface PtyDataMessage extends Envelope {
  type: 'pty.data';
  correlation_id: string;
  data: string; // base64
}

/** Master → Agent: изменение размеров «окна» — при resize клиента. */
export interface PtyResizeMessage extends Envelope {
  type: 'pty.resize';
  correlation_id: string;
  cols: number;
  rows: number;
}

/** Master → Agent: закрыть сессию (SIGHUP). */
export interface PtyCloseMessage extends Envelope {
  type: 'pty.close';
  correlation_id: string;
}

/** Agent → Master: shell завершился. */
export interface PtyExitMessage extends Envelope {
  type: 'pty.exit';
  correlation_id: string;
  code: number | null;
  signal?: string | null;
}

/** Agent → Master: ошибка (например, node-pty не установлен). */
export interface PtyErrorMessage extends Envelope {
  type: 'pty.error';
  correlation_id: string;
  message: string;
  /** Если 'missing_node_pty' — клиент покажет инструкцию по установке. */
  code?: 'missing_node_pty' | 'spawn_failed' | 'unknown';
}

// ============ git ============

/** Master → Agent: клонировать репо в указанный parent_path/folder_name.
 *  parent_path должен быть абсолютным путём, который существует на устройстве. */
export interface GitCloneRequest extends Envelope {
  type: 'git.clone';
  id: string;
  /** HTTPS URL репозитория. Поддерживается https://github.com/owner/repo[.git]. */
  repo_url: string;
  /** Абсолютный путь к родителю; финальный путь будет parent_path/folder_name. */
  parent_path: string;
  /** Имя папки. Если совпадает с существующей — ошибка (не перезаписываем). */
  folder_name: string;
  /** Опциональный access-токен GitHub для приватных репо.
   *  Передаётся как https://x-access-token:TOKEN@github.com/... — токен НЕ
   *  оседает в git config (clone'ится, потом мы можем его убрать из remote). */
  token?: string;
  /** depth=1 для shallow-клона. По умолчанию 1 — экономим время и трафик. */
  depth?: number;
}

/** Стриминг прогресса (stderr из git). */
export interface GitCloneProgress extends Envelope {
  type: 'git.clone.progress';
  correlation_id: string;
  text: string;
}

export interface GitCloneReply extends Envelope {
  type: 'git.clone.reply';
  correlation_id: string;
  ok: boolean;
  /** Финальный путь до клонированной папки (если ok). */
  path?: string;
  error?: string;
}

// ============ plugin providers ============

/** Master → Agent: запустить чат через plugin-провайдера. */
export interface ProviderChatRequest extends Envelope {
  type: 'provider.chat';
  id: string;
  /** id провайдера, как объявлено плагином (e.g. 'aider', 'cursor'). */
  provider_id: string;
  prompt: string;
  cwd: string;
  instructions?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'extra-high' | 'max';
  permission_mode?: 'default' | 'plan' | 'accept-edits' | 'bypass';
  session_id?: string;
}

/** Agent → Master: стрим событий от плагина (text/tool_use/done/error/...). */
export interface ProviderChatEvent extends Envelope {
  type: 'provider.chat.event';
  correlation_id: string;
  event:
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input?: unknown }
    | { type: 'tool_result'; tool_use_id?: string; output?: unknown; error?: string }
    | { type: 'session'; session_id: string }
    | { type: 'error'; message: string; code?: string }
    | { type: 'done'; result?: string; session_id?: string };
}

/** Master → Agent: отменить запущенный provider.chat. */
export interface ProviderChatCancel extends Envelope {
  type: 'provider.chat.cancel';
  correlation_id: string;
}

// ============ union ============

export type AnyMessage =
  | HelloMessage | HelloAckMessage | ErrorMessage
  | PingMessage | PongMessage
  | ExecRequest | ExecStdout | ExecStderr | ExecExit
  | ClaudeRequest | ClaudeEvent | ClaudeDone | ClaudeError
  | FsListRequest | FsListReply
  | FsReadRequest | FsReadReply
  | FsWriteRequest | FsWriteReply
  | FsMkdirRequest | FsMkdirReply
  | FsDeleteRequest | FsDeleteReply
  | StatusRequest | StatusReply
  | JobsRecap | JobsResume | JobsAck
  | PtyOpenRequest | PtyOpenedMessage | PtyDataMessage | PtyResizeMessage
  | PtyCloseMessage | PtyExitMessage | PtyErrorMessage
  | GitCloneRequest | GitCloneProgress | GitCloneReply
  | ProviderChatRequest | ProviderChatEvent | ProviderChatCancel;

/** Защита агента: пути к которым НИКОГДА не допускаем fs-операции. */
export const FS_BLOCKLIST_PATTERNS = [
  /(^|\/)\.claude(\/|$)/,                // ~/.claude/**
  /(^|\/)\.config\/claude(\/|$)/,        // ~/.config/claude/**
  /(^|\/)\.ssh(\/|$)/,                   // ~/.ssh/**
  /(^|\/)\.aws(\/|$)/,                   // ~/.aws/**
  /(^|\/)\.gnupg(\/|$)/,                 // ~/.gnupg/**
  /(^|\/)\.pocket-claude(\/|$)/,         // собственный конфиг агента (legacy)
  /(^|\/)\.autmzr-command(\/|$)/,        // собственный конфиг агента
];

export function isPathBlocked(absolutePath: string): boolean {
  return FS_BLOCKLIST_PATTERNS.some((re) => re.test(absolutePath));
}
