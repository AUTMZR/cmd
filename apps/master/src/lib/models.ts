/**
 * Каталог доступных моделей по провайдерам.
 *
 * Используется для:
 *   • дропдауна выбора модели в UI (ProjectCreateModal + composer pill)
 *   • fallback-цепочки в /api/chat: session.model → project.default_model → DEFAULT[provider]
 *   • валидации на API-ручках (чтобы не отправить «claude-sonnet» в gemini-cli)
 *
 * Формат model-id соответствует тому, что принимает `--model` / `-m` у CLI:
 *   • Claude Code принимает алиасы: 'haiku' | 'sonnet' | 'opus'
 *     (эквивалентно claude-{haiku,sonnet,opus}-{current})
 *   • Gemini CLI принимает полное имя: 'gemini-2.5-pro' | 'gemini-2.5-flash' и т.д.
 *
 * Цены обновляются вручную раз в 2-3 месяца. Это ОК — список моделей тоже редко
 * меняется. Когда появится новое поколение (Opus 5, Gemini 3) — одна правка здесь.
 */

export type Provider = 'claude-code' | 'gemini-cli' | 'codex-cli';

export interface ModelSpec {
  /** ID как передаётся в CLI через --model / -m */
  id: string;
  /** Короткое имя для UI (Haiku / Sonnet / Opus) */
  label: string;
  /** Иконка-emoji — быстрая визуальная якорь */
  icon: string;
  /** 1-2 словных тега для списка: «быстрая», «баланс», «мощная» */
  tags: string[];
  /** Описание под лейблом — когда брать */
  hint: string;
  /** Категория «дешевизны» для быстрой оценки — cheap/balanced/premium */
  tier: 'cheap' | 'balanced' | 'premium';
  /** Если true — рисуем «BETA» бейдж рядом с label. Используется для
   *  провайдеров с региональными ограничениями (Gemini блочит RU/CN/etc).  */
  experimental?: boolean;
}

/** Заметка-предупреждение на уровне провайдера. Показывается в DeviceSheet
 *  и в pill при выборе модели. NULL = провайдер стабилен. */
export const PROVIDER_NOTICE: Record<Provider, string | null> = {
  'claude-code': null,
  'gemini-cli':
    'Gemini API ограничен Google по странам (Россия, Китай, Иран и др. — блокируются). ' +
    'Если получаешь «User location is not supported» — нужен VPN на сервере или ' +
    'отдельный агент в неблокированной локации.',
  'codex-cli': 'Codex CLI требует локальный вход через `codex` или OPENAI_API_KEY на устройстве.',
};

export const MODELS: Record<Provider, ModelSpec[]> = {
  'claude-code': [
    {
      id: 'haiku',
      label: 'Haiku',
      icon: '💡',
      tags: ['быстрая', 'бюджет'],
      hint: 'Простые правки, бойлерплейт, CRUD',
      tier: 'cheap',
    },
    {
      id: 'sonnet',
      label: 'Sonnet',
      icon: '🎯',
      tags: ['баланс'],
      hint: 'Подходит для 80% задач — по умолчанию',
      tier: 'balanced',
    },
    {
      id: 'opus',
      label: 'Opus',
      icon: '🧠',
      tags: ['умная', 'дорогая'],
      hint: 'Архитектура, сложная отладка, глубокий анализ',
      tier: 'premium',
    },
  ],
  'gemini-cli': [
    {
      id: 'gemini-2.5-flash',
      label: 'Flash',
      icon: '💨',
      tags: ['быстрая', 'бюджет'],
      hint: 'Быстрая и дешёвая — для простых задач и bulk-обработки',
      tier: 'cheap',
      experimental: true,
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Pro',
      icon: '🎯',
      tags: ['умная'],
      hint: 'Серьёзные задачи, большой контекст',
      tier: 'premium',
      experimental: true,
    },
  ],
  'codex-cli': [
    {
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      icon: '⌘',
      tags: ['агентная', 'мощная'],
      hint: 'Самая сильная Codex-модель для сложных coding-задач',
      tier: 'premium',
      experimental: true,
    },
    {
      id: 'gpt-5-codex',
      label: 'GPT-5 Codex',
      icon: '⚡',
      tags: ['баланс'],
      hint: 'Быстрее и дешевле для обычных задач разработки',
      tier: 'balanced',
      experimental: true,
    },
  ],
};

/** Hardcoded per-provider default — финальный fallback если нигде нет явного выбора. */
export const DEFAULT_MODEL: Record<Provider, string> = {
  'claude-code': 'sonnet',
  'gemini-cli': 'gemini-2.5-pro',
  'codex-cli': 'gpt-5.3-codex',
};

export function normalizeProvider(value: string | null | undefined): Provider {
  return value === 'gemini-cli' || value === 'codex-cli' ? value : 'claude-code';
}

/** Найти spec модели по id в рамках провайдера. */
export function findModel(provider: Provider, id: string | null | undefined): ModelSpec | null {
  if (!id) return null;
  return MODELS[provider].find((m) => m.id === id) || null;
}

/**
 * Выбрать модель для чата по fallback-цепочке.
 * Возвращает ГАРАНТИРОВАННО валидный id для данного провайдера.
 *
 * Пример: если у проекта default_model='gemini-2.5-pro', а провайдер сейчас
 * claude-code (переключили default_agent на устройстве) — project.default_model
 * не подходит, падаем в DEFAULT_MODEL.
 */
export function resolveModel(
  provider: Provider,
  sessionModel: string | null | undefined,
  projectDefault: string | null | undefined,
): string {
  if (sessionModel && findModel(provider, sessionModel)) return sessionModel;
  if (projectDefault && findModel(provider, projectDefault)) return projectDefault;
  return DEFAULT_MODEL[provider];
}

/** Список валидных id моделей — для валидации на API. */
export function isValidModel(provider: Provider, id: string): boolean {
  return findModel(provider, id) !== null;
}
