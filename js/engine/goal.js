// =============================================================
// GOAL ENGINE — "X kg to Y kg in Z months": is it safe, and what
// is the plan? Pure functions: no DOM, no network, no storage.
// Rules come from spec §5.1 (rates, energy, macros, phases) and
// §9.1 (guardrails). Unit-tested in test/unit/goal.test.mjs.
//
//   assessGoal(input)     → feasibility + rate + reasons + counter-offers
//   buildGoalPlan(input)  → GoalPlan (phases, milestones), or null if blocked
//   projectWeight(plan,w) → expected weight after w weeks
//   planFromProfile(p)    → GoalPlan for a v1 profile, same day-1 targets
//
// Weeks are whole numbers: the plan runs ceil(window) weeks, then a
// 2-week maintenance "lock it in" phase.
// =============================================================
import { round, addDays, daysBetween, todayKey } from '../util.js';
import { calcTargets, KCAL_PER_KG, MINICUT_PACE } from './targets.js';

export const WEEKS_PER_MONTH = 52 / 12;
export const MAINTENANCE_WEEKS = 2;
export const MIN_BMI = 18.5;
export const MAX_GAIN_BMI = 30;

export const EXPERIENCE = [
  { id: 'beginner',     label: 'Beginner',     sub: 'Under a year of lifting' },
  { id: 'intermediate', label: 'Intermediate', sub: '1–3 years, steady' },
  { id: 'advanced',     label: 'Advanced',     sub: '3+ years, slow gains' },
];

// % of body weight per week: [safe, aggressive]. Above aggressive is not offered.
const RATE_PCT = {
  lose: [0.75, 1.0],
  gainBeginner: [0.5, 0.75],
  gainSeasoned: [0.25, 0.5],
};
const MAX_SURPLUS = 700;                       // kcal above TDEE: no "dirty bulk" numbers

export const bmiOf = (w, h) => w / ((h / 100) ** 2);
const wkgOf = (kcal) => (kcal * 7) / KCAL_PER_KG;   // kcal/day → kg/week
const half = x => Math.round(x * 2) / 2;

// ---------- input ----------
function norm(input = {}) {
  const i = {
    weight: +input.weight || 60, target: input.target == null ? null : +input.target,
    height: +input.height || 170, age: +input.age || 20, sex: input.sex === 'female' ? 'female' : 'male',
    activity: input.activity || 'moderate', experience: input.experience || 'beginner',
    goalType: input.goalType || 'auto', miniCut: !!input.miniCut,
    startDate: input.startDate || todayKey(), months: input.months, endDate: input.endDate,
  };
  if (i.target == null || !isFinite(i.target)) i.target = i.weight;
  let weeks;
  if (input.endDate) weeks = daysBetween(i.startDate, input.endDate) / 7;
  else if (+input.months > 0) weeks = +input.months * WEEKS_PER_MONTH;
  else weeks = 12;
  i.weeks = Math.min(156, Math.max(1, Math.ceil(weeks - 1e-9)));
  return i;
}

/** BMR / TDEE through the same formula the daily targets use. */
function energy(i) {
  const t = calcTargets({ ...i, goal: 'maintain', phase: null, calAdjust: 0 });
  return { bmr: t.bmr, tdee: t.tdee, floor: t.floor, holdCal: t.cal };
}

function typeOf(i) {
  if (i.goalType === 'recomp') return 'recomp';
  if (i.goalType === 'maintain' || Math.abs(i.target - i.weight) < 0.25) return 'maintain';
  return i.target > i.weight ? 'gain' : 'lose';
}

// ---------- phase layout ----------
/** Diet breaks on long cuts (spec §5.1.4): none ≤ 13 weeks, then one per ~12. */
function breaksFor(type, weeks) {
  if (type !== 'lose' || weeks <= 12) return { n: 0, len: 0 };
  return { n: Math.max(0, Math.floor((weeks - 2) / 12)), len: weeks > 40 ? 2 : 1 };
}
const miniCutOffered = (type, weeks, i) => type === 'gain' && weeks > 24 && i.experience !== 'beginner';
const MINICUT_WEEKS = 3;

