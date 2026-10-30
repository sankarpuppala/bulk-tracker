// =============================================================
// GOALS — the stateful side of the Goal Planner and weekly check-ins.
// Engines live in js/engine/goal.js and js/engine/checkin.js; this file
// wires them to the store: starting a plan, keeping profile.phase in
// step with it, and running / applying a check-in.
// =============================================================
import { todayKey, round } from './util.js';
import { store } from './store.js';
import { ctx } from './ctx.js';
import { profilePhaseFor, phaseAt, weekOf, buildGoalPlan } from './engine/goal.js';
import { runCheckIn, checkInDue } from './engine/checkin.js';
import { calcTargets } from './engine/targets.js';
import { totals } from './engine/plate.js';
import { itemMeal } from './engine/dayplan.js';

/** Planner inputs that come from the profile (the rest the user chooses). */
export const baseFrom = pf => ({ sex: pf.sex, age: pf.age, height: pf.height, activity: pf.activity });

/**
 * Make `plan` the active goal. `patch` is merged into the profile (onboarding
 * passes the whole draft); training is only switched when asked.
 */
export function startPlan(plan, { patch = {}, applyTraining = false } = {}) {
  const moves = plan.type === 'gain' || plan.type === 'lose';
  store.saveGoal(plan, { activate: true });
  store.saveProfile({
    ...patch,
    goal: plan.type, goalWeight: moves ? plan.target.w : null,
    ...(moves ? { pace: plan.rateWk } : {}),
    weight: plan.start.w, experience: plan.experience,
    phase: profilePhaseFor(plan, todayKey()), calAdjust: 0,
    ...(applyTraining ? { plan: plan.training.planId } : {}),
    activeGoalId: plan.id,
  });
}

/** Keep profile.phase (diet break, mini-cut, lock-in) matching the active plan's phase today. */
export function syncPhase() {
  const plan = store.activeGoal;
  if (!plan || !store.profile.onboarded) return;
  const want = profilePhaseFor(plan, todayKey());
  if ((store.profile.phase || null) !== want) store.saveProfile({ phase: want });
}

export function currentPhase() {
  const plan = store.activeGoal;
  return plan ? { plan, phase: phaseAt(plan, todayKey()), week: weekOf(plan, todayKey()) } : null;
}

// ---------- check-ins ----------
/** [{ key, weight, kcal, meals }] for the engine; today counts as a weigh-in but not as a logged day. */
export function historyForCheckIn() {
  const today = todayKey();
  return ctx.history.map(d => {
    const isToday = d.key === today;
    return {
      key: d.key, weight: d.weight || null,
      kcal: isToday ? 0 : Math.round(totals(d.items).cal),
      meals: isToday ? 0 : new Set(d.items.map(itemMeal)).size,
    };
  });
}

export function checkInIsDue() {
  return !!store.activeGoal && checkInDue(store.activeGoal, store.checkins, todayKey());
}

/** Run this week's check-in and save it. The caller shows the result and offers `applyCheckIn`. */
export function doCheckIn() {
  const plan = store.activeGoal;
  const ci = runCheckIn(plan, historyForCheckIn(), store.checkins, {
    asOf: todayKey(), targets: calcTargets(store.profile), profile: store.profile,
  });
  ci.planId = plan.id;
  store.saveCheckIn(ci);
  return ci;
}

/** Apply a check-in's calorie adjustment to the daily targets. */
export function applyCheckIn(ci) {
  if (!ci.newTargets) return;
  store.saveProfile({ calAdjust: ci.newTargets.calAdjust });
  store.saveCheckIn({ ...ci, applied: true });
}

export const DECISION_LABEL = {
  'on-track': 'On track', watch: 'Watching', adjust: 'Adjusted', 'at-limit': 'At limit',
  'log-more': 'Log more', insufficient: 'Not enough data',
};

export const kg = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(round(v, 2))}`;

/** Replace the active plan with a 3-month maintenance plan (used when the eating-disorder check-in suggests it). */
export function switchToMaintenance() {
  const pf = store.profile;
  const plan = buildGoalPlan({ ...baseFrom(pf), weight: pf.weight, target: pf.weight, goalType: 'maintain', months: 3, experience: pf.experience || 'beginner' });
  if (plan) startPlan(plan);
  return plan;
}
