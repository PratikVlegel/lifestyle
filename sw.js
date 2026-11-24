/* Service worker: houdt de app offline beschikbaar. Verhoog VERSION bij elke update. */
const VERSION = 'vd-1.19.2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'js/config.js', 'js/store.js?v=1.19.1', 'js/i18n.js?v=1.18.1', 'js/ocr.js?v=1.19.1', 'js/cloud.js', 'js/library.js?v=1.19.1', 'js/migrate.js', 'js/activity.js?v=1.19.1', 'js/share.js?v=1.19.1', 'js/insights2.js?v=1.19.1', 'js/mood.js?v=1.19.1', 'js/cycle.js?v=1.11.6', 'js/week.js?v=1.19.1', 'js/extras.js?v=1.19.1', 'js/girth.js?v=1.17.0', 'js/invite.js?v=1.19.1', 'js/admin.js', 'js/training.js?v=1.19.1', 'js/community-exercises.js?v=1.10.44', 'js/community-kpi.js', 'js/charts.js?v=1.19.1', 'js/insights.js?v=1.19.2', 'js/app.js?v=1.19.2', 'js/home-setup.js?v=1.18.0', 'js/push.js?v=1.10.75', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  // Elk bestand apart: één ontbrekend bestand mag de installatie van de worker niet laten mislukken.
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API's niet cachen
  const cached = caches.open(VERSION).then(c => c.match(e.request) || c.match(e.request, { ignoreSearch: true }));
  if (e.request.mode === 'navigate') {
    // Navigations check for a new app shell; offline, fall back to the installed shell.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(async () => (await cached) || caches.match('index.html')));
  } else {
    // Versioned assets are immutable within this shell. Serve them immediately from cache.
    e.respondWith(cached.then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
      return res;
    })).catch(() => caches.match('index.html')));
  }
});
self.addEventListener('push', e => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) { }
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 80) : 'Tijd voor je check-in';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 160) : 'Open je dagboek wanneer het jou past.';
  const target = typeof payload.url === 'string' && payload.url.startsWith('https://pratikvlegel.github.io/lifestyle/')
    ? payload.url : new URL('./', self.location).href;
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 80) : 'diary-check-in',
    data: { url: target }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
