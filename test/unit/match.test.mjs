import test from 'node:test';
import assert from 'node:assert/strict';
import { matchItem, macrosOf, sumMacros, scaleItem, judge, suggestOverride, toLogged, menuToText, labelToFood, nameScore } from '../../js/engine/match.js';

const MENU = [
  { n: 'Chicken biryani', cal: 450, p: 22, c: 55, f: 15, diet: 'n' }, { n: 'Raita', cal: 70, p: 3, c: 6, f: 3, diet: 'v' },
  { n: 'Mirchi ka salan', cal: 120, p: 3, c: 8, f: 8, diet: 'v' }, { n: 'Boiled egg', cal: 78, p: 6, c: 1, f: 5, diet: 'e' },
];
const FOODS = [{ id: 'steamed-rice', n: 'Steamed Rice', k: [130, 2.7, 28, 0.3], sizes: [['1 katori', 150]], diet: 'v' }, { id: 'lays', n: 'Magic Masala', brand: 'Lay’s', k: [536, 6.5, 53, 33], sizes: [['pack', 50]], diet: 'v' }];
const search = q => FOODS.filter(f => nameScore(q, `${f.brand || ''} ${f.n}`) > 0 || q.toLowerCase().includes(f.n.toLowerCase()));
const rec = (o) => ({ name: 'x', grams: 200, cooking: 'curry', visible_fat: 'some', confidence: 'high', ...o });

test('a named menu candidate wins and brings the mess macros', () => {
  const it = matchItem(rec({ name: 'biryani', matched_candidate: 'Chicken biryani', grams: 350 }), { candidates: MENU, search });
  assert.equal(it.source, 'menu'); assert.equal(it.name, 'Chicken biryani'); assert.equal(it.conf, 'matched'); assert.equal(it.est, false);
  assert.deepEqual(macrosOf(it), { cal: 450, p: 22, c: 55, f: 15 });
});

test('a count of servings multiplies the menu macros', () => {
  const it = matchItem(rec({ name: 'Boiled egg', count: 2, grams: 100 }), { candidates: MENU, search });
  assert.equal(macrosOf(it).cal, 156);
});

test('fuzzy: "raita bowl" finds Raita; an unrelated dish does not borrow a candidate', () => {
  assert.equal(matchItem(rec({ name: 'raita bowl' }), { candidates: MENU, search }).name, 'Raita');
  assert.notEqual(matchItem(rec({ name: 'Paneer tikka' }), { candidates: MENU, search }).source, 'menu');
});

test('no candidate: the food database supplies macros per 100 g × grams', () => {
  const it = matchItem(rec({ name: 'steamed rice', grams: 200 }), { candidates: [], search });
  assert.equal(it.source, 'db'); assert.equal(it.fid, 'steamed-rice'); assert.equal(it.est, false);
  assert.deepEqual(macrosOf(it), { cal: 260, p: 5.4, c: 56, f: 0.6 });
});

test('last resort: the model’s own per-100 g guess, marked as an estimate', () => {
  const it = matchItem(rec({ name: 'Mystery gravy', grams: 100, confidence: 'medium', est_per_100g: { kcal: 150, p: 5, c: 10, f: 9 } }), { candidates: [], search: () => [] });
  assert.equal(it.source, 'estimate'); assert.equal(it.est, true); assert.equal(it.conf, 'est'); assert.equal(macrosOf(it).cal, 150);
  const low = matchItem(rec({ name: 'Mystery', confidence: 'low', est_per_100g: { kcal: 100, p: 1, c: 1, f: 1 } }), { candidates: [], search: () => [] });
  assert.equal(low.conf, 'low');
  const none = matchItem(rec({ name: 'Mystery' }), { candidates: [], search: () => [] });
  assert.equal(none.source, 'unknown'); assert.equal(macrosOf(none).cal, 0);
});