function layout(type, i) {
  const br = breaksFor(type, i.weeks);
  const mini = i.miniCut && miniCutOffered(type, i.weeks, i) ? MINICUT_WEEKS : 0;
  const nonActive = br.n * br.len + mini;
  const active = Math.max(1, i.weeks - nonActive);
  const miniLoss = MINICUT_PACE * mini;   // kg lost during the mini-cut
  return { br, mini, active, miniLoss, nonActive };
}

// ---------- assessment ----------
const text = {
  safe: 'This pace is sustainable. Most of the change will be the kind you want.',
  aggressive: 'This is faster than we like. It is possible, but expect hunger, low energy and some muscle loss. A longer timeline works better.',
  tooFastLose: 'Losing this fast is not safe, so we won’t build a plan around it.',
  tooFastGain: 'Gaining this fast would mostly be fat, so we won’t build a plan around it.',
};

export function assessGoal(input) {
  const i = norm(input);
  const type = typeOf(i);
  const { bmr, tdee, floor } = energy(i);
  const minor = i.age < 18;
  const bmiNow = bmiOf(i.weight, i.height), bmiTarget = bmiOf(i.target, i.height);
  const diff = i.target - i.weight, abs = Math.abs(diff);
  const reasons = [], counterOffers = [];
  const out = (feasibility, extra = {}) => ({
    type, feasibility, reasons, counterOffers, weeks: i.weeks, diff: round(diff, 1),
    rateWk: 0, ratePct: 0, label: '', bmiNow: round(bmiNow, 1), bmiTarget: round(bmiTarget, 1), bmr, tdee, minor,
    limits: { safe: 0, aggressive: 0 }, ...extra,
  });
  if (minor) reasons.push({ code: 'minor', text: 'Under 18: we keep things gentle. Please involve a parent, doctor or coach in your plan.' });

  // ---- hold / recomp: no weight change asked for ----
  if (type === 'maintain' || type === 'recomp') {
    if (type === 'maintain' && abs < 0.25 && i.goalType !== 'maintain') reasons.push({ code: 'at-target', text: 'You are already at your target weight, so this plan holds it.' });
    if (type === 'recomp' && bmiNow < MIN_BMI) {
      reasons.push({ code: 'bmi-low', text: 'Your BMI is under 18.5. Recomp needs a small deficit, so we hold your weight instead.' });
      counterOffers.push({ kind: 'maintain', label: 'Maintain your weight' });
      return out('blocked');
    }
    return out('safe', { label: type === 'recomp' ? 'Recomp' : 'Maintain' });
  }

  // ---- hard limits that no pace can fix ----
  if (bmiTarget < MIN_BMI) {
    reasons.push({ code: 'bmi-low', text: `That target is a BMI of ${round(bmiTarget, 1)}, under the healthy minimum of 18.5. We won’t plan below it.` });
    counterOffers.push({ kind: 'maintain', label: 'Maintain your weight' }, { kind: 'recomp', label: 'Recomp: build muscle, lose fat slowly' });
    return out('blocked', { limits: { safe: 0, aggressive: 0 } });
  }
  if (type === 'gain' && bmiTarget > MAX_GAIN_BMI) {
    reasons.push({ code: 'bmi-high', text: `That target is a BMI of ${round(bmiTarget, 1)}. Gaining past BMI 30 isn’t something we plan. A recomp builds muscle without adding that weight.` });
    counterOffers.push({ kind: 'recomp', label: 'Recomp: build muscle, lose fat slowly' }, { kind: 'maintain', label: 'Maintain your weight' });
    return out('blocked');
  }

  // ---- rate limits (table + energy floor/ceiling) ----
  const lay = layout(type, i);
  const rateWk = (abs + (type === 'gain' ? lay.miniLoss : 0)) / lay.active;
  const ratePct = (rateWk / i.weight) * 100;
  const pct = type === 'lose' ? RATE_PCT.lose : i.experience === 'beginner' ? RATE_PCT.gainBeginner : RATE_PCT.gainSeasoned;
  const energyCap = type === 'lose' ? wkgOf(tdee - floor) : wkgOf(MAX_SURPLUS);
  const safeMax = Math.max(0, Math.min(pct[0] / 100 * i.weight, energyCap));
  const aggrMax = minor ? safeMax : Math.max(0, Math.min(pct[1] / 100 * i.weight, energyCap));

  let feasibility;
  if (rateWk <= safeMax + 1e-9) feasibility = 'safe';
  else if (rateWk <= aggrMax + 1e-9) feasibility = 'aggressive';
  else feasibility = 'blocked';

  if (feasibility === 'safe') reasons.push({ code: 'safe-rate', text: text.safe });
  if (feasibility === 'aggressive') reasons.push({ code: 'aggressive-rate', text: text.aggressive });
  if (feasibility === 'blocked') {
    const floorBound = energyCap < pct[1] / 100 * i.weight;
    reasons.push({ code: 'too-fast', text: `${round(rateWk, 2)} kg a week is ${round(ratePct, 1)}% of your body weight. ${type === 'lose' ? text.tooFastLose : text.tooFastGain}` });
    if (floorBound) reasons.push({ code: type === 'lose' ? 'floor' : 'ceiling', text: type === 'lose'
      ? `Your calorie target would drop below ${floor} kcal, the minimum we plan for your body.`
      : `You would need to eat more than ${MAX_SURPLUS} kcal over what you burn, which is mostly fat gain.` });
    if (safeMax > 0.01) {
      const weeksNeeded = Math.ceil(abs / safeMax) + lay.nonActive;
      const monthsNeeded = Math.max(0.5, Math.ceil((weeksNeeded / WEEKS_PER_MONTH) * 2) / 2);
      counterOffers.push({ kind: 'longer', label: `Same target in about ${monthsNeeded} months`, months: monthsNeeded, target: i.target });
      const reach = half(safeMax * lay.active);
      const closer = type === 'lose' ? round(i.weight - Math.max(0.5, reach), 1) : round(i.weight + Math.max(0.5, reach), 1);
      const dm = round(i.weeks / WEEKS_PER_MONTH, 1);
      counterOffers.push({ kind: 'closer', label: `${closer < i.weight ? '−' : '+'}${round(Math.abs(closer - i.weight), 1)} kg in ${dm} month${dm === 1 ? '' : 's'}`, target: closer, months: i.months });
    }
    if (type === 'lose' && bmiNow < 25) counterOffers.push({ kind: 'recomp', label: 'Recomp: build muscle, lose fat slowly' });
    counterOffers.push({ kind: 'maintain', label: 'Maintain your weight' });
  }

  const label = ({
    gain: feasibility === 'aggressive' ? 'Aggressive bulk' : i.experience === 'beginner' ? 'Realistic lean bulk' : 'Lean bulk',
    lose: feasibility === 'aggressive' ? 'Aggressive cut' : 'Steady cut',
  })[type];
  return out(feasibility, {
    rateWk: round(rateWk, 3), ratePct: round(ratePct, 2), label,
    limits: { safe: round(safeMax, 3), aggressive: round(aggrMax, 3) },
    breaks: lay.br, miniCutOffered: miniCutOffered(type, i.weeks, i),
  });
}

