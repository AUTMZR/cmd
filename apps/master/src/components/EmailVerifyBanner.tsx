'use client';

import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

interface Props {
  emailVerified: boolean;
}

/**
 * Тонкий баннер для юзеров с !email_verified.
 * Soft-нотификация: ничего не блокирует, просто напоминает + предлагает resend.
 */
export default function EmailVerifyBanner({ emailVerified }: Props) {
  const t = useTranslations('emailVerify.banner');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>('');

  if (emailVerified) return null;

  async function resend() {
    setBusy(true);
    setNote('');
    try {
      const r = await api('/api/auth/resend-verification', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        setNote(j.delivered ? t('sent') : t('stub'));
      } else if (j.errorCode === 'already_verified') {
        // Тут редкий race: юзер мог открыть письмо в другой вкладке. Скрываем баннер.
        setNote(t('alreadyVerified'));
      } else if (r.status === 429) {
        setNote(t('tooSoon'));
      } else {
        setNote(t('failed'));
      }
    } catch {
      setNote(t('failed'));
    }
    setBusy(false);
  }

  return (
    <div
      className="flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] border-b"
      style={{
        background: 'rgba(212, 165, 60, .12)',
        color: 'var(--warn, #b45309)',
        borderColor: 'var(--border)',
      }}
      role="status"
    >
      <Mail size={13} strokeWidth={2.2} className="shrink-0" />
      <span className="truncate">{t('text')}</span>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="ml-1 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline disabled:opacity-50"
        style={{ color: 'var(--warn, #b45309)' }}
      >
        {busy && <Loader2 size={11} className="animate-spin" />}
        {t('cta')}
      </button>
      {note && <span className="ml-2 text-[11px] opacity-80">· {note}</span>}
    </div>
  );
}
