// =============================================================
// COACH — the stateful side of the AI features that need a model
// (spec §5.7): context packet from live state, the safety guard in
// front of every message, proposal chips that only apply after a tap,
// and the optional AI upgrades for verdict and check-in text.
// Everything here degrades to the template/engine answer on any error.
// =============================================================
import { store } from './store.js';
import { ctx } from './ctx.js';
import { planner } from './planner.js';
import { totals } from './nutrition.js';
import { todayKey } from './util.js';
import { flag } from './flags.js';
import { aiCall, aiReady } from './ai.js';
import { currentPhase, switchToMaintenance } from './goals.js';
import { buildPacket, guard, validateProposal, acceptExplanation } from './engine/coach.js';
import { mealTotals, guessMeal } from './engine/dayplan.js';

/** The coach and the AI text upgrades are gated by the `coach` flag, which stays off until the red team passes live. */
export const coachEnabled = () => flag('coach');

export function limits() {
  const pf = store.profile, t = ctx.targets();
  return { floor: t.floor, ceiling: t.ceiling, weight: pf.weight, age: pf.age, current: t.cal };
}

export function packetNow() {
  const pf = store.profile, t = ctx.targets(), date = todayKey();
  const plan = store.activeGoal, cp = currentPhase();
  let nextMeal = null;
  if (planner.ready) {
    const m = planner.planFor(date).meals.find(x => x.status === 'upcoming' && x.id !== undefined);
    if (m) { const tot = mealTotals(m); nextMeal = { id: m.id, names: m.plate.map(e => e.name), cal: tot.cal, p: tot.p }; }
  }
  return buildPacket({
    profile: pf, targets: t, eaten: totals(store.day(date).items), plan, nextMeal,
    checkin: store.checkins.length ? store.checkins[store.checkins.length - 1] : null,
    week: cp ? { week: Math.min(cp.week, plan?.totalWeeks || cp.week), phase: cp.phase.kind } : null,
  });
}

/** What happens when a suggestion chip is tapped. Only ever called from a tap. */
export function applyProposal(p) {
  const v = validateProposal(p, limits());
  if (!v.ok) return { ok: false, why: v.why };
  const { kind, value } = v.p;
  if (kind === 'calories') store.saveProfile({ customTargets: { ...(store.profile.customTargets || {}), cal: Math.round(value) } });
  else if (kind === 'protein') store.saveProfile({ customTargets: { ...(store.profile.customTargets || {}), p: Math.round(value) } });
  else if (kind === 'switch_to_maintenance') switchToMaintenance();
  else if (kind === 'goal_timeline') import('./views/goalplanner.js').then(m => m.openGoalPlanner());
  else if (kind === 'add_topup') ctx.openLog();
  else if (kind === 'swap_meal_item') import('./views/nottoday.js').then(m => m.openNotToday(todayKey(), guessMeal()));
  return { ok: true };
}

/**
 * One coach turn. Runs the deterministic guard first; the model is only called when the guard lets the message through.
 * `on` receives { text } | { proposal } | { error } | { done: true }.
 */
export async function askCoach(message, history, on) {
  const g = guard(message, store.profile, ctx.targets());
  if (g) {
    on({ text: g.reply, local: true, category: g.category });
    if (g.proposal) on({ proposal: g.proposal });
    on({ done: true });
    return;
  }
  const { aiStream } = await import('./ai.js');
  await aiStream('coach', { context: packetNow(), message, history }, ev => {
    if (ev.call?.name === 'propose_change') { const v = validateProposal(ev.call.args, limits()); if (v.ok) on({ proposal: v.p }); return; }
    on(ev);
  });
}

// ---------------- AI upgrades (always optional) ----------------
const cache = new Map();

/** The verdict as the explainer sees it: only values the engine produced. */
export const explainInput = (v, copy) => ({
  kind: v.kind, portion: v.portion, goal: v.goal, meal: v.meal, reasons: v.reasons, lang: store.profile.locale?.slice(0, 2) || 'en',
  numbers: { cal: v.numbers.cal, p: v.numbers.p, flex: v.numbers.flex, share: v.numbers.share },
  alternatives: v.alternatives.slice(0, 2).map(a => a.n), if_anyway: copy.ifAnyway || undefined,
});

/** Returns an AI sentence for the verdict if it passes every check, else null (the template text stays). */
export async function aiExplanation(v, copy) {
  if (!coachEnabled() || aiReady() || v.blocked) return null;            // hard blocks keep their fixed, neutral wording
  const input = explainInput(v, copy), key = JSON.stringify(input);
  if (cache.has(key)) return cache.get(key);
  const r = await aiCall('explain/verdict', { verdict: input });
  const text = r.ok && acceptExplanation(v.kind, r.data?.text, input) ? r.data.text.trim() : null;
  cache.set(key, text);
  return text;
}

export async function aiCheckinSummary(ci, extra = {}) {
  if (!coachEnabled() || aiReady()) return null;
  const input = { decision: ci.decision, observedRate: ci.observedRate, expectedRate: ci.expectedRate, trendW: ci.trendW, completeness: ci.completeness, phase: ci.phase, newTargets: ci.newTargets ? { cal: ci.newTargets.cal, step: ci.newTargets.step } : null, flags: ci.flags, ...extra };
  const r = await aiCall('explain/checkin', { checkin: input });
  return r.ok && r.data?.text ? r.data : null;
}

/** Free text → plate, via the gateway. The client then runs the verdict engine itself. */
export async function aiParseAsk(text) {
  if (!coachEnabled()) return { ok: false };
  const r = await aiCall('parse/ask', { text });
  return r.ok ? { ok: true, intent: r.data } : { ok: false, error: r.error };
}
