// =============================================================
// MENU RESOLUTION
// Priority for a given mess + date:
//   festival special (shared) > your personal edit > published
//   shared menu (admins) > bundled default
// =============================================================
import { DEFAULT_MENUS, MEALS, MESSES, DEFAULT_TIMINGS } from '../data/messes.js';
import { store } from './store.js';
import { weekdayOf } from './util.js';
import { dietOf, estFat } from './nutrition.js';

export const messById = id => MESSES.find(m => m.id === id);
export const messLabel = id => { const m = messById(id); return m ? `${m.id} · ${m.kind}` : 'No mess'; };

export function normItem(it) {
  return {
    n: String(it.n || '').slice(0, 80), cal: +it.cal || 0, p: +it.p || 0, c: +it.c || 0,
    f: it.f != null && it.f !== '' ? +it.f : estFat(it), diet: it.diet || dietOf(it.n),
  };
}

/** Weekly menu for a mess and where it came from. */
export function weeklyMenu(messId) {
  const personal = store.profile.menuOverrides?.[messId];
  if (personal) return { menu: personal, source: 'personal' };
  const shared = store.shared.menus[messId];
  if (shared?.menu) return { menu: shared.menu, source: 'shared', updatedAt: shared.updatedAt, version: shared.version || 0, updatedBy: shared.updatedBy || null };
  if (DEFAULT_MENUS[messId]) return { menu: DEFAULT_MENUS[messId], source: 'default' };
  return { menu: null, source: 'none' };
}

export function specialsFor(messId, dateKey) {
  return store.shared.specials.filter(s => s.date === dateKey && (s.messes || []).some(m => m === 'ALL' || m === messId));
}

export function upcomingSpecials(messId, fromKey) {
  return store.shared.specials
    .filter(s => s.date >= fromKey && (!messId || (s.messes || []).some(m => m === 'ALL' || m === messId)))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** { meals: {breakfast:[...]...}, special: {title, emoji, meals:[ids]} | null, source } */
export function menuFor(messId, dateKey) {
  const { menu, source, version } = weeklyMenu(messId);
  const day = menu?.[weekdayOf(dateKey)] || {};
  const meals = {};
  MEALS.forEach(m => { meals[m.id] = (day[m.id] || []).map(normItem); });
  const sp = specialsFor(messId, dateKey);
  let special = null;
  if (sp.length) {
    special = { title: sp[0].title, emoji: sp[0].emoji || '🎉', note: sp[0].note || '', meals: [] };
    sp.forEach(s => Object.entries(s.meals || {}).forEach(([mid, items]) => {
      if (items && items.length) { meals[mid] = items.map(normItem); special.meals.push(mid); }
    }));
  }
  return { meals, special, source, version: version ?? null, hasAny: MEALS.some(m => meals[m.id].length) };
}

export function timingsFor(profile) {
  return { ...DEFAULT_TIMINGS, ...(profile.messTimings || {}) };
}

export function emptyWeek() {
  const w = {};
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach(d => {
    w[d] = { breakfast: [], lunch: [], snacks: [], dinner: [] };
  });
  return w;
}
