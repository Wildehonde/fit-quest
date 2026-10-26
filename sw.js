/* Fit Quest service worker: precache the app shell, serve cache-first, bust by bumping VERSION. */
const VERSION = 'fq-v3.8.0';
const ASSETS = ['./', 'index.html', 'styles.css', 'fonts.css', 'app.js', 'howto.js', 'manifest.webmanifest',
  'fonts/BarlowCondensed-600.woff2', 'fonts/BarlowCondensed-800.woff2', 'fonts/BarlowCondensed-900.woff2', 'fonts/Inter-var.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fq-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') { // any page URL (e.g. ?demo) gets the cached shell
    e.respondWith(caches.match('index.html').then(r => r || fetch(req)).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
