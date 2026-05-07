'use client';

import { Sparkles, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  trialUntil: string | null;
  isAdmin: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Тонкий баннер сверху приложения с состоянием trial-периода.
 * Не рендерится для админов и self-host (trial_until === null).
 *
 * Hard-блокировки нет — это soft-нотификация. Когда биллинг будет
 * подключён, добавим middleware на /api/* и редирект на /upgrade.
 */
export default function TrialBanner({ trialUntil, isAdmin }: Props) {
  const t = useTranslations('billing.banner');

  if (isAdmin || !trialUntil) return null;

  const ts = Date.parse(trialUntil);
  if (Number.isNaN(ts)) return null;

  const msLeft = ts - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const expired = msLeft <= 0;

  // Активный trial с большим запасом — не отвлекаем (показываем только последние 7 дней).
  if (!expired && daysLeft > 7) return null;

  const isUrgent = expired || daysLeft <= 3;
  const bg = isUrgent ? 'rgba(248, 113, 113, .12)' : 'var(--vibrant-tint, rgba(95, 184, 120, .14))';
  const fg = isUrgent ? 'var(--danger)' : 'var(--vibrant)';
  const Icon = isUrgent ? AlertCircle : Sparkles;

  return (
    <div
      className="flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] border-b"
      style={{ background: bg, color: fg, borderColor: 'var(--border)' }}
      role="status"
    >
      <Icon size={13} strokeWidth={2.2} className="shrink-0" />
      <span className="truncate">
        {expired ? t('expired') : t('daysLeft', { days: daysLeft })}
      </span>
      <a
        href="/#pricing"
        className="ml-1 font-semibold underline-offset-2 hover:underline"
        style={{ color: fg }}
      >
        {t('cta')}
      </a>
    </div>
  );
}
