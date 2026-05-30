'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import NoVpsGuide from './NoVpsGuide';
import DemoChat from './DemoChat';

type View = 'choose' | 'noVps' | 'demo';

interface Props {
  onPickHasVps: () => void;
  onDismiss: () => void;
}

/**
 * 3-branch onboarding wizard. Rendered by AppShell when the user has
 * verified their email but has zero projects. The wizard is a helper, not
 * a blocker — user can dismiss it; existing empty-state CTA still works.
 */
export default function OnboardingWelcome({ onPickHasVps, onDismiss }: Props) {
  const [view, setView] = useState<View>('choose');
  const t = useTranslations('onboarding.welcome');

  if (view === 'noVps') return <NoVpsGuide onBack={() => setView('choose')} />;
  if (view === 'demo') return <DemoChat onConnectClick={() => { setView('choose'); onPickHasVps(); }} />;

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    borderColor: 'var(--border)',
  };

  return (
    <div className="max-w-2xl mx-auto" style={{ color: 'var(--fg)' }}>
      <h1 className="text-2xl font-semibold mb-2">{t('title')}</h1>
      <p className="mb-8" style={{ color: 'var(--muted)' }}>{t('subtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <button
          onClick={onPickHasVps}
          className="text-left rounded-lg border p-4 hover:opacity-90 transition"
          style={cardStyle}
        >
          <div className="text-2xl mb-2">🖥</div>
          <div className="font-medium mb-1">{t('hasVpsTitle')}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('hasVpsHint')}</div>
        </button>

        <button
          onClick={() => setView('noVps')}
          className="text-left rounded-lg border p-4 hover:opacity-90 transition"
          style={cardStyle}
        >
          <div className="text-2xl mb-2">📦</div>
          <div className="font-medium mb-1">{t('noVpsTitle')}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('noVpsHint')}</div>
        </button>

        <button
          onClick={() => setView('demo')}
          className="text-left rounded-lg border p-4 hover:opacity-90 transition"
          style={cardStyle}
        >
          <div className="text-2xl mb-2">▶️</div>
          <div className="font-medium mb-1">{t('demoTitle')}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('demoHint')}</div>
        </button>
      </div>

      <button
        onClick={onDismiss}
        className="text-xs hover:underline"
        style={{ color: 'var(--muted)' }}
      >
        {t('skip')}
      </button>
    </div>
  );
}
