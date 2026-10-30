// =============================================================
// MICRONUTRIENT WATCH — iron, B12, calcium, vitamin D over the last
// week of logs, for people whose diet makes them worth watching
// (vegetarian, eggetarian, vegan). Food-first suggestions only.
//
// Honest by design: only foods with data in data/foods-x.js count, and
// the result says how much of what was eaten that covered. Below 40 %
// coverage it says "not enough data" instead of a scary number.
// Pure: no DOM, no network.
// =============================================================
import { round } from '../util.js';
import { allowed } from './diet.js';

/** ICMR-NIN 2020 adult RDAs (iron differs by sex). */
export const RDA = (sex = 'male') => ({ fe: sex === 'female' ? 29 : 19, b12: 2.2, ca: 1000, d: 15 });
export const MICRO_LABEL = { fe: 'Iron', b12: 'Vitamin B12', ca: 'Calcium', d: 'Vitamin D' };
export const MICRO_UNIT = { fe: 'mg', b12: 'µg', ca: 'mg', d: 'µg' };
export const MIN_COVERAGE = 0.4;

const SUGGEST = {
  fe: [['Ragi mudde or ragi dosa', 'Ragi Mudde'], ['Rajma or chole with a squeeze of lemon', 'Rajma Curry'], ['A handful of dates or roasted chana', 'Dates'], ['Soya chunks curry', 'Soya Chunks (dry)']],
  b12: [['Milk or curd every day', 'Amul Taaza Toned Milk'], ['Two boiled eggs', 'Boiled Egg'], ['Paneer at lunch or dinner', 'Paneer']],
  ca: [['A glass of milk, morning and night', 'Amul Taaza Toned Milk'], ['Curd or raita with lunch', 'Curd'], ['Ragi in place of some rice', 'Ragi Mudde'], ['Tofu or soya chunks', 'Tofu'], ['A few almonds', 'Almonds']],
  d: [['15 minutes of morning sun on arms and face, a few days a week', null], ['Eggs, or fortified milk', 'Boiled Egg']],
};
const NOTE = {
  b12: 'Vegetarian diets are often low in B12. Ask a doctor about a blood test before taking a supplement.',
  d: 'Vitamin D is hard to get from food alone. A blood test tells you whether a supplement is worth it.',
};

/**
 * @param days    [{ items: [{ fid?, n, g?, qty, cal }] }] (the days to average over)
 * @param lookup  { x: id → extras | undefined, byName: name → id | null }
 */
export function microWatch(days, { sex = 'male', lookup }) {
  const logged = days.filter(d => d.items?.length);
  const tot = { fe: 0, b12: 0, ca: 0, d: 0 };
  let kcalAll = 0, kcalKnown = 0;
  for (const d of logged) {
    for (const it of d.items) {
      const cal = +it.cal || 0; kcalAll += cal;
      const id = it.fid && lookup.x(it.fid) ? it.fid : lookup.byName?.(it.n) || null;
      const x = id && lookup.x(id);
      const g = +it.g || (id && lookup.grams ? lookup.grams(id) * (+it.qty || 1) : 0);
      if (!x || !g) continue;
      kcalKnown += cal;
      for (const k of Object.keys(tot)) tot[k] += ((x[k] || 0) * g) / 100;
    }
  }
  const n = logged.length || 1, coverage = kcalAll ? kcalKnown / kcalAll : 0, rda = RDA(sex);
  const enough = logged.length >= 3 && coverage >= MIN_COVERAGE;
  const rows = Object.keys(tot).map(k => {
    const avg = tot[k] / n, pct = avg / rda[k];
    // coverage < 100 % means the real intake is at least this much; scale up so a half-known diet is not judged half-empty
    const adj = coverage > 0 ? pct / Math.max(coverage, MIN_COVERAGE) : 0;
    return { key: k, label: MICRO_LABEL[k], unit: MICRO_UNIT[k], avg: round(avg, k === 'b12' ? 2 : 1), rda: rda[k], pct: round(pct, 2), est: round(Math.min(adj, 1.5), 2), status: !enough ? 'unknown' : adj >= 0.8 ? 'ok' : adj >= 0.5 ? 'low' : 'very-low' };
  });
  return { days: logged.length, coverage: round(coverage, 2), enough, rows };
}

/** Food-first ideas for a short nutrient, filtered through the person's food rules. */
export function suggestionsFor(key, rules, foodByName) {
  return SUGGEST[key].filter(([, name]) => {
    if (!name) return true;                                    // sunshine, etc.
    const f = foodByName?.(name) || { n: name };      // judge by the suggestion's own name when it isn't a database row
    return allowed(f, rules);
  }).map(([text]) => text).slice(0, 3);
}
export const noteFor = key => NOTE[key] || null;

/** Worth showing at all? Vegetarians, eggetarians and vegans. */
export const worthWatching = profile => (profile.diet && profile.diet !== 'nonveg') || (profile.dietTags || []).includes('vegan');