test('portion chips scale from the recognised amount, not from each other', () => {
  const it = matchItem(rec({ name: 'steamed rice', grams: 200 }), { candidates: [], search });
  const half = scaleItem(it, 0.5), twice = scaleItem(half, 2);
  assert.equal(half.grams, 100); assert.equal(twice.grams, 400); assert.equal(scaleItem(twice, 1).grams, 200);
  const m = scaleItem(matchItem(rec({ name: 'Raita', count: 1 }), { candidates: MENU, search }), 1.5);
  assert.equal(macrosOf(m).cal, 105);
  assert.equal(sumMacros([half, m]).cal, 130 + 105);
});

test('non-food, unusable and all-low-confidence photos get a retake prompt, never a table', () => {
  assert.equal(judge({ is_food: false, usable: true, items: [] }).reason, 'not-food');
  assert.equal(judge({ is_food: true, usable: false, retake_hint: 'Too dark', items: [{ confidence: 'high' }] }).hint, 'Too dark');
  assert.equal(judge({ is_food: true, usable: true, items: [] }).reason, 'empty');
  assert.equal(judge({ is_food: true, usable: true, items: [{ confidence: 'low' }, { confidence: 'low' }] }).reason, 'unsure');
  assert.equal(judge({ is_food: true, usable: true, items: [{ confidence: 'low' }, { confidence: 'high' }] }).ok, true);
  assert.equal(judge(null).ok, false);
});

test('a plate that is not on the menu proposes a menu fix; a matching plate does not', () => {
  const off = ['Paneer tikka', 'Jeera rice', 'Dal fry'].map(n => matchItem(rec({ name: n, est_per_100g: { kcal: 150, p: 6, c: 15, f: 7 } }), { candidates: MENU, search: () => [] }));
  const fix = suggestOverride(off, MENU);
  assert.equal(fix.length, 3); assert.ok(fix.every(x => x.n && x.cal > 0));
  const on = ['Chicken biryani', 'Raita'].map(n => matchItem(rec({ name: n }), { candidates: MENU, search }));
  assert.equal(suggestOverride(on, MENU), null);
  assert.equal(suggestOverride(off, []), null, 'no menu, nothing to fix');
  assert.equal(suggestOverride(off.slice(0, 1), MENU), null);
});

test('logged items carry photo provenance and confidence', () => {
  const l = toLogged(matchItem(rec({ name: 'steamed rice', grams: 150 }), { candidates: [], search }), 'lunch');
  assert.equal(l.src, 'photo'); assert.equal(l.conf, 'high'); assert.equal(l.est, false); assert.equal(l.meal, 'lunch'); assert.equal(l.cal, 195); assert.equal(l.fid, 'steamed-rice');
});

test('menu chart → paste-a-week text, label → custom food', () => {
  const t = menuToText({ Monday: { breakfast: [{ n: 'Idli' }, { n: 'Sambar' }], lunch: [], snacks: [{ n: 'Tea' }], dinner: [{ n: 'Chapati' }] } });
  assert.equal(t, 'MONDAY\nBreakfast: Idli, Sambar\nSnacks: Tea\nDinner: Chapati');
  const f = labelToFood({ is_label: true, product: 'Magic Masala', brand: 'Lays', per_100: { kcal: 536, protein_g: 6.5, carbs_g: 53, fat_g: 33 }, serving_size: '1 pack (50 g)', serving_grams: 50, diet_mark: 'veg', energy_converted: false, unreadable_fields: [] });
  assert.deepEqual(f.per100, { cal: 536, p: 6.5, c: 53, f: 33 }); assert.equal(f.diet, 'v');
  const g = labelToFood({ is_label: true, per_serving: { kcal: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }, serving_grams: 40, diet_mark: 'nonveg' });
  assert.deepEqual(g.per100, { cal: 250, p: 5, c: 50, f: 2.5 }); assert.equal(g.diet, 'n');
  assert.equal(labelToFood({ is_label: true }), null);
});
