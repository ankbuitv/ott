/* CHRTV Service Worker — Web Push (payload-less) + hiển thị notification */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = 'CHRTV';
    let body = 'Có thông báo mới từ CHRTV';
    let url = '/';
    try {
      // Push không payload → fetch nội dung mới nhất từ server
      const res = await fetch('/api/notifications', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const latest = (data.notifications || [])[0];
        if (latest) {
          title = latest.title || title;
          body = latest.body || body;
          if (latest.channel_id) url = `/?channel=${encodeURIComponent(latest.channel_id)}`;
        }
      }
    } catch {}
    await self.registration.showNotification(title, {
      body,
      icon: 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png',
      badge: 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png',
      tag: 'chrtv-' + Date.now(),
      data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const u = new URL(client.url);
        const target = new URL(url, u.origin);
        u.search = target.search;
        if ('navigate' in client) { await client.navigate(u.toString()); }
        return client.focus();
      } catch {}
    }
    return self.clients.openWindow(url);
  })());
});
