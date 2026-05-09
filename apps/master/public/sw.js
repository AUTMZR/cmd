/* Autmzr push service worker.
 * Минимум: показать notification из push-payload и открыть/сфокусировать вкладку
 * на data.url при клике. Никакого кэширования assets — это не offline-PWA. */

self.addEventListener('install', (event) => {
  // Активируется без ожидания старого SW.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* ignore */ }
  const title = data.title || 'Autmzr';
  const body = data.body || '';
  const url = data.url || '/app';
  const tag = data.tag || 'autmzr-default';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Если уже есть открытая вкладка с приложением — фокусируем её и навигируем.
    for (const c of all) {
      try {
        const u = new URL(c.url);
        if (u.origin === self.location.origin) {
          await c.focus();
          if ('navigate' in c) await c.navigate(targetUrl);
          return;
        }
      } catch (_) { /* ignore */ }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
