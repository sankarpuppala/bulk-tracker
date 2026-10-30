// =============================================================
// FUEL & FORGE — app bootstrap, auth, routing, shell
// =============================================================
import { h, todayKey, addDays, lsGet, lsSet, fill } from './util.js';
import { toast, confirmSheet } from './ui.js';
import { store, Store, dayHasData } from './store.js';
import { ctx } from './ctx.js';
import { analyse } from './gamify.js';
import { scheduleReminders } from './routine.js';
import { planner } from './planner.js';
import { syncPhase } from './goals.js';
import { t, setLocale } from './i18n/index.js';
import { ensureHealthConsent } from './views/privacy.js';
import { totals } from './nutrition.js';
import { proteinStreak } from './engine/community.js';
import { loadFoodDb } from './fooddb.js';
import { renderToday } from './views/today.js';
import { renderPlan } from './views/plan.js';
import { renderAsk } from './views/ask.js';
import { renderProgress } from './views/progress.js';
import { renderYou, applyTheme } from './views/you.js';
import { renderAuth } from './views/auth.js';
import { startOnboarding } from './views/onboard.js';
import { openLog } from './views/logsheet.js';
import { openSnap } from './components/camera.js';
import { icon } from './components/icons.js';
import { logoMark } from './components/art.js';
import { syncPill } from './views/common.js';

// Firebase web config is public by design — access is enforced by firestore.rules.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB34V9YNDuULxSafwZm6a7wD0vE5Z9inms',
  authDomain: 'bulk-tracker-c030e.firebaseapp.com',
  projectId: 'bulk-tracker-c030e',
  storageBucket: 'bulk-tracker-c030e.firebasestorage.app',
  messagingSenderId: '489595429173',
  appId: '1:489595429173:web:20678c4f90a32612762c7c',
  measurementId: 'G-PFR2Z4N3WE',
};

const ROUTES = {
  today: { render: renderToday, key: 'nav.today', icon: 'today' },
  plan: { render: renderPlan, key: 'nav.plan', icon: 'plan' },
  ask: { render: renderAsk, key: 'nav.ask', icon: 'ask' },
  progress: { render: renderProgress, key: 'nav.progress', icon: 'progress' },
  you: { render: renderYou, key: 'nav.you', icon: 'you' },
};
// Hashes from before the redesign keep working: [route, section]
const LEGACY = { mess: ['plan', 'menus'], train: ['plan', 'training'], stats: ['progress', null], me: ['you', null] };

const root = document.getElementById('root');
let unsubSync = null;
let main = null, route = 'today', section = null, pending = false, raf = 0, booting = null;

// ---------------- Firebase ----------------
function initFirebase() {
  if (!window.firebase) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* multi-tab or unsupported */ });
    store.attachDb(db);
    ctx.auth = firebase.auth();
    ctx.firebaseReady = true;
  } catch (e) { console.warn('Firebase init failed — guest mode only', e); }
}

