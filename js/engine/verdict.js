// =============================================================
// VERDICT ENGINE — "Should I eat this?" (spec §5.5).
// Pure and deterministic: the verdict is never decided by an LLM.
// An explainer (template copy here, optionally AI in Phase 7) only
// turns the reason codes into a sentence.
//
//   evaluate(input)    → Verdict { kind, portion, reasons, numbers, alternatives, ifAnyway }
//   edSignals(input)   → eating-disorder warning signs (spec §9.1)
//
// kind: 'go' | 'smaller' | 'swap' | 'skip'
// =============================================================
import { round } from '../util.js';
import { totals, estFat, dietOf, dietAllows, topUps, isFriedName } from './plate.js';
import { rebudget, diffDayPlans, mealTotals, MEAL_SPLIT, MEAL_IDS, MEAL_LABEL, guessMeal } from './dayplan.js';
import { allergenLabel } from './allergens.js';
import { blockReasons as dietBlocks, rulesOf } from './diet.js';
import { fastingFor } from './fasting.js';
import { DEFAULT_TIMINGS } from '../../data/messes.js';

export const STEPS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];                  // smallest → largest portion step
export const STEP_LABEL = { 0.25: '¼', 0.3333: '⅓', 0.5: '½', 0.6667: '⅔', 0.75: '¾', 1: 'the full portion' };
export const stepLabel = v => STEP_LABEL[round(v, 4)] || `${Math.round(v * 100)}%`;

const THRESH = {
  lose: { go: 0.6, smaller: 1.2 },
  maintain: { go: 0.8, smaller: 1.4 },
  recomp: { go: 0.8, smaller: 1.4 },
};
const GAIN_CAP = 1.25;                     // a bulker only gets a "skip" when the day would pass 125 % of target
const LOW_PD = 5, HIGH_PD = 8;             // g protein per 100 kcal
const ESSENTIAL_PD = 5;                    // plate entries at least this protein-dense count as "essential"
const SOURCE_RANK = { menu: 0, favourite: 1, topup: 2 };

