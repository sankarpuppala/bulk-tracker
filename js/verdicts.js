// =============================================================
// VERDICTS — the stateful side of "Should I eat this?" (spec §5.5).
// Gathers the day plan, what has been eaten, favourites and the
// eating-disorder state, runs the pure engine, keeps a short local
// history of recent verdicts. Works offline: nothing here is a
// network call.
// =============================================================
import { store } from './store.js';
import { ctx } from './ctx.js';
import { planner } from './planner.js';
import { planDay } from './routine.js';
import { getFood } from './search.js';
import { makeItem, guessMeal, totals } from './nutrition.js';
import { todayKey, addDays, lsGet, lsSet } from './util.js';
import { evaluate, edSignals } from './engine/verdict.js';
import { explain } from './engine/verdict-copy.js';

const KEY = 'ff.verdicts';
const MAX = 30;

export const recentVerdicts = () => lsGet(KEY, []);

export function recordVerdict(v, extra = {}) {
  const row = { ts: Date.now(), kind: v.kind, names: v.names, cal: v.numbers.cal, goal: v.goal, ...extra };
  lsSet(KEY, [row, ...recentVerdicts()].slice(0, MAX));
}

/** Eating-disorder warning signs from the last week of logs and recent "should I eat" asks. */
export function edState(text = '') {
  const t = ctx.targets(), today = todayKey();
  const byKey = new Map((ctx.history || []).map(d => [d.key, d]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const k = addDays(today, i - 7);                       // the 7 complete days before today
    const d = byKey.get(k);
    return { cal: d ? totals(d.items).cal : 0, target: t.cal, logged: !!d && d.items.length > 0 };
  });
  return edSignals({ days, verdicts: recentVerdicts().map(r => r.kind), text });
}

export function favouriteItems() {
  return store.profile.favorites.map(getFood).filter(Boolean).slice(0, 12).map(f => {
    const it = makeItem(f, { meal: 'extra' });
    return { n: it.n, cal: it.cal, p: it.p, c: it.c, f: it.f, diet: it.diet, fid: f.id, al: f.al };
  });
}

/**
 * Run the engine for the food(s) on a plate, as eaten at `meal` today.
 * `items` are logged-item shaped (see makeItem), so what the verdict
 * judged is exactly what "Log it" would log.
 */
export function verdictFor(items, { meal = guessMeal(), now = new Date(), text = '' } = {}) {
  const pf = store.profile, date = ctx.date || todayKey();
  const ed = edState(text);
  const dayPlan = date === todayKey() && planner.ready ? planner.planFor(date) : null;
  const v = evaluate({
    items, dayPlan, logged: store.day(date), profile: pf, targets: ctx.targets(), now, meal,
    favourites: favouriteItems(), trainingDay: !planDay(pf, date).day?.rest, restrictionPaused: ed.flag,
  });
  return { v, copy: explain(v), ed };
}
