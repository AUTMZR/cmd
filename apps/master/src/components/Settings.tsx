'use client';

/**
 * Settings — глобальные настройки аккаунта и UI.
 *
 * Четыре вкладки:
 *   1. Subscription — состояние trial / Pro / self-host (NEW)
 *   2. Invites      — приглашения и реферальные коды
 *   3. Theme        — выбор темы оформления
 *   4. Account      — профиль + Logout
 *
 * Settings рендерится в двух режимах:
 *   • desktop — модалка по центру
 *   • mobile  — inline-content внутри bottom-tab `settings` (embedded)
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles, Ticket, Palette, User as UserIcon, X, LogOut, Check, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

const InvitesPanel = dynamic(() => import('./InvitesPanel'), { ssr: false, loading: () => null });

interface User {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  trial_until: string | null;
}

const THEMES = ['soft', 'light', 'dark'] as const;
type Theme = typeof THEMES[number];

type Tab = 'billing' | 'invites' | 'theme' | 'account';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Settings({
  user,
  theme,
  onThemeChange,
  onClose,
  embedded = false,
}: {
  user: User;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  /** Закрытие модалки. На embedded-режиме игнорируется. */
  onClose: () => void;
  /** На мобиле — рендерим inline (без модалки). */
  embedded?: boolean;
}) {
  const t = useTranslations('settings');
  const [tab, setTab] = useState<Tab>('billing');

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    location.reload();
  }

  const TABS: Array<{ id: Tab; label: string; icon: typeof Ticket }> = [
    { id: 'billing',  label: t('tabs.billing'),  icon: Sparkles },
    { id: 'invites',  label: t('tabs.invites'),  icon: Ticket },
    { id: 'theme',    label: t('tabs.theme'),    icon: Palette },
    { id: 'account',  label: t('tabs.account'),  icon: UserIcon },
  ];

  const tabStrip = (
    <div
      className="flex gap-1 px-2 py-2 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border)' }}
      role="tablist"
    >
      {TABS.map((tt) => {
        const Icon = tt.icon;
        const active = tab === tt.id;
        return (
          <button
            key={tt.id}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(tt.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium shrink-0"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--fg-2)',
              minHeight: 44,
            }}
          >
            <Icon size={14} />
            {tt.label}
          </button>
        );
      })}
    </div>
  );

  const body = (
    <>
      {tab === 'billing' && <BillingPanel user={user} />}

      {tab === 'invites' && (
        <div className="py-2">
          <InvitesPanel />
        </div>
      )}

      {tab === 'theme' && (
        <div className="p-5">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
            {t('tabs.theme')}
          </div>
          <div className="flex gap-2 flex-wrap">
            {THEMES.map((th) => (
              <button
                key={th}
                onClick={() => onThemeChange(th)}
                className="px-4 py-2 rounded-full text-sm"
                style={{
                  background: theme === th ? 'var(--accent)' : 'var(--accent-light)',
                  color: theme === th ? 'var(--bg)' : 'var(--fg)',
                  minHeight: 44,
                }}
              >
                {th}
              </button>
            ))}
          </div>
          <p className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>
            {t('themeHint')}
          </p>
        </div>
      )}

      {tab === 'account' && (
        <div className="p-5">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
            {t('tabs.account')}
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-base"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            >
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name || '—'}</div>
              <div className="text-[12px] truncate" style={{ color: 'var(--muted)' }}>
                {user.email}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--accent-light)',
              color: 'var(--danger)',
              border: '1px solid var(--border)',
              minHeight: 44,
            }}
          >
            <LogOut size={14} />
            {t('logout')}
          </button>
        </div>
      )}
    </>
  );

  // === Embedded (mobile inline) =====================================
  if (embedded) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
        {tabStrip}
        <div className="flex-1 overflow-y-auto">{body}</div>
      </div>
    );
  }

  // === Modal (desktop) ==============================================
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ color: 'var(--muted)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {tabStrip}
        <div className="flex-1 overflow-y-auto">{body}</div>
      </div>
    </div>
  );
}

/**
 * Subscription state-машина:
 *  - is_admin === true                     → "Administrator" (бесконечный доступ)
 *  - trial_until === null && !admin        → "Self-hosted" (no limits)
 *  - trial_until > NOW()                   → "Trial active" с countdown
 *  - trial_until <= NOW()                  → "Trial expired" + Upgrade CTA
 */
function BillingPanel({ user }: { user: User }) {
  const tb = useTranslations('billing');
  const adminMode = user.is_admin;
  const selfHostMode = !adminMode && user.trial_until === null;

  let trialState: 'active' | 'expired' | null = null;
  let daysLeft = 0;
  let validUntilDate: Date | null = null;

  if (!adminMode && user.trial_until) {
    const ts = Date.parse(user.trial_until);
    if (!Number.isNaN(ts)) {
      validUntilDate = new Date(ts);
      const msLeft = ts - Date.now();
      daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
      trialState = msLeft > 0 ? 'active' : 'expired';
    }
  }

  return (
    <div className="p-5 space-y-5">
      {adminMode && (
        <Card tone="vibrant" icon={Check} title={tb('adminTitle')}>
          <p className="text-[13px] leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
            {tb('selfHostedBody')}
          </p>
        </Card>
      )}

      {selfHostMode && (
        <Card tone="vibrant" icon={Check} title={tb('selfHostedTitle')}>
          <p className="text-[13px] leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
            {tb('selfHostedBody')}
          </p>
        </Card>
      )}

      {trialState === 'active' && validUntilDate && (
        <Card tone={daysLeft <= 3 ? 'urgent' : 'vibrant'} icon={Sparkles} title={tb('trial')}>
          <Stat label={tb('trialActive')} value={tb('trialDaysLeft', { days: daysLeft })} />
          <Stat label={tb('trialUntil')} value={validUntilDate.toLocaleDateString()} />
          <UpgradeButton label={tb('upgradeFromTrial')} />
          <p className="text-[12px] mt-3 leading-[1.55]" style={{ color: 'var(--muted)' }}>
            {tb('tagline')}
          </p>
        </Card>
      )}

      {trialState === 'expired' && (
        <Card tone="urgent" icon={AlertCircle} title={tb('trialExpired')}>
          <p className="text-[13px] mb-4 leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
            {tb('comingSoonBody', { email: user.email })}
          </p>
          <UpgradeButton label={tb('upgradeFromTrial')} />
        </Card>
      )}
    </div>
  );
}

function Card({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'vibrant' | 'urgent';
  icon: typeof Sparkles;
  title: string;
  children: React.ReactNode;
}) {
  const accent = tone === 'urgent' ? 'var(--danger)' : 'var(--vibrant)';
  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: tone === 'urgent' ? 'rgba(248,113,113,.12)' : 'var(--vibrant-tint, rgba(95,184,120,.14))', color: accent }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </div>
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12px] uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

function UpgradeButton({ label }: { label: string }) {
  return (
    <a
      href="/#pricing"
      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14px] font-semibold"
      style={{ background: 'var(--vibrant)', color: 'var(--vibrant-fg, #fff)', minHeight: 44 }}
    >
      {label}
    </a>
  );
}
