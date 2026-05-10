'use client';

import { Terminal, Github } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full border-t"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto w-full max-w-[1100px] px-6 py-12 md:py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[320px]">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                <Terminal size={15} strokeWidth={2.4} />
              </div>
              <span className="text-[15px] font-semibold tracking-tight">Autmzr</span>
            </div>
            <p className="mt-3 text-[13px] leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
              {t('tagline')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:gap-12">
            <FooterCol title={t('columns.product')}>
              <FooterLink href="/login">{t('links.signIn')}</FooterLink>
              <FooterLink href="/#pricing">{t('links.pricing')}</FooterLink>
              <FooterLink href="https://github.com/AUTMZR/cmd" external>
                <span className="inline-flex items-center gap-1.5">
                  <Github size={12} />
                  {t('links.github')}
                </span>
              </FooterLink>
            </FooterCol>
            <FooterCol title={t('columns.resources')}>
              <FooterLink href="https://github.com/AUTMZR/cmd#readme" external>
                {t('links.docs')}
              </FooterLink>
              <FooterLink href="https://github.com/AUTMZR/cmd/issues" external>
                {t('links.reportBug')}
              </FooterLink>
              <FooterLink href="https://github.com/AUTMZR/cmd/releases" external>
                {t('links.changelog')}
              </FooterLink>
            </FooterCol>
            <FooterCol title={t('columns.legal')}>
              <FooterLink href="/privacy">{t('links.privacy')}</FooterLink>
              <FooterLink href="/terms">{t('links.terms')}</FooterLink>
              <FooterLink href="mailto:fdrvaa@gmail.com">{t('links.contact')}</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div
          className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>
            {t('made', { year })}
          </p>
          <p className="font-mono text-[11.5px]" style={{ color: 'var(--muted)' }}>
            {t('version')}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4
        className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--muted)' }}
      >
        {title}
      </h4>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className="text-[13px] transition-colors hover:underline"
        style={{ color: 'var(--fg-2)' }}
      >
        {children}
      </a>
    </li>
  );
}
