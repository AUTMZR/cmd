/**
 * Cross-sell promo source. Driven by env var AUTMZR_PROMOS_JSON
 * containing a JSON array of PromoItem objects. Founder can rotate
 * promos by editing .env and restarting the master — no code redeploy.
 */
export interface PromoItem {
  id: string;
  title: string;
  description: string;
  ctaUrl: string;
  ctaLabel: string;
  imageUrl?: string;
}

export function getActivePromos(): PromoItem[] {
  const raw = process.env.AUTMZR_PROMOS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PromoItem[];
  } catch {
    return [];
  }
}
