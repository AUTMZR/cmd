'use client';

/**
 * Bottom sheet для мобильного композера — всё что раньше было в двух popover-pills
 * (mode / model / effort) и двух mobile-tab-bar кнопках (files / terminal) собрано в одну шторку.
 * Открывается тапом по [+] рядом с textarea или по pill «Sonnet 4.6 · Bypass» под композером.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODES, EFFORTS, MODEL_CATALOG, normalizeModel, type ModelValue, type EffortValue, type ModeValue, type Provider } from './Controls';
import { PROVIDER_NOTICE } from '@/lib/models';
import { COMMANDS } from './slashCommands';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: ModeValue;
  onModeChange: (m: ModeValue) => void;
  model: ModelValue;
  onModelChange: (m: ModelValue) => void;
  effort: EffortValue;
  onEffortChange: (e: EffortValue) => void;
  /** Provider активного проекта — фильтрует список моделей. По умолчанию claude-code. */
  provider?: Provider;
  onOpenFiles?: () => void;
  onOpenTerminal?: () => void;
  /** Вставить команду в input композера (и закрыть шторку). Юзер сам жмёт Send. */
  onInsertCommand?: (text: string) => void;
}

export default function MobileChatSheet({
  open, onClose,
  mode, onModeChange,
  model, onModelChange,
  effort, onEffortChange,
  provider = 'claude-code',
  onOpenFiles, onOpenTerminal, onInsertCommand,
}: Props) {
  const t = useTranslations('mobileChat');
  const tm = useTranslations('models');
  const modelKey = (id: string) => id.replace(/[.-]/g, '_');
  const MODELS_FOR_PROVIDER = MODEL_CATALOG[provider];
  const normalizedModel = normalizeModel(model);
  const [commandsOpen, setCommandsOpen] = useState(false);
  // При закрытии всей шторки — схлопываем внутренний раскрытый список команд
  useEffect(() => { if (!open) setCommandsOpen(false); }, [open]);
  // Блокируем прокрутку body пока шторка открыта.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc закрывает.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,.42)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />
      {/* sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[22px] overflow-y-auto"
        style={{
          background: 'var(--bg)',
          boxShadow: '0 -10px 40px rgba(0,0,0,.18)',
          maxHeight: '82vh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .28s cubic-bezier(.22,1,.36,1)',
          paddingBottom: 'calc(22px + env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4">
          <div className="w-11 h-1 rounded-full mx-auto my-2" style={{ background: 'var(--border-strong)' }} />
          <h2 className="text-[17px] font-semibold">{t('title')}</h2>
          <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{t('subtitle')}</p>

          {/* Mode */}
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] pt-4 pb-2 px-1"
            style={{ color: 'var(--muted)' }}>{t('modeHeader')}</div>
          <div className="flex gap-2 flex-wrap">
            {MODES.filter(m => !m.disabled).map(m => {
              const isBypass = m.value === 'bypassPermissions';
              const on = mode === m.value;
              return (
                <button key={m.value} type="button"
                  onClick={() => onModeChange(m.value)}
                  className="px-3.5 py-2 rounded-full text-[14px] font-medium"
                  style={{
                    background: on ? (isBypass ? '#f5c94c' : 'var(--accent)') : 'var(--surface)',
                    color: on ? (isBypass ? '#2a2620' : 'var(--bg)') : 'var(--fg-2)',
                    border: `1px solid ${on ? (isBypass ? '#e6b63a' : 'var(--accent)') : 'var(--border)'}`,
                  }}>
                  {isBypass ? '⚡ Bypass' : m.label.replace(/ permissions| mode/i, '').trim()}
                </button>
              );
            })}
          </div>

          {/* Model */}
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] pt-5 pb-2 px-1"
            style={{ color: 'var(--muted)' }}>
            {t('modelHeader', { provider: provider === 'gemini-cli' ? 'Gemini' : provider === 'codex-cli' ? 'Codex' : 'Claude' })}
          </div>
          {PROVIDER_NOTICE[provider] && (
            <div className="mb-2 px-3 py-2 rounded-[10px] text-[12px]"
              style={{ background: 'var(--accent-light)', color: 'var(--muted)', lineHeight: 1.4 }}>
              🌍 {PROVIDER_NOTICE[provider]}
            </div>
          )}
          <div className="rounded-[14px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {MODELS_FOR_PROVIDER.map((m, i) => {
              const on = normalizedModel === m.id;
              return (
                <button key={m.id} type="button"
                  onClick={() => onModelChange(m.id)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left text-[15px]"
                  style={{ borderBottom: i < MODELS_FOR_PROVIDER.length - 1 ? '1px solid var(--border)' : '0' }}>
                  <span className="w-6 text-center text-[16px] opacity-85">{m.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block">
                      {m.label}
                      {m.experimental && (
                        <span className="ml-2 font-mono text-[10px] px-1.5 py-px rounded align-middle"
                          style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', letterSpacing: '0.05em' }}>
                          BETA
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{tm(`${modelKey(m.id)}.hint`)}</span>
                  </span>
                  {on && <span className="font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* Effort */}
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] pt-5 pb-2 px-1"
            style={{ color: 'var(--muted)' }}>{t('effortHeader')}</div>
          <div className="flex gap-2 flex-wrap">
            {EFFORTS.map(e => {
              const on = effort === e.value;
              return (
                <button key={e.value} type="button"
                  onClick={() => onEffortChange(e.value)}
                  className="px-3.5 py-2 rounded-full text-[14px] font-medium"
                  style={{
                    background: on ? 'var(--accent)' : 'var(--surface)',
                    color: on ? 'var(--bg)' : 'var(--fg-2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                  {e.label.toLowerCase()}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] pt-5 pb-2 px-1"
            style={{ color: 'var(--muted)' }}>{t('quickActionsHeader')}</div>
          <div className="rounded-[14px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {/* Файлы устройства (скрыто если колбек не передан — теперь через slash /files) */}
            {onOpenFiles && (
              <button type="button"
                onClick={() => { onOpenFiles(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px]"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="w-6 text-center font-mono opacity-85">📁</span>
                <span className="flex-1">{t('deviceFiles')}</span>
                <span className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>⌘F</span>
              </button>
            )}

            {/* Terminal (аналогично — скрыто если колбек не передан) */}
            {onOpenTerminal && (
              <button type="button"
                onClick={() => { onOpenTerminal(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px]"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="w-6 text-center font-mono opacity-85">&gt;_</span>
                <span className="flex-1">{t('terminal')}</span>
                <span className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>⌘T</span>
              </button>
            )}

            {/* Slash-команды — аккордеон */}
            <button type="button"
              onClick={() => setCommandsOpen(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px]"
              style={{ borderBottom: commandsOpen ? '1px solid var(--border)' : '1px solid var(--border)' }}
              aria-expanded={commandsOpen}>
              <span className="w-6 text-center font-mono opacity-85">/</span>
              <span className="flex-1">{t('allSlashCommands')}</span>
              <span className="font-mono text-[11.5px] transition-transform duration-200"
                style={{
                  color: 'var(--muted)',
                  transform: commandsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▾</span>
            </button>

            {/* Раскрывающийся список команд. Тап по команде → вставка в input. */}
            {commandsOpen && (
              <div className="max-h-[280px] overflow-y-auto"
                style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {COMMANDS.map((c, i, arr) => {
                  // Команды с args ждут ввода → вставляем "/cmd " с пробелом в конце.
                  // Без args → вставляем "/cmd" чистым — юзер жмёт Send.
                  const toInsert = c.name + (c.args ? ' ' : '');
                  return (
                    <button key={c.name} type="button"
                      onClick={() => {
                        if (onInsertCommand) onInsertCommand(toInsert);
                        onClose();
                      }}
                      className="w-full flex items-baseline gap-2.5 px-4 py-2.5 text-left"
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : '0' }}>
                      <span className="font-mono text-[13px] shrink-0" style={{ color: 'var(--accent)' }}>
                        {c.name}
                      </span>
                      {c.args && (
                        <span className="font-mono text-[11.5px] shrink-0" style={{ color: 'var(--muted)' }}>
                          {c.args}
                        </span>
                      )}
                      <span className="text-[12.5px] truncate min-w-0 flex-1" style={{ color: 'var(--fg-2)' }}>
                        {c.description}
                      </span>
                      {c.kind === 'claude' && (
                        <span className="font-mono text-[9.5px] px-1 py-px rounded shrink-0"
                          style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                          claude
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Прикрепить файл — disabled */}
            <button type="button" disabled
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] opacity-50">
              <span className="w-6 text-center font-mono opacity-85">📎</span>
              <span className="flex-1">{t('attachFile')}</span>
              <span className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{t('soonBadge')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
