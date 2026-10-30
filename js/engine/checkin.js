// =============================================================
// CHECK-IN ENGINE — weekly "is it working?" (spec §5.2).
// Pure functions: no DOM, no network, no storage.
//
//   trendWeights(days)       EMA (α = 0.1) of the weigh-ins
//   adaptiveTDEE(days, o)    what your body actually burns, from intake vs trend
//   runCheckIn(plan, days)   decision + message (+ new targets when it adjusts)
//
// `days` is [{ key, weight|null, kcal, meals }] oldest first, where `kcal`
// is the day's logged energy and `meals` how many meals were logged.
// =============================================================
import { addDays, daysBetween, round } from '../util.js';
import { KCAL_PER_KG } from './targets.js';
import { phaseAt } from './goal.js';

export const EMA_ALPHA = 0.1;
export const WINDOW_DAYS = 14;
const MIN_WEIGH_INS = 4;
const MIN_LOGGED_DAYS = 5;
const MIN_COMPLETENESS = 0.7;
const TOLERANCE = 0.4;            // observed within ±40 % of the planned rate = on track
const MIN_TOLERANCE_KG = 0.1;     // …but never tighter than 0.1 kg/week (weigh-in noise)
const STEP_SMALL = 100, STEP_BIG = 150, STEP_MAX = 250;

// ---------- trend ----------
export function trendWeights(days, alpha = EMA_ALPHA) {
  const out = [];
  let t = null;
  for (const d of days) {
    const w = +d.weight;
    if (!(w > 0)) continue;
    t = t == null ? w : t + alpha * (w - t);
    out.push({ key: d.key, w, trend: round(t, 3) });
  }
  return out;
}

/** Trend value on or before `key`; null if there is no weigh-in that early. */
export function trendAt(series, key) {
  let v = null;
  for (const p of series) { if (p.key <= key) v = p; else break; }
  return v;
}

// ---------- week keys ----------
/** ISO week id for a date key, e.g. 2026-W18. */
export function weekKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const wk = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

// ---------- adaptive TDEE ----------
function windowOf(days, asOf) {
  const from = addDays(asOf, -(WINDOW_DAYS - 1));
  const inWin = days.filter(d => d.key >= from && d.key <= asOf);
  const logged = inWin.filter(d => (+d.meals || 0) >= 2 && +d.kcal > 0);
  const weighIns = inWin.filter(d => +d.weight > 0);
  return { from, inWin, logged, weighIns };
}

export function adaptiveTDEE(days, { asOf } = {}) {
  asOf = asOf || days[days.length - 1]?.key;
  if (!asOf) return null;
  const { from, logged, weighIns } = windowOf(days, asOf);
  const series = trendWeights(days.filter(d => d.key <= asOf));
  const end = trendAt(series, asOf);
  // start of the 14-day window; if the history is shorter, the first weigh-in inside it
  const start = trendAt(series, addDays(from, -1)) || series.find(p => p.key >= from);
  if (!end || !start || weighIns.length < MIN_WEIGH_INS) return null;
  const span = daysBetween(start.key, end.key);
  if (span < 7 || !logged.length) return null;
  const observed = ((end.trend - start.trend) / span) * 7;                 // kg per week
  const intake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
  return {
    tdee: Math.round(intake - (observed * KCAL_PER_KG) / 7), intake: Math.round(intake), observed: round(observed, 3),
    trendNow: end.trend, loggedDays: logged.length, weighIns: weighIns.length, spanDays: span,
  };
}

// ---------- decision ----------
const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * @param plan        the active GoalPlan
 * @param days        see top of file
 * @param prev        earlier CheckIns, oldest first
 * @param o.asOf      date key, default: last day in `days`
 * @param o.targets   current daily targets (calcTargets output: cal, p, c, f, bmr, tdee, floor, ceiling)
 * @param o.profile   { age } for the under-18 guard
 */
