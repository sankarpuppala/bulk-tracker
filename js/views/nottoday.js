// =============================================================
// "NOT THIS TODAY" — the mess served something other than the menu.
// Type what is on the counter (or tap dishes from this mess's other
// days) and that one meal is re-planned from it. Saved on the day's
// log, so it syncs and only affects that date.
// =============================================================
import { h, fill, round } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MEALS, WEEK } from '../../data/messes.js';
import { weeklyMenu, normItem } from '../menus.js';
import { parseQuickLog } from '../search.js';
import { makeItem, dietOf } from '../nutrition.js';
import { planner } from '../planner.js';
import { icon } from '../components/icons.js';
import { dietDot } from '../components/bits.js';

/** Distinct dishes this mess serves at `meal` on other days, commonest first. */
function knownDishes(messId, meal) {
  const { menu } = weeklyMenu(messId);
  const seen = new Map();
  for (const d of WEEK) for (const it of menu?.[d]?.[meal] || []) {
    const n = normItem(it);
    if (!n.n) continue;
    const e = seen.get(n.n.toLowerCase());
    if (e) e.count++; else seen.set(n.n.toLowerCase(), { item: n, count: 1 });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count).map(x => x.item).slice(0, 14);
}

const asItem = it => ({ n: it.n, cal: round(it.cal), p: round(it.p, 1), c: round(it.c, 1), f: round(it.f ?? 0, 1), diet: it.diet || dietOf(it.n) });

export function openNotToday(date, mealId) {
  const pf = store.profile;
  const label = MEALS.find(m => m.id === mealId).label;
  const existing = store.day(date).dayOverrides?.[mealId] || [];
  const picked = new Map(existing.map(i => [i.n.toLowerCase(), asItem(i)]));
  let typed = [], unmatched = [];

  const chips = h('div', { class: 'chip-row' });
  const preview = h('div', { class: 'stack-xs' });
  const note = h('div', { class: 'tiny muted' });
  const saveBtn = h('button', { class: 'btn primary grow', onclick: save }, 'Re-plan this meal');

  const all = () => [...picked.values(), ...typed];
  function paint() {
    fill(chips, knownDishes(pf.mess, mealId).map(it => {
      const on = picked.has(it.n.toLowerCase());
      return h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { if (on) picked.delete(it.n.toLowerCase()); else picked.set(it.n.toLowerCase(), asItem(it)); paint(); } }, dietDot(it.diet), it.n);
    }));
    const items = all();
    fill(preview, items.length
      ? items.map(i => h('div', { class: 'log-item' }, dietDot(i.diet), h('div', { class: 'grow small' }, i.n), h('span', { class: 'mono tiny muted' }, `${i.cal} kcal · ${i.p} g P`)))
      : h('p', { class: 'tiny muted' }, 'Nothing chosen yet.'));
    fill(note, unmatched.length ? `Couldn’t match: ${unmatched.join(', ')}. Tap a dish above or rephrase.` : null);
    saveBtn.disabled = items.length === 0;
  }

  const ta = h('textarea', { class: 'input', rows: 2, placeholder: 'e.g. egg curry, 2 chapati, curd', 'aria-label': `What is being served for ${label.toLowerCase()}` });
  ta.addEventListener('input', () => {
    const parsed = parseQuickLog(ta.value, pf.diet);
    typed = parsed.filter(x => x.food).map(x => {
      const m = makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, grams: x.grams, meal: mealId });
      return asItem({ ...m, n: m.n });
    });
    unmatched = parsed.filter(x => !x.food).map(x => x.raw);
    paint();
  });

  function save() {
    const items = all();
    if (!items.length) return;
    planner.setOverride(date, mealId, items);
    sh.close(); toast(`${label} re-planned`); ctx.refresh();
  }

  const sh = sheet({
    title: 'Not this today', sub: `What is being served for ${label.toLowerCase()} instead? Only this meal, only this day.`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', null, 'Type the dishes'), ta),
      knownDishes(pf.mess, mealId).length > 0 && h('div', { class: 'field' }, h('label', null, `Or tap from ${pf.mess}’s usual ${label.toLowerCase()}`), chips),
      note, preview,
      h('div', { class: 'row gap' },
        existing.length > 0 && h('button', { class: 'btn ghost grow', onclick: () => { planner.setOverride(date, mealId, null); sh.close(); toast('Back to the menu'); ctx.refresh(); } }, icon('undo', { size: 16 }), 'Back to the menu'),
        saveBtn)),
  });
  paint();
  return sh;
}
