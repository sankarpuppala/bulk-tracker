// Fuel & Forge service worker — network-first for app files so deploys show up
// immediately, cache fallback for offline use. Firebase SDK cached cache-first.
const CACHE = 'ff-v2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.json', 'icon.svg',
  'js/app.js', 'js/util.js', 'js/ui.js', 'js/store.js', 'js/ctx.js', 'js/nutrition.js', 'js/search.js',
  'js/menus.js', 'js/routine.js', 'js/gamify.js', 'js/actions.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/mess.js', 'js/views/train.js', 'js/views/stats.js',
  'js/views/me.js', 'js/views/onboard.js', 'js/views/auth.js', 'js/views/logsheet.js',
  'data/foods.js', 'data/messes.js', 'data/workouts.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (url.hostname === 'www.gstatic.com' || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0] ? list[0].focus() : self.clients.openWindow('./')));
});
