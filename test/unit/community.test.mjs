import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dishKey, ratingId, aggregate, topBottom, scorecard, proteinStreak, sortBoard, cleanGroup, MIN_VOTES } from '../../js/engine/community.js';

const d = (n, cal, p, diet) => ({ n, cal, p, c: 20, f: 5, ...(diet ? { diet } : {}) });

test('ids are stable and unique per user, dish and day', () => {
  assert.equal(dishKey('Paneer Butter Masala!'), 'paneer-butter-masala');
  assert.equal(ratingId('CNV', '2026-06-01', 'Rajma', 'u1'), 'CNV_2026-06-01_rajma_u1');
  assert.notEqual(ratingId('CNV', '2026-06-01', 'Rajma', 'u1'), ratingId('CNV', '2026-06-02', 'Rajma', 'u1'));
});

test('ratings aggregate per dish and only rank dishes with enough votes', () => {
  const r = (dish, v, date = '2026-06-01') => ({ dish, dishKey: dishKey(dish), v, date });
  const agg = aggregate([r('Rajma', 5), r('Rajma', 5), r('Rajma', 3), r('Bland dal', 1), r('Bland dal', 1), r('Bland dal', 3), r('Once only', 5)]);
  assert.equal(agg.find(a => a.dish === 'Rajma').avg, 4.33);
  const tb = topBottom(agg);
  assert.deepEqual(tb.top.map(a => a.dish), ['Rajma', 'Bland dal']);
  assert.deepEqual(tb.bottom.map(a => a.dish), ['Bland dal']);
  assert.equal(tb.unranked, 1, `"Once only" has fewer than ${MIN_VOTES} votes`);
  assert.deepEqual(aggregate([{ dish: 'x', v: 9 }]), [], 'out-of-range values are ignored');
});

const WEEK = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => [day, {
  breakfast: [d('Idli', 60, 2), d('Sambar', 60, 3)], lunch: [d('Rice', 200, 4), d('Dal', 160, 9), d('Curd', 60, 3)],
  snacks: [d('Samosa', 260, 5), d('Tea', 50, 1)], dinner: day === 'Tuesday' ? [d('Chapati', 100, 3), d('Aloo gobi', 150, 3), d('Chicken curry', 250, 25, 'n')] : [d('Chapati', 100, 3), d('Paneer curry', 300, 16)],
}]));

test('the scorecard flags a meal with no protein dish for veg students, fried food and repeats', () => {
  const sc = scorecard(WEEK, { proteinTarget: 100 });
  assert.equal(sc.days.length, 7);
  assert.ok(sc.suggestions.some(s => /Tuesday dinner has no protein dish for veg students/.test(s)), sc.suggestions.join('|'));
  assert.equal(sc.fried, 7, 'a samosa a day');
  assert.ok(sc.repeats.some(r => r.dish === 'Samosa' && r.days === 7));
  assert.ok(sc.repeats.every(r => !/^rice|^tea/i.test(r.dish)), 'staples are not "repeats"');
  const tue = sc.days.find(x => x.day === 'Tuesday');
  assert.ok(tue.protein > tue.vegProtein, 'non-veg protein is counted separately');
  assert.equal(scorecard({}).days.length, 0);
});

test('protein streak counts consecutive days at 90 % and forgives an unfinished today', () => {
  const days = [{ p: 20, done: false }, { p: 100 }, { p: 95 }, { p: 40 }, { p: 100 }];
  assert.equal(proteinStreak(days, 100), 2);
  assert.equal(proteinStreak([{ p: 20, done: true }, { p: 100 }], 100), 0);
  assert.equal(proteinStreak([{ p: 100, done: false }, { p: 100 }, { p: 100 }], 100), 3);
});

test('challenge boards sort by the chosen metric; group codes are clean', () => {
  const rows = [{ id: 'a', xp: 10, streak: 9, pStreak: 1 }, { id: 'b', xp: 50, streak: 2, pStreak: 8 }];
  assert.equal(sortBoard(rows, 'xp')[0].id, 'b'); assert.equal(sortBoard(rows, 'streak')[0].id, 'a'); assert.equal(sortBoard(rows, 'protein')[0].id, 'b');
  assert.equal(cleanGroup(' hostel-7b! '), 'HOSTEL7B');
  assert.equal(cleanGroup('x'.repeat(40)).length, 12);
});

test('rules: dish ratings are create-only, bound to the rater, and the leaderboard allows the new fields', () => {
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const block = rules.slice(rules.indexOf('match /dishRatings/{id}'), rules.indexOf('match /reports/{id}'));
  assert.match(block, /allow update: if false/);
  assert.match(block, /allow delete: if signedIn\(\) && resource\.data\.uid == request\.auth\.uid/);
  assert.match(block, /request\.resource\.data\.uid == request\.auth\.uid/);
  assert.match(block, /id == request\.resource\.data\.mess \+ '_' \+ request\.resource\.data\.date/);
  assert.match(block, /v >= 1 && request\.resource\.data\.v <= 5/);
  assert.match(rules, /'pStreak', 'group'/);
});