const toMin = hhmm => { const [a, b] = String(hhmm).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const nowMinOf = d => d.getHours() * 60 + d.getMinutes();
const pd = x => (x.cal > 0 ? (x.p / x.cal) * 100 : 0);
const sum = items => items.reduce((a, i) => {
  a.cal += +i.cal || 0; a.p += +i.p || 0; a.c += +i.c || 0; a.f += +(i.f ?? estFat(i)) || 0;
  a.fiber += +i.fiber || 0; a.sugar += +i.sugar || 0; a.sodium += +i.sodium || 0;
  return a;
}, { cal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0 });
const scaled = (x, k) => ({ ...x, cal: x.cal * k, p: x.p * k, c: x.c * k, f: (x.f ?? estFat(x)) * k });

// ---------- what the rest of the day still needs ----------
/** Protein-carrying part of a planned meal: dense plate entries and top-ups, not the rice. */
function essentialCal(m) {
  let e = 0;
  for (const x of m.plate || []) if (pd(x) >= ESSENTIAL_PD) e += x.cal * x.servings;
  for (const x of m.topUps || []) e += x.cal;
  return e;
}

function remaining(dayPlan, targets, { nowMin, meal, items }) {
  const asked = meal;
  if (dayPlan) {
    const open = dayPlan.meals.filter(m => m.status === 'upcoming' && m.id !== asked && toMin(m.window[1]) >= nowMin);
    const own = dayPlan.meals.find(m => m.id === asked && m.status === 'upcoming');
    return {
      essential: open.reduce((a, m) => a + essentialCal(m), 0),
      planned: open.reduce((a, m) => a + mealTotals(m).cal, 0),
      meals: open.map(m => m.id),
      askedMeal: own ? mealTotals(own).cal : 0,        // what they'd eat at this meal if they don't have the item
    };
  }
  // no plan (guest without a menu): estimate from the standard meal split
  const done = new Set(items.map(i => i.meal).filter(Boolean));
  const open = MEAL_IDS.filter(id => id !== asked && !done.has(id) && toMin(DEFAULT_TIMINGS[id][1]) >= nowMin);
  const planned = open.reduce((a, id) => a + targets.cal * MEAL_SPLIT[id], 0);
  const askedMeal = asked && !done.has(asked) && toMin(DEFAULT_TIMINGS[asked]?.[1] || '23:59') >= nowMin ? targets.cal * (MEAL_SPLIT[asked] || 0) : 0;
  return { essential: planned * 0.6, planned, meals: open, askedMeal };
}

// ---------- alternatives ----------
function candidatesFor({ dayPlan, meal, favourites, profile, targets, flex, gap }) {
  const out = [];
  const pm = dayPlan?.meals.find(m => m.id === meal);
  for (const x of [...(pm?.menu || [])]) out.push({ n: x.n, cal: x.cal, p: x.p, c: x.c, f: x.f ?? estFat(x), diet: x.diet || dietOf(x.n), source: 'menu', qty: 1 });
  for (const f of favourites) out.push({ ...f, source: 'favourite', qty: f.qty || 1 });
  for (const t of topUps({ p: Math.max(gap, 12), cal: 0 }, { diet: profile.diet, goal: profile.goal, limit: 8, allow: f => !blockedReasons(f, profile).length })) {
    const g = t.food.sizes[t.sizeIdx][1] * t.qty;
    out.push({
      n: t.food.n, fid: t.food.id, cal: t.cal, p: t.p, c: (t.food.k[2] * g) / 100, f: (t.food.k[3] * g) / 100,
      diet: t.food.diet, al: t.food.al, source: 'topup', qty: t.qty, sizeIdx: t.sizeIdx, label: `${t.qty > 1 ? t.qty + '× ' : ''}${t.food.n}`,
    });
  }
  return out;
}

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Diet, allergies, diet patterns and today's fast: one hard-block check for every food. */
function blockedReasons(item, profile, now = new Date()) {
  return dietBlocks(item, rulesOf(profile, fastingFor(profile, dayKey(now))));
}

// ---------- evaluate ----------
/**
 * @param items        [{ n, cal, p, c, f, diet, al?, fried?, fiber?, sugar?, sodium? }]  what is on the plate, at the portion asked about
 * @param dayPlan      DayPlan for today (optional)
 * @param logged       { items } eaten so far today
 * @param profile      { goal, diet, allergies, sex }
 * @param targets      { cal, p, floor, … }
 * @param meal         meal id this would be eaten as
 * @param favourites   pre-resolved [{ n, cal, p, c, f, diet, fid }] for alternatives
 * @param trainingDay  boolean
 * @param restrictionPaused  an ED signal is active: never recommend eating less
 */
export function evaluate({ items, dayPlan = null, logged = { items: [] }, profile, targets, now = new Date(), meal = null, favourites = [], trainingDay = false, restrictionPaused = false }) {
  meal = meal || guessMeal(now);
  const goal = profile.goal || 'maintain';
  const nowMin = nowMinOf(now);
  const item = sum(items);
  const names = items.map(i => i.n).join(' + ');
  const eaten = totals(logged.items || []);
  const floor = targets.floor || Math.max(profile.sex === 'female' ? 1300 : 1500, 1000);
  const base = { names, meal, goal };

  // 1. hard blocks: no override nudge
  const blocks = items.flatMap(i => blockedReasons(i, profile).map(r => ({ r, i })));
  const reasons = [...new Set(blocks.map(b => b.r))];

  const rest = remaining(dayPlan, targets, { nowMin, meal, items: logged.items || [] });
  const flex = targets.cal - eaten.cal - rest.essential;
  const share = item.cal / Math.max(flex, 1);
  const density = pd(item);
  const fried = items.some(i => i.fried || isFriedName(i.n));
  const quality = -(fried ? 1 : 0) - (item.sugar > 15 ? 1 : 0) - (item.sodium > 800 ? 1 : 0) + (item.fiber >= 5 ? 1 : 0) + (density >= HIGH_PD ? 1 : 0);
  const numbers = {
    cal: round(item.cal), p: round(item.p, 1), c: round(item.c, 1), f: round(item.f, 1),
    share: round(share, 2), flex: round(flex), pDensity: round(density, 1), quality,
    after: { cal: round(eaten.cal + item.cal), p: round(eaten.p + item.p, 1) }, target: { cal: targets.cal, p: targets.p },
    eaten: { cal: round(eaten.cal), p: round(eaten.p, 1) }, floor,
  };
  const out = { ...base, kind: 'go', portion: 1, reasons: [], numbers, alternatives: [], ifAnyway: null, blocked: false, addProtein: [], tip: null };

  const alts = () => candidatesFor({ dayPlan, meal, favourites, profile, targets, flex, gap: Math.max(0, (targets.p - eaten.p) - item.p) })
    .filter(a => !blockedReasons(a, profile).length && !names.toLowerCase().includes(String(a.n).toLowerCase()));

  if (reasons.length) {
    out.kind = 'skip'; out.blocked = true; out.portion = 0; out.reasons = reasons;
    out.alternatives = rankAlts(alts().filter(a => a.cal <= Math.max(flex, 250)), 'lose').slice(0, 3).map(slimAlt);
    return out;
  }

  const addReasons = [];
  if (fried) addReasons.push('FRIED');
  if (item.sugar > 15) addReasons.push('HIGH_SUGAR');
  if (item.sodium > 800) addReasons.push('HIGH_SODIUM');
  if (item.fiber >= 5) addReasons.push('HIGH_FIBRE');
  if (density >= HIGH_PD) addReasons.push('PROTEIN_DENSE');
  if (density < LOW_PD && item.cal >= 150) addReasons.push('LOW_PROTEIN_DENSITY');
  if (trainingDay && item.p >= 15) addReasons.push('TRAINING_DAY');

  // 2. decide
  if (restrictionPaused) {
    out.reasons = ['RESTRICTION_PAUSED', ...addReasons];
    return out;
  }

  if (goal === 'gain') {
    const afterRatio = (eaten.cal + item.cal) / targets.cal;
    out.reasons = [...addReasons];
    if (afterRatio > GAIN_CAP) {
      const room = GAIN_CAP * targets.cal - eaten.cal;
      const step = [...STEPS].reverse().find(s => item.cal * s <= room);
      out.reasons.unshift('OVER_DAY_CAP');
      if (step) { out.kind = 'smaller'; out.portion = step; }
      else { out.kind = 'skip'; out.portion = 0; }
    } else if (density < LOW_PD && item.cal >= 150) {
      out.addProtein = rankAlts(candidatesFor({ dayPlan, meal, favourites: [], profile, targets, flex, gap: 20 }).filter(a => a.source === 'topup' && a.p >= 8 && !blockedReasons(a, profile).length), 'gain').slice(0, 2).map(slimAlt);
      out.reasons.unshift('ADD_PROTEIN');
    } else out.reasons.unshift('FITS');
  } else {
    const th = THRESH[goal] || THRESH.maintain;
    if (eaten.cal >= targets.cal) out.reasons.push('PAST_TARGET');
    if (share <= th.go) {
      out.reasons.push('FITS', ...addReasons);
      if (quality < 0) out.tip = 'QUALITY';
    } else if (share <= th.smaller) {
      const step = [...STEPS].reverse().find(s => share * s <= th.go);
      out.kind = 'smaller'; out.portion = step || STEPS[0];
      out.reasons.push('OVER_FLEX', ...addReasons);
    } else {
      const fits = rankAlts(alts().filter(a => a.cal / Math.max(flex, 1) <= th.go), goal);
      out.reasons.push('OVER_FLEX', ...addReasons);
      if (fits.length) { out.kind = 'swap'; out.portion = 0; out.alternatives = fits.slice(0, 3).map(slimAlt); }
      else { out.kind = 'skip'; out.portion = 0; }
    }
    if (out.kind === 'smaller' || out.kind === 'skip') {
      const fits = rankAlts(alts().filter(a => a.cal / Math.max(flex, 1) <= th.go), goal);
      out.alternatives = fits.slice(0, 3).map(slimAlt);
    }
  }

  // 3. the floor: never recommend eating so little that the day lands below it
  const eatsCal = out.kind === 'go' ? item.cal : out.kind === 'smaller' ? item.cal * out.portion : out.kind === 'swap' ? (out.alternatives[0]?.cal || 0) : 0;
  // not eating this means eating the planned meal instead, so the day is never judged as if that meal vanished
  const projected = eaten.cal + rest.planned + Math.max(eatsCal, out.kind === 'go' ? 0 : rest.askedMeal || 0);
  numbers.projected = round(projected);
  if (out.kind !== 'go' && out.kind !== 'swap' && projected < floor) {
    out.kind = 'go'; out.portion = 1; out.alternatives = []; out.reasons = ['FLOOR', ...addReasons];
    numbers.projected = round(eaten.cal + rest.planned + item.cal);
  } else if (out.kind === 'swap' && projected < floor) {
    out.kind = 'go'; out.portion = 1; out.alternatives = []; out.reasons = ['FLOOR', ...addReasons];
    numbers.projected = round(eaten.cal + rest.planned + item.cal);
  }
  out.portionNumbers = { cal: round(item.cal * out.portion), p: round(item.p * out.portion, 1) };

  // 4. what happens to the rest of the day if the item is eaten in full anyway
  if (out.kind !== 'go') out.ifAnyway = ifAnyway({ dayPlan, logged, item, names, meal, targets, nowMin, eaten, floor, rest });
  return out;
}

function slimAlt(a) {
  return { n: a.label || a.n, name: a.n, cal: round(a.cal), p: round(a.p, 1), c: round(a.c || 0, 1), f: round(a.f || 0, 1), diet: a.diet, source: a.source, qty: a.qty || 1, fid: a.fid || null, sizeIdx: a.sizeIdx ?? null };
}

/** Menu first, then favourites, then top-ups; within a source the most protein per kcal first. */
function rankAlts(list, goal) {
  const dens = a => pd(a);
  return [...list].sort((a, b) => (SOURCE_RANK[a.source] - SOURCE_RANK[b.source]) || (goal === 'gain' ? b.cal - a.cal : dens(b) - dens(a)));
}

// ---------- "if you eat it anyway" ----------
function ifAnyway({ dayPlan, logged, item, names, meal, targets, nowMin, eaten, floor, rest }) {
  const extra = { id: 'verdict-' + names, n: names, cal: item.cal, p: item.p, c: item.c, f: item.f, meal: 'extra', ts: 0 };
  const loggedAfter = { items: [...(logged.items || []), extra] };
  const overBy = Math.max(0, eaten.cal + item.cal - targets.cal);
  if (!dayPlan) {
    return { changes: [], overBy: round(overBy), projected: round(eaten.cal + item.cal + rest.planned), floorOk: true, text: null };
  }
  const plan2 = rebudget(dayPlan, loggedAfter, { nowMin, reason: 'verdict' });
  const diffs = diffDayPlans(dayPlan, plan2);
  const changes = [];
  for (const m2 of plan2.meals) {
    const m1 = dayPlan.meals.find(m => m.id === m2.id);
    if (!m1 || m2.status !== 'upcoming' || m2.id === meal) continue;
    for (const e2 of m2.plate) {
      const e1 = m1.plate.find(x => x.name === e2.name);
      const from = e1 ? e1.servings : 0;
      if (Math.abs(from - e2.servings) >= 0.5) changes.push({ meal: m2.id, name: e2.name, from, to: e2.servings, dCal: round((e2.servings - from) * e2.cal) });
    }
    for (const e1 of m1.plate) if (!m2.plate.some(x => x.name === e1.name)) changes.push({ meal: m2.id, name: e1.name, from: e1.servings, to: 0, dCal: round(-e1.servings * e1.cal) });
  }
  changes.sort((a, b) => a.dCal - b.dCal);               // biggest reduction first
  const planned2 = plan2.meals.filter(m => m.status === 'upcoming' && m.id !== meal).reduce((a, m) => a + mealTotals(m).cal, 0);
  const projected = eaten.cal + item.cal + planned2;
  return { changes: changes.slice(0, 3), diffs: diffs.length, overBy: round(overBy), projected: round(projected), floorOk: projected >= floor };
}

// ---------- eating-disorder signals (spec §9.1) ----------
export const ED_TEXT = /\b(purge|purging|purged|make myself (throw up|vomit)|vomit(ing)? (after|it out)|laxatives?|starv(e|ing) myself|punish(ing)? myself|hate my body|binge and|burn off what i ate|don'?t deserve (to eat|food))\b/i;

/**
 * @param days     last 7 days, oldest first: [{ cal, target, logged }]
 * @param verdicts recent verdict kinds, newest first: ['skip', 'go', …]
 * @param loss     { observed, planned } kg/week of weight change (negative = losing)
 * @param text     any free text the user typed (ask box, coach)
 */
export function edSignals({ days = [], verdicts = [], loss = null, text = '' } = {}) {
  const reasons = [];
  const real = days.filter(d => d.logged && d.target > 0);
  if (real.filter(d => d.cal < 0.6 * d.target).length >= 5) reasons.push('LOW_INTAKE');
  const recent = verdicts.slice(0, 10);
  if (recent.length >= 6 && recent.filter(k => k === 'skip').length >= 5) reasons.push('SKIP_ASKS');
  if (loss && loss.observed < 0 && loss.observed < Math.min(-0.5, loss.planned * 1.5 || -0.5)) reasons.push('RAPID_LOSS');
  if (ED_TEXT.test(String(text))) reasons.push('TEXT');
  return { flag: reasons.length > 0, reasons, helpline: { name: 'Tele-MANAS', number: '14416' } };
}

export { MEAL_LABEL, allergenLabel };
