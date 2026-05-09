'use client';

/**
 * DevicesList — единый список устройств юзера.
 *
 * Заменяет «devices»-секцию из старого Settings.tsx и dashboard-список из welcome-экрана.
 * Тап по карточке открывает focused-модалку `DeviceSheet` (через onOpen) — там
 * вся работа с конкретным девайсом: install Claude / Gemini / выбор preferred_agent /
 * корень проектов / browse / отключение.
 *
 * Используется:
 *   • На мобиле — внутри bottom-tab «devices»
 *   • На desktop — может быть встроен в welcome или как модалка-панель (по желанию)
 */

import type { DeviceSheetDevice } from './DeviceSheet';
import { effectiveIntent } from '@/lib/device-intent';
import { Plus, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface DevicesListProps {
  devices: DeviceSheetDevice[];
  /** Тап по карточке. Откроет DeviceSheet с этим девайсом. */
  onOpen: (d: DeviceSheetDevice) => void;
  /** Кнопка «+ Подключить устройство». Откроет DeviceAddModal. */
  onAdd: () => void;
  /** Pull-to-refresh / кнопка обновления. */
  onReload?: () => void;
}

export default function DevicesList({ devices, onOpen, onAdd, onReload }: DevicesListProps) {
  const t = useTranslations('device.list');
  // Empty state — большая иконка + primary CTA
  if (devices.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}
        >
          <MonitorSmartphone size={36} style={{ color: 'var(--muted)' }} strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">{t('emptyTitle')}</h2>
        <p className="text-[13px] mb-6 max-w-[280px]" style={{ color: 'var(--muted)' }}>
          {t('emptySubtitle')}
        </p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-medium"
          style={{
            background: 'var(--accent)',
            color: 'var(--bg)',
            minHeight: 44,
          }}
        >
          <Plus size={16} />
          {t('emptyCta')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Header bar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <div className="text-[15px] font-semibold leading-tight">{t('title')}</div>
          <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {t('onlineSummary', { online: devices.filter((d) => d.online).length, total: devices.length })}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onReload && (
            <button
              onClick={onReload}
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ color: 'var(--muted)' }}
              aria-label={t('refresh')}
              title={t('refresh')}
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg)',
              minHeight: 40,
            }}
          >
            <Plus size={14} />
            {t('connect')}
          </button>
        </div>
      </div>

      {/* Список карточек */}
      <div className="p-3 space-y-2">
        {devices.map((d) => (
          <DeviceCard key={d.id} device={d} onOpen={() => onOpen(d)} />
        ))}
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  onOpen,
}: {
  device: DeviceSheetDevice;
  onOpen: () => void;
}) {
  const t = useTranslations('device');
  const role = effectiveIntent(device);
  const isClaudeRole = role === 'claude';

  // Статус AI-агентов — компактная сводка для карточки.
  const claudeStatus =
    device.agent_logged_in === true ? 'ready' :
    device.agent_installed === true ? 'no-login' :
    device.agent_installed === false ? 'not-installed' :
    'unknown';
  const geminiStatus =
    device.gemini_logged_in === true ? 'ready' :
    device.gemini_installed === true ? 'no-login' :
    'not-installed';
  const codexStatus =
    device.codex_logged_in === true ? 'ready' :
    device.codex_installed === true ? 'no-login' :
    'not-installed';

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl overflow-hidden transition-colors hover:bg-[var(--surface-2)]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        minHeight: 44,
      }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Avatar / role icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
          style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}
          aria-hidden
        >
          {isClaudeRole ? '🤖' : '📂'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold leading-tight">{device.name}</span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
              style={{
                background: device.online ? 'var(--ok, #047857)' : 'var(--danger, #b91c1c)',
                color: '#fff',
              }}
            >
              {device.online ? 'online' : 'offline'}
            </span>
          </div>
          <div
            className="font-mono text-[11px] mt-1 truncate"
            style={{ color: 'var(--muted)' }}
          >
            {device.hostname || device.id.slice(0, 8)}
            {device.os ? ` · ${device.os}/${device.arch}` : ''}
          </div>

          {/* AI-агенты */}
          {isClaudeRole && device.online && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <AgentChip
                label="Claude"
                emoji="🤖"
                status={claudeStatus}
                preferred={(device.preferred_agent || 'claude-code') === 'claude-code'}
              />
              <AgentChip
                label="Gemini"
                emoji="✨"
                status={geminiStatus}
                preferred={device.preferred_agent === 'gemini-cli'}
              />
              <AgentChip
                label="Codex"
                emoji="⌘"
                status={codexStatus}
                preferred={device.preferred_agent === 'codex-cli'}
              />
            </div>
          )}

          {device.root_path && (
            <div
              className="font-mono text-[11px] mt-1.5 truncate"
              style={{ color: 'var(--muted)' }}
            >
              {t('rootLabel')}: {device.root_path}
            </div>
          )}
        </div>

        {/* Chevron */}
        <span
          className="font-mono text-[14px] shrink-0 self-center pl-1"
          style={{ color: 'var(--muted)' }}
          aria-hidden
        >
          ›
        </span>
      </div>
    </button>
  );
}

function AgentChip({
  label,
  emoji,
  status,
  preferred,
}: {
  label: string;
  emoji: string;
  status: 'ready' | 'no-login' | 'not-installed' | 'unknown';
  preferred: boolean;
}) {
  const t = useTranslations('device.agentChip');
  const color =
    status === 'ready' ? 'var(--ok, #047857)' :
    status === 'no-login' ? 'var(--warn, #b45309)' :
    'var(--muted)';
  const text =
    status === 'ready' ? '✓' :
    status === 'no-login' ? `⚠ ${t('needLogin')}` :
    status === 'not-installed' ? t('setup') :
    '—';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
      style={{
        background: 'var(--surface-2)',
        border: preferred ? '1px solid var(--accent)' : '1px solid var(--border)',
        color,
      }}
    >
      <span aria-hidden>{emoji}</span>
      <span>{label}</span>
      <span style={{ color }}>{text}</span>
    </span>
  );
}
