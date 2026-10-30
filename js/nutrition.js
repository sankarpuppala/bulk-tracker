// =============================================================
// NUTRITION — meal helpers, food → logged item, day scoring
// =============================================================
import { round, uid, clamp } from './util.js';
import { GOALS, ACTIVITY, DIETS, calcTargets, targetsFor, weeksToGoal } from './engine/targets.js';
import { totals, estFat, dietOf, dietAllows, planPlate, topUps } from './engine/plate.js';

// Pure logic lives in js/engine/ (unit-tested in Node). Re-exported here so
// existing imports keep working.
export { GOALS, ACTIVITY, DIETS, calcTargets, targetsFor, weeksToGoal };
export { totals, estFat, dietOf, dietAllows, planPlate, topUps };

export const COLORS = { cal: 'var(--c-cal)', p: 'var(--c-p)', c: 'var(--c-c)', f: 'var(--c-f)', water: 'var(--c-water)' };

export const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.3, snacks: 0.15, dinner: 0.3 };

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

// ---------- food → logged item ----------
export function foodName(food) {
  return food.brand ? `${food.brand} ${food.n}` : food.n;
}

export function makeItem(food, { sizeIdx = 0, qty = 1, grams = null, meal }) {
  const size = food.sizes[sizeIdx] || food.sizes[0];
  const g = grams != null ? +grams : size[1] * qty;
  const k = food.k, x = g / 100;
  return {
    id: uid(), fid: food.id, n: foodName(food),
    unit: grams != null ? `${round(g)} ${food.ml ? 'ml' : 'g'}` : size[0], qty: grams != null ? 1 : qty, g: round(g),
    cal: round(k[0] * x), p: round(k[1] * x, 1), c: round(k[2] * x, 1), f: round(k[3] * x, 1),
    price: grams == null && size[2] ? round(size[2] * qty) : null,
    meal, diet: food.diet || 'v', cat: food.cat || 'custom', ts: Date.now(),
  };
}

export function makeMessItem(mi, servings, meal, messId) {
  return {
    id: uid(), n: mi.n, unit: messId ? `${messId} mess serving` : 'serving', qty: servings,
    cal: round(mi.cal * servings), p: round(mi.p * servings, 1), c: round(mi.c * servings, 1),
    f: round((mi.f ?? estFat(mi)) * servings, 1), price: null, meal, diet: mi.diet || dietOf(mi.n), cat: 'mess', ts: Date.now(),
  };
}

// ---------- daily scoring ----------
export function dayScore(day, t, isRestDay = false) {
  const tt = totals(day.items);
  if (!day.items.length && !day.water) return { score: 0, tt, hitP: false, hitCal: false, hitWater: false, trained: false };
  const calRatio = tt.cal / t.cal;
  const calPts = clamp(1 - Math.abs(1 - calRatio) / 0.25, 0, 1) * 40;
  const pPts = clamp(tt.p / t.p, 0, 1) * 30;
  const wPts = clamp(day.water / t.water, 0, 1) * 15;
  const trained = day.gymDone.length > 0 || Object.keys(day.sets || {}).length > 0;
  const gPts = trained || isRestDay ? 15 : 0;
  return {
    score: Math.round(calPts + pPts + wPts + gPts), tt,
    hitP: tt.p >= t.p * 0.9, hitCal: calRatio >= 0.9 && calRatio <= 1.1, hitWater: day.water >= t.water, trained,
  };
}
