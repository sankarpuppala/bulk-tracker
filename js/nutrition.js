// =============================================================
// NUTRITION ENGINE — targets, totals, plate planner, top-ups
// =============================================================
import { round, uid, clamp } from './util.js';
import { FOODS } from '../data/foods.js';

export const GOALS = [
  { id: 'gain',     icon: '📈', label: 'Gain weight',  sub: 'Bulk up — add muscle and size' },
  { id: 'lose',     icon: '🔥', label: 'Lose fat',     sub: 'Cut down while keeping muscle' },
  { id: 'maintain', icon: '⚖️', label: 'Maintain',     sub: 'Stay where you are, eat well' },
  { id: 'recomp',   icon: '🔁', label: 'Recomp',       sub: 'Build muscle, lose fat slowly' },
];

export const ACTIVITY = [
  { id: 'sedentary', f: 1.2,   label: 'Mostly sitting',    sub: 'Classes, desk work, little walking' },
  { id: 'light',     f: 1.375, label: 'Lightly active',    sub: 'Walk around campus, light exercise 1–2×/wk' },
  { id: 'moderate',  f: 1.55,  label: 'Moderately active', sub: 'Gym or sport 3–5× a week' },
  { id: 'active',    f: 1.725, label: 'Very active',       sub: 'Hard training 6–7× a week' },
  { id: 'athlete',   f: 1.9,   label: 'Athlete',           sub: 'Twice-a-day training or college team' },
];

export const DIETS = [
  { id: 'veg',    icon: '🥦', label: 'Vegetarian' },
  { id: 'egg',    icon: '🥚', label: 'Eggetarian' },
  { id: 'nonveg', icon: '🍗', label: 'Non-veg' },
];

export const COLORS = { cal: 'var(--c-cal)', p: 'var(--c-p)', c: 'var(--c-c)', f: 'var(--c-f)', water: 'var(--c-water)' };

// ---------- targets ----------
export function calcTargets(pr) {
  const w = +pr.weight || 60, ht = +pr.height || 170, age = +pr.age || 20;
  const bmr = 10 * w + 6.25 * ht - 5 * age + (pr.sex === 'female' ? -161 : 5);
  const tdee = bmr * (ACTIVITY.find(a => a.id === pr.activity)?.f || 1.55);
  const pace = +pr.pace || 0.25;
  let delta = 0;
  if (pr.goal === 'gain') delta = (pace * 7700) / 7;
  else if (pr.goal === 'lose') delta = -(pace * 7700) / 7;
  else if (pr.goal === 'recomp') delta = -Math.min(250, tdee * 0.1);
  const floor = pr.sex === 'female' ? 1300 : 1500;
  const cal = Math.max(floor, Math.round((tdee + delta) / 10) * 10);
  // protein scales off a sensible body weight so heavier folks don't get absurd numbers
  const bmi = w / ((ht / 100) ** 2);
  const refW = bmi > 27 ? 25 * (ht / 100) ** 2 : w;
  const perKg = { gain: 1.8, lose: 2.0, recomp: 2.0, maintain: 1.6 }[pr.goal] || 1.6;
  const p = Math.round(refW * perKg);
  const f = Math.round(Math.max(0.7 * refW, (cal * 0.25) / 9));
  const c = Math.max(50, Math.round((cal - p * 4 - f * 9) / 4));
  const water = Math.max(2000, Math.round((w * 35) / 250) * 250);
  return { cal, p, c, f, water, fiber: Math.round((cal / 1000) * 14), bmr: Math.round(bmr), tdee: Math.round(tdee), bmi: round(bmi, 1) };
}

export function targetsFor(profile) {
  const auto = calcTargets(profile);
  return { ...auto, ...(profile.customTargets || {}) };
}

export function weeksToGoal(profile) {
  const { weight, goalWeight, pace, goal } = profile;
  if (!goalWeight || goal === 'maintain') return null;
  const diff = goalWeight - weight;
  if ((goal === 'gain' && diff <= 0) || (goal === 'lose' && diff >= 0)) return 0;
  return Math.ceil(Math.abs(diff) / (+pace || 0.25));
}

// ---------- totals ----------
export function totals(items) {
  return items.reduce((a, i) => {
    a.cal += +i.cal || 0; a.p += +i.p || 0; a.c += +i.c || 0; a.f += +(i.f ?? estFat(i)) || 0;
    a.price += +i.price || 0;
    return a;
  }, { cal: 0, p: 0, c: 0, f: 0, price: 0 });
}

/** Fat for legacy/mess items that only stored kcal, P and C. */
export function estFat(i) {
  return Math.max(0, round(((+i.cal || 0) - 4 * (+i.p || 0) - 4 * (+i.c || 0)) / 9, 1));
}

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

// ---------- veg / non-veg detection for free-text menu items ----------
const NV = /\b(chicken|mutton|fish|prawn|prawns|keema|kabab|kebab|kebabs|meat|beef|pork|crab|lamb|tuna|seafood)\b/i;
const EGG = /\b(egg|eggs|omelette|omelet|omlet|anda|bhurji|brownie|cake|mayo)\b/i;
export function dietOf(name) {
  const n = String(name);
  if (/veg opt|\(veg\)|veg option/i.test(n)) return 'v';
  if (NV.test(n)) return 'n';
  if (EGG.test(n)) return 'e';
  return 'v';
}
export function dietAllows(diet, itemDiet) {
  if (diet === 'veg') return itemDiet === 'v';
  if (diet === 'egg') return itemDiet !== 'n';
  return true;
}