// ---------- training suggestion ----------
/** Picks from data/workouts.js: beginners start full-body, the rest follow the goal. */
export function suggestTraining(type, experience = 'beginner') {
  if (experience === 'beginner') return 'fb3';
  if (type === 'lose') return 'cut4';
  if (type === 'gain') return experience === 'advanced' ? 'ppl5' : 'ul4';
  return 'ul4';
}

// ---------- plan ----------
const PHASE_LABEL = { gain: 'Lean bulk', cut: 'Cut', break: 'Diet break', minicut: 'Mini-cut', maintain: 'Maintain', recomp: 'Recomp' };
export const phaseLabel = kind => PHASE_LABEL[kind] || kind;

function goalFor(kind) {
  return { gain: 'gain', cut: 'lose', minicut: 'lose', break: 'maintain', maintain: 'maintain', recomp: 'recomp' }[kind];
}

function mkPhase(kind, startWk, endWk, rateWk, i, holdCal) {
  const goal = goalFor(kind);
  const pace = kind === 'minicut' ? MINICUT_PACE : Math.abs(rateWk);
  const t = calcTargets({ ...i, goal, pace, phase: null, calAdjust: 0 });
  const signed = kind === 'gain' ? pace : kind === 'cut' || kind === 'minicut' ? -pace : 0;
  return {
    kind, label: PHASE_LABEL[kind], startWk, endWk, rateWk: round(signed, 3),
    calDelta: t.cal - holdCal, macros: { cal: t.cal, p: t.p, c: t.c, f: t.f },
  };
}

