/**
 * Autmzr Plugin API v1 — публичный контракт для community-плагинов.
 *
 * Что такое плагин:
 *   • npm-пакет (или одиночный .js) который default-export'ит `AIProvider`.
 *   • Лежит в `~/.autmzr-command/plugins/<name>/index.js` либо
 *     `~/.autmzr-command/plugins/<name>.js`.
 *   • Агент сканит папку при старте, динамически импортирует, регистрирует.
 *
 * Что плагин делает:
 *   • Объявляет `id`, `label`, `models[]` — UI показывает их в селекторе.
 *   • Реализует `status()` — мастер периодически опрашивает (installed/logged_in/version).
 *   • Реализует `chat(req, emit)` — стримит ответы AI в формате `ChatEvent`.
 *
 * Что плагин НЕ делает в v1:
 *   • Install/login UX — пользователь настраивает CLI/SDK сам, плагин
 *     только проверяет статус.
 *   • Custom UI — UI стандартный, плагин в нём отображается через `label` + `models`.
 *
 * Стабильность контракта:
 *   • Major-bumps `apiVersion` ломают совместимость. Агент проверяет, что
 *     plugin.apiVersion === 1, иначе пропускает с предупреждением.
 */

export const PLUGIN_API_VERSION = 1;

// ---------------------------- Provider --------------------------------------

export interface ModelSpec {
  /** ID, который агент передаёт в CLI/SDK как `--model`. */
  id: string;
  /** Короткое имя для UI. */
  label: string;
  /** Эмодзи или один символ — визуальный якорь. */
  icon?: string;
  /** Описание — когда брать эту модель. */
  hint?: string;
  /** Категория цены — UI может показывать badge. */
  tier?: 'cheap' | 'balanced' | 'premium';
  /** Если true, рисуем «BETA» — для нестабильных или регионально ограниченных. */
  experimental?: boolean;
}

export interface ProviderStatus {
  /** CLI/SDK установлен на устройстве. */
  installed: boolean;
  /** Учётка/токен есть, можно дёргать API. */
  logged_in: boolean;
  /** Версия CLI/SDK (если знаем). */
  version?: string;
  /** Опциональное человекочитаемое сообщение — например, причина !logged_in. */
  note?: string;
}

export interface ChatRequest {
  /** UUID запроса — чтобы coррелировать события. */
  id: string;
  /** Само сообщение от юзера. */
  prompt: string;
  /** Текущая директория проекта — рабочий каталог CLI. */
  cwd: string;
  /** Опциональный system-prompt / instructions из проекта. */
  instructions?: string;
  /** ID модели из `models[]`. */
  model?: string;
  /** Reasoning effort: low/medium/high — провайдер сам решает что это значит. */
  effort?: 'low' | 'medium' | 'high' | 'extra-high' | 'max';
  /**
   * Подсказка по permission-режиму — провайдер маппит как умеет.
   * Не все провайдеры поддерживают.
   */
  permission_mode?: 'default' | 'plan' | 'accept-edits' | 'bypass';
  /**
   * ID предыдущей сессии если провайдер умеет их сохранять
   * (Claude Code: claude_session_id). Плагин может игнорировать.
   */
  session_id?: string;
}

/** Тип событий, который плагин эмитит во время `chat()`. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; output?: unknown; error?: string }
  | { type: 'session'; session_id: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; result?: string; session_id?: string };

export type Emit = (event: ChatEvent) => void;

/** Хэндл для отмены — плагин ДОЛЖЕН реагировать на сигнал и убивать процесс. */
export interface CancelToken {
  signal: AbortSignal;
  /** true если токен был отменён (тонкая обёртка над signal.aborted). */
  readonly cancelled: boolean;
}

export interface AIProvider {
  /** Уникальный id, не пересекается с другими провайдерами. Используется в URL/БД. */
  id: string;
  /** Что показывать в UI ("Claude Code", "Aider", "Cursor"). */
  label: string;
  /** Версия Plugin API, против которой написан плагин. Должна быть === PLUGIN_API_VERSION. */
  apiVersion: number;
  /** Список моделей, которые плагин умеет роутить. Может быть пустым массивом. */
  models: ModelSpec[];
  /**
   * Текущий статус: установлен ли CLI, залогинен ли. Мастер опрашивает периодически.
   * Должен быть быстрым (<2s) — это блокирует UI.
   */
  status: () => Promise<ProviderStatus>;
  /**
   * Стриминговый чат. Должен:
   *   • Эмитить text/tool_use/tool_result через `emit`.
   *   • Завершиться вызовом emit({type:'done'}) или emit({type:'error'}).
   *   • Реагировать на cancel.signal — убить subprocess/abort fetch.
   * Возвращает Promise который резолвится после финального события.
   */
  chat: (req: ChatRequest, emit: Emit, cancel: CancelToken) => Promise<void>;
}

// --- Helper для авторов плагинов: создать CancelToken ----------------------

export function makeCancelToken(): CancelToken & { cancel: () => void } {
  const ctrl = new AbortController();
  return {
    signal: ctrl.signal,
    get cancelled() { return ctrl.signal.aborted; },
    cancel: () => ctrl.abort(),
  };
}

/** Default-export shape для плагина. Один файл = один провайдер. */
export interface PluginModule {
  default: AIProvider;
}
