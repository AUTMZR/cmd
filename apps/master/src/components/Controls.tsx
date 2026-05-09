'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MODELS as MODEL_CATALOG, DEFAULT_MODEL, PROVIDER_NOTICE, normalizeProvider, type Provider, isValidModel } from '@/lib/models';

// ---------------- Data ----------------
//
// Каталог моделей теперь живёт в `@/lib/models` и делится по провайдерам
// (claude-code / gemini-cli). Здесь только UI-примитивы (pills/popovers)
// и backward-compat легаси-экспортов.

/** Legacy shim — оставляем для строк localStorage с версионными именами
 *  (например 'claude-sonnet-4-6') и для UI, не знающих про провайдера.
 *  Нормализуется в алиасы при резолве.
 */
const LEGACY_MAP: Record<string, string> = {
  'claude-opus-4-7': 'opus',
  'claude-opus-4-7[1m]': 'opus',
  'claude-sonnet-4-6': 'sonnet',
  'claude-haiku-4-5': 'haiku',
};

/** Нормализовать legacy-значение модели в каноничный alias. */
export function normalizeModel(value: string): string {
  return LEGACY_MAP[value] || value;
}

export const EFFORTS = [
  { value: 'low',        label: 'Low' },
  { value: 'medium',     label: 'Medium' },
  { value: 'high',       label: 'High' },
  { value: 'extra_high', label: 'Extra high' },
  { value: 'max',        label: 'Max' },
] as const;

export const MODES = [
  { value: 'default',           label: 'Ask permissions',    hint: null,                       disabled: false },
  { value: 'acceptEdits',       label: 'Accept edits',        hint: null,                       disabled: false },
  { value: 'plan',              label: 'Plan mode',           hint: null,                       disabled: false },
  { value: 'bypassPermissions', label: 'Bypass permissions',  hint: null,                       disabled: false },
  { value: 'auto',              label: 'Auto mode',           hint: 'Enable in Claude Code settings', disabled: true },
] as const;

export type ModelValue = string;
export type EffortValue = typeof EFFORTS[number]['value'];
export type ModeValue = typeof MODES[number]['value'];

/** Старый плоский список — показывает все клод-модели. Используется в местах
 *  где ещё не прокинут provider (TODO: мигрировать). */
export const MODELS = MODEL_CATALOG['claude-code'].map(m => ({ value: m.id, label: m.label }));

// ---------------- Popover primitive ----------------

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return { open, setOpen, ref };
}

// ---------------- Mode pill ----------------

