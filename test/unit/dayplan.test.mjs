import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDayPlan, rebudget, diffDayPlans, notable, describeChange, mealTotals, proteinCoverage, MEAL_CAP, MEAL_IDS } from '../../js/engine/dayplan.js';
import { calcTargets } from '../../js/engine/targets.js';

const profile = { diet: 'nonveg', goal: 'gain', mess: 'CNV' };
const targets = calcTargets({ sex: 'male', age: 20, height: 175, weight: 65, activity: 'moderate', goal: 'gain', pace: 0.25 });
const it = (n, cal, p, c = 20, diet) => ({ n, cal, p, c, f: Math.max(0, (cal - 4 * p - 4 * c) / 9), ...(diet ? { diet } : {}) });

const MENU = {
  breakfast: [it('Idli', 60, 2, 12), it('Vada', 150, 4, 14), it('Sambar', 70, 3, 10), it('Boiled egg', 78, 6, 1)],
  lunch: [it('Rice', 200, 4, 44), it('Chapati', 100, 3, 18), it('Dal', 160, 9, 20), it('Egg masala', 190, 14, 6), it('Curd', 60, 3, 5)],
  snacks: [it('Tea', 50, 1, 8), it('Bajji', 160, 3, 18)],
  dinner: [it('Chapati', 100, 3, 18), it('Paneer butter masala', 330, 16, 12)],
};
const menus = (over = {}) => ({ meals: { ...MENU, ...over }, special: null, source: 'shared', version: 1, hasAny: true });
const day = (...items) => ({ items });
const eaten = (meal, cal, p) => ({ id: meal + cal, n: 'Something', meal, cal, p, c: 0, f: 0, diet: 'v', cat: 'custom' });
const build = (extra = {}) => buildDayPlan({ date: '2026-03-02', profile, targets, menus: menus(), logged: day(), ...extra });
const meal = (plan, id) => plan.meals.find(m => m.id === id);

test('a fresh plan has the four mess meals with windows, budgets and plates', () => {
  const p = build();
  assert.deepEqual(p.meals.map(m => m.id), MEAL_IDS);
  assert.equal(p.version, 1); assert.equal(p.reason, 'initial');
  for (const m of p.meals) {
    assert.equal(m.status, 'upcoming');
    assert.equal(m.source.kind, 'mess'); assert.equal(m.source.messId, 'CNV');
    assert.ok(m.window[0] < m.window[1]);
    assert.ok(m.plate.length > 0, m.id);
    assert.ok(m.budget.cal > 0 && m.budget.p > 0);
  }
  const sum = p.meals.reduce((a, m) => a + m.budget.cal, 0);
  assert.ok(Math.abs(sum - targets.cal) <= 20, `${sum} vs ${targets.cal}`);
});

test('a vegetarian never gets non-veg dishes, in plates or top-ups', () => {
  const p = build({ profile: { ...profile, diet: 'veg' }, menus: menus({ lunch: [...MENU.lunch, it('Chicken curry', 250, 25, 5)] }) });
  const names = p.meals.flatMap(m => [...m.plate, ...m.others].map(x => x.name));
  assert.ok(!names.includes('Chicken curry') && !names.includes('Boiled egg') && !names.includes('Egg masala'));
  assert.ok(p.meals.flatMap(m => m.topUps).every(t => !/chicken|egg/i.test(t.name)));
});

test('a meal with no menu is empty, not an error', () => {
  const p = build({ menus: menus({ snacks: [] }) });
  assert.equal(meal(p, 'snacks').plate.length, 0);
  assert.ok(p.notes.some(n => /No menu for snacks/.test(n)));
});

test('"not this today": an override replaces that meal only, and is marked custom', () => {
  const p = build({ overrides: { dinner: [it('Egg curry', 220, 15, 6), it('Rice', 200, 4, 44)] } });
  assert.equal(meal(p, 'dinner').source.kind, 'custom');
  assert.ok(meal(p, 'dinner').plate.some(x => x.name === 'Egg curry'));
  assert.equal(meal(p, 'lunch').source.kind, 'mess');
  assert.ok(!meal(p, 'dinner').plate.some(x => x.name === 'Paneer butter masala'));
});

// ---------- budgets, missed meals, caps ----------
test('a skipped breakfast redistributes its budget over the other meals, within the 45 % cap', () => {
  const base = build();
  const p = build({ skipped: ['breakfast'] });
  assert.equal(meal(p, 'breakfast').status, 'skipped');
  for (const id of ['lunch', 'snacks', 'dinner']) assert.ok(meal(p, id).budget.cal > meal(base, id).budget.cal, id);
  for (const m of p.meals) assert.ok(m.budget.cal <= targets.cal * MEAL_CAP + 1, `${m.id} ${m.budget.cal}`);
});

