// =============================================================
// PLATE ENGINE — totals, diet rules, plate planner, top-ups.
// Pure functions: no DOM, no network, no storage. Unit-tested in
// test/unit/. js/nutrition.js re-exports everything here.
// =============================================================
import { round } from '../util.js';
import { FOODS } from '../../data/foods.js';

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

export const isFriedName = n => FRIED.test(String(n));

/**
 * Pick servings of each mess item so the plate lands near the meal's
 * calorie + protein budget for the user's goal. Local search over
 * servings in 0.5 steps — fast and good enough for 3–8 items.
 */
export function planPlate(menuItems, budget, { diet = 'nonveg', goal = 'maintain', allow = null } = {}) {
  const items = menuItems.map(mi => {
    const d = mi.diet || dietOf(mi.n);
    const isStaple = STAPLE.test(mi.n), isDessert = DESSERT.test(mi.n), isFried = FRIED.test(mi.n);
    let max = isDessert ? 1 : isStaple ? (goal === 'gain' ? 3 : 2) : 2;
    if (!dietAllows(diet, d) || (allow && !allow(mi))) max = 0;
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

export function topUps(gap, { diet = 'nonveg', goal = 'maintain', limit = 4, allow = null } = {}) {
  const out = [];
  for (const [id, sizeIdx, qty] of TOPUP_IDS) {
    const food = FOODS.find(f => f.id === id);
    if (!food || !dietAllows(diet, food.diet) || (allow && !allow(food))) continue;
    const g = food.sizes[sizeIdx][1] * qty;
    const m = { cal: food.k[0] * g / 100, p: food.k[1] * g / 100 };
    if (gap.p > 8 && m.p < 4) continue;
    out.push({ food, sizeIdx, qty, ...m, density: m.p / Math.max(1, m.cal) });
  }
  if (goal === 'gain' && gap.cal > 400) out.sort((a, b) => (b.cal + b.p * 8) - (a.cal + a.p * 8));
  else out.sort((a, b) => b.density - a.density);
  return out.slice(0, limit);
}
