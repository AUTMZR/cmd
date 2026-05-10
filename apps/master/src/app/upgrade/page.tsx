'use client';

/**
 * Trial expired / upgrade landing.
 * Минимум: говорим, что trial кончился, предлагаем связаться (mailto)
 * или вернуться к лендингу/выйти. Stripe-billing — v0.4, до тех пор
 * "связаться с нами" — единственный способ продлить.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sparkles, ArrowLeft, LogOut } from 'lucide-react';
import '../globals.css';

interface Me {
  id: string;
  email: string;
  is_admin: boolean;
  trial_until: string | null;
}

export default function UpgradePage() {
  const t = useTranslations('upgrade');
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((j) => setMe(j.user || null))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    window.location.href = '/';
  }

  const expiredAt = me?.trial_until ? new Date(me.trial_until) : null;
  const expiredDays = expiredAt ? Math.floor((Date.now() - expiredAt.getTime()) / 86400000) : 0;

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md rounded-2xl p-7 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'var(--accent-light)' }}>
          <Sparkles size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 className="text-xl font-semibold mb-1.5">{t('title')}</h1>
        <p className="text-[13.5px] mb-1" style={{ color: 'var(--muted)' }}>
          {expiredDays > 0 ? t('expiredAgo', { days: expiredDays }) : t('expiredJust')}
        </p>
        {me?.email && (
          <p className="text-[12px] font-mono mb-5" style={{ color: 'var(--muted)' }}>{me.email}</p>
        )}

        <div className="text-left rounded-lg p-4 mb-5"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-[13px] mb-3">{t('intro')}</p>
          <ul className="text-[12.5px] space-y-1.5" style={{ color: 'var(--fg-2)' }}>
            <li>• {t('option1')}</li>
            <li>• {t('option2')}</li>
            <li>• {t('option3')}</li>
          </ul>
        </div>

        <a href={`mailto:fdrvaa@gmail.com?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(t('mailBody', { email: me?.email || '' }))}`}
          className="block w-full px-4 py-3 rounded-lg text-[14px] font-semibold mb-2"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          {t('contact')}
        </a>

        <div className="flex gap-2">
          <Link href="/" className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px]"
            style={{ background: 'var(--surface-2)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>
            <ArrowLeft size={13} /> {t('back')}
          </Link>
          <button onClick={logout}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px]"
            style={{ background: 'var(--surface-2)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>
            <LogOut size={13} /> {t('signOut')}
          </button>
        </div>

        <p className="text-[11.5px] mt-5" style={{ color: 'var(--muted)' }}>
          {t.rich('selfHostHint', { link: (c) => <a href="https://github.com/AUTMZR/cmd" target="_blank" className="underline" style={{ color: 'var(--accent)' }}>{c}</a> })}
        </p>
      </div>
    </div>
  );
}
