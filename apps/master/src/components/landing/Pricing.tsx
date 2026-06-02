'use client';

import { Check, Github, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Pricing() {
  const t = useTranslations('pricing');
  return (
    <section id="pricing" className="relative w-full" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto w-full max-w-[1180px] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[700px] text-center">
          <p
            className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--vibrant)' }}
          >
            {t('eyebrow')}
          </p>
          <h2 className="text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[36px] md:text-[44px]">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[14.5px] leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
            {t('lede')}
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-[440px] md:mt-16">
          <div
            className="relative flex flex-col rounded-[var(--radius-lg)] border-2 p-6 sm:p-8"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--vibrant)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-semibold tracking-tight">{t('free.name')}</h3>
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider"
                style={{ borderColor: 'var(--vibrant)', color: 'var(--vibrant)' }}
              >
                {t('free.tag')}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[44px] font-semibold tracking-tight">{t('free.price')}</span>
              <span className="text-[13px]" style={{ color: 'var(--muted)' }}>
                {t('free.period')}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: 'var(--fg-2)' }}>
              {t('free.blurb')}
            </p>

            <ul className="mt-6 space-y-2.5 text-[13.5px]">
              <Bullet>{t('free.bullet1')}</Bullet>
              <Bullet>{t('free.bullet2')}</Bullet>
              <Bullet>{t('free.bullet3')}</Bullet>
              <Bullet>{t('free.bullet4')}</Bullet>
              <Bullet>{t('free.bullet5')}</Bullet>
            </ul>

            <a
              href="/login"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-colors"
              style={{ background: 'var(--vibrant)', color: 'var(--vibrant-fg)' }}
            >
              {t('free.cta')}
              <ArrowRight size={15} />
            </a>
            <a
              href="https://github.com/AUTMZR/cmd"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-[13.5px] font-semibold transition-colors"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
            >
              <Github size={15} />
              {t('free.ctaCode')}
            </a>
          </div>
        </div>

        <p
          className="mx-auto mt-8 max-w-[560px] text-center font-mono text-[11.5px]"
          style={{ color: 'var(--muted)' }}
        >
          {t('footer')}
        </p>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check size={15} strokeWidth={2.4} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--vibrant)' }} />
      <span style={{ color: 'var(--fg)' }}>{children}</span>
    </li>
  );
}
