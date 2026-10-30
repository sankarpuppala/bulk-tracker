// =============================================================
// DAY PLAN ENGINE — "what should I eat today" as one object (spec §5.3).
// Pure functions: no DOM, no network, no storage. The stateful side
// (watching the store, re-planning, persisting) lives in js/planner.js.
//
//   buildDayPlan(input)       a fresh DayPlan from menus, targets and the log
//   rebudget(plan, logged)    redistribute what is left over the uneaten meals
//   diffDayPlans(a, b)        what changed per meal
//   describeChange(diffs)     one human sentence for the banner
//
// Plate entries hold PER-SERVING cal/p/c/f plus `servings`.
// =============================================================
import { round } from '../util.js';
import { totals, estFat, dietOf, dietAllows, planPlate, topUps } from './plate.js';
import { DEFAULT_TIMINGS } from '../../data/messes.js';
import { rulesOf, allowed } from './diet.js';
import { fastingFor } from './fasting.js';

export const MEAL_IDS = ['breakfast', 'lunch', 'snacks', 'dinner'];
export const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.3, snacks: 0.15, dinner: 0.3 };
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };
export const MEAL_CAP = 0.45;           // no single meal may take more than this share of the day's calories
const PROTEIN_CAP = 0.5;
const GAP_FOR_TOPUP = 10;               // g of protein a plate may be short before top-ups are suggested
export const NOTABLE = { protein: 5, kcal: 100 };

// ---------- meal of a logged item ----------
export function guessMeal(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m < 11 * 60) return 'breakfast';
  if (m < 15 * 60 + 30) return 'lunch';
  if (m < 19 * 60) return 'snacks';
  return 'dinner';
}
export function itemMeal(i) {
  if (i.meal) return i.meal;
  return i.ts ? guessMeal(new Date(i.ts)) : 'snacks';
}

const toMin = hhmm => { const [a, b] = String(hhmm).split(':').map(Number); return (a || 0) * 60 + (b || 0); };

// ---------- helpers ----------
const entryOf = (it, servings = 1) => ({
  name: it.n, servings, cal: +it.cal || 0, p: +it.p || 0, c: +it.c || 0, f: it.f != null ? +it.f : estFat(it), diet: it.diet || dietOf(it.n),
});
const plateTotals = (plate, tops = []) => {
  const t = { cal: 0, p: 0 };
  for (const x of plate) { t.cal += x.cal * x.servings; t.p += x.p * x.servings; }
  for (const x of tops) { t.cal += x.cal; t.p += x.p; }
  return t;
};
export const mealTotals = m => plateTotals(m.plate || [], m.topUps || []);

function menuItemsFor(id, menus, overrides) {
  const ov = overrides?.[id];
  if (Array.isArray(ov) && ov.length) return { items: ov, kind: 'custom' };
  return { items: menus?.meals?.[id] || [], kind: null };
}

// ---------- core: budgets + plates ----------
/**
 * `skeleton` is [{ id, source, window, menu, status }]; this fills budget,
 * plate, others and topUps. Meals that are `logged` and already in `prev`
 * are frozen: their plate is carried over untouched.
 */
