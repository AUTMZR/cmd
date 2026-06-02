'use client';

import { useEffect } from 'react';

/**
 * Глобальный patch window.fetch — автоматически добавляет X-CSRF-Token
 * из cookie pc_csrf для same-origin запросов.
 *
 * Альтернатива: переписать все fetch на api() вручную (30+ мест), но
 * глобальный patch проще и поймает в т.ч. сторонние библиотеки.
 *
 * Side effect: запускается один раз при монтировании RootLayout.
 */
export default function ClientBoot() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__pcFetchPatched) return;
    (window as any).__pcFetchPatched = true;

    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      // Считаем same-origin: либо относительный URL, либо абсолютный с тем же origin.
      let isSameOrigin = true;
      try {
        if (typeof input === 'string' || input instanceof URL) {
          const u = new URL(String(input), window.location.href);
          isSameOrigin = u.origin === window.location.origin;
        } else if (input instanceof Request) {
          isSameOrigin = new URL(input.url).origin === window.location.origin;
        }
      } catch {}
      if (!isSameOrigin) return orig(input, init);

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      const m = document.cookie.match(/(?:^|;\s*)pc_csrf=([^;]+)/);
      if (m && !headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', decodeURIComponent(m[1]));
      }
      const res = await orig(input, { ...init, headers, credentials: init.credentials || 'same-origin' });
      return res;
    };

    // На старте подтягиваем cookie если её ещё нет (первый запуск устройства).
    if (!document.cookie.includes('pc_csrf=')) {
      orig('/api/auth', { credentials: 'same-origin' }).catch(() => {});
    }

    // Регистрируем service worker для Web Push (если поддерживается).
    // На HTTP в dev SW не зарегистрируется — это нормально, push не работает без HTTPS.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore — dev на http или iframe */ });
    }
  }, []);
  return null;
}