// ---------- plate planner ----------
const STAPLE = /rice|chapati|roti|dosa|idli|poori|puri|biryani|pulao|bath|paratha|naan|bhatura|appam|pongal|upma|poha|mudde|fried rice|noodles/i;
const DESSERT = /payasam|kheer|sweet|halwa|ice cream|brownie|custard|jamun|holige|laddoo|cake|pastry|kesari|boost|bournvita/i;
const FRIED = /pakoda|bajji|vada|bonda|pazhampori|samosa|puff|garelu|fry\b|fries|poori|bhatura|mixture/i;
const WHOLESOME = /dal|sambar|curd|raita|fruit|papaya|salad|kosambari|sprout|palya|aviyal|kootu|majiga|buttermilk|egg|chicken|fish|paneer|soya|rajma|chana/i;

/**
 * Pick servings of each mess item so the plate lands near the meal's
 * calorie + protein budget for the user's goal. Local search over
 * servings in 0.5 steps — fast and good enough for 3–8 items.
 */
export function planPlate(menuItems, budget, { diet = 'nonveg', goal = 'maintain' } = {}) {
  const items = menuItems.map(mi => {
    const d = mi.diet || dietOf(mi.n);
    const isStaple = STAPLE.test(mi.n), isDessert = DESSERT.test(mi.n), isFried = FRIED.test(mi.n);
    let max = isDessert ? 1 : isStaple ? (goal === 'gain' ? 3 : 2) : 2;
    if (!dietAllows(diet, d)) max = 0;
    return { mi, d, max, isStaple, isDessert, isFried, wholesome: WHOLESOME.test(mi.n), s: max ? 1 : 0 };
  });
  if (!items.some(i => i.max)) return { picks: [], totals: totals([]), skipped: items.map(i => i.mi) };

  const tCal = Math.max(150, budget.cal), tP = Math.max(5, budget.p);
  const score = () => {
    let cal = 0, p = 0, pen = 0;
    for (const it of items) {
      cal += it.mi.cal * it.s; p += it.mi.p * it.s;
      if (it.s > 2) pen += 0.02 * (it.s - 2);
      if (goal === 'lose' && (it.isDessert || it.isFried)) pen += 0.06 * it.s;
      if (it.isDessert) pen += 0.03 * it.s;
      if (it.wholesome && it.s >= 0.5) pen -= 0.025;
    }
    // protein is the last thing to cut: reward it up to 130% of the meal's share
    pen -= 0.15 * Math.min(p, tP * 1.3) / tP;
    const e = (cal - tCal) / tCal;
    const over = goal === 'lose' ? 3 : goal === 'gain' ? 0.8 : 1.5;
    const under = goal === 'gain' ? 2.2 : 1;
    pen += e > 0 ? e * e * over : e * e * under;
    const ps = Math.max(0, tP - p) / tP;
    pen += 1.6 * ps * ps;
    return pen;
  };
  // best-improvement local search (first-improvement gets stuck halving the protein dish)
  let best = score();
  for (let iter = 0; iter < 60; iter++) {
    let move = null;
    for (const it of items) {
      for (const d of [-0.5, 0.5, -1, 1]) {
        const ns = it.s + d;
        if (ns < 0 || ns > it.max) continue;
        const old = it.s; it.s = ns;
        const sc = score();
        it.s = old;
        if (sc < best - 1e-6 && (!move || sc < move.sc)) move = { it, ns, sc };
      }
    }
    if (!move) break;
    move.it.s = move.ns; best = move.sc;
  }
  const picks = items.filter(i => i.s > 0).map(i => ({ item: i.mi, servings: i.s, diet: i.d }));
  const t = picks.reduce((a, x) => {
    a.cal += x.item.cal * x.servings; a.p += x.item.p * x.servings; a.c += x.item.c * x.servings;
    a.f += (x.item.f ?? estFat(x.item)) * x.servings; return a;
  }, { cal: 0, p: 0, c: 0, f: 0 });
  return { picks, totals: t, skipped: items.filter(i => i.s === 0).map(i => i.mi) };
}

// ---------- protein / calorie top-ups ----------
const TOPUP_IDS = [
  ['boiled-egg', 0, 2], ['amul-taaza-toned-milk', 0, 1], ['optimum-nutrition-whey-protein-gold-standard', 0, 1],
  ['soya-chunks-dry', 0, 1], ['paneer', 1, 1], ['curd', 1, 1], ['roasted-chana', 0, 1], ['amul-high-protein-buttermilk', 0, 1],
  ['sprouts-boiled-mix', 0, 1], ['roasted-peanuts', 0, 1], ['chicken-breast-grilled', 1, 1], ['greek-yogurt-plain', 0, 1],
  ['banana', 1, 2], ['pintola-peanut-butter', 1, 1], ['banana-shake', 0, 1], ['dates', 1, 1],
];

export function topUps(gap, { diet = 'nonveg', goal = 'maintain', limit = 4 } = {}) {
  const out = [];
  for (const [id, sizeIdx, qty] of TOPUP_IDS) {
    const food = FOODS.find(f => f.id === id);
    if (!food || !dietAllows(diet, food.diet)) continue;
    const g = food.sizes[sizeIdx][1] * qty;
    const m = { cal: food.k[0] * g / 100, p: food.k[1] * g / 100 };
    if (gap.p > 8 && m.p < 4) continue;
    out.push({ food, sizeIdx, qty, ...m, density: m.p / Math.max(1, m.cal) });
  }
  if (goal === 'gain' && gap.cal > 400) out.sort((a, b) => (b.cal + b.p * 8) - (a.cal + a.p * 8));
  else out.sort((a, b) => b.density - a.density);
  return out.slice(0, limit);
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
