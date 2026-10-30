import test from 'node:test';
import assert from 'node:assert/strict';
import { assessGoal, buildGoalPlan, projectWeight, phaseAt, planFromProfile, suggestTraining, profilePhaseFor, defaultMonths } from '../../js/engine/goal.js';
import { calcTargets } from '../../js/engine/targets.js';

const male20 = { sex: 'male', age: 20, height: 175, activity: 'moderate', experience: 'beginner', startDate: '2026-01-05' };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

// ---------- spec §10.2 examples ----------
test('60 → 70 kg in 8 months (male 20, beginner) is a realistic lean bulk', () => {
  const a = assessGoal({ ...male20, weight: 60, target: 70, months: 8 });
  assert.equal(a.feasibility, 'safe');
  assert.equal(a.type, 'gain');
  assert.equal(a.label, 'Realistic lean bulk');
  near(a.rateWk, 0.29, 0.01, 'kg/week');
  near(a.ratePct, 0.48, 0.03, '% BW');
  const plan = buildGoalPlan({ ...male20, weight: 60, target: 70, months: 8 });
  const t = calcTargets({ ...male20, weight: 60, goal: 'maintain' });
  near(plan.phases[0].calDelta, 320, 25, 'surplus');
  assert.ok(plan.phases[0].macros.cal > t.cal);
});

test('every plan ends with a 2-week maintenance phase', () => {
  const plan = buildGoalPlan({ ...male20, weight: 60, target: 70, months: 8 });
  const last = plan.phases.at(-1);
  assert.equal(last.kind, 'maintain');
  assert.equal(last.endWk - last.startWk + 1, 2);
  assert.equal(last.calDelta, 0);
  assert.equal(plan.totalWeeks, last.endWk);
});

test('80 → 60 kg in 2 months is not offered; counter-offers are about 8 months or about -5 kg', () => {
  const input = { ...male20, weight: 80, target: 60, months: 2 };
  const a = assessGoal(input);
  assert.equal(a.feasibility, 'blocked');
  assert.ok(a.ratePct > 2.5);
  const longer = a.counterOffers.find(c => c.kind === 'longer');
  const closer = a.counterOffers.find(c => c.kind === 'closer');
  near(longer.months, 8, 0.6, 'months');
  near(80 - closer.target, 5, 1, 'kg');
  assert.equal(buildGoalPlan(input), null);
});

test('counter-offers are themselves safe', () => {
  const a = assessGoal({ ...male20, weight: 80, target: 60, months: 2 });
  for (const c of a.counterOffers.filter(c => c.kind === 'longer' || c.kind === 'closer')) {
    const b = assessGoal({ ...male20, weight: 80, target: c.target, months: c.months ?? 2 });
    assert.notEqual(b.feasibility, 'blocked', c.label);
  }
});

test('female 50 kg, 160 cm → 45 kg is refused (BMI 17.6); maintenance and recomp are offered', () => {
  const a = assessGoal({ sex: 'female', age: 22, height: 160, weight: 50, target: 45, months: 6, activity: 'light' });
  assert.equal(a.feasibility, 'blocked');
  assert.ok(a.reasons.some(r => r.code === 'bmi-low'));
  assert.ok(a.counterOffers.some(c => c.kind === 'maintain'));
  assert.ok(a.counterOffers.some(c => c.kind === 'recomp'));
});

// ---------- edge cases ----------
test('zero change and "already at target" produce a maintenance plan', () => {
  const same = assessGoal({ ...male20, weight: 65, target: 65, months: 3 });
  assert.equal(same.type, 'maintain'); assert.equal(same.feasibility, 'safe');
  assert.ok(same.reasons.some(r => r.code === 'at-target'));
  const plan = buildGoalPlan({ ...male20, weight: 65, target: 65, months: 3 });
  assert.equal(plan.type, 'maintain');
  assert.ok(plan.phases.every(p => p.rateWk === 0));
  assert.equal(projectWeight(plan, 30), 65);
});

test('explicit maintain ignores a different target; recomp holds weight with a small deficit', () => {
  assert.equal(assessGoal({ ...male20, weight: 65, target: 70, months: 3, goalType: 'maintain' }).type, 'maintain');
  const r = buildGoalPlan({ ...male20, weight: 65, target: 65, months: 3, goalType: 'recomp' });
  assert.equal(r.type, 'recomp');
  const m = calcTargets({ ...male20, weight: 65, goal: 'maintain' }).cal;
  assert.ok(m - r.phases[0].macros.cal > 0 && m - r.phases[0].macros.cal <= 260);
});

