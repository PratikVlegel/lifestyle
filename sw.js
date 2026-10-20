/* Service worker: houdt de app offline beschikbaar. Verhoog VERSION bij elke update. */
const VERSION = 'vd-1.10.98';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'js/config.js', 'js/store.js?v=1.10.98', 'js/i18n.js?v=1.10.98', 'js/ocr.js', 'js/cloud.js', 'js/library.js?v=1.10.92', 'js/migrate.js', 'js/activity.js?v=1.10.61', 'js/share.js', 'js/insights2.js?v=1.10.73', 'js/mood.js?v=1.10.94', 'js/cycle.js?v=1.10.95', 'js/week.js', 'js/extras.js?v=1.10.88', 'js/invite.js', 'js/admin.js', 'js/training.js?v=1.10.92', 'js/community-exercises.js?v=1.10.43', 'js/community-kpi.js', 'js/charts.js', 'js/insights.js?v=1.10.93', 'js/app.js?v=1.10.98', 'js/push.js?v=1.10.74', 'icons/icon-192.png', 'icons/icon-512.png'];

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
  // Eerst het netwerk (zodat updates binnenkomen), anders de cache.
  // cache: 'no-cache' omzeilt de 10 minuten browsercache van GitHub Pages: de browser vraagt
  // steeds aan de server of het bestand veranderd is (meestal een klein 304-antwoord).
  e.respondWith(
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
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