export function runCheckIn(plan, days, prev = [], { asOf, targets, profile = {} } = {}) {
  asOf = asOf || days[days.length - 1]?.key;
  const win = windowOf(days, asOf);
  const completeness = round(win.logged.length / WINDOW_DAYS, 2);
  const ph = phaseAt(plan, asOf);
  const expected = ph ? ph.rateWk : 0;
  const series = trendWeights(days.filter(d => d.key <= asOf));
  const end = trendAt(series, asOf);
  const ci = {
    week: weekKey(asOf), date: asOf, trendW: end ? round(end.trend, 1) : null, observedRate: null, expectedRate: expected,
    adaptTDEE: null, completeness, loggedDays: win.logged.length, weighIns: win.weighIns.length,
    phase: ph?.kind || null, decision: 'insufficient', off: null, dir: null, flags: [], message: '',
  };

  if (win.weighIns.length < MIN_WEIGH_INS || win.logged.length < MIN_LOGGED_DAYS) {
    const needW = Math.max(0, MIN_WEIGH_INS - win.weighIns.length), needL = Math.max(0, MIN_LOGGED_DAYS - win.logged.length);
    const bits = [];
    if (needW) bits.push(`${needW} more weigh-in${needW > 1 ? 's' : ''}`);
    if (needL) bits.push(`${needL} more day${needL > 1 ? 's' : ''} with at least two meals logged`);
    ci.message = `Not enough data yet. Add ${bits.join(' and ')} in the last two weeks and the next check-in will have a real answer.`;
    return ci;
  }

  const a = adaptiveTDEE(days, { asOf });
  if (!a) { ci.message = 'The weigh-ins are too close together to read a trend. Weigh in on different days this week.'; return ci; }
  ci.observedRate = a.observed; ci.adaptTDEE = a.tdee;

  // flags: independent of the decision
  const wNow = end.trend;
  if (a.observed < 0 && (-a.observed / wNow) * 100 > 1.0) ci.flags.push('rapid-loss');
  const old = trendAt(series, addDays(asOf, -21));
  const firstKey = series[0]?.key;
  if (old && firstKey <= addDays(asOf, -18) && Math.abs(end.trend - old.trend) < 0.1 && Math.abs(expected) >= 0.1) ci.flags.push('plateau');

  if (completeness < MIN_COMPLETENESS) {
    ci.decision = 'log-more';
    ci.message = `You logged ${win.logged.length} of the last ${WINDOW_DAYS} days. Log at least ${Math.ceil(WINDOW_DAYS * MIN_COMPLETENESS)} (two or more meals each) so the adjustment is accurate. Targets stay as they are.`;
    return ci;
  }

  const tol = Math.max(TOLERANCE * Math.abs(expected), MIN_TOLERANCE_KG);
  const off = Math.abs(a.observed - expected) > tol;
  ci.off = off;
  ci.dir = off ? (a.observed < expected ? 'up' : 'down') : null;   // up = needs more calories
  const rateText = `${a.observed >= 0 ? '+' : '−'}${Math.abs(round(a.observed, 2))} kg/week`;
  const planText = `${expected >= 0 ? '+' : '−'}${Math.abs(round(expected, 2))}`;

  if (!off) {
    ci.decision = 'on-track';
    ci.message = `On track: your trend is ${rateText} against a plan of ${planText}. Keep going, no changes.`;
  } else {
    const last = [...prev].reverse().find(p => p.off != null);
    const repeat = last && last.off && last.dir === ci.dir;
    if (!repeat) {
      ci.decision = 'watch';
      ci.message = `Your trend is ${rateText} against a plan of ${planText}. One off week can be water, so nothing changes yet. If next week looks the same, we’ll nudge your calories.`;
    } else {
      const gap = Math.abs(((expected - a.observed) * KCAL_PER_KG) / 7);
      const mag = Math.min(STEP_MAX, gap >= 300 ? STEP_BIG : STEP_SMALL);
      let step = ci.dir === 'up' ? mag : -mag;
      if ((profile.age || 20) < 18 && step < 0) step = 0;                       // never cut an under-18 further
      const cur = targets?.cal;
      if (cur != null) {
        const floor = targets.floor ?? 1300, ceiling = targets.ceiling ?? Infinity;
        step = Math.min(Math.max(cur + step, floor), ceiling) - cur;            // respect floor and ceiling
      }
      if (!step) {
        ci.decision = 'at-limit';
        ci.message = `Your trend is ${rateText} against a plan of ${planText}, but your calories are already at the safe limit, so they stay put. Consider adjusting the timeline.`;
      } else {
        ci.decision = 'adjust';
        const newCal = cur != null ? cur + step : null;
        ci.newTargets = {
          calAdjust: (+profile.calAdjust || 0) + step, step,
          ...(newCal != null ? { cal: newCal, c: Math.max(50, Math.round((newCal - targets.p * 4 - targets.f * 9) / 4)), p: targets.p, f: targets.f } : {}),
        };
        ci.message = `Your trend has been ${rateText} for two weeks against a plan of ${planText}. ${step > 0 ? 'Adding' : 'Trimming'} ${Math.abs(step)} kcal a day${newCal != null ? ` (${newCal} kcal)` : ''} should bring it back.`;
      }
    }
  }
  if (ci.flags.includes('plateau')) ci.message += ' Your weight has barely moved in three weeks.';
  if (ci.flags.includes('rapid-loss')) ci.message += ' You are losing faster than a healthy pace. Please eat to your targets, and see a doctor or coach if you feel unwell.';
  return ci;
}

/** A check-in is due 7 days after the last one (or after the plan started). */
export function checkInDue(plan, checkins = [], today) {
  if (!plan) return false;
  const last = checkins.reduce((m, c) => (c.date > m ? c.date : m), plan.start.date);
  return daysBetween(last, today) >= 7;
}
