// Fuel & Forge service worker — network-first for app files so deploys show up
// immediately, cache fallback for offline use. Firebase SDK cached cache-first.
const CACHE = 'ff-v8';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.json', 'icon.svg',
  'js/app.js', 'js/util.js', 'js/ui.js', 'js/store.js', 'js/ctx.js', 'js/nutrition.js', 'js/search.js',
  'js/menus.js', 'js/routine.js', 'js/gamify.js', 'js/actions.js', 'js/flags.js', 'js/menuparse.js', 'js/goals.js', 'js/planner.js', 'js/verdicts.js', 'js/ai.js', 'js/aikey.js', 'js/snapqueue.js', 'js/i18n/index.js', 'js/i18n/en.js', 'js/i18n/hi.js', 'js/views/privacy.js', 'js/engine/community.js', 'js/views/ratings.js', 'js/engine/diet.js', 'js/engine/fasting.js', 'js/engine/micro.js', 'js/views/foodrules.js', 'data/foods-x.js', 'js/coach.js', 'js/engine/coach.js',
  'js/engine/targets.js', 'js/engine/plate.js', 'js/engine/profile.js', 'js/engine/goal.js', 'js/engine/checkin.js', 'js/engine/dayplan.js', 'js/engine/verdict.js', 'js/engine/verdict-copy.js', 'js/engine/allergens.js', 'js/engine/aicore.js', 'js/engine/match.js',
  'js/components/icons.js', 'js/components/art.js', 'js/components/plategauge.js', 'js/components/bits.js', 'js/components/focus.js', 'js/components/camera.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/plan.js', 'js/views/ask.js', 'js/views/progress.js', 'js/views/you.js',
  'js/views/mess.js', 'js/views/train.js', 'js/views/onboard.js', 'js/views/auth.js', 'js/views/logsheet.js', 'js/views/goalplanner.js', 'js/views/nottoday.js', 'js/views/snap.js', 'js/views/coach.js',
  'data/foods.js', 'data/messes.js', 'data/mess-menus.js', 'js/engine/dishes.js', 'data/workouts.js', 'js/fooddb.js', 'data/india-foods.json', 'data/world-foods.json',
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