// ---------------- boot ----------------
function boot() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  initFirebase();

  ctx.go = (r, sec) => {
    const old = LEGACY[r];
    if (old) { sec = sec || old[1]; r = old[0]; }
    location.hash = '#/' + r + (sec ? '/' + sec : '');
  };
  ctx.setDate = k => { ctx.date = k; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  ctx.openLog = (opts = {}) => openLog(opts);
  ctx.openSnap = (mode) => openSnap(mode);
  ctx.refresh = () => schedule();
  ctx.reloadHistory = reloadHistory;
  ctx.signOut = signOut;

  window.addEventListener('hashchange', onHash);
  window.addEventListener('online', () => store.setSync('ok'));
  window.addEventListener('offline', () => store.setSync('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !main) return;
    const t = todayKey();
    if (ctx.date !== t && ctx.date === addDays(t, -1) && ctx.lastToday !== t) { ctx.date = t; }
    ctx.lastToday = t;
    syncPhase();
    planner.refresh();
    render();
  });
  document.addEventListener('keydown', e => {
    if (!main || e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || document.querySelector('.sheet-wrap')) return;
    if (e.key === '/' || e.key === 'n') { e.preventDefault(); openLog(); }
  });
  store.on(reason => {
    if (reason === 'day') mergeHistory();
    if (reason === 'profile' || reason === 'day') recomputeStats();
    schedule();
  });

  if (ctx.auth) {
    ctx.auth.getRedirectResult().catch(e => toast(e.message, 'err'));
    ctx.auth.onAuthStateChanged(user => {
      // Firebase can re-emit for the same account (token refresh, profile
      // update). Re-running startCloud would double the import prompt and
      // throw away unsaved state, so only act on a real account change.
      if (user) {
        if (booting === user.uid) return;
        if (store.mode === 'cloud' && store.user && store.user.uid === user.uid) { store.user = user; return; }
        startCloud(user);
      } else if (lsGet('ff.mode') === 'guest') startGuest();
      else showAuth();
    });
  } else if (lsGet('ff.mode') === 'guest') startGuest();
  else showAuth();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function showAuth() {
  main = null;
  planner.reset();
  store.reset();
  ctx.history = [];
  ctx.stats = null;
  fill(root, renderAuth({ onGuest: startGuest }));
}

async function startGuest() {
  lsSet('ff.mode', 'guest');
  await store.start('guest');
  enterApp();
}

async function startCloud(user) {
  booting = user.uid;
  try {
    lsSet('ff.mode', 'cloud');
    fill(root, h('div', { class: 'boot' }, h('div', { class: 'boot-ring' }), h('p', { class: 'muted small' }, 'Loading your plan…')));
    await store.start('cloud', user);
    const guest = Store.guestSnapshot();
    if (guest?.profile?.onboarded && !store.profile.onboarded) {
      if (await confirmSheet('Bring your guest data?', { ok: 'Import', detail: `You have ${guest.days.length} days logged as a guest on this device. Move them into this account?` })) {
        try { await store.importGuest(guest); toast('Guest data imported ✅'); } catch (e) { toast('Import failed: ' + e.message, 'err'); }
      }
    }
    if (!store.profile.name && user.displayName) store.profile.name = user.displayName;
    enterApp();
  } finally { booting = null; }
}

async function signOut() {
  if (store.mode === 'cloud') {
    await ctx.auth.signOut();
  } else {
    lsSet('ff.mode', null);
    showAuth();
  }
}

// ---------------- shell ----------------
/** Re-label the navigation after a language change (the rest of the page re-renders on its own). */
ctx.relabel = () => document.querySelectorAll('.tab-btn[data-route], .rail-btn[data-route]').forEach(b => {
  const r = b.dataset.route; if (!ROUTES[r] || r === 'you') return;
  b.setAttribute('aria-label', t(ROUTES[r].key)); const l = b.querySelector('.nav-l'); if (l) l.textContent = t(ROUTES[r].key);
});

function navBtn(r, cls) {
  const label = t(ROUTES[r].key);
  const b = h('button', { class: cls, 'data-route': r, 'aria-label': label, onclick: () => ctx.go(r) },
    h('span', { class: 'nav-ic' }, icon(ROUTES[r].icon, { size: 24 })), h('span', { class: 'nav-l' }, label));
  return b;
}

/** Tap = Snap sheet, press and hold = the search / type log sheet. */
function snapButton(cls, ...kids) {
  let timer = null, held = false;
  const b = h('button', { class: cls, 'aria-label': 'Snap or log food', title: 'Tap to snap · hold to search', onclick: () => { if (!held) openSnap(); held = false; } }, ...kids);
  b.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; openLog(); }, 480); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(timer)));
  return b;
}