export function ModePill({ value, onChange }: { value: ModeValue; onChange: (v: ModeValue) => void }) {
  const { open, setOpen, ref } = usePopover();
  const current = MODES.find(m => m.value === value) || MODES[0];
  const isBypass = value === 'bypassPermissions';

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      e.preventDefault();
      const pick = MODES[n - 1];
      if (!pick.disabled) { onChange(pick.value); setOpen(false); }
    }
    if (e.key === 'Escape') setOpen(false);
  }
  useEffect(() => {
    if (open) { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }
  }); // eslint-disable-line

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className="font-mono px-2.5 py-1 rounded-md text-[11.5px] inline-flex items-center gap-1"
        style={{
          background: isBypass ? '#f5c94c' : 'var(--surface-2)',
          color: isBypass ? '#2a2620' : 'var(--fg)',
          border: `1px solid ${isBypass ? '#e6b63a' : 'var(--border)'}`,
        }}>
        <span style={{ opacity: isBypass ? .65 : .55, fontWeight: 400 }}>mode=</span>
        <span style={{ fontWeight: 500 }}>{isBypass ? 'Bypass' : current.label.replace(/ permissions| mode/i, '').replace('Ask', 'Ask').trim()}</span>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 rounded-2xl overflow-hidden min-w-[260px] z-20 p-1.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Mode</div>
            <div className="flex gap-1">
              <Kbd>⇧</Kbd><Kbd>⌘</Kbd><Kbd>M</Kbd>
            </div>
          </div>
          {MODES.map((m, i) => (
            <button key={m.value}
              onClick={() => { if (!m.disabled) { onChange(m.value); setOpen(false); } }}
              disabled={m.disabled}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left"
              style={{
                opacity: m.disabled ? .5 : 1,
                background: value === m.value ? 'var(--accent-light)' : 'transparent',
                cursor: m.disabled ? 'not-allowed' : 'pointer',
              }}>
              <span className="flex-1">
                <span className="block">{m.label}</span>
                {m.hint && <span className="block text-[10.5px]" style={{ color: 'var(--muted)' }}>{m.hint}</span>}
              </span>
              {value === m.value && <span style={{ color: 'var(--fg)' }}>✓</span>}
              {!m.disabled && <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{i + 1}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Model + Effort pill ----------------

/**
 * Pill для выбора модели и effort. Провайдер-aware: показывает список моделей
 * из каталога `@/lib/models` для активного провайдера (по проекту).
 *
 * Если `provider` не задан — fallback на claude-code (например, когда чат ещё
 * не привязан к проекту).
 */
export function ModelEffortPill({
  model, effort, onChange, provider = 'claude-code',
}: {
  model: ModelValue;
  effort: EffortValue;
  onChange: (m: ModelValue, e: EffortValue) => void;
  provider?: Provider;
}) {
  const t = useTranslations('app.welcome');
  const tm = useTranslations('models');
  const modelKey = (id: string) => id.replace(/[.-]/g, '_');
  const { open, setOpen, ref } = usePopover();
  const modelsForProvider = MODEL_CATALOG[provider];

  // Если текущая модель не валидна для провайдера — показываем fallback, но
  // НЕ меняем state тут (AppShell отвечает за миграцию при смене проекта).
  const normalized = normalizeModel(model);
  const curModel = modelsForProvider.find(m => m.id === normalized)
                || modelsForProvider.find(m => m.id === DEFAULT_MODEL[provider])!;
  const curEffort = EFFORTS.find(e => e.value === effort) || EFFORTS[1];

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    const n = Number(e.key);
    if (n >= 1 && n <= modelsForProvider.length) {
      e.preventDefault();
      onChange(modelsForProvider[n - 1].id, effort);
    }
    if (e.key === 'Escape') setOpen(false);
  }
  useEffect(() => {
    if (open) { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }
  }); // eslint-disable-line

  const providerLabel = provider === 'gemini-cli' ? 'Gemini' : provider === 'codex-cli' ? 'Codex' : 'Claude';

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className="font-mono px-2.5 py-1 rounded-md text-[11.5px] inline-flex items-center gap-1"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
        <span style={{ fontSize: 13 }}>{curModel.icon}</span>
        <span style={{ fontWeight: 500 }}>{curModel.label}</span>
        <span style={{ opacity: .35 }}>·</span>
        <span style={{ opacity: .55, fontWeight: 400 }}>{curEffort.label.toLowerCase()}</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 rounded-2xl overflow-hidden min-w-[300px] z-20 p-1.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>

          {/* Models */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              {t('statModel')} · {providerLabel}
            </div>
            <div className="flex gap-1"><Kbd>⇧</Kbd><Kbd>⌘</Kbd><Kbd>I</Kbd></div>
          </div>
          {PROVIDER_NOTICE[provider] && (
            <div className="mx-1.5 mb-1 px-2 py-1.5 rounded text-[10.5px]"
              style={{ background: 'var(--accent-light)', color: 'var(--muted)', lineHeight: 1.4 }}>
              🌍 {PROVIDER_NOTICE[provider]}
            </div>
          )}
          {modelsForProvider.map((m, i) => (
            <button key={m.id}
              onClick={() => onChange(m.id, effort)}
              className="w-full flex items-start gap-2 px-2 py-2 rounded-lg text-sm text-left"
              style={{ background: normalized === m.id ? 'var(--accent-light)' : 'transparent' }}>
              <span style={{ fontSize: 14, lineHeight: 1.2 }}>{m.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium">
                  {m.label}
                  {m.experimental && (
                    <span className="ml-1.5 font-mono text-[9px] px-1 py-px rounded align-middle"
                      style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', letterSpacing: '0.05em' }}>
                      BETA
                    </span>
                  )}
                </span>
                <span className="block text-[10.5px]" style={{ color: 'var(--muted)' }}>{tm(`${modelKey(m.id)}.hint`)}</span>
              </span>
              {normalized === m.id && <span>✓</span>}
              <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{i + 1}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="my-1.5 mx-2" style={{ borderTop: '1px solid var(--border)' }} />

          {/* Effort */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Effort</div>
            <div className="flex gap-1"><Kbd>⇧</Kbd><Kbd>⌘</Kbd><Kbd>E</Kbd></div>
          </div>
          {EFFORTS.map(e => (
            <button key={e.value}
              onClick={() => onChange(model, e.value)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
              style={{ background: effort === e.value ? 'var(--accent-light)' : 'transparent' }}>
              <span className="flex-1">{e.label}</span>
              {effort === e.value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded"
      style={{ background: 'var(--accent-light)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
      {children}
    </span>
  );
}

// Re-export для других файлов которые хотят провайдер-aware каталог
export { MODEL_CATALOG, DEFAULT_MODEL, normalizeProvider, isValidModel };
export type { Provider };
