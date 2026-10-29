/* 离线缓存：HTML 走网络优先，data/js/css 走缓存优先 + 后台更新 */
const V = 'kg-v3.5';
const SHELL = ['./', './index.html', './explore.html', './diagnose.html', './wrong.html', './drill.html',
  './report.html', './lab.html', './learn.html', './review.html', './data/lab.json', './style.css', './app.js', './brand.json', './manifest.webmanifest', './icon.svg', './icons/apple-touch-icon.png', './icons/icon-512-maskable.png', './icons/icon-512.png', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\.html?$/.test(new URL(req.url).pathname);
  if (isPage) {
    e.respondWith(fetch(req).then(r => {
      const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});