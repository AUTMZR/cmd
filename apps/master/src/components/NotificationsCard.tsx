'use client';

/**
 * Карточка управления Web Push-уведомлениями.
 * Один раз спрашивает разрешение, регистрирует subscription на /api/push/subscribe,
 * показывает текущее состояние и позволяет отписаться.
 *
 * Поддержка: Chrome/Firefox/Edge (любой OS), Safari iOS 16.4+ из standalone PWA.
 * Если service worker не зарегистрирован (HTTP в dev) или VAPID ключи не заданы —
 * показываем поясняющий текст вместо кнопки.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellOff } from 'lucide-react';

type State = 'loading' | 'unsupported' | 'no-vapid' | 'denied' | 'idle' | 'enabling' | 'enabled' | 'error';

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationsCard() {
  const t = useTranslations('settings.notifications');
  const [state, setState] = useState<State>('loading');
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // Initial probe: поддержка, VAPID, текущая подписка.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState('unsupported'); return;
      }
      const r = await fetch('/api/push/vapid-public-key').then(r => r.json()).catch(() => ({ enabled: false }));
      if (!r.enabled) { setState('no-vapid'); return; }

      if (Notification.permission === 'denied') { setState('denied'); return; }

      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setEndpoint(existing.endpoint);
          setState('enabled');
        } else {
          setState('idle');
        }
      } catch {
        setState('idle');
      }
    })();
  }, []);

  async function enable() {
    setState('enabling');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'idle'); return; }

      const r = await fetch('/api/push/vapid-public-key').then(r => r.json());
      if (!r.enabled || !r.publicKey) { setState('no-vapid'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(r.publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) { setState('error'); return; }
      setEndpoint(sub.endpoint);
      setState('enabled');
    } catch (e) {
      console.warn('[push] enable failed', e);
      setState('error');
    }
  }

  async function disable() {
    if (!endpoint) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch('/api/push/subscribe', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    } catch { /* ignore */ }
    setEndpoint(null);
    setState('idle');
  }

  if (state === 'loading') return null;

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        {state === 'enabled' ? <Bell size={14} /> : <BellOff size={14} />}
        <div className="text-sm font-medium">{t('header')}</div>
      </div>
      <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>{t('hint')}</p>

      {state === 'unsupported' && (
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>{t('unsupported')}</p>
      )}
      {state === 'no-vapid' && (
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>{t('noVapid')}</p>
      )}
      {state === 'denied' && (
        <p className="text-[12px]" style={{ color: 'var(--danger)' }}>{t('denied')}</p>
      )}
      {(state === 'idle' || state === 'error') && (
        <button onClick={enable}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          {t('enable')}
        </button>
      )}
      {state === 'enabling' && (
        <button disabled className="px-3 py-1.5 rounded-lg text-[13px] opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          {t('enabling')}
        </button>
      )}
      {state === 'enabled' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px]" style={{ color: 'var(--ok)' }}>{t('enabled')}</span>
          <button onClick={disable}
            className="text-[12px] px-2.5 py-1 rounded-md"
            style={{ background: 'var(--surface)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>
            {t('disable')}
          </button>
        </div>
      )}

      {state !== 'enabled' && state !== 'unsupported' && (
        <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>{t('iosHint')}</p>
      )}
    </div>
  );
}
