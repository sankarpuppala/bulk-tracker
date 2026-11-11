// =============================================================
// WEEKLY REPORT — the week in a few lines you would actually send
// someone. Charts answer "what happened"; this answers "how did it go,
// and what is the one thing to change".
//
//   weekReport(input)  → { range, logged, cal, protein, weight, best, worst,
//                          highlight, fix, badges, spend }
//   shareText(report)  → a short plain-text block for WhatsApp
//
// Honest by design: a day with nothing logged is never counted as a day
// at target, and with fewer than three logged days it says so instead of
// averaging noise.
// Pure: no DOM, no network.
// =============================================================
import { round } from '../util.js';
import { totals } from './plate.js';
import { MEAL_LABEL } from './dayplan.js';

export const MIN_DAYS = 3;
const pct = (a, b) => (b > 0 ? a / b : 0);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = key => DAY_NAMES[new Date(key + 'T00:00:00').getDay()];

/**
 * @param days     the last 7 days, oldest first: [{ key, items, water, weight, gymDone, sets }]
 * @param targets  { cal, p, water }
 * @param profile  { goal, name }
 * @param stats    gamify.analyse() output (optional: streak and badges)
 */
export function weekReport({ days = [], targets, profile = {}, stats = null } = {}) {
  const logged = days.filter(d => d.items?.length);
  const scored = logged.map(d => {
    const t = totals(d.items);
    return {
      key: d.key, day: dayName(d.key), cal: Math.round(t.cal), p: round(t.p, 1), price: t.price,
      calFit: Math.abs(1 - pct(t.cal, targets.cal)) <= 0.1,
      hitP: t.p >= 0.9 * targets.p,
      water: d.water || 0,
      trained: (d.gymDone?.length || 0) > 0 || Object.keys(d.sets || {}).length > 0,
    };
  });

  const avg = key => (scored.length ? scored.reduce((a, d) => a + d[key], 0) / scored.length : 0);
  const avgCal = Math.round(avg('cal')), avgP = round(avg('p'), 1);
  const weights = days.filter(d => d.weight).map(d => ({ key: d.key, w: d.weight }));
  const weightChange = weights.length >= 2 ? round(weights[weights.length - 1].w - weights[0].w, 1) : null;

  // the best day is the one that hit both targets with the most protein; the worst is the biggest miss
  const best = [...scored].sort((a, b) => (b.calFit + b.hitP) - (a.calFit + a.hitP) || b.p - a.p)[0] || null;
  const worst = [...scored].sort((a, b) => Math.abs(1 - pct(b.cal, targets.cal)) - Math.abs(1 - pct(a.cal, targets.cal)))[0] || null;

  const r = {
    range: days.length ? { from: days[0].key, to: days[days.length - 1].key } : null,
    enough: logged.length >= MIN_DAYS,
    logged: logged.length, of: days.length,
    cal: { avg: avgCal, target: targets.cal, onTarget: scored.filter(d => d.calFit).length, pct: round(pct(avgCal, targets.cal), 2) },
    protein: { avg: avgP, target: targets.p, hit: scored.filter(d => d.hitP).length, pct: round(pct(avgP, targets.p), 2) },
    weight: weightChange == null ? null : { change: weightChange, from: round(weights[0].w, 1), to: round(weights[weights.length - 1].w, 1), weighIns: weights.length },
    trained: scored.filter(d => d.trained).length,
    spend: Math.round(scored.reduce((a, d) => a + d.price, 0)),
    streak: stats?.streak ?? null,
    newBadges: (stats?.badges || []).filter(b => b.got).slice(-2).map(b => `${b.icon} ${b.name}`),
    best: best ? { day: best.day, cal: best.cal, p: best.p } : null,
    worst: worst && scored.length > 1 ? { day: worst.day, cal: worst.cal } : null,
    days: scored,
  };
  r.highlight = highlightOf(r, profile);
  r.fix = fixOf(r, profile);
  return r;
}

