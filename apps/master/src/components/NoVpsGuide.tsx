'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onBack: () => void;
}

/**
 * Informational panel for users without a VPS. Shows 3 recommended providers
 * and tells them to come back and pick "I have a VPS" once they've signed up
 * with one. Purely informational, no state.
 */
export default function NoVpsGuide({ onBack }: Props) {
  const t = useTranslations('onboarding.noVps');

  return (
    <div className="max-w-md mx-auto" style={{ color: 'var(--fg)' }}>
      <h2 className="text-xl font-semibold mb-2">{t('title')}</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('intro')}</p>

      <ul className="space-y-3 mb-6">
        <li className="rounded border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="font-medium">timeweb.cloud</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('timewebHint')}</div>
        </li>
        <li className="rounded border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="font-medium">beget.com</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('begetHint')}</div>
        </li>
        <li className="rounded border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="font-medium">hetzner.com</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('hetznerHint')}</div>
        </li>
      </ul>

      <p className="text-sm mb-4">{t('outro')}</p>
      <button
        onClick={onBack}
        className="text-sm hover:underline"
        style={{ color: 'var(--vibrant)' }}
      >
        ← {t('back')}
      </button>
    </div>
  );
}
