import test from 'node:test';
import assert from 'node:assert/strict';
import { calcTargets, targetsFor, weeksToGoal } from '../../js/engine/targets.js';

const base = { sex: 'male', age: 20, height: 175, weight: 65, activity: 'moderate', pace: 0.25 };

test('maintain lands on TDEE (BMR × activity)', () => {
  const t = calcTargets({ ...base, goal: 'maintain' });
  assert.equal(t.bmr, Math.round(10 * 65 + 6.25 * 175 - 5 * 20 + 5));
  assert.ok(Math.abs(t.cal - t.tdee) <= 10);
});

test('gain adds ~275 kcal at 0.25 kg/week, lose subtracts it', () => {
  const m = calcTargets({ ...base, goal: 'maintain' }).cal;
  const g = calcTargets({ ...base, goal: 'gain' }).cal;
  const l = calcTargets({ ...base, goal: 'lose' }).cal;
  assert.ok(Math.abs(g - m - 275) <= 15, `gain delta ${g - m}`);
  assert.ok(Math.abs(m - l - 275) <= 15, `lose delta ${m - l}`);
});

test('recomp is a small deficit capped at 250 kcal', () => {
  const m = calcTargets({ ...base, goal: 'maintain' }).cal;
  const r = calcTargets({ ...base, goal: 'recomp' }).cal;
  assert.ok(m - r > 0 && m - r <= 260);
});

test('calorie floor holds for an aggressive cut (1500 male / 1300 female)', () => {
  const small = { age: 40, height: 150, weight: 45, activity: 'sedentary', goal: 'lose', pace: 1 };
  assert.equal(calcTargets({ ...small, sex: 'male' }).cal, 1500);
  assert.equal(calcTargets({ ...small, sex: 'female' }).cal, 1300);
});

test('protein per kg: lose > gain > maintain for a normal-BMI user', () => {
  const p = g => calcTargets({ ...base, goal: g }).p;
  assert.equal(p('lose'), 130);
  assert.equal(p('gain'), Math.round(65 * 1.8));
  assert.equal(p('maintain'), Math.round(65 * 1.6));
});

test('heavier users get protein off a BMI-25 reference weight, not body weight', () => {
  const t = calcTargets({ sex: 'male', age: 25, height: 170, weight: 110, activity: 'light', goal: 'lose' });
  assert.equal(t.p, Math.round(25 * 1.7 ** 2 * 2.0));
  assert.ok(t.p < 110 * 2.0);
});

test('macros add back up to roughly the calorie target', () => {
  const t = calcTargets({ ...base, goal: 'gain' });
  const kcal = t.p * 4 + t.c * 4 + t.f * 9;
  assert.ok(Math.abs(kcal - t.cal) <= 40, `${kcal} vs ${t.cal}`);
});

test('water has a 2 L minimum and scales with weight', () => {
  assert.equal(calcTargets({ ...base, weight: 40, goal: 'maintain' }).water, 2000);
  assert.ok(calcTargets({ ...base, weight: 100, goal: 'maintain' }).water >= 3500);
});

test('targetsFor lets custom targets override the auto values', () => {
  const t = targetsFor({ ...base, goal: 'maintain', customTargets: { cal: 3000 } });
  assert.equal(t.cal, 3000);
  assert.ok(t.p > 0);
});

test('weeksToGoal', () => {
  assert.equal(weeksToGoal({ weight: 60, goalWeight: 70, pace: 0.25, goal: 'gain' }), 40);
  assert.equal(weeksToGoal({ weight: 80, goalWeight: 70, pace: 0.5, goal: 'lose' }), 20);
  assert.equal(weeksToGoal({ weight: 70, goalWeight: 65, goal: 'gain' }), 0);
  assert.equal(weeksToGoal({ weight: 70, goalWeight: 75, goal: 'maintain' }), null);
  assert.equal(weeksToGoal({ weight: 70, goal: 'gain' }), null);
});
