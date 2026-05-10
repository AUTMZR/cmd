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

        <p className="mt-6 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
          The full privacy policy will be published before public launch.
        </p>

        <p className="mt-4 text-[14.5px] leading-[1.65]" style={{ color: 'var(--fg-2)' }}>
          In the meantime, here is what Autmzr Command does with your data:
        </p>

        <ul className="mt-4 list-disc space-y-2 pl-6 text-[14px] leading-[1.6]" style={{ color: 'var(--fg-2)' }}>
          <li>
            <strong style={{ color: 'var(--fg)' }}>What we collect:</strong> email (for sign-in), server connection
            metadata (hostname, OS, agent version), and chat history you create with the agent.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>How we store it:</strong> your API keys and OAuth tokens are
            encrypted at rest with libsodium sealed boxes; chat history is stored unencrypted in your tenant database.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Who we share with:</strong> nobody. No analytics, no ad partners,
            no resold tokens.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>GDPR / data requests:</strong> email <a
              href="mailto:fdrvaa@gmail.com" className="underline" style={{ color: 'var(--vibrant)' }}
            >fdrvaa@gmail.com</a> and we&apos;ll export or delete your data within 30 days.
          </li>
          <li>
            <strong style={{ color: 'var(--fg)' }}>Self-host:</strong> none of the above applies. Your data lives in
            your Postgres on your VPS. We can&apos;t see it.
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