function enterApp() {
  setLocale(store.profile.locale);
  // existing users who have not yet agreed are asked once; nothing new is stored until they do
  if (store.profile.onboarded && !store.profile.consents?.health) ensureHealthConsent();
  main = h('main', { id: 'main', class: 'main', 'aria-label': 'Fuel & Forge' });
  const fab = snapButton('fab', icon('snap', { size: 30, sw: 2 }));
  const name = (store.profile.name || store.user?.displayName || 'You').split(' ')[0];
  const syncHost = h('div');
  const paintSync = () => fill(syncHost, syncPill());
  paintSync();
  unsubSync?.();
  unsubSync = store.on(r => { if (r === 'sync') paintSync(); });
  fill(root, h('div', { class: 'app' },
    h('nav', { class: 'rail', 'aria-label': 'Main' },
      h('div', { class: 'logo' }, logoMark(38), h('span', { class: 'nav-l' }, 'Fuel & Forge')),
      snapButton('btn primary lg rail-snap', icon('snap', { size: 20, sw: 2 }), h('span', { class: 'nav-l' }, 'Snap or log')),
      ['today', 'plan', 'ask', 'progress'].map(r => navBtn(r, 'rail-btn')),
      h('div', { class: 'rail-foot' },
        syncHost,
        h('button', { class: 'rail-btn', 'data-route': 'you', 'aria-label': 'You', onclick: () => ctx.go('you') },
          h('span', { class: 'avatar', style: { width: '30px', height: '30px', fontSize: '14px' } }, name.charAt(0).toUpperCase()), h('span', { class: 'nav-l' }, name)),
        h('div', { class: 'tiny muted' }, 'Press / to search and log'))),
    main,
    h('nav', { class: 'tabbar', 'aria-label': 'Main' }, navBtn('today', 'tab-btn'), navBtn('plan', 'tab-btn'), fab, navBtn('ask', 'tab-btn'), navBtn('progress', 'tab-btn'))));
  main.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) schedule(); }, 0));
  onHash();
  reloadHistory();
  syncPhase();
  planner.start().then(schedule, e => console.warn('planner failed to start', e));
  // ~8,000 more foods (Indian recipes + world foods); lazy so the first paint stays fast
  setTimeout(() => loadFoodDb().then(n => { if (n) schedule(); }), 400);
  if (!store.profile.onboarded) startOnboarding(false);
}

function onHash() {
  let [r, sec] = location.hash.replace(/^#\/?/, '').split('/');
  if (LEGACY[r]) { const [nr, ns] = LEGACY[r]; location.replace('#/' + nr + (sec || ns ? '/' + (sec || ns) : '')); return; }
  const next = ROUTES[r] ? r : 'today';
  const changed = next !== route;
  route = next; section = sec || null;
  if (!main) return;
  render();
  if (changed && !section) window.scrollTo({ top: 0 });
}

const editing = () => { const a = document.activeElement; return a && main?.contains(a) && a.matches('input, textarea, select'); };

function schedule() {
  if (!main) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (editing()) { pending = true; return; }
    render();
  });
}

function render() {
  if (!main) return;
  pending = false;
  try {
    fill(main, ROUTES[route].render(section));
  } catch (e) {
    console.error(e);
    fill(main, h('div', { class: 'page' }, h('div', { class: 'card' }, h('h2', { class: 'card-t' }, 'Something broke 😵'), h('pre', { class: 'tiny' }, String(e.stack || e)))));
  }
  document.querySelectorAll('[data-route]').forEach(b => { const on = b.dataset.route === route; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.title = (route === 'today' ? '' : t(ROUTES[route].key) + ' · ') + 'Fuel & Forge';
  section = null;
}

// ---------------- history & stats ----------------
async function reloadHistory() {
  const to = addDays(todayKey(), 1), from = addDays(todayKey(), -180);
  ctx.history = await store.range(from, to);
  recomputeStats();
  publishBoard();
  scheduleReminders(store.profile, ctx.targets());
  schedule();
}

function mergeHistory() {
  const from = addDays(todayKey(), -180);
  const map = new Map(ctx.history.map(d => [d.key, d]));
  for (const [k, d] of store.days) {
    if (k < from) continue;
    if (dayHasData(d)) map.set(k, { key: k, ...d }); else map.delete(k);
  }
  ctx.history = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

function recomputeStats() {
  ctx.stats = analyse(ctx.history, ctx.targets(), store.profile);
}

let boardSent = 0;
function publishBoard() {
  if (store.mode !== 'cloud' || !store.profile.leaderboard || !ctx.stats || Date.now() - boardSent < 60000) return;
  boardSent = Date.now();
  const s = ctx.stats;
  const t = ctx.targets(), days = [...ctx.history].reverse().map(d => ({ p: totals(d.items).p, done: d.key !== todayKey() }));
  store.publishLeaderboard({ name: (store.profile.name || 'Anon').split(' ')[0].slice(0, 20), mess: store.profile.mess || '', xp: s.xp, level: s.level, streak: s.streak, pStreak: proteinStreak(days, t.p), group: store.profile.challengeCode || '' });
}
store.on(r => { if (r === 'profile') publishBoard(); });

boot();
