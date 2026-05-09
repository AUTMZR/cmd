'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

interface Props {
  needSetup: boolean;
  /** GitHub OAuth настроен на бэке. Если false — кнопку прячем. */
  githubOauth?: boolean;
  onAuth: (user: any) => void;
}

type Mode = 'login' | 'signup';

/** Опциональный invite-код через URL — admin может раздавать early-access ссылки.
 *  Поле в форме спрятано, код просто прокидывается при отправке. */
function readInviteFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('invite') || '';
}

export default function AuthScreen({ needSetup, githubOauth, onAuth }: Props) {
  const t = useTranslations('auth');
  // needSetup === true → форсим регистрацию первого админа.
  // Иначе публичная регистрация (email + пароль, 14-дневный trial).
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Если пришли по ссылке /?invite=XXX — переключаем в signup-режим.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = readInviteFromUrl();
    if (code && !needSetup) setMode('signup');
  }, [needSetup]);

  // GitHub OAuth callback может вернуть с ошибкой — поднимем её в err.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const oauthErr = new URL(window.location.href).searchParams.get('oauthError');
    if (oauthErr) setErr(t('errorOauth', { reason: oauthErr }));
  }, [t]);

  const isSignup = needSetup || mode === 'signup';
  const subtitleKey = needSetup ? 'subtitleSetup' : isSignup ? 'subtitleSignup' : 'subtitleSignin';
  const submitKey = needSetup ? 'submitSetup' : isSignup ? 'submitSignup' : 'submitSignin';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const body: Record<string, unknown> = { email, password };
    if (isSignup) {
      body.name = name;
      const invite = readInviteFromUrl();
      if (invite && !needSetup) body.inviteCode = invite;
    }
    const r = await api('/api/auth', {
      method: isSignup ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const code = (j.errorCode || j.error) as string | undefined;
      // Локализуем известные коды ошибок; для неизвестных показываем как есть.
      const known = new Set([
        'password_too_short', 'password_needs_letters', 'password_needs_digits', 'password_too_long',
        'email_required', 'user_exists', 'invite_invalid',
      ]);
      const localized = code && known.has(code) ? t(`err.${code}`) : code || t('errorFallback', { status: r.status });
      setErr(localized);
      return;
    }
    const j = await r.json();
    // Публичный signup (не setup-режим, не login) → ведём на /verify-email
    // показать "Check your inbox". Юзер уже залогинен (cookie установлена сервером),
    // поэтому resend-verification со страницы будет работать.
    if (isSignup && !needSetup && !j.user?.email_verified) {
      window.location.href = '/verify-email';
      return;
    }
    onAuth(j.user);
  }

  return (
    <div className="h-dvh flex items-center justify-center p-6 animate-fadeIn"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm animate-fadeUp">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            <Sparkles size={22} strokeWidth={2.2} />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('appName')}</h1>
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--muted)' }}>
            {t(subtitleKey)}
          </p>
        </div>

        {githubOauth && (
          <div className="surface p-6 mb-3 flex flex-col gap-3" style={{ boxShadow: 'var(--shadow)' }}>
            <a href="/api/auth/github"
              className="btn flex items-center justify-center gap-2"
              style={{ background: '#24292f', color: '#fff', border: '1px solid #24292f' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              {isSignup ? t('githubSignup') : t('githubSignin')}
            </a>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
              {t('or')}
              <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
            </div>
          </div>
        )}

        <form onSubmit={submit} className="surface p-6 flex flex-col gap-4" style={{ boxShadow: 'var(--shadow)' }}>
          {isSignup && (
            <div>
              <label className="field-label flex items-center gap-1.5"><UserIcon size={11} />{t('name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder={t('namePlaceholder')} />
            </div>
          )}
          <div>
            <label className="field-label flex items-center gap-1.5"><Mail size={11} />{t('email')}</label>
            <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)}
              className="field" placeholder={t('emailPlaceholder')} autoComplete="email" />
          </div>
          <div>
            <label className="field-label flex items-center gap-1.5"><Lock size={11} />{t('password')}</label>
            <input type="password" value={password} required onChange={(e) => setPassword(e.target.value)}
              className="field" placeholder="•••••••" minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'} />
            {isSignup && (
              <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--muted)' }}>
                {t('passwordHint')}
              </p>
            )}
          </div>
          {err && (
            <div className="text-[12px] px-3 py-2 rounded-lg flex items-start gap-2"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              {err}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary mt-1">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t(submitKey)}
          </button>

          {!needSetup && (
            <button type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }}
              className="text-[12px] underline-offset-2 hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              {mode === 'login' ? t('switchToSignup') : t('switchToSignin')}
            </button>
          )}
        </form>

        <p className="text-center text-[11px] mt-5" style={{ color: 'var(--muted)' }}>
          {t('footer')}
        </p>
      </div>
    </div>
  );
}
