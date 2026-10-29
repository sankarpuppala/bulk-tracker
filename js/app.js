// =============================================================
// FUEL & FORGE — app bootstrap, auth, routing, shell
// =============================================================
import { h, todayKey, addDays, lsGet, lsSet, fill } from './util.js';
import { toast, confirmSheet } from './ui.js';
import { store, Store, dayHasData } from './store.js';
import { ctx } from './ctx.js';
import { analyse } from './gamify.js';
import { scheduleReminders } from './routine.js';
import { renderToday } from './views/today.js';
import { renderMess } from './views/mess.js';
import { renderTrain } from './views/train.js';
import { renderStats } from './views/stats.js';
import { renderMe, applyTheme } from './views/me.js';
import { renderAuth } from './views/auth.js';
import { startOnboarding } from './views/onboard.js';
import { openLog } from './views/logsheet.js';

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
  today: { render: renderToday, label: 'Today', icon: '◉' },
  mess: { render: renderMess, label: 'Mess', icon: '🍛' },
  train: { render: renderTrain, label: 'Train', icon: '🏋️' },
  stats: { render: renderStats, label: 'Stats', icon: '📈' },
  me: { render: renderMe, label: 'Me', icon: '👤' },
};
const NAV_ICONS = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  mess: '<svg viewBox="0 0 24 24"><path d="M4 13h16a8 8 0 0 1-16 0Z"/><path d="M8 9c0-2 2-2 2-4M12 9c0-2 2-2 2-4"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/></svg>',
  stats: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

const root = document.getElementById('root');
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

  ctx.go = (r, sec) => { location.hash = '#/' + r + (sec ? '/' + sec : ''); };
  ctx.setDate = k => { ctx.date = k; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  ctx.openLog = (opts = {}) => openLog(opts);
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
function navBtn(r, cls) {
  const b = h('button', { class: cls, 'data-route': r, 'aria-label': ROUTES[r].label, onclick: () => ctx.go(r) },
    h('span', { class: 'nav-ic' }), h('span', { class: 'nav-l' }, ROUTES[r].label));
  b.querySelector('.nav-ic').innerHTML = NAV_ICONS[r]; // static, trusted markup
  return b;
}

function enterApp() {
  main = h('main', { id: 'main', class: 'main' });
  const fab = h('button', { class: 'fab', 'aria-label': 'Log food', onclick: () => openLog() }, h('span', null, '+'));
  fill(root, h('div', { class: 'app' },
    h('nav', { class: 'rail', 'aria-label': 'Main' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-mark' }, 'F&F'), h('span', { class: 'nav-l' }, 'Fuel & Forge')),
      h('button', { class: 'btn primary rail-log', onclick: () => openLog() }, '+ ', h('span', { class: 'nav-l' }, 'Log food')),
      Object.keys(ROUTES).map(r => navBtn(r, 'rail-btn')),
      h('div', { class: 'rail-foot tiny muted' }, 'Press / to log')),
    main,
    h('nav', { class: 'tabbar', 'aria-label': 'Main' }, navBtn('today', 'tab-btn'), navBtn('mess', 'tab-btn'), fab, navBtn('train', 'tab-btn'), navBtn('stats', 'tab-btn'))));
  main.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) schedule(); }, 0));
  onHash();
  reloadHistory();
  if (!store.profile.onboarded) startOnboarding(false);
}

function onHash() {
  const [r, sec] = location.hash.replace(/^#\/?/, '').split('/');
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
  document.querySelectorAll('[data-route]').forEach(b => b.classList.toggle('on', b.dataset.route === route));
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
  store.publishLeaderboard({ name: (store.profile.name || 'Anon').split(' ')[0].slice(0, 20), mess: store.profile.mess || '', xp: s.xp, level: s.level, streak: s.streak });
}
store.on(r => { if (r === 'profile') publishBoard(); });

boot();
