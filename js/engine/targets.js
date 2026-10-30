// =============================================================
// TARGETS ENGINE — goals, activity levels, daily targets.
// Pure functions: no DOM, no network, no storage. Unit-tested in
// test/unit/. js/nutrition.js re-exports everything here.
// =============================================================
import { round } from '../util.js';

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

// ---------- targets ----------
export const KCAL_PER_KG = 7700;
export const MINICUT_PACE = 0.3;   // kg/week during an optional mini-cut

/**
 * Daily targets from a profile.
 *   pr.phase      null | 'maintain' (diet break / lock-in) | 'minicut': set by the
 *                 goal plan so the targets follow the current phase (Phase 2)
 *   pr.calAdjust  kcal added by weekly check-ins (can be negative)
 * Guardrails (spec §9.1): never below max(sex floor, BMR), never above TDEE + 700,
 * and protein is capped at 1.6 g/kg for under-18s.
 */
export function calcTargets(pr) {
  const w = +pr.weight || 60, ht = +pr.height || 170, age = +pr.age || 20;
  const bmr = 10 * w + 6.25 * ht - 5 * age + (pr.sex === 'female' ? -161 : 5);
  const tdee = bmr * (ACTIVITY.find(a => a.id === pr.activity)?.f || 1.55);
  const goal = pr.phase === 'maintain' ? 'maintain' : pr.phase === 'minicut' ? 'lose' : pr.goal;
  const pace = pr.phase === 'minicut' ? MINICUT_PACE : (+pr.pace || 0.25);
  let delta = 0;
  if (goal === 'gain') delta = (pace * KCAL_PER_KG) / 7;
  else if (goal === 'lose') delta = -(pace * KCAL_PER_KG) / 7;
  else if (goal === 'recomp') delta = -Math.min(250, tdee * 0.1);
  delta += +pr.calAdjust || 0;
  const floor = Math.max(pr.sex === 'female' ? 1300 : 1500, Math.round(bmr));
  const ceiling = Math.round(tdee + 700);
  const cal = Math.min(Math.max(ceiling, floor), Math.max(floor, Math.round((tdee + delta) / 10) * 10));
  // protein scales off a sensible body weight so heavier folks don't get absurd numbers
  const bmi = w / ((ht / 100) ** 2);
  const refW = bmi > 27 ? 25 * (ht / 100) ** 2 : w;
  let perKg = { gain: 1.8, lose: 2.0, recomp: 2.0, maintain: 1.6 }[goal] || 1.6;
  if (age < 18) perKg = Math.min(perKg, 1.6);
  const p = Math.round(refW * perKg);
  const f = Math.round(Math.max(0.7 * refW, (cal * 0.25) / 9));
  const c = Math.max(50, Math.round((cal - p * 4 - f * 9) / 4));
  const water = Math.max(2000, Math.round((w * 35) / 250) * 250);
  return { cal, p, c, f, water, fiber: Math.round((cal / 1000) * 14), bmr: Math.round(bmr), tdee: Math.round(tdee), bmi: round(bmi, 1), floor, ceiling };
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