export function buildGoalPlan(input) {
  const a = assessGoal(input);
  if (a.feasibility === 'blocked') return null;
  const i = norm(input);
  const type = a.type;
  const { holdCal } = energy(i);
  const phases = [];
  let wk = 1;
  const push = (kind, len, rate) => { if (len <= 0) return; phases.push(mkPhase(kind, wk, wk + len - 1, rate, i, holdCal)); wk += len; };

  if (type === 'gain' || type === 'lose') {
    const lay = layout(type, i);
    const main = type === 'gain' ? 'gain' : 'cut';
    const sign = type === 'gain' ? 1 : -1;
    const rate = a.rateWk * sign;
    if (type === 'lose' && lay.br.n) {
      const seg = Math.ceil(lay.active / (lay.br.n + 1));
      let left = lay.active;
      for (let b = 0; b <= lay.br.n; b++) {
        const len = b === lay.br.n ? left : Math.min(seg, left);
        push(main, len, rate); left -= len;
        if (b < lay.br.n) push('break', lay.br.len, 0);
      }
    } else if (lay.mini) {
      const before = Math.floor(lay.active / 2);
      push(main, before, rate); push('minicut', lay.mini, 0); push(main, lay.active - before, rate);
    } else push(main, lay.active, rate);
  } else {
    push(type === 'recomp' ? 'recomp' : 'maintain', i.weeks, 0);
  }
  const endOfWindow = wk - 1;
  push('maintain', MAINTENANCE_WEEKS, 0);

  const plan = {
    id: 'g' + Date.now().toString(36), type, label: a.label, status: 'active',
    start: { date: i.startDate, w: round(i.weight, 1) },
    target: { date: addDays(i.startDate, endOfWindow * 7), w: type === 'gain' || type === 'lose' ? round(i.target, 1) : round(i.weight, 1) },
    rateWk: a.rateWk, ratePct: a.ratePct, feasibility: a.feasibility,
    experience: i.experience, miniCut: i.miniCut && a.miniCutOffered === true, phases,
    training: { planId: suggestTraining(type, i.experience) },
    milestones: [], options: { miniCutOffered: !!a.miniCutOffered },
    input: { weight: i.weight, target: i.target, months: input.months ?? null, endDate: input.endDate ?? null, goalType: i.goalType, experience: i.experience },
  };
  plan.totalWeeks = wk - 1;
  plan.milestones = milestonesFor(plan, endOfWindow);
  return plan;
}

function milestonesFor(plan, endWk) {
  const out = [];
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const w = Math.max(1, Math.round(endWk * f));
    if (!out.some(m => m.wk === w)) out.push({ wk: w, w: round(projectWeight(plan, w), 1) });
  }
  return out;
}

// ---------- projection ----------
/** Expected weight after `week` elapsed weeks (0 = start). Phase weeks are 1-based, inclusive. */
export function projectWeight(plan, week) {
  let w = plan.start.w;
  const t = Math.max(0, week);
  for (const ph of plan.phases) {
    const from = ph.startWk - 1, to = ph.endWk;
    if (t <= from) break;
    w += ph.rateWk * (Math.min(t, to) - from);
  }
  return round(w, 2);
}

/** The phase active on a date (the last one once the plan is over). */
export function phaseAt(plan, date) {
  if (!plan || !plan.phases?.length) return null;
  const wk = Math.floor(daysBetween(plan.start.date, date) / 7) + 1;
  return plan.phases.find(p => wk >= p.startWk && wk <= p.endWk) || (wk < 1 ? plan.phases[0] : plan.phases[plan.phases.length - 1]);
}
export const weekOf = (plan, date) => Math.max(1, Math.floor(daysBetween(plan.start.date, date) / 7) + 1);

