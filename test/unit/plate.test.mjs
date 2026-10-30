import test from 'node:test';
import assert from 'node:assert/strict';
import { planPlate, topUps, totals, estFat, dietOf, dietAllows } from '../../js/engine/plate.js';

const menu = [
  { n: 'Chicken curry', cal: 290, p: 28, c: 6 },
  { n: 'Egg masala (2 eggs)', cal: 190, p: 14, c: 4 },
  { n: 'Chapati x3 + Rice', cal: 400, p: 11, c: 78 },
  { n: 'Dal', cal: 160, p: 9, c: 22 },
  { n: 'Payasam', cal: 180, p: 4, c: 30 },
  { n: 'Veg fry', cal: 120, p: 3, c: 12, diet: 'v' },
];
const budget = { cal: 700, p: 40 };

test('dietOf classifies free-text dishes', () => {
  assert.equal(dietOf('Chicken curry'), 'n');
  assert.equal(dietOf('Egg roast'), 'e');
  assert.equal(dietOf('Dal tadka'), 'v');
  assert.equal(dietOf('Chicken (veg option)'), 'v');
});

test('dietAllows follows veg < egg < nonveg', () => {
  assert.ok(dietAllows('veg', 'v') && !dietAllows('veg', 'e') && !dietAllows('veg', 'n'));
  assert.ok(dietAllows('egg', 'e') && !dietAllows('egg', 'n'));
  assert.ok(dietAllows('nonveg', 'n'));
});

test('veg user never gets egg or meat servings', () => {
  const r = planPlate(menu, budget, { diet: 'veg', goal: 'maintain' });
  for (const p of r.picks) assert.equal(p.diet, 'v', p.item.n);
  assert.ok(r.skipped.some(m => m.n === 'Chicken curry'));
});

test('egg user never gets non-veg servings', () => {
  const r = planPlate(menu, budget, { diet: 'egg', goal: 'maintain' });
  assert.ok(r.picks.every(p => p.diet !== 'n'));
});

test('desserts are capped at one serving', () => {
  const r = planPlate(menu, { cal: 2500, p: 150 }, { diet: 'nonveg', goal: 'gain' });
  const d = r.picks.find(p => p.item.n === 'Payasam');
  assert.ok(!d || d.servings <= 1);
});

test('servings stay on 0.5 steps and within caps', () => {
  const r = planPlate(menu, budget, { diet: 'nonveg', goal: 'maintain' });
  for (const p of r.picks) {
    assert.equal(p.servings % 0.5, 0);
    assert.ok(p.servings > 0 && p.servings <= 3);
  }
});

test('the plate lands near the calorie budget', () => {
  const r = planPlate(menu, budget, { diet: 'nonveg', goal: 'maintain' });
  assert.ok(Math.abs(r.totals.cal - budget.cal) / budget.cal < 0.3, `${r.totals.cal}`);
});

test('a cut avoids dessert, a bulk eats more than a cut on the same menu', () => {
  const lose = planPlate(menu, budget, { diet: 'nonveg', goal: 'lose' });
  const gain = planPlate(menu, { cal: 1000, p: 40 }, { diet: 'nonveg', goal: 'gain' });
  assert.ok(!lose.picks.some(p => p.item.n === 'Payasam'));
  assert.ok(gain.totals.cal > lose.totals.cal);
});

test('gain allows up to 3 servings of a staple, a cut only 2', () => {
  const rice = [{ n: 'Plain rice', cal: 200, p: 4, c: 44 }];
  const gain = planPlate(rice, { cal: 900, p: 20 }, { goal: 'gain' });
  const lose = planPlate(rice, { cal: 900, p: 20 }, { goal: 'lose' });
  assert.equal(gain.picks[0].servings, 3);
  assert.equal(lose.picks[0].servings, 2);
});

test('an all-meat menu for a veg user returns an empty plate, not a crash', () => {
  const r = planPlate([{ n: 'Chicken curry', cal: 290, p: 28, c: 6 }], budget, { diet: 'veg' });
  assert.deepEqual(r.picks, []);
  assert.equal(r.skipped.length, 1);
});

test('totals sums items and estimates fat when missing', () => {
  const t = totals([{ cal: 200, p: 10, c: 20, f: 5, price: 10 }, { cal: 300, p: 20, c: 10 }]);
  assert.equal(t.cal, 500);
  assert.equal(t.price, 10);
  assert.equal(t.f, 5 + estFat({ cal: 300, p: 20, c: 10 }));
});

test('estFat never goes negative', () => {
  assert.equal(estFat({ cal: 100, p: 30, c: 30 }), 0);
});

test('topUps respects diet and returns the requested limit', () => {
  const veg = topUps({ cal: 300, p: 30 }, { diet: 'veg', limit: 4 });
  assert.equal(veg.length, 4);
  assert.ok(veg.every(t => t.food.diet === 'v'));
});

test('topUps for a big protein gap skips low-protein items', () => {
  const t = topUps({ cal: 300, p: 40 }, { diet: 'nonveg', limit: 20 });
  assert.ok(t.length > 0 && t.every(x => x.p >= 4));
});
