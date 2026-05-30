import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import '../landing.css';

export const metadata = {
  title: 'Privacy — Autmzr Command',
  description: 'Privacy policy for Autmzr Command.',
};

export default function PrivacyPage() {
  return (
    <div className="linear-root h-dvh w-full overflow-y-auto overflow-x-hidden">
      <main className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[12px]"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft size={14} />
          Back to home
        </Link>

        <h1
          className="mt-6 text-[32px] font-semibold tracking-tight sm:text-[40px]"
          style={{ color: 'var(--fg)' }}
        >
          Privacy policy
        </h1>

        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Last updated: 2026-05-30
        </p>

        {/* Free service */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            Free, open-source service
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            Autmzr Command is a free, open-source service. There is no paid tier. The source
            code is available on GitHub under the AGPL-3.0 license.
          </p>
        </section>

        {/* What we collect */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            What we collect
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            We collect the minimum information needed to operate the service:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[14px] leading-[1.6]" style={{ color: 'var(--fg-2)' }}>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Email address</strong> — used for sign-in
              and account verification.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Password hash</strong> — we store a bcrypt
              hash of your password, not the plaintext.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Login audit log</strong> — IP address,
              user-agent, and timestamp for each sign-in attempt, used for security monitoring.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Connected agent metadata</strong> — hostname,
              OS, CPU architecture, and agent version of each device you register. This is needed
              to display your device fleet in the UI.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Chat history</strong> — messages you send
              to the agent, stored in the service database so you can review past sessions.
            </li>
          </ul>
        </section>

        {/* What we do NOT have access to */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            What we do not have access to
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            By design, the following data never leaves your own server:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[14px] leading-[1.6]" style={{ color: 'var(--fg-2)' }}>
            <li>
              <strong style={{ color: 'var(--fg)' }}>Your source code</strong> — project files
              live on your VPS and are only accessed by the agent running there.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>CLI auth tokens</strong> — credentials such
              as{' '}
              <code className="text-[13px] rounded px-1" style={{ background: 'var(--surface-2)' }}>
                ~/.claude/
              </code>{' '}
              or{' '}
              <code className="text-[13px] rounded px-1" style={{ background: 'var(--surface-2)' }}>
                ~/.config/gemini/
              </code>{' '}
              stay on your VPS. The protocol blocks any attempt to read these paths.
            </li>
            <li>
              <strong style={{ color: 'var(--fg)' }}>API keys</strong> — third-party API keys
              are never transmitted to or stored by this service.
            </li>
          </ul>
        </section>

        {/* Who we share with */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            Who we share data with
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            Nobody. We do not sell, rent, or share your data with third parties. No ad networks
            or data brokers are involved. When the operator enables Plausible Analytics (currently
            enabled on cmd.autmzr.com), aggregate usage events (signups, first-chat completions)
            are recorded. Plausible is cookieless, does not track you across sites, does not use
            your IP or device fingerprint to build a profile, and is GDPR/CCPA-compliant by
            default.
          </p>
        </section>

        {/* Data deletion */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            Data deletion and GDPR requests
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            To request export or deletion of your account data, email{' '}
            <a
              href="mailto:fdrvaa84@gmail.com"
              className="underline"
              style={{ color: 'var(--vibrant)' }}
            >
              fdrvaa84@gmail.com
            </a>
            . We will respond within 30 days.
          </p>
        </section>

        {/* Self-host note */}
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--fg)' }}>
            Self-hosting
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
            If you run your own Autmzr Command instance, none of the above applies — your data
            lives entirely in your own Postgres database. We have no access to it.
          </p>
        </section>

        <p className="mt-12 text-[13px] leading-[1.65]" style={{ color: 'var(--muted)' }}>
          Questions? Email{' '}
          <a
            href="mailto:fdrvaa84@gmail.com"
            className="underline"
            style={{ color: 'var(--vibrant)' }}
          >
            fdrvaa84@gmail.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
