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
      className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:bg-zinc-900 transition"
    >
      {chosen.imageUrl && (
        <img src={chosen.imageUrl} alt="" className="w-full h-24 object-cover rounded mb-2" />
      )}
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">From the maker of cmd</div>
      <div className="text-sm font-medium text-zinc-100 mb-1">{chosen.title}</div>
      <div className="text-xs text-zinc-400 mb-2">{chosen.description}</div>
      <div className="text-xs text-emerald-400">{chosen.ctaLabel} →</div>
    </a>
  );
}
