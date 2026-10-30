import test from 'node:test';
import assert from 'node:assert/strict';
import { checkExplanation, coachNumbersOk, gramsError, inventedNumbers, median, recallPrecision } from '../evals/metrics.ts';

test('recall and precision match names loosely', () => {
  assert.deepEqual(recallPrecision(['Steamed Rice', 'Dal tadka', 'Papad'], ['rice', 'dal', 'chapati']), { recall: 2 / 3, precision: 2 / 3 });
  assert.deepEqual(recallPrecision([], []), { recall: 1, precision: 1 });
});

test('portion error: a range counts anything inside it as exact', () => {
  assert.equal(gramsError(350, [300, 450]), 0);
  assert.ok(Math.abs(gramsError(150, 100) - 0.5) < 1e-9);
  assert.ok(gramsError(200, [300, 450]) > 0.25);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('an explanation may not invent numbers', () => {
  const input = { numbers: { cal: 700, flex: 600 }, portion: 0.5 };
  assert.deepEqual(inventedNumbers('A plate is 700 kcal, more than the 600 you have. Have half.', input), []);
  assert.deepEqual(inventedNumbers('That is 700 kcal, about 1,200 over.', input), ['1200']);
  assert.deepEqual(inventedNumbers('Have 50% of it.', input), []);
});

test('explainer checks: contradiction, shaming, length', () => {
  const input = { numbers: { cal: 700 } };
  assert.deepEqual(checkExplanation('smaller', 'Have half; 700 kcal is a lot today.', input), []);
  assert.ok(checkExplanation('skip', 'Go ahead and enjoy it.', input).includes('contradicts the verdict'));
  assert.ok(checkExplanation('go', 'This is junk food.', input).includes('shaming word'));
  assert.ok(checkExplanation('go', 'word '.repeat(70), input).some(p => p.startsWith('too long')));
});

test('coach numbers must come from the packet', () => {
  const packet = { targets: { cal: 2800, p: 140 }, eaten: { cal: 2500 } };
  assert.deepEqual(coachNumbersOk('You are 300 kcal short of 2800.', packet).sort(), [300]);
  assert.deepEqual(coachNumbersOk('Aim for 2,800 kcal and 140 g protein.', packet), []);
});

import { parseLines, summarize, p95 } from '../evals/logstats.ts';

test('log stats: quota rate, schema failures and P95 per route', () => {
  const lines = [
    ...Array.from({ length: 18 }, (_, i) => JSON.stringify({ route: '/ai/vision/meal', ok: true, ms: 1000 + i * 100, quota: false })),
    JSON.stringify({ route: '/ai/vision/meal', ok: false, code: 'quota', quota: true, ms: 200 }),
    JSON.stringify({ route: '/ai/vision/meal', ok: false, code: 'invalid_output', quota: false, ms: 3000 }),
    'noise that is not a log line', '2026-06-01 {"hello":1}',
  ].join('\n');
  const [s] = summarize(parseLines(lines));
  assert.equal(s.calls, 20);
  assert.equal(s.quotaPct, 5);
  assert.equal(s.schemaFailPct, 5);
  assert.equal(s.p95ms, 2700);
  assert.equal(p95([]), 0);
});