/** Value for profile.phase so calcTargets follows the current phase. */
export function profilePhaseFor(plan, date) {
  const ph = phaseAt(plan, date);
  if (!ph) return null;
  return ph.kind === 'break' || ph.kind === 'maintain' ? 'maintain' : ph.kind === 'minicut' ? 'minicut' : null;
}

// ---------- v1 profiles ----------
/**
 * A GoalPlan from a v1 profile (goal / pace / goalWeight). Day-1 targets are
 * calcTargets(profile), unchanged: the phase macros are computed with the
 * same inputs.
 */
export function planFromProfile(pf, { today = todayKey(), id = 'g1' } = {}) {
  const w = +pf.weight || 60, pace = +pf.pace || 0.25, goalW = +pf.goalWeight || 0;
  const type = pf.goal === 'recomp' ? 'recomp' : pf.goal === 'gain' || pf.goal === 'lose' ? pf.goal : 'maintain';
  const moves = type === 'gain' || type === 'lose';
  const open = moves && !goalW;                           // v1 allowed a goal with no target weight
  const dirOk = moves && goalW && (type === 'gain' ? goalW >= w : goalW <= w);
  const diff = !moves ? 0 : open ? pace * 26 : dirOk ? Math.abs(goalW - w) : 0;
  const weeks = moves ? Math.max(1, Math.ceil(diff / pace)) : 12;
  const base = { ...pf, phase: null, calAdjust: 0 };
  const t = calcTargets({ ...base, goal: type });
  const t0 = calcTargets({ ...base, goal: 'maintain' });
  const kind = type === 'gain' ? 'gain' : type === 'lose' ? 'cut' : type;
  const rateWk = type === 'gain' ? pace : type === 'lose' ? -pace : 0;
  const mk = (k, s, e, rate, tt) => ({ kind: k, label: PHASE_LABEL[k], startWk: s, endWk: e, rateWk: round(rate, 3), calDelta: tt.cal - t0.cal, macros: { cal: tt.cal, p: tt.p, c: tt.c, f: tt.f } });
  const phases = [mk(kind, 1, weeks, rateWk, t), mk('maintain', weeks + 1, weeks + MAINTENANCE_WEEKS, 0, t0)];
  const exp = pf.experience || 'beginner';
  const targetW = !moves ? w : open ? w + Math.sign(rateWk) * diff : dirOk ? goalW : w;
  const plan = {
    id, type, label: { gain: 'Lean bulk', lose: 'Steady cut', maintain: 'Maintain', recomp: 'Recomp' }[type], status: 'active',
    start: { date: today, w: round(w, 1) },
    target: { date: addDays(today, weeks * 7), w: round(targetW, 1) },
    rateWk: round(Math.abs(rateWk), 3), ratePct: round((Math.abs(rateWk) / w) * 100, 2), feasibility: 'safe',
    experience: exp, miniCut: false, phases, training: { planId: pf.plan || suggestTraining(type, exp) },
    milestones: [], options: { miniCutOffered: false }, migrated: true, totalWeeks: weeks + MAINTENANCE_WEEKS,
    input: { weight: w, target: targetW, months: null, endDate: null, goalType: type === 'recomp' ? 'recomp' : 'auto', experience: exp },
  };
  plan.milestones = milestonesFor(plan, weeks);
  return plan;
}

/** Months to show in the planner for an existing plan or a pace. */
export function monthsFor(weeks) {
  return Math.max(1, Math.round(weeks / WEEKS_PER_MONTH));
}

/** A sensible first guess for the timeline: a comfortably safe pace. */
export function defaultMonths(weight, target, experience = 'beginner') {
  const diff = Math.abs(target - weight);
  if (diff < 0.25) return 3;
  const pct = target < weight ? RATE_PCT.lose[0] : experience === 'beginner' ? RATE_PCT.gainBeginner[0] : RATE_PCT.gainSeasoned[0];
  const perWeek = (pct / 100) * weight * 0.7;
  return Math.min(36, Math.max(1, Math.ceil(diff / perWeek / WEEKS_PER_MONTH)));
}
