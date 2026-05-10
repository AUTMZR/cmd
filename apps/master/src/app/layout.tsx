import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import ClientBoot from '@/components/ClientBoot';

const SITE_URL = process.env.PUBLIC_URL || 'https://cmd.autmzr.com';
const TITLE = 'Autmzr Command — drive your AI coding CLIs from your phone';
const DESCRIPTION = 'Self-hosted, open-source mobile control panel for Claude Code, Gemini CLI, Codex (and more). One CLI subscription, every server.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · Autmzr' },
  description: DESCRIPTION,
  applicationName: 'Autmzr Command',
  keywords: ['Claude Code', 'Gemini CLI', 'Codex CLI', 'self-hosted', 'AGPL', 'mobile dev', 'AI coding', 'VPS', 'remote development'],
  authors: [{ name: 'Autmzr', url: 'https://autmzr.com' }],
  creator: 'Autmzr',
  publisher: 'Autmzr',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  openGraph: {
    type: 'website', url: SITE_URL,
    title: TITLE, description: DESCRIPTION,
    siteName: 'Autmzr Command',
    locale: 'en_US',
    images: [{ url: '/og', width: 1200, height: 630, alt: 'Autmzr Command — mobile control panel for AI coding CLIs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE, description: DESCRIPTION,
    images: ['/og'],
  },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false,
  viewportFit: 'cover', themeColor: '#0b0b0d',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Аналитика подключается только если задан PLAUSIBLE_DOMAIN в env.
  // Дефолт — без аналитики (self-host friendly + GDPR friendly).
  // Plausible: cookie-less, без consent-баннера. ANALYTICS_SCRIPT_URL
  // позволяет указать кастомный домен (proxy через свой домен от adblock).
  const plausibleDomain = process.env.PLAUSIBLE_DOMAIN || null;
  const plausibleScriptUrl = process.env.PLAUSIBLE_SCRIPT_URL || 'https://plausible.io/js/script.js';
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var t=localStorage.getItem('pc_theme')||'soft';document.documentElement.setAttribute('data-theme',t)})()`
        }} />
        {plausibleDomain && (
          <script defer data-domain={plausibleDomain} src={plausibleScriptUrl} />
        )}
      </head>
      <body className="h-dvh overflow-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientBoot />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
