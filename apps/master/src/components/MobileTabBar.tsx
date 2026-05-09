'use client';

/**
 * MobileTabBar — iOS-style bottom-tab-bar навигации для мобильного layout.
 *
 * Четыре раздела приложения на мобиле:
 *   • Главная    — текущий чат / welcome
 *   • Чаты       — список всех чатов (sessions)
 *   • Устройства — список устройств (DevicesList)
 *   • Профиль    — Settings (Invites/Theme/Account + Logout), показывается как
 *                  аватар-буква; ПЕРЕИМЕНОВАН из «Settings» — то же содержимое,
 *                  но заход через профиль юзера, без отдельного settings-пункта.
 *
 * Только мобильный layout (`md:hidden`). На desktop есть левый sidebar с юзер-блоком
 * внизу — тоже открывает Settings.
 *
 * Высота 54px + safe-area для iOS home-indicator.
 */

import { Home, MessagesSquare, MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type MobileTab = 'home' | 'chats' | 'devices' | 'settings';
// settings = «Профиль» в UI, но id оставлен для совместимости с state.

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  /** Цифры-бейджи рядом с иконками. */
  badges?: { chats?: number; devices?: number };
  /** Инициал юзера для profile-tab (аватар). */
  userInitial?: string;
}

export default function MobileTabBar({ active, onChange, badges, userInitial = '·' }: MobileTabBarProps) {
  const t = useTranslations('mobileTabs');
  const FIXED_TABS: Array<{ id: Exclude<MobileTab, 'settings'>; label: string; icon: typeof Home }> = [
    { id: 'home', label: t('home'), icon: Home },
    { id: 'chats', label: t('chats'), icon: MessagesSquare },
    { id: 'devices', label: t('devices'), icon: MonitorSmartphone },
  ];
  return (
    <nav
      role="tablist"
      aria-label={t('home') /* fallback aria-label */}
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex items-stretch"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -1px 0 rgba(0,0,0,.02)',
      }}
    >
      {FIXED_TABS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        const badgeRaw =
          t.id === 'chats' ? badges?.chats :
          t.id === 'devices' ? badges?.devices :
          undefined;
        const badge = typeof badgeRaw === 'number' && badgeRaw > 0 ? badgeRaw : undefined;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            aria-label={t.label}
            onClick={() => onChange(t.id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
            style={{
              minHeight: 54,
              color: isActive ? 'var(--accent)' : 'var(--muted)',
              fontWeight: isActive ? 600 : 400,
              transition: 'color 120ms ease',
            }}
          >
            <span className="relative inline-flex">
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              {badge !== undefined && (
                <span
                  className="absolute -top-1 -right-2 inline-flex items-center justify-center font-mono"
                  style={{
                    minWidth: 16, height: 16, padding: '0 4px',
                    fontSize: 10, lineHeight: '16px', borderRadius: 8,
                    background: 'var(--accent)', color: 'var(--bg)',
                  }}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10.5, lineHeight: 1.1 }}>{t.label}</span>
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2"
                style={{ width: 28, height: 2, background: 'var(--accent)', borderRadius: 0 }}
              />
            )}
          </button>
        );
      })}

      {/* Profile tab — аватар с первой буквой юзера, не generic-иконка */}
      <button
        role="tab"
        aria-selected={active === 'settings'}
        aria-label={t('profile')}
        onClick={() => onChange('settings')}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
        style={{
          minHeight: 54,
          color: active === 'settings' ? 'var(--accent)' : 'var(--muted)',
          fontWeight: active === 'settings' ? 600 : 400,
          transition: 'color 120ms ease',
        }}
      >
        <span
          className="inline-flex items-center justify-center font-semibold"
          style={{
            width: 24, height: 24, borderRadius: '50%',
            background: active === 'settings' ? 'var(--accent)' : 'var(--surface-2)',
            color: active === 'settings' ? 'var(--bg)' : 'var(--fg-2)',
            border: active === 'settings' ? 'none' : '1px solid var(--border)',
            fontSize: 12,
          }}
        >
          {userInitial.toUpperCase()}
        </span>
        <span style={{ fontSize: 10.5, lineHeight: 1.1 }}>{t('profile')}</span>
        {active === 'settings' && (
          <span
            className="absolute top-0 left-1/2 -translate-x-1/2"
            style={{ width: 28, height: 2, background: 'var(--accent)', borderRadius: 0 }}
          />
        )}
      </button>
    </nav>
  );
}
