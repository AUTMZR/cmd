'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import AuthScreen from '@/components/AuthScreen';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [needSetup, setNeedSetup] = useState(false);
  const [githubOauth, setGithubOauth] = useState(false);
  const [state, setState] = useState<'loading' | 'show'>('loading');

  useEffect(() => {
    fetch('/api/auth')
      .then(async (r) => {
        const j = r.ok ? await r.json() : {};
        if (j?.user) {
          router.replace('/app');
          return;
        }
        setNeedSetup(!!j?.setup);
        setGithubOauth(!!j?.githubOauth);
        setState('show');
      })
      .catch(() => setState('show'));
  }, [router]);

  if (state === 'loading') {
    return (
      <div className="h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>{t('loading')}</div>
      </div>
    );
  }

  return <AuthScreen needSetup={needSetup} githubOauth={githubOauth} onAuth={() => router.replace('/app')} />;
}
