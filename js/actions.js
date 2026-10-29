// =============================================================
// COMMON ACTIONS used across views
// =============================================================
import { store } from './store.js';
import { ctx } from './ctx.js';
import { toast, confetti } from './ui.js';
import { totals } from './nutrition.js';
import { haptic, round } from './util.js';

export function logItems(date, items, { silent = false } = {}) {
  if (!items.length) return;
  const t = ctx.targets();
  const before = totals(store.day(date).items);
  store.updateDay(date, d => { d.items.push(...items); });
  const ids = items.map(i => i.fid).filter(Boolean);
  if (ids.length) {
    const rec = [...new Set([...ids.reverse(), ...store.profile.recents])].slice(0, 30);
    store.saveProfile({ recents: rec });
  }
  haptic(12);
  const after = totals(store.day(date).items);
  if (before.p < t.p && after.p >= t.p) { confetti(); toast('Protein target smashed! 💪', 'ok'); return; }
  if (before.cal < t.cal * 0.95 && after.cal >= t.cal * 0.95 && store.profile.goal === 'gain') { confetti(); toast('Calorie target reached — bulk mode ✅', 'ok'); return; }
  if (silent) return;
  const label = items.length === 1 ? items[0].n : `${items.length} items`;
  const kcal = round(items.reduce((a, i) => a + i.cal, 0));
  toast(`+ ${label} · ${kcal} kcal`, 'ok', { label: 'Undo', fn: () => removeItems(date, items.map(i => i.id), true) });
}

export function removeItems(date, ids, quiet = false) {
  const set = new Set(ids);
  const removed = store.day(date).items.filter(i => set.has(i.id));
  store.updateDay(date, d => { d.items = d.items.filter(i => !set.has(i.id)); });
  if (!quiet && removed.length) {
    toast(`Removed ${removed.length === 1 ? removed[0].n : removed.length + ' items'}`, 'warn', {
      label: 'Undo', fn: () => store.updateDay(date, d => { d.items.push(...removed); }),
    });
  }
}

export function isFav(id) { return store.profile.favorites.includes(id); }
export function toggleFav(id) {
  const fav = new Set(store.profile.favorites);
  fav.has(id) ? fav.delete(id) : fav.add(id);
  store.saveProfile({ favorites: [...fav] });
  return fav.has(id);
}

export function saveCustomFood(food) {
  const list = store.profile.customFoods.filter(f => f.id !== food.id);
  const clean = { id: food.id, n: food.n, brand: food.brand || '', cat: food.cat || 'custom', k: food.k, sizes: food.sizes, diet: food.diet || 'v', src: food.src || 'custom', code: food.code || null };
  store.saveProfile({ customFoods: [clean, ...list].slice(0, 300) });
}

export function addWater(date, ml) {
  store.updateDay(date, d => { d.water = Math.max(0, (d.water || 0) + ml); });
  haptic(10);
  const t = ctx.targets();
  const w = store.day(date).water;
  if (ml > 0 && w >= t.water && w - ml < t.water) { confetti(60); toast('Water goal hit 💧', 'ok'); }
}