function highlightOf(r, profile) {
  if (!r.enough) return `You logged ${r.logged} of ${r.of} days. Log a few more and this report gets useful.`;
  if (r.protein.hit >= 5) return `Protein on ${r.protein.hit} of ${r.logged} days — that is the hard part, and you did it.`;
  if (r.streak >= 7) return `${r.streak}-day logging streak. Consistency like that is what moves the number.`;
  if (r.weight && profile.goal === 'gain' && r.weight.change > 0) return `Up ${Math.abs(r.weight.change)} kg this week, which is the direction you want.`;
  if (r.weight && profile.goal === 'lose' && r.weight.change < 0) return `Down ${Math.abs(r.weight.change)} kg this week, steadily.`;
  if (r.cal.onTarget >= 4) return `Calories landed close to target on ${r.cal.onTarget} days. Boring, and exactly right.`;
  if (r.trained >= 3) return `${r.trained} workouts logged. Food and training both showing up.`;
  return `${r.logged} days logged, averaging ${r.cal.avg} kcal and ${r.protein.avg} g protein.`;
}

/** The single most useful change, chosen in the order that actually matters. */
function fixOf(r, profile) {
  if (!r.enough) return 'Log every meal for three days. Nothing here can help until it knows what you eat.';
  if (r.protein.pct < 0.8) {
    const short = Math.round(r.protein.target - r.protein.avg);
    return `You are about ${short} g short on protein most days. Two eggs, a glass of milk or a bowl of curd closes most of it.`;
  }
  if (profile.goal === 'gain' && r.cal.pct < 0.9) return `You are eating about ${Math.round(r.cal.target - r.cal.avg)} kcal under target. For gaining, that is the whole problem — add a shake or an extra chapati.`;
  if (profile.goal === 'lose' && r.cal.pct > 1.1) return `You are about ${Math.round(r.cal.avg - r.cal.target)} kcal over target most days. Usually it is one snack, not the meals.`;
  if (r.logged < r.of) return `You missed logging ${r.of - r.logged} day${r.of - r.logged > 1 ? 's' : ''}. The gaps are where plans quietly fail.`;
  if (r.weight?.weighIns < 2) return 'Weigh in a couple of mornings a week — without it the plan is guessing.';
  if (r.trained === 0) return 'No workouts logged this week. Even two sessions protect muscle while you change weight.';
  return 'Nothing to fix. Keep doing exactly this.';
}

const sign = n => (n > 0 ? '+' : '−') + Math.abs(n);

/** A short block to paste into WhatsApp. No emoji soup, no fake precision. */
export function shareText(r, { name = '', appUrl = '' } = {}) {
  if (!r.range) return '';
  const lines = [
    `${name ? name + '’s week' : 'My week'} · Thali`,
    `${r.logged}/${r.of} days logged${r.streak ? ` · ${r.streak}-day streak` : ''}`,
    `Calories: ${r.cal.avg} avg (target ${r.cal.target})`,
    `Protein: ${r.protein.avg} g avg, hit on ${r.protein.hit} day${r.protein.hit === 1 ? '' : 's'}`,
  ];
  if (r.weight) lines.push(`Weight: ${sign(r.weight.change)} kg (${r.weight.from} → ${r.weight.to})`);
  if (r.trained) lines.push(`Workouts: ${r.trained}`);
  if (r.best) lines.push(`Best day: ${r.best.day} — ${r.best.cal} kcal, ${r.best.p} g protein`);
  lines.push('', r.highlight, `Next week: ${r.fix}`);
  if (appUrl) lines.push('', appUrl);
  return lines.join('\n');
}

/** Which meal most often went unlogged, so the nudge can name it. */
export function weakestMeal(days) {
  const miss = {};
  for (const d of days) {
    if (!d.items?.length) continue;
    const had = new Set(d.items.map(i => i.meal).filter(Boolean));
    for (const m of ['breakfast', 'lunch', 'snacks', 'dinner']) if (!had.has(m)) miss[m] = (miss[m] || 0) + 1;
  }
  const worst = Object.entries(miss).sort((a, b) => b[1] - a[1])[0];
  return worst && worst[1] >= 2 ? { meal: worst[0], label: MEAL_LABEL[worst[0]], missed: worst[1] } : null;
}
