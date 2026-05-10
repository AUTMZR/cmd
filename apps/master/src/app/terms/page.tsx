import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import '../landing.css';

export const metadata = {
  title: 'Terms — Autmzr Command',
  description: 'Terms of service for Autmzr Command.',
};

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

        <p className="mt-6 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
          The full terms of service will be published before public launch. Until then, the short version:
        </p>

        <ul className="mt-4 list-disc space-y-2 pl-6 text-[14px] leading-[1.6]" style={{ color: 'var(--fg-2)' }}>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Use:</strong> Autmzr Command is provided as-is during beta. Don&apos;t
            use it to harm yourself, others, or your infrastructure.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Liability:</strong> the agent runs commands on your servers. You
            are responsible for what you ask it to do. We&apos;re not liable for data loss, downtime, or third-party
            charges resulting from your use of the service.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Service limits:</strong> we may impose fair-use limits on cloud
            usage to keep the service running for everyone. Self-host has no such limits.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Termination:</strong> you can cancel anytime; we can suspend
            accounts that violate these terms. Either way, you can export your data.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Applicable law:</strong> to be specified at launch.
          </li>
        </ul>

        <p className="mt-8 text-[13px] leading-[1.65]" style={{ color: 'var(--muted)' }}>
          Questions? Email <a
            href="mailto:fdrvaa@gmail.com" className="underline" style={{ color: 'var(--vibrant)' }}
          >fdrvaa@gmail.com</a>.
        </p>
      </main>
    </div>
  );
}