test('the clock skips meals whose window has passed with nothing logged', () => {
  const p = build({ nowMin: 15 * 60 });                     // 3 pm: breakfast and lunch are over
  assert.equal(meal(p, 'breakfast').status, 'skipped');
  assert.equal(meal(p, 'lunch').status, 'skipped');
  assert.equal(meal(p, 'snacks').status, 'upcoming');
  assert.equal(build({ nowMin: -1 }).meals.every(m => m.status === 'upcoming'), true, 'other dates are never "missed"');
});

test('with only dinner left, it still cannot take more than 45 % of the day', () => {
  const p = build({ skipped: ['breakfast', 'lunch', 'snacks'] });
  assert.ok(meal(p, 'dinner').budget.cal <= Math.round(targets.cal * MEAL_CAP));
});

test('logging a big breakfast shrinks what is left, and the logged meal is frozen', () => {
  const p0 = build();
  const logged = day(eaten('breakfast', 900, 20));
  const p1 = rebudget(p0, logged);
  assert.equal(meal(p1, 'breakfast').status, 'logged');
  assert.deepEqual(meal(p1, 'breakfast').plate, meal(p0, 'breakfast').plate, 'logged meals keep their plate');
  assert.ok(meal(p1, 'lunch').budget.cal < meal(p0, 'lunch').budget.cal);
  assert.equal(p1.reason, 'logged-off-plan');
});

test('a meal logged far under its share is "partial"', () => {
  const p = rebudget(build(), day(eaten('breakfast', 100, 2)));
  assert.equal(meal(p, 'breakfast').status, 'partial');
});

test('editing the menu of an already-logged meal does not change that meal', () => {
  const logged = day(eaten('dinner', 700, 30));
  const before = build({ logged });
  const after = build({ logged, prev: before, menus: menus({ dinner: [it('Aloo gobi', 150, 3, 18), it('Chapati', 100, 3, 18)] }) });
  assert.deepEqual(meal(after, 'dinner').plate, meal(before, 'dinner').plate);
  assert.deepEqual(diffDayPlans(before, after).filter(d => d.meal === 'dinner'), []);
});

// ---------- diffs and the banner ----------
const ALOO = menus({ dinner: [it('Chapati', 100, 3, 18), it('Aloo gobi', 150, 3, 18)] });

test('paneer → aloo changes dinner, drops protein by ≥ 5 g and is notable', () => {
  const a = build(), b = build({ menus: ALOO, prev: a, reason: 'menu-change' });
  const diffs = diffDayPlans(a, b);
  const d = diffs.find(x => x.meal === 'dinner');
  assert.ok(d.removed.includes('Paneer butter masala') && d.added.includes('Aloo gobi'));
  assert.ok(d.dP <= -5, `dP ${d.dP}`);
  assert.equal(notable(diffs).length > 0, true);
});

test('the protein lost at dinner is made up with a top-up at snacks', () => {
  const b = build({ menus: ALOO });
  assert.ok(meal(b, 'snacks').topUps.length > 0, 'snacks gained a top-up');
  assert.equal(meal(b, 'dinner').topUps.length, 0);
  assert.ok(b.notes.some(n => /moved to snacks/.test(n)));
  const a = build();
  const diffs = diffDayPlans(a, build({ menus: ALOO, prev: a }));
  const text = describeChange(notable(diffs));
  assert.match(text, /Dinner changed: Paneer butter masala → Aloo gobi/);
  assert.match(text, /Protein −\d+ g, so we added .* at snacks\./);
});

test('once the snacks window has passed, the top-up stays at dinner', () => {
  const b = build({ menus: ALOO, nowMin: 18 * 60 });
  assert.equal(meal(b, 'snacks').status, 'skipped');
  assert.ok(meal(b, 'dinner').topUps.length > 0);
});

test('a small change (< 5 g protein and < 100 kcal) is not notable', () => {
  const a = build();
  const b = build({ menus: menus({ breakfast: [...MENU.breakfast.slice(0, 3), it('Boiled egg', 80, 6, 1)] }), prev: a });
  assert.deepEqual(notable(diffDayPlans(a, b)), []);
});

test('identical plans diff to nothing', () => {
  assert.deepEqual(diffDayPlans(build(), build()), []);
});

test('week-grid coverage is plate protein over the meal share', () => {
  const p = build();
  for (const id of ['breakfast', 'lunch', 'dinner']) assert.ok(proteinCoverage(meal(p, id)) > 0.5, id);
  assert.equal(proteinCoverage(meal(build({ menus: menus({ snacks: [] }) }), 'snacks')), null);
  assert.ok(mealTotals(meal(p, 'lunch')).cal > 0);
});
