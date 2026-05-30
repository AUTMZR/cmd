import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import '../landing.css';

export const metadata = {
  title: 'Terms — Autmzr Command',
  description: 'Terms of service for Autmzr Command.',
};

const SECTIONS = [
  {
    id: 'service',
    title: 'Service',
    body: (
      <>
        Autmzr Command is provided free of charge. There are no paid features, subscriptions, or
        hidden fees. You self-host the master server; we publish the open-source software and
        provide this hosted demo at no cost.
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability',
    body: (
      <>
        The service is provided as-is with no SLA. We aim for high availability but make no
        guarantees of uptime, continuity, or fitness for any particular purpose. Scheduled or
        unscheduled downtime may occur without notice.
      </>
    ),
  },
  {
    id: 'your-data',
    title: 'Your data',
    body: (
      <>
        Your source code, CLI authentication tokens, and third-party API keys remain on your own
        VPS or workstation. We never receive, store, or transmit them. The master server holds
        only metadata: device names, project paths, and chat history that you create through the
        UI. You can delete your account and all associated metadata at any time.
      </>
    ),
  },
  {
    id: 'use',
    title: 'Acceptable use',
    body: (
      <>
        Do not use Autmzr Command to harm yourself, others, or your infrastructure. The agent
        runs commands on your servers — you are responsible for what you ask it to do. We reserve
        the right to suspend accounts that violate these terms.
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Liability',
    body: (
      <>
        To the maximum extent permitted by law, Autmzr and its contributors are not liable for
        any data loss, downtime, security incidents, or third-party charges resulting from your
        use of the service. Use at your own risk.
      </>
    ),
  },
  {
    id: 'source',
    title: 'Open source',
    body: (
      <>
        The source code is licensed under{' '}
        <a
          href="https://github.com/AUTMZR/cmd/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: 'var(--vibrant)' }}
        >
          AGPL-3.0-or-later
        </a>
        . Any modifications distributed as a hosted service must be released under the same
        license.
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <>
        We may update these terms at any time. Continued use of the service after changes are
        posted constitutes acceptance of the updated terms.
      </>
    ),
  },
];

export default function TermsPage() {
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
          Terms of service
        </h1>

        <p className="mt-3 text-[13px]" style={{ color: 'var(--muted)' }}>
          Last updated: May 30, 2026
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.id}>
              <h2
                className="text-[16px] font-semibold"
                style={{ color: 'var(--fg)' }}
              >
                {s.title}
              </h2>
              <p
                className="mt-2 text-[14px] leading-[1.7]"
                style={{ color: 'var(--fg-2)' }}
              >
                {s.body}
              </p>
            </section>
          ))}
        </div>

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