function fillPlan(skeleton, { targets, items, diet, goal, prev, rules }) {
  const T = targets;
  const allow = it => allowed(it, rules);
  const open = skeleton.filter(m => m.status === 'upcoming').map(m => m.id);
  const budgetFor = id => {
    const eatenOther = totals(items.filter(i => itemMeal(i) !== id));
    const set = new Set([...open, id]);
    const sum = [...set].reduce((a, m) => a + MEAL_SPLIT[m], 0);
    const share = MEAL_SPLIT[id] / sum;
    return {
      cal: Math.round(Math.min(Math.max(150, (T.cal - eatenOther.cal) * share), T.cal * MEAL_CAP)),
      p: round(Math.min(Math.max(5, (T.p - eatenOther.p) * share), T.p * PROTEIN_CAP), 1),
    };
  };

  const meals = skeleton.map(m => {
    const share = { cal: Math.round(T.cal * MEAL_SPLIT[m.id]), p: round(T.p * MEAL_SPLIT[m.id], 1) };
    const frozen = m.status === 'logged' ? prev?.meals?.find(x => x.id === m.id) : null;
    if (frozen) return { ...frozen, status: m.status, window: m.window, source: m.source, menu: frozen.menu, share };
    const budget = budgetFor(m.id);
    let plate = [], others = [];
    if (m.menu.length) {
      const plan = planPlate(m.menu, budget, { diet, goal, allow });
      plate = plan.picks.map(pk => entryOf(pk.item, pk.servings));
      others = plan.skipped.filter(x => allow(x)).map(x => entryOf(x, 1));
    }
    const blockedAll = m.menu.length > 0 && m.menu.every(x => !allow(x));
    return { id: m.id, ...(m.label ? { label: m.label } : {}), source: m.source, window: m.window, menu: m.menu, status: m.status, budget, share, plate, others, topUps: [], ...(blockedAll ? { blockedAll } : {}) };
  });

  // protein top-ups: a light plate gets them, and a light dinner moves them to snacks
  // (an egg or two earlier in the day fixes dinner without cooking anything)
  const gap = Object.fromEntries(meals.map(m => [m.id, 0]));
  for (const m of meals) {
    if (m.status === 'logged' || m.status === 'skipped' || (!m.plate.length && !m.blockedAll)) continue;
    gap[m.id] = Math.max(0, m.budget.p - plateTotals(m.plate).p);
  }
  const notes = [];
  const snacks = meals.find(m => m.id === 'snacks'), dinner = meals.find(m => m.id === 'dinner');
  if (gap.dinner > GAP_FOR_TOPUP && snacks && snacks.status === 'upcoming') {
    gap.snacks += gap.dinner;
    notes.push(`Dinner is about ${Math.round(gap.dinner)} g light on protein, so the top-up moved to snacks.`);
    dinner.shifted = true;
    gap.dinner = 0;
  }
  for (const m of meals) {
    if (gap[m.id] > GAP_FOR_TOPUP) {
      m.topUps = topUps({ p: gap[m.id], cal: 0 }, { diet, goal, limit: 3, allow }).map(x => ({
        fid: x.food.id, name: x.food.n, sizeIdx: x.sizeIdx, qty: x.qty, cal: Math.round(x.cal), p: round(x.p, 1),
      }));
    }
    if (m.status !== 'logged' && m.menu.length && m.plate.length && plateTotals(m.plate).p < 0.35 * m.budget.p) {
      notes.push(`${MEAL_LABEL[m.id]} has little protein on the menu.`);
    }
    if (m.status === 'upcoming' && !m.menu.length) notes.push(`No menu for ${(m.label || MEAL_LABEL[m.id]).toLowerCase()}.`);
    if (m.blockedAll && m.status === 'upcoming') notes.push(`Nothing on the ${(m.label || MEAL_LABEL[m.id]).toLowerCase()} menu fits your ${rules.fast ? 'fast' : 'food rules'}, so top-ups cover it.`);
  }
  const eaten = totals(items);
  const planned = meals.filter(m => m.status === 'upcoming').reduce((a, m) => a + plateTotals(m.plate).p, 0);
  if (open.length && eaten.p + planned < 0.8 * T.p) notes.unshift('Protein-poor day: the menu alone will not reach your target.');
  return { meals, notes };
}

function statusOf(id, items, window, { nowMin, skipped }) {
  if (items.some(i => itemMeal(i) === id)) return 'logged';
  if (skipped.includes(id) || (nowMin >= 0 && toMin(window[1]) < nowMin)) return 'skipped';
  return 'upcoming';
}

/** Mark logged meals "partial" when they came in well under their share. */
function markPartial(plan, items) {
  for (const m of plan.meals) {
    if (m.status !== 'logged') continue;
    const cal = totals(items.filter(i => itemMeal(i) === m.id)).cal;
    if (cal < 0.6 * m.share.cal) m.status = 'partial';
  }
  return plan;
}

/**
 * @param date      'YYYY-MM-DD'
 * @param profile   { diet, goal, mess }
 * @param targets   { cal, p, c, f, fiber, water }
 * @param menus     menuFor() output: { meals: {id: [items]}, special, source, hasAny } or null
 * @param logged    the day: { items: [...] }
 * @param overrides { mealId: [items] }, a one-off "not this today" replacement
 * @param routine   { timings: { mealId: [start, end] } }
 * @param prev      earlier DayPlan: logged meals keep their plate from it
 * @param nowMin    minutes since midnight for today, -1 for any other date
 * @param skipped   meal ids the user said they are skipping
 */
export function buildDayPlan({ date, profile = {}, targets, menus = null, logged = { items: [] }, overrides = {}, routine = {}, prev = null, version = 1, reason = 'initial', nowMin = -1, skipped = [] }) {
  const timings0 = { ...DEFAULT_TIMINGS, ...(routine.timings || {}) };
  const items = logged.items || [];
  const fast = fastingFor(profile, date);
  const rules = rulesOf(profile, fast);
  const fastSkip = fast?.skip || [];
  const timings = { ...timings0, ...(fast?.timings || {}) };
  const skeleton = MEAL_IDS.map(id => {
    const { items: menu, kind } = menuItemsFor(id, menus, overrides);
    const source = kind === 'custom' ? { kind: 'custom' } : profile.mess ? { kind: 'mess', messId: profile.mess, menuVersion: menus?.version ?? null } : { kind: 'home' };
    const status = statusOf(id, items, timings[id], { nowMin, skipped: [...skipped, ...fastSkip] });
    return { id, ...(fast?.labels?.[id] ? { label: fast.labels[id] } : {}), source, window: timings[id], menu: menu.map(x => ({ n: x.n, cal: +x.cal || 0, p: +x.p || 0, c: +x.c || 0, f: x.f != null ? +x.f : estFat(x), diet: x.diet || dietOf(x.n) })), status };
  });
  const { meals, notes } = fillPlan(skeleton, { targets, items, diet: profile.diet || 'nonveg', goal: profile.goal || 'maintain', prev, rules });
  if (fast) notes.unshift(fast.note);
  return markPartial({
    date, version, reason, for: { diet: profile.diet || 'nonveg', goal: profile.goal || 'maintain', allergies: rules.allergies, tags: rules.tags, fast: rules.fast, fastSkip },
    targets: { cal: targets.cal, p: targets.p, c: targets.c, f: targets.f, fiber: targets.fiber, water: targets.water },
    special: menus?.special || null, hasMenu: !!menus?.hasAny, meals, notes, change: prev?.change || null,
  }, items);
}

