'use client';

import { ArrowRight, Github, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import LocaleSwitch from '@/components/LocaleSwitch';

/**
 * Hero — conditional показ:
 *  - если задан NEXT_PUBLIC_HERO_VIDEO_URL → embed видео (YouTube/Loom/iframe или direct .mp4)
 *  - если URL пустой → fallback на PhoneMockup (живое демо UI приложения)
 *
 * Установи env-переменную в .env (NEXT_PUBLIC_HERO_VIDEO_URL=https://www.youtube.com/embed/XXX)
 * и при следующем deploy hero автоматически переключится на видео.
 */
const HERO_VIDEO_URL = process.env.NEXT_PUBLIC_HERO_VIDEO_URL || '';

export default function Hero() {
  const t = useTranslations('hero');
  const tnav = useTranslations('nav');
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[640px] w-[960px] -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: 'var(--hero-glow)' }}
      />

      <nav className="relative z-30 mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            <Terminal size={15} strokeWidth={2.4} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            Autmzr
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/AUTMZR/cmd"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost text-[12.5px]"
          >
            <Github size={14} />
            <span className="hidden sm:inline">{tnav('github')}</span>
          </a>
          <LocaleSwitch />
          <a href="/login" className="btn btn-secondary text-[12.5px]">
            {tnav('signIn')}
          </a>
        </div>
      </nav>

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-6 pb-16 pt-10 sm:pt-16 md:pb-24 md:pt-24">
        <div className="mx-auto max-w-[820px] text-center">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-mono"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--muted)',
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--ok)' }}
            />
            {t('badge')}
          </div>

          <h1
            className="text-[36px] font-semibold leading-[1.05] tracking-tight sm:text-[52px] md:text-[64px]"
            style={{ color: 'var(--fg)' }}
          >
            {t('title')}
            <br />
            <span style={{ color: 'var(--vibrant)' }}>{t('titleAccent')}</span>
          </h1>

          <div className="mt-5 flex flex-col items-center gap-1.5 sm:mt-6">
            <span
              className="marker-hl text-[22px] font-semibold tracking-tight sm:text-[28px]"
              style={{ color: 'var(--fg)' }}
            >
              {t('foreverFree')}
            </span>
            <span className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {t('foreverFreeSub')}
            </span>
          </div>

          <p
            className="mx-auto mt-6 max-w-[680px] text-[15px] leading-[1.6] sm:text-[17px]"
            style={{ color: 'var(--fg-2)' }}
          >
            {t('lede')}
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            <a
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-colors"
              style={{
                background: 'var(--vibrant)',
                color: 'var(--vibrant-fg)',
              }}
            >
              {t('ctaCloud')}
              <ArrowRight size={16} />
            </a>
            <a
              href="https://github.com/AUTMZR/cmd"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-[14px] font-semibold transition-colors"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
            >
              <Github size={16} />
              {t('ctaGithub')}
            </a>
          </div>

          <p
            className="mt-5 text-[12px] font-mono"
            style={{ color: 'var(--muted)' }}
          >
            {t('metaLine')}
          </p>
        </div>

        <div className="mt-16 flex justify-center sm:mt-20">
          {HERO_VIDEO_URL ? <HeroVideo url={HERO_VIDEO_URL} /> : <PhoneMockup />}
        </div>
      </div>
    </section>
  );
}

function HeroVideo({ url }: { url: string }) {
  const isDirectVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return (
    <div
      className="relative w-full max-w-[860px] overflow-hidden rounded-[var(--radius-lg)] border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-soft)',
        aspectRatio: '16 / 9',
      }}
    >
      {isDirectVideo ? (
        <video
          src={url}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <iframe
          src={url}
          title="Autmzr demo"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}
    </div>
  );
}

function PhoneMockup() {
  return (
    <div
      className="relative mx-auto w-[300px] sm:w-[340px]"
      style={{ filter: 'drop-shadow(0 30px 60px rgba(58,54,49,.18))' }}
    >
      <div
        className="relative rounded-[44px] p-[10px]"
        style={{
          background: 'var(--accent)',
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.4)',
        }}
      >
        <div className="relative flex justify-center pb-[6px]">
          <div className="h-[22px] w-[100px] rounded-b-[14px]" style={{ background: 'var(--accent)' }} />
          <div
            aria-hidden
            className="absolute left-1/2 top-[6px] h-[8px] w-[64px] -translate-x-1/2 rounded-full"
            style={{ background: '#000', opacity: 0.6 }}
          />
        </div>
        <div className="overflow-hidden rounded-[34px]" style={{ background: 'var(--bg)' }}>
          <FakeChatUI />
        </div>
      </div>
    </div>
  );
}

function FakeChatUI() {
  const t = useTranslations('hero.mockup');
  return (
    <div className="flex h-[560px] flex-col">
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: 'var(--ok)' }} />
          <span className="text-[12px] font-medium">{t('deviceName')}</span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            · {t('project')}
          </span>
        </div>
        <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
          {t('agent')}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-hidden p-4">
        <Bubble role="user">{t('userMsg')}</Bubble>
        <Bubble role="assistant">
          <p className="m-0">{t('asstIntro')}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li><code className="font-mono">{t('asstStep1')}</code></li>
            <li><code className="font-mono">{t('asstStep2')}</code></li>
          </ul>
        </Bubble>
        <Bubble role="tool">
          <span className="font-mono text-[10.5px]">{t('toolMsg')}</span>
        </Bubble>
        <Bubble role="assistant">
          <p className="m-0 text-[12.5px]">{t('asstFinal')}</p>
        </Bubble>
      </div>

      <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <div
          className="flex items-center gap-2 rounded-2xl border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            {t('composer')}
          </span>
          <span className="ml-auto typing-dots">
            <span /><span /><span />
          </span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant' | 'tool'; children: React.ReactNode }) {
  if (role === 'tool') {
    return (
      <div
        className="rounded-lg border px-2.5 py-1.5 text-[11px]"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--muted)',
        }}
      >
        {children}
      </div>
    );
  }
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] rounded-2xl rounded-tr-md px-3 py-2 text-[12.5px]"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[88%] rounded-2xl rounded-tl-md px-3 py-2 text-[12.5px] leading-[1.5]"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--fg)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
