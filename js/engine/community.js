// =============================================================
// COMMUNITY ENGINE — dish ratings, the menu scorecard committees
// see, and friend-challenge metrics. Pure: no DOM, no network.
//
//   dishKey / ratingId          stable ids (one rating per user per dish per day)
//   aggregate(ratings)          per-dish average + count
//   topBottom(agg)              ranked dishes, only with enough votes
//   scorecard(week, opts)       protein per day, fried count, veg protein, repeats, suggestions
//   proteinStreak(days, target) consecutive days at ≥ 90 % of the protein target
// =============================================================
import { round } from '../util.js';
import { isFriedName, dietOf } from './plate.js';

export const MIN_VOTES = 3;                     // a dish is only ranked once this many students rated it
export const RATING_VALUES = [1, 3, 5];         // 😞 😐 😋

export const dishKey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const ratingId = (mess, date, dish, uid) => `${mess}_${date}_${dishKey(dish)}_${uid}`;

export function aggregate(ratings) {
  const by = new Map();
  for (const r of ratings) {
    if (!RATING_VALUES.includes(r.v) && !(r.v >= 1 && r.v <= 5)) continue;
    const k = r.dishKey || dishKey(r.dish);
    const e = by.get(k) || { key: k, dish: r.dish, count: 0, sum: 0, last: '' };
    e.count++; e.sum += r.v; if (r.date > e.last) e.last = r.date;
    by.set(k, e);
  }
  return [...by.values()].map(e => ({ ...e, avg: round(e.sum / e.count, 2) }));
}

export function topBottom(agg, { n = 5, min = MIN_VOTES } = {}) {
  const ok = agg.filter(a => a.count >= min).sort((a, b) => b.avg - a.avg || b.count - a.count);
  return { top: ok.slice(0, n), bottom: [...ok].reverse().filter(a => a.avg < 3.5).slice(0, n), unranked: agg.length - ok.length };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const PROTEIN_DISH = 8;        // g protein per serving that makes a dish a "protein dish"

/**
 * @param week  { Monday: { breakfast: [{ n, cal, p, diet? }], … } }
 * @param opts  { proteinTarget } students' daily target for the reference (default 100 g)
 */
export function scorecard(week, { proteinTarget = 100 } = {}) {
  const days = [], suggestions = [], seen = new Map();
  let fried = 0, dishes = 0;
  for (const d of DAYS) {
    const day = week?.[d]; if (!day) continue;
    let p = 0, pVeg = 0, cal = 0;
    for (const m of MEALS) {
      const items = day[m] || [];
      const vegProtein = items.filter(i => (i.diet || dietOf(i.n)) === 'v' && (+i.p || 0) >= PROTEIN_DISH);
      if (items.length && !vegProtein.length) suggestions.push(`${d} ${m} has no protein dish for veg students.`);
      for (const i of items) {
        dishes++;
        p += +i.p || 0; cal += +i.cal || 0;
        if ((i.diet || dietOf(i.n)) === 'v') pVeg += +i.p || 0;
        if (isFriedName(i.n)) fried++;
        const k = dishKey(i.n); if (k) seen.set(k, { n: i.n, days: new Set([...(seen.get(k)?.days || []), d]) });
      }
    }
    days.push({ day: d, protein: round(p), vegProtein: round(pVeg), cal: round(cal), proteinPct: round(p / proteinTarget, 2), vegPct: round(pVeg / proteinTarget, 2) });
  }
  const repeats = [...seen.values()].filter(x => x.days.size >= 4 && !/^(rice|chapati|tea|coffee|milk|curd|pickle|papad|water)/i.test(x.n)).map(x => ({ dish: x.n, days: x.days.size }));
  const lowVegDays = days.filter(x => x.vegPct < 0.7).map(x => x.day);
  if (lowVegDays.length) suggestions.push(`Veg students fall short of protein on ${lowVegDays.slice(0, 4).join(', ')}${lowVegDays.length > 4 ? '…' : ''}. Add dal, rajma, paneer, soya, curd or sprouts.`);
  if (dishes && fried / dishes > 0.2) suggestions.push(`${fried} of ${dishes} dishes are fried (${Math.round((100 * fried) / dishes)}%). Swap a couple for steamed or roasted options.`);
  for (const r of repeats.slice(0, 3)) suggestions.push(`${r.dish} appears on ${r.days} days this week. Rotate it.`);
  return { days, fried, dishes, friedShare: dishes ? round(fried / dishes, 2) : 0, repeats, suggestions: [...new Set(suggestions)].slice(0, 12), avgProtein: days.length ? round(days.reduce((a, d) => a + d.protein, 0) / days.length) : 0 };
}

/** Consecutive days, ending today (or yesterday if today isn't done yet), with protein ≥ 90 % of target. */
export function proteinStreak(daysDesc, target) {
  let n = 0;
  for (const [i, d] of daysDesc.entries()) {
    const hit = (+d.p || 0) >= 0.9 * target;
    if (hit) n++; else if (i === 0 && !d.done) continue; else break;
  }
  return n;
}

export const CHALLENGES = [
  { id: 'xp', label: 'XP', field: 'xp' },
  { id: 'streak', label: 'Logging streak', field: 'streak' },
  { id: 'protein', label: 'Protein streak', field: 'pStreak' },
];

export const sortBoard = (rows, id) => { const f = CHALLENGES.find(c => c.id === id)?.field || 'xp'; return [...rows].sort((a, b) => (b[f] || 0) - (a[f] || 0)); };
export const cleanGroup = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
