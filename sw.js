/* Dialysis Log service worker: makes the app work fully offline.
 * Bump VERSION whenever you publish changes. */
var VERSION = 'dialysis-v1.2.0';
var ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'privacy-es.html', 'terms-es.html', 'log-sheet.html', 'log-sheet-es.html', 'i18n-es.js', 'vendor/qrcode.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('dialysis-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Cache first (instant + offline), refresh the cached copy in the background.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  var isNav = req.mode === 'navigate';
  e.respondWith(caches.open(VERSION).then(function (cache) {
    // Pages like terms.html / privacy.html are served as themselves; the app shell (and any unknown page) falls back to index.html.
    var path = new URL(req.url).pathname, isPage = isNav && /\.html$/.test(path) && !/\/index\.html$/.test(path);
    var key = isNav && !isPage ? 'index.html' : req;
    return cache.match(key, { ignoreSearch: true }).then(function (hit) {
      if (!hit && isPage) return fetch(req).catch(function () { return cache.match('index.html'); });
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      }).catch(function () { return hit; });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net.then(function (r) { return r || new Response('Offline', { status: 503 }); });
    });
  }));
});
