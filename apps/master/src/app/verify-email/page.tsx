'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import '../globals.css';

type State = 'idle' | 'verifying' | 'success' | 'error';

/**
 * Multi-purpose страница:
 *   /verify-email                — "Check your inbox" (после signup)
 *   /verify-email?token=XXX      — валидирует токен и показывает success/error
 */
export default function VerifyEmailPage() {
  const t = useTranslations('verifyEmail');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState<State>(token ? 'verifying' : 'idle');
  const [errorCode, setErrorCode] = useState<string>('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string>('');

  // Если в URL token — сразу валидируем.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (j.ok) {
          setState('success');
          setTimeout(() => router.replace('/app'), 1800);
        } else {
          setState('error');
          setErrorCode(j.errorCode || 'unknown');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('error');
          setErrorCode('network');
        }
      });
    return () => { cancelled = true; };
  }, [token, router]);

  async function resend() {
    setResendBusy(true);
    setResendNote('');
    try {
      const r = await api('/api/auth/resend-verification', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        setResendNote(j.delivered ? t('resendSent') : t('resendStub'));
      } else if (j.errorCode === 'unauthorized') {
        setResendNote(t('resendNotLoggedIn'));
      } else if (j.errorCode === 'already_verified') {
        setResendNote(t('resendAlready'));
      } else if (r.status === 429) {
        setResendNote(t('resendTooSoon'));
      } else {
        setResendNote(t('resendFailed'));
      }
    } catch {
      setResendNote(t('resendFailed'));
    }
    setResendBusy(false);
  }

  // Render по состоянию.
  return (
    <div className="h-dvh flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-5">
          <Icon state={state} />
        </div>

        <h1 className="text-[22px] font-semibold tracking-tight">{titleFor(state, t)}</h1>
        <p className="text-[13.5px] mt-2 leading-[1.55]" style={{ color: 'var(--muted)' }}>
          {bodyFor(state, errorCode, t)}
        </p>

        {state === 'idle' && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={resend}
              disabled={resendBusy}
              className="btn btn-secondary w-full"
              style={{ minHeight: 44 }}
            >
              {resendBusy && <Loader2 size={14} className="animate-spin" />}
              {t('resendButton')}
            </button>
            {resendNote && (
              <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{resendNote}</p>
            )}
            <a href="/app" className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>
              {t('skipForNow')}
            </a>
          </div>
        )}

        {state === 'success' && (
          <p className="mt-4 text-[12px] font-mono" style={{ color: 'var(--muted)' }}>
            {t('redirecting')}
          </p>
        )}

        {state === 'error' && (
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={resend} disabled={resendBusy} className="btn btn-secondary w-full" style={{ minHeight: 44 }}>
              {resendBusy && <Loader2 size={14} className="animate-spin" />}
              {t('resendButton')}
            </button>
            {resendNote && <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{resendNote}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Icon({ state }: { state: State }) {
  const cls = 'inline-flex items-center justify-center w-14 h-14 rounded-2xl';
  if (state === 'verifying') {
    return (
      <span className={cls} style={{ background: 'var(--accent-tint, rgba(0,0,0,.04))', color: 'var(--accent)' }}>
        <Loader2 size={26} className="animate-spin" strokeWidth={2.2} />
      </span>
    );
  }
  if (state === 'success') {
    return (
      <span className={cls} style={{ background: 'var(--vibrant-tint, rgba(95,184,120,.14))', color: 'var(--vibrant)' }}>
        <CheckCircle2 size={26} strokeWidth={2.2} />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className={cls} style={{ background: 'rgba(248,113,113,.12)', color: 'var(--danger)' }}>
        <AlertCircle size={26} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className={cls} style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
      <Mail size={26} strokeWidth={2.2} />
    </span>
  );
}

function titleFor(state: State, t: (k: string) => string): string {
  if (state === 'verifying') return t('verifying.title');
  if (state === 'success') return t('success.title');
  if (state === 'error') return t('error.title');
  return t('idle.title');
}

function bodyFor(state: State, code: string, t: (k: string) => string): string {
  if (state === 'verifying') return t('verifying.body');
  if (state === 'success') return t('success.body');
  if (state === 'error') {
    if (code === 'token_invalid') return t('error.invalid');
    if (code === 'token_required') return t('error.missing');
    return t('error.generic');
  }
  return t('idle.body');
}
