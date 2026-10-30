import test from 'node:test';
import assert from 'node:assert/strict';
import { trendWeights, trendAt, adaptiveTDEE, runCheckIn, checkInDue, weekKey } from '../../js/engine/checkin.js';
import { buildGoalPlan } from '../../js/engine/goal.js';
import { calcTargets } from '../../js/engine/targets.js';
import { addDays } from '../../js/util.js';

const START = '2026-01-05';
const profile = { sex: 'male', age: 20, height: 175, weight: 60, activity: 'moderate', experience: 'beginner' };
const bulk = buildGoalPlan({ ...profile, target: 70, months: 8, startDate: START });
const targets = calcTargets({ ...profile, goal: 'gain', pace: bulk.rateWk });

/** Deterministic 28+ day series. rate = real kg/week, intake = kcal eaten, logged = which day offsets are logged. */
function series({ rate, intake, days = 28, w0 = 60, logged = () => true, weigh = () => true }) {
  return Array.from({ length: days }, (_, d) => ({
    key: addDays(START, d),
    weight: weigh(d) ? Math.round((w0 + (rate * d) / 7 + Math.sin(d * 2.1) * 0.25) * 10) / 10 : null,
    kcal: logged(d) ? intake + Math.round(Math.cos(d * 1.3) * 80) : 0,
    meals: logged(d) ? 3 : 0,
  }));
}
const asOf = addDays(START, 27);
const opts = (extra = {}) => ({ asOf, targets, profile, ...extra });

// ---------- trend ----------
test('trendWeights is an EMA with alpha 0.1 and skips days without a weigh-in', () => {
  const t = trendWeights([{ key: 'a', weight: 60 }, { key: 'b', weight: null }, { key: 'c', weight: 61 }]);
  assert.equal(t.length, 2);
  assert.equal(t[0].trend, 60);
  assert.equal(t[1].trend, 60.1);
  assert.equal(trendAt(t, 'b').w, 60);
  assert.equal(trendAt(t, '0'), null);
});

test('the trend smooths a +/-1 kg water swing', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ key: addDays(START, i), weight: 65 + (i % 2 ? 1 : -1) }));
  const t = trendWeights(days);
  assert.ok(Math.abs(t.at(-1).trend - 65) < 0.5);
});

test('weekKey is the ISO week', () => {
  assert.equal(weekKey('2026-01-05'), '2026-W02');
  assert.equal(weekKey('2025-12-29'), '2026-W01');
  assert.equal(weekKey('2026-01-04'), '2026-W01');
});

test('adaptive TDEE = intake minus what the trend says you stored', () => {
  const d = series({ rate: 0.3, intake: 2800 });
  const a = adaptiveTDEE(d, { asOf });
  assert.ok(a.observed > 0.15 && a.observed < 0.45, `observed ${a.observed}`);
  assert.ok(Math.abs(a.tdee - (2800 - (0.3 * 7700) / 7)) < 200, `tdee ${a.tdee}`);
  assert.equal(adaptiveTDEE(series({ rate: 0.3, intake: 2800, weigh: d => d % 9 === 0 }), { asOf }), null, 'too few weigh-ins');
});

// ---------- four synthetic 28-day datasets ----------
test('on track: trend within 40 % of plan, no change to targets', () => {
  const ci = runCheckIn(bulk, series({ rate: bulk.rateWk, intake: 2700 }), [], opts());
  assert.equal(ci.decision, 'on-track', ci.message);
  assert.equal(ci.newTargets, undefined);
  assert.equal(ci.expectedRate, bulk.phases[0].rateWk);
  assert.ok(ci.adaptTDEE > 2000);
});

test('stalled: the first off week is only watched, the second consecutive one adds calories', () => {
  const d = series({ rate: 0, intake: 2500 });
  const first = runCheckIn(bulk, d, [], opts({ asOf: addDays(START, 20) }));
  assert.equal(first.decision, 'watch', first.message);
  assert.equal(first.dir, 'up');
  const second = runCheckIn(bulk, d, [first], opts());
  assert.equal(second.decision, 'adjust', second.message);
  assert.ok(second.newTargets.step >= 100 && second.newTargets.step <= 250);
  assert.equal(second.newTargets.cal, targets.cal + second.newTargets.step);
  assert.equal(second.newTargets.calAdjust, second.newTargets.step);
  assert.ok(Math.abs(second.newTargets.cal * 1 - (second.newTargets.p * 4 + second.newTargets.c * 4 + second.newTargets.f * 9)) < 30);
});

