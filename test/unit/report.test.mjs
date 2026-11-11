import test from 'node:test';
import assert from 'node:assert/strict';
import { weekReport, shareText, weakestMeal, MIN_DAYS } from '../../js/engine/report.js';

const T = { cal: 2800, p: 140, water: 3000 };
const item = (cal, p, meal = 'lunch', price = 0) => ({ n: 'Food', cal, p, c: cal / 8, f: cal / 30, meal, price });
const day = (key, cal, p, extra = {}) => ({ key, items: cal ? [item(cal, p)] : [], water: 0, gymDone: [], sets: {}, ...extra });
const week = (from = 1) => Array.from({ length: 7 }, (_, i) => `2026-06-0${from + i}`);

test('a good week reads as a good week', () => {
  const r = weekReport({ days: week().map((k, i) => day(k, 2800, 145, { weight: 65 + i * 0.05, gymDone: ['push'] })), targets: T, profile: { goal: 'gain' } });
  assert.equal(r.enough, true);
  assert.equal(r.logged, 7);
  assert.equal(r.cal.avg, 2800);
  assert.equal(r.protein.hit, 7);
  assert.equal(r.trained, 7);
  assert.equal(r.weight.change, 0.3);
  assert.match(r.highlight, /[Pp]rotein/);
  assert.equal(r.fix, 'Nothing to fix. Keep doing exactly this.');
});

test('under three logged days it says so instead of averaging noise', () => {
  const days = week().map((k, i) => day(k, i < 2 ? 2600 : 0, i < 2 ? 130 : 0));
  const r = weekReport({ days, targets: T, profile: {} });
  assert.equal(r.enough, false);
  assert.equal(r.logged, 2);
  assert.match(r.highlight, /logged 2 of 7/);
  assert.match(r.fix, /three days/);
  assert.ok(MIN_DAYS === 3);
});

test('unlogged days never count as days on target', () => {
  const days = week().map((k, i) => day(k, i < 4 ? 2800 : 0, i < 4 ? 140 : 0));
  const r = weekReport({ days, targets: T, profile: {} });
  assert.equal(r.cal.onTarget, 4, 'only the four logged days');
  assert.equal(r.protein.hit, 4);
  assert.equal(r.cal.avg, 2800, 'the average ignores empty days rather than dragging to zero');
});

test('the fix names the biggest single problem, in priority order', () => {
  const lowP = weekReport({ days: week().map(k => day(k, 2800, 70)), targets: T, profile: { goal: 'gain' } });
  assert.match(lowP.fix, /70 g short on protein|short on protein/);

  const underEating = weekReport({ days: week().map(k => day(k, 2000, 140)), targets: T, profile: { goal: 'gain' } });
  assert.match(underEating.fix, /under target/);

  const overEating = weekReport({ days: week().map(k => day(k, 3400, 140)), targets: { ...T, cal: 2000 }, profile: { goal: 'lose' } });
  assert.match(overEating.fix, /over target/);

  const gaps = weekReport({ days: week().map((k, i) => day(k, i < 5 ? 2800 : 0, i < 5 ? 140 : 0)), targets: T, profile: { goal: 'maintain' } });
  assert.match(gaps.fix, /missed logging 2 days/);
});

test('best and worst days are named', () => {
  const days = [day('2026-06-01', 2800, 145), day('2026-06-02', 900, 30), day('2026-06-03', 2750, 142)];
  const r = weekReport({ days, targets: T, profile: {} });
  assert.equal(r.best.day, 'Mon');
  assert.equal(r.worst.day, 'Tue');
  assert.equal(r.worst.cal, 900);
});

test('weight needs two weigh-ins; one is not a trend', () => {
  const one = weekReport({ days: week().map((k, i) => day(k, 2800, 140, i === 0 ? { weight: 65 } : {})), targets: T, profile: {} });
  assert.equal(one.weight, null);
  const two = weekReport({ days: week().map((k, i) => day(k, 2800, 140, i % 6 === 0 ? { weight: 65 + i / 6 } : {})), targets: T, profile: {} });
  assert.equal(two.weight.change, 1);
  assert.equal(two.weight.weighIns, 2);
});

test('an empty week does not crash and shares nothing', () => {
  const r = weekReport({ days: [], targets: T, profile: {} });
  assert.equal(r.logged, 0);
  assert.equal(r.range, null);
  assert.equal(r.best, null);
  assert.equal(shareText(r), '');
});

test('the share text is short, plain and quotes only real numbers', () => {
  const r = weekReport({ days: week().map((k, i) => day(k, 2800, 145, { weight: 65 + i * 0.05 })), targets: T, profile: { goal: 'gain' }, stats: { streak: 9, badges: [] } });
  const txt = shareText(r, { name: 'Asha', appUrl: 'https://example.test' });
  assert.match(txt, /Asha’s week/);
  assert.match(txt, /7\/7 days logged · 9-day streak/);
  assert.match(txt, /Calories: 2800 avg \(target 2800\)/);
  assert.match(txt, /Weight: \+0\.3 kg/);
  assert.ok(txt.split('\n').length <= 12, 'short enough to paste');
  assert.doesNotMatch(txt, /NaN|undefined|Infinity/);
  // every number in the text must be one the report computed
  const allowed = new Set([7, 9, 2800, 145, 140, 0.3, 65, 65.3, 2026, 6]);
  for (const n of txt.match(/\d+(\.\d+)?/g).map(Number)) assert.ok(allowed.has(n), `${n} is not a number from the report`);
});

test('the meal most often skipped is named, but only when it is a habit', () => {
  const meals = ms => ({ items: ms.map(m => item(300, 15, m)), water: 0, gymDone: [], sets: {} });
  const days = [
    { key: '2026-06-01', ...meals(['lunch', 'dinner']) },
    { key: '2026-06-02', ...meals(['lunch', 'dinner']) },
    { key: '2026-06-03', ...meals(['breakfast', 'lunch', 'snacks', 'dinner']) },
  ];
  const w = weakestMeal(days);
  assert.equal(w.meal, 'breakfast');
  assert.equal(w.missed, 2);
  assert.equal(weakestMeal([days[2]]), null, 'one miss is not a habit');
  assert.equal(weakestMeal([]), null);
});
