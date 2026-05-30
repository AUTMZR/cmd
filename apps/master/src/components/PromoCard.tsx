'use client';

import { useEffect, useState } from 'react';
import type { PromoItem } from '@/lib/promo';

interface Props {
  promos: PromoItem[];
}

declare global {
  interface Window { plausible?: (event: string, opts?: { props?: Record<string, string> }) => void }
}

/**
 * Renders one promo card, rotating randomly per page load if multiple promos
 * are configured. Click fires `promo_click` event to Plausible.
 */
export default function PromoCard({ promos }: Props) {
  const [chosen, setChosen] = useState<PromoItem | null>(null);

  useEffect(() => {
    if (promos.length === 0) { setChosen(null); return; }
    const idx = Math.floor(Math.random() * promos.length);
    setChosen(promos[idx]);
  }, [promos]);

  if (!chosen) return null;

  function onClick() {
    window.plausible?.('promo_click', { props: { id: chosen!.id } });
  }

  return (
    <a
      href={chosen.ctaUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="block rounded-lg border p-3 transition"
      style={{
        background: 'var(--surface-2)',
        borderColor: 'var(--border)',
      }}
    >
      {chosen.imageUrl && (
        <img src={chosen.imageUrl} alt="" className="w-full h-24 object-cover rounded mb-2" />
      )}
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>From the maker of cmd</div>
      <div className="text-sm font-medium mb-1" style={{ color: 'var(--fg)' }}>{chosen.title}</div>
      <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{chosen.description}</div>
      <div className="text-xs" style={{ color: 'var(--vibrant)' }}>{chosen.ctaLabel} →</div>
    </a>
  );
}