test('1-month and 24-month windows', () => {
  const small = assessGoal({ ...male20, weight: 65, target: 63, months: 1 });
  assert.equal(small.type, 'lose');
  assert.equal(small.weeks, 5);
  assert.notEqual(small.feasibility, 'blocked');
  const big = buildGoalPlan({ ...male20, weight: 60, target: 75, months: 24 });
  assert.equal(big.feasibility, 'safe');
  assert.equal(big.phases.at(-2).endWk, 104);
  near(big.rateWk, 15 / 104, 0.001);
});

test('a beginner may bulk faster than an intermediate', () => {
  const input = { ...male20, weight: 60, target: 66, months: 5 };
  const beg = assessGoal({ ...input, experience: 'beginner' });
  const mid = assessGoal({ ...input, experience: 'intermediate' });
  assert.equal(beg.feasibility, 'safe');
  assert.notEqual(mid.feasibility, 'safe');
});

test('aggressive loss is allowed but flagged; beyond 1 % BW/week is blocked', () => {
  const agg = assessGoal({ ...male20, weight: 80, target: 72, months: 2.5 });   // about 0.85 %/wk
  assert.equal(agg.feasibility, 'aggressive');
  assert.ok(agg.reasons.some(r => r.code === 'aggressive-rate'));
  assert.equal(agg.label, 'Aggressive cut');
});

test('heavy users (BMI > 30): cuts are fine, gain targets above BMI 30 are refused', () => {
  const heavy = { sex: 'male', age: 28, height: 170, weight: 100, activity: 'light' };   // BMI 34.6
  assert.equal(assessGoal({ ...heavy, target: 90, months: 5 }).feasibility, 'safe');
  const g = assessGoal({ ...heavy, target: 105, months: 6 });
  assert.equal(g.feasibility, 'blocked');
  assert.ok(g.reasons.some(r => r.code === 'bmi-high'));
  assert.ok(g.counterOffers.some(c => c.kind === 'recomp'));
});

test('under-18: only the safe column, with a note about involving an adult', () => {
  const teen = { ...male20, age: 16, weight: 80, target: 72, months: 2.5 };            // aggressive for an adult
  const a = assessGoal(teen);
  assert.equal(a.feasibility, 'blocked');
  assert.ok(a.reasons.some(r => r.code === 'minor'));
  const safe = assessGoal({ ...teen, months: 6 });
  assert.equal(safe.feasibility, 'safe');
  assert.ok(safe.reasons.some(r => r.code === 'minor'));
  const plan = buildGoalPlan({ ...teen, months: 6 });
  assert.ok(plan.phases[0].macros.p <= Math.round(80 * 1.6) + 1, 'protein ≤ 1.6 g/kg');
});

test('calorie floor: a plan never goes below max(1500/1300, BMR)', () => {
  const tiny = { sex: 'female', age: 40, height: 150, weight: 52, activity: 'sedentary', target: 48, months: 1.5 };
  const a = assessGoal(tiny);
  assert.equal(a.feasibility, 'blocked');
  const ok = buildGoalPlan({ ...tiny, months: 12 });
  if (ok) for (const p of ok.phases) assert.ok(p.macros.cal >= 1300, `${p.kind} ${p.macros.cal}`);
});

// ---------- phases ----------
test('long cuts get diet breaks; short ones do not', () => {
  const long = buildGoalPlan({ ...male20, weight: 90, target: 75, months: 9 });
  const breaks = long.phases.filter(p => p.kind === 'break');
  assert.ok(breaks.length >= 1);
  assert.ok(breaks.every(b => b.calDelta === 0 && b.rateWk === 0));
  assert.equal(long.phases[0].kind, 'cut');
  assert.equal(long.phases.at(-2).kind, 'cut', 'a cut block, not a break, is last before lock-in');
  const short = buildGoalPlan({ ...male20, weight: 70, target: 66, months: 3 });
  assert.equal(short.phases.filter(p => p.kind === 'break').length, 0);
});