/**
 * Re-spread what is left of the day after logging or missing a meal.
 * Logged meals stay exactly as they were; every other meal gets a new
 * budget and plate from its stored menu. Returns a new DayPlan.
 */
export function rebudget(plan, logged = { items: [] }, { nowMin = -1, skipped = [], reason = 'logged-off-plan' } = {}) {
  const items = logged.items || [];
  const fastSkip = plan.for.fastSkip || [];
  const skeleton = plan.meals.map(m => ({ id: m.id, label: m.label, source: m.source, window: m.window, menu: m.menu, status: statusOf(m.id, items, m.window, { nowMin, skipped: [...skipped, ...fastSkip] }) }));
  const rules = { diet: plan.for.diet, allergies: plan.for.allergies || [], tags: plan.for.tags || [], fast: plan.for.fast || null };
  const { meals, notes } = fillPlan(skeleton, { targets: plan.targets, items, diet: plan.for.diet, goal: plan.for.goal, prev: plan, rules });
  return markPartial({ ...plan, reason, meals, notes }, items);
}

// ---------- diffing ----------
const names = m => (m?.plate || []).map(x => x.name);
const topNames = m => (m?.topUps || []).map(x => (x.qty > 1 ? `${x.qty}× ` : '') + x.name);

/** Per-meal changes between two plans; meals logged in either are ignored. */
export function diffDayPlans(a, b) {
  const out = [];
  if (!b) return out;
  for (const mb of b.meals) {
    const ma = a?.meals?.find(x => x.id === mb.id);
    if (mb.status === 'logged' || mb.status === 'partial' || ma?.status === 'logged' || ma?.status === 'partial') continue;
    const ta = ma ? mealTotals(ma) : { cal: 0, p: 0 }, tb = mealTotals(mb);
    const added = names(mb).filter(n => !names(ma).includes(n)), removed = names(ma).filter(n => !names(mb).includes(n));
    const topAdded = topNames(mb).filter(n => !topNames(ma).includes(n)), topRemoved = topNames(ma).filter(n => !topNames(mb).includes(n));
    const dCal = Math.round(tb.cal - ta.cal), dP = round(tb.p - ta.p, 1);
    const changed = added.length || removed.length || topAdded.length || topRemoved.length || Math.abs(dCal) >= 1 || Math.abs(dP) >= 0.5;
    if (changed) out.push({ meal: mb.id, added, removed, topAdded, topRemoved, dCal, dP });
  }
  return out;
}

/** Diffs big enough to tell the user about (spec §5.4). */
export const notable = diffs => diffs.filter(d => Math.abs(d.dP) >= NOTABLE.protein || Math.abs(d.dCal) >= NOTABLE.kcal);

/** "Dinner changed: Paneer butter masala → Aloo gobi. Protein −14 g, so we added 2× Boiled egg at snacks." */
export function describeChange(diffs) {
  const main = [...diffs].filter(d => d.added.length || d.removed.length).sort((a, b) => Math.abs(b.dP) - Math.abs(a.dP))[0] || diffs[0];
  if (!main) return '';
  const label = MEAL_LABEL[main.meal];
  const swap = main.removed.length && main.added.length ? `${main.removed.join(', ')} → ${main.added.join(', ')}`
    : main.added.length ? `added ${main.added.join(', ')}` : main.removed.length ? `${main.removed.join(', ')} gone` : '';
  const sign = n => (n > 0 ? '+' : '−') + Math.abs(Math.round(n));
  let s = swap ? `${label} changed: ${swap}.` : `${label} changed.`;
  if (Math.abs(main.dP) >= 1) s += ` Protein ${sign(main.dP)} g`;
  else if (Math.abs(main.dCal) >= 1) s += ` Energy ${sign(main.dCal)} kcal`;
  const top = diffs.find(d => d.topAdded.length);
  if (top) s += `${s.endsWith('.') ? '' : ','} so we added ${top.topAdded.join(' + ')} at ${top.meal}.`;
  else if (!s.endsWith('.')) s += '.';
  return s;
}

/** Protein the menu alone provides, as a share of the meal's protein share (for the week grid). */
export function proteinCoverage(meal) {
  if (!meal.plate.length || !meal.share.p) return null;
  return plateTotals(meal.plate).p / meal.share.p;
}