test('too fast: two consecutive fast weeks trim calories, never below the floor', () => {
  const d = series({ rate: 0.9, intake: 3300 });
  const first = runCheckIn(bulk, d, [], opts({ asOf: addDays(START, 20) }));
  assert.equal(first.decision, 'watch');
  assert.equal(first.dir, 'down');
  const second = runCheckIn(bulk, d, [first], opts());
  assert.equal(second.decision, 'adjust');
  assert.ok(second.newTargets.step < 0 && second.newTargets.step >= -250);
  assert.ok(second.newTargets.cal >= targets.floor);
  // at the floor already, the step is refused instead of going lower
  const tight = runCheckIn(bulk, d, [first], opts({ targets: { ...targets, cal: targets.floor } }));
  assert.equal(tight.decision, 'at-limit');
});

test('sparse logging: under 70 % completeness never changes numbers', () => {
  const d = series({ rate: 0, intake: 2500, logged: i => i % 2 === 0 });          // 7 of the last 14 days
  const prev = [{ off: true, dir: 'up', date: addDays(asOf, -7) }];
  const ci = runCheckIn(bulk, d, prev, opts());
  assert.equal(ci.decision, 'log-more');
  assert.equal(ci.newTargets, undefined);
  assert.match(ci.message, /Log at least 10/);
});

test('too little data is reported, not guessed', () => {
  const d = series({ rate: 0.3, intake: 2700, weigh: i => i === 25 || i === 27 });
  const ci = runCheckIn(bulk, d, [], opts());
  assert.equal(ci.decision, 'insufficient');
  assert.match(ci.message, /weigh-in/);
});

// ---------- guardrails and flags ----------
test('a repeated check-in in the other direction does not count as consecutive', () => {
  const d = series({ rate: 0, intake: 2500 });
  const ci = runCheckIn(bulk, d, [{ off: true, dir: 'down', date: addDays(asOf, -7) }], opts());
  assert.equal(ci.decision, 'watch');
});

test('insufficient / log-more check-ins do not break the two-in-a-row rule', () => {
  const d = series({ rate: 0, intake: 2500 });
  const prev = [{ off: true, dir: 'up' }, { off: null, dir: null, decision: 'insufficient' }];
  assert.equal(runCheckIn(bulk, d, prev, opts()).decision, 'adjust');
});

test('under-18 users are never given a calorie cut', () => {
  const d = series({ rate: 0.9, intake: 3300 });
  const teen = { ...profile, age: 16 };
  const ci = runCheckIn(bulk, d, [{ off: true, dir: 'down' }], opts({ profile: teen }));
  assert.equal(ci.decision, 'at-limit');
  assert.equal(ci.newTargets, undefined);
});

test('rapid loss is flagged and the message does not cheer it on', () => {
  const cut = buildGoalPlan({ ...profile, weight: 80, target: 70, months: 6, startDate: START });
  const d = series({ rate: -1.2, intake: 1800, w0: 80 });
  const ci = runCheckIn(cut, d, [], opts({ targets: calcTargets({ ...profile, weight: 80, goal: 'lose', pace: 0.5 }) }));
  assert.ok(ci.flags.includes('rapid-loss'));
  assert.match(ci.message, /faster than a healthy pace/);
});

test('plateau: trend flat for three weeks while the plan expects movement', () => {
  const ci = runCheckIn(bulk, series({ rate: 0, intake: 2500 }), [], opts());
  assert.ok(ci.flags.includes('plateau'));
});

test('a maintenance phase expects zero change with a 0.1 kg/week tolerance', () => {
  const hold = buildGoalPlan({ ...profile, target: 60, months: 3, startDate: START });
  assert.equal(runCheckIn(hold, series({ rate: 0.05, intake: 2500 }), [], opts()).decision, 'on-track');
  assert.equal(runCheckIn(hold, series({ rate: 0.5, intake: 2900 }), [], opts()).decision, 'watch');
});

test('check-ins are due 7 days after the last one or after the plan started', () => {
  assert.equal(checkInDue(bulk, [], addDays(START, 6)), false);
  assert.equal(checkInDue(bulk, [], addDays(START, 7)), true);
  assert.equal(checkInDue(bulk, [{ date: addDays(START, 7) }], addDays(START, 13)), false);
  assert.equal(checkInDue(bulk, [{ date: addDays(START, 7) }], addDays(START, 14)), true);
  assert.equal(checkInDue(null, [], START), false);
});