test('phases are contiguous and the projection lands on the target', () => {
  for (const input of [{ weight: 90, target: 75, months: 9 }, { weight: 60, target: 70, months: 8 }, { weight: 62, target: 68, months: 5 }]) {
    const plan = buildGoalPlan({ ...male20, experience: 'intermediate', ...input });
    plan.phases.forEach((p, i) => assert.equal(p.startWk, i ? plan.phases[i - 1].endWk + 1 : 1));
    const windowEnd = plan.phases.at(-2).endWk;
    near(projectWeight(plan, windowEnd), input.target, 0.15, 'at target');
    near(projectWeight(plan, plan.totalWeeks + 10), input.target, 0.15, 'after the plan');
    assert.equal(projectWeight(plan, 0), input.weight);
  }
});

test('mini-cut is only offered on long bulks for non-beginners, and off by default', () => {
  const input = { ...male20, weight: 60, target: 72, months: 14, experience: 'intermediate' };
  const base = buildGoalPlan(input);
  assert.equal(base.options.miniCutOffered, true);
  assert.ok(!base.phases.some(p => p.kind === 'minicut'));
  const on = buildGoalPlan({ ...input, miniCut: true });
  assert.ok(on.phases.some(p => p.kind === 'minicut'));
  near(projectWeight(on, on.phases.at(-2).endWk), 72, 0.2);
  assert.equal(buildGoalPlan({ ...input, experience: 'beginner' }).options.miniCutOffered, false);
});

test('milestones, phase lookup and the profile phase', () => {
  const plan = buildGoalPlan({ ...male20, weight: 90, target: 75, months: 9 });
  assert.ok(plan.milestones.length >= 3);
  assert.equal(phaseAt(plan, '2026-01-05').kind, 'cut');
  assert.equal(phaseAt(plan, '2030-01-05').kind, 'maintain');
  assert.equal(profilePhaseFor(plan, '2026-01-06'), null);
  assert.equal(profilePhaseFor(plan, '2030-01-05'), 'maintain');
});

test('training suggestion follows goal and experience', () => {
  assert.equal(suggestTraining('gain', 'beginner'), 'fb3');
  assert.equal(suggestTraining('gain', 'advanced'), 'ppl5');
  assert.equal(suggestTraining('lose', 'intermediate'), 'cut4');
  assert.equal(defaultMonths(60, 66, 'beginner') >= 1, true);
});

// ---------- v1 migration ----------
test('v1 profiles get a plan with identical day-1 targets', () => {
  const profiles = [
    { sex: 'male', age: 20, height: 170, weight: 60, activity: 'moderate', goal: 'gain', pace: 0.25, goalWeight: 66 },
    { sex: 'female', age: 22, height: 160, weight: 62, activity: 'light', goal: 'lose', pace: 0.5, goalWeight: 56 },
    { sex: 'male', age: 25, height: 180, weight: 75, activity: 'active', goal: 'maintain', pace: 0.25, goalWeight: null },
    { sex: 'male', age: 19, height: 172, weight: 64, activity: 'moderate', goal: 'recomp', pace: 0.25 },
    { sex: 'male', age: 21, height: 170, weight: 58, activity: 'moderate', goal: 'gain', pace: 0.25 },                    // no target weight
    { sex: 'male', age: 21, height: 170, weight: 70, activity: 'moderate', goal: 'gain', pace: 0.5, goalWeight: 68 },       // already past it
  ];
  for (const pf of profiles) {
    const plan = planFromProfile(pf, { today: '2026-01-05' });
    const t = calcTargets(pf);
    const d1 = plan.phases[0].macros;
    assert.deepEqual([d1.cal, d1.p, d1.c, d1.f], [t.cal, t.p, t.c, t.f], `${pf.goal} ${pf.weight}`);
    assert.equal(plan.phases.at(-1).kind, 'maintain');
  }
  assert.equal(planFromProfile(profiles[0]).totalWeeks, 24 + 2);
});

test('calcTargets follows phase and check-in adjustment, within the floor and ceiling', () => {
  const pf = { ...male20, weight: 70, goal: 'gain', pace: 0.25 };
  const gain = calcTargets(pf), hold = calcTargets({ ...pf, phase: 'maintain' });
  assert.ok(gain.cal > hold.cal);
  assert.equal(hold.cal, calcTargets({ ...pf, goal: 'maintain' }).cal);
  assert.ok(calcTargets({ ...pf, phase: 'minicut' }).cal < hold.cal);
  assert.equal(calcTargets({ ...pf, calAdjust: 100 }).cal - gain.cal, 100);
  assert.ok(calcTargets({ ...pf, calAdjust: 5000 }).cal <= gain.tdee + 700);
  assert.ok(calcTargets({ ...pf, goal: 'lose', calAdjust: -5000 }).cal >= gain.floor);
});
