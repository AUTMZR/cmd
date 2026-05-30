'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onConnectClick: () => void;
}

/**
 * Read-only demo of what a cmd chat looks like. Hardcoded conversation so it
 * has zero runtime dependencies. CTA at the bottom routes users to the
 * "I have a VPS" branch when they're ready to use it for real.
 */
export default function DemoChat({ onConnectClick }: Props) {
  const t = useTranslations('onboarding.demo');

  const messages = [
    { role: 'user' as const, body: t('msgUser1') },
    { role: 'assistant' as const, body: t('msgAsst1') },
    { role: 'user' as const, body: t('msgUser2') },
    { role: 'assistant' as const, body: t('msgAsst2') },
  ];

  return (
    <div className="max-w-2xl mx-auto" style={{ color: 'var(--fg)' }}>
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>{t('badge')}</div>
      <h2 className="text-xl font-semibold mb-4">{t('title')}</h2>

      <div
        className="rounded-lg border p-4 space-y-4 mb-6"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'pl-8' : 'pr-8'}>
            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
              {m.role === 'user' ? t('you') : 'claude'}
            </div>
            <div className="text-sm whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('outro')}</p>
      <button
        onClick={onConnectClick}
        className="w-full rounded-md font-medium py-2 transition hover:opacity-90"
        style={{ background: 'var(--vibrant)', color: 'var(--bg)' }}
      >
        {t('cta')}
      </button>
    </div>
  );
}
