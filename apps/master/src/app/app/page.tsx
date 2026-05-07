'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

interface User { id: string; email: string; name: string | null; is_admin: boolean; trial_until: string | null }

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    fetch('/api/auth')
      .then(async (r) => {
        if (!r.ok) {
          router.replace('/login');
          return;
        }
        const j = await r.json();
        if (!j?.user) {
          router.replace('/login');
          return;
        }
        setUser(j.user);
        setState('ready');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (state === 'loading' || !user) {
    return (
      <div className="h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }

  return <AppShell user={user} />;
}
