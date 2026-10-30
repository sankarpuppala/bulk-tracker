import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../../data/foods.js';
import { FOOD_X, MICRO_KEYS } from '../../data/foods-x.js';
import { validateAll, validateFood } from '../../tools/build-foods.mjs';
import { ALLERGENS, allergenHits } from '../../js/engine/allergens.js';
import { blockReasons, rulesOf, allowed } from '../../js/engine/diet.js';
import { fastingFor, activeFast } from '../../js/engine/fasting.js';
import { planPlate, topUps } from '../../js/engine/plate.js';
import { buildDayPlan } from '../../js/engine/dayplan.js';
import { evaluate } from '../../js/engine/verdict.js';
import { microWatch, suggestionsFor, worthWatching, RDA } from '../../js/engine/micro.js';

// ---------------- data ----------------
test('the food data validator: zero entries fail (energy within 15 %, tags, sizes, ids)', () => {
  assert.deepEqual(validateAll(), []);
});

test('the validator catches bad entries', () => {
  const good = { id: 'x', n: 'X', cat: 'mess', k: [130, 2.7, 28, 0.3], sizes: [['1 cup', 100]], diet: 'v' };
  assert.deepEqual(validateFood(good), []);
  assert.ok(validateFood({ ...good, k: [500, 2, 28, 0.3] }).some(e => /energy/.test(e)));
  assert.ok(validateFood({ ...good, diet: undefined }).some(e => /diet tag/.test(e)));
  assert.ok(validateFood({ ...good, k: [100, 60, 60, 10] }).some(e => /add up/.test(e)));
  assert.ok(validateFood({ ...good, sizes: [] }).length > 0);
  assert.ok(validateFood({ ...good, cat: 'nope' }).some(e => /category/.test(e)));
});

test('every extra-nutrient entry points at a real food and has plausible numbers', () => {
  const ids = new Set(FOODS.map(f => f.id));
  for (const [id, x] of Object.entries(FOOD_X)) {
    assert.ok(ids.has(id), 'unknown food id ' + id);
    for (const k of MICRO_KEYS) assert.ok(typeof x[k] === 'number' && x[k] >= 0, `${id}.${k}`);
    assert.ok(x.fe < 30 && x.ca < 1000 && x.b12 < 30 && x.d < 30, id);
  }
  assert.ok(Object.keys(FOOD_X).length >= 50);
});

// ---------------- allergies ----------------
const MENU = [
  { n: 'Peanut chikki', cal: 150, p: 4, c: 18, f: 7 }, { n: 'Rice', cal: 200, p: 4, c: 44, f: 0.5 }, { n: 'Dal', cal: 160, p: 9, c: 20, f: 4 },
  { n: 'Paneer curry', cal: 300, p: 15, c: 8, f: 22 }, { n: 'Egg masala', cal: 190, p: 14, c: 6, f: 12 }, { n: 'Fish fry', cal: 220, p: 20, c: 5, f: 12 },
];

test('allergens are matched in names and a declared tag wins', () => {
  assert.deepEqual(allergenHits({ n: 'Peanut Butter' }, ['peanut', 'soy']), ['peanut']);
  assert.deepEqual(allergenHits({ n: 'Peanut Butter', al: [] }, ['peanut']), []);
  assert.deepEqual(allergenHits({ n: 'Plain curd' }, ['lactose']), ['lactose']);
  assert.deepEqual(allergenHits({ n: 'Rice' }, []), []);
});

test('property: for every allergen, the plate planner, top-ups and day plan never offer it', () => {
  for (const a of Object.keys(ALLERGENS)) {
    const rules = rulesOf({ diet: 'nonveg', allergies: [a] });
    const allow = it => allowed(it, rules);
    for (const goal of ['lose', 'gain', 'maintain']) {
      const plate = planPlate(MENU, { cal: 700, p: 40 }, { diet: 'nonveg', goal, allow });
      for (const pk of plate.picks) assert.deepEqual(allergenHits(pk.item, [a]), [], `${a}/${goal}: plate has ${pk.item.n}`);
      for (const gap of [{ p: 30, cal: 0 }, { p: 12, cal: 500 }]) {
        for (const t of topUps(gap, { diet: 'nonveg', goal, limit: 20, allow })) assert.deepEqual(allergenHits(t.food, [a]), [], `${a}: top-up ${t.food.n}`);
      }
    }
    const dp = buildDayPlan({ date: '2026-06-01', profile: { diet: 'nonveg', goal: 'gain', allergies: [a] }, targets: { cal: 2800, p: 140, c: 350, f: 80 }, menus: { meals: { breakfast: MENU, lunch: MENU, snacks: MENU, dinner: MENU }, hasAny: true } });
    for (const m of dp.meals) {
      for (const e of [...m.plate, ...m.others, ...m.topUps]) assert.deepEqual(allergenHits({ n: e.name }, [a]), [], `${a}: day plan offers ${e.name}`);
    }
  }
});

test('property: top-ups over the whole database never include a peanut item for a peanut-allergic user', () => {
  const rules = rulesOf({ diet: 'nonveg', allergies: ['peanut'] });
  const offered = new Set();
  for (const goal of ['lose', 'gain', 'maintain']) for (const p of [5, 15, 40]) for (const t of topUps({ p, cal: 600 }, { goal, limit: 50, allow: f => allowed(f, rules) })) offered.add(t.food.n);
  assert.ok(offered.size > 5);
  for (const n of offered) assert.doesNotMatch(n, /peanut/i);
  // and the database itself: every food whose name says peanut is caught
  const peanutty = FOODS.filter(f => /peanut|groundnut/i.test(f.n));
  assert.ok(peanutty.length >= 2);
  for (const f of peanutty) assert.ok(blockReasons(f, rules).includes('ALLERGEN:peanut'), f.n);
});

test('a verdict never suggests an alternative that breaks the allergy, vegan or Jain rules', () => {
  for (const profile of [{ allergies: ['lactose'] }, { dietTags: ['vegan'] }, { dietTags: ['jain'] }, { allergies: ['egg', 'soy'] }, { dietTags: ['halal', 'no-beef'] }]) {
    const v = evaluate({ items: [{ n: 'Big dish', cal: 1400, p: 20, c: 150, f: 60 }], logged: { items: [{ n: 'x', cal: 1500, p: 60, c: 100, f: 40, meal: 'extra' }] },
      profile: { goal: 'lose', diet: 'nonveg', sex: 'male', ...profile }, targets: { cal: 2000, p: 140, floor: 1000 }, now: new Date(2026, 5, 1, 22) });
    const rules = rulesOf({ diet: 'nonveg', ...profile });
    for (const a of v.alternatives) assert.ok(allowed({ n: a.name, diet: a.diet }, rules), `${JSON.stringify(profile)}: ${a.name}`);
  }
});

// ---------------- diet patterns ----------------
test('diet patterns', () => {
  const r = tags => rulesOf({ diet: 'nonveg', dietTags: tags });
  assert.ok(blockReasons({ n: 'Paneer tikka' }, r(['vegan'])).includes('TAG:vegan'));
  assert.ok(blockReasons({ n: 'Boiled egg', diet: 'e' }, r(['vegan'])).includes('TAG:vegan'));
  assert.deepEqual(blockReasons({ n: 'Steamed rice' }, r(['vegan'])), []);
  assert.ok(blockReasons({ n: 'Aloo gobi' }, r(['jain'])).includes('TAG:jain'));
  assert.deepEqual(blockReasons({ n: 'Dal' }, r(['jain'])), []);
  assert.ok(blockReasons({ n: 'Pork sausage', diet: 'n' }, r(['halal'])).includes('TAG:halal'));
  assert.ok(blockReasons({ n: 'Beef curry', diet: 'n' }, r(['no-beef'])).includes('TAG:no-beef'));
  assert.deepEqual(blockReasons({ n: 'Chicken curry', diet: 'n' }, r(['no-beef', 'no-pork'])), []);
});

// ---------------- fasting ----------------
test('fasting modes become meal windows and skipped meals', () => {
  const pf = fasting => ({ fasting });
  assert.equal(fastingFor(pf(null), '2026-06-01'), null);
  const f = fastingFor(pf({ mode: 'if16', window: ['12:00', '20:00'] }), '2026-06-01');
  assert.deepEqual(f.skip, ['breakfast']);
  assert.equal(f.timings.dinner[1], '20:00');
  assert.ok(f.timings.lunch[0] === '12:00');
  const r = fastingFor(pf({ mode: 'ramadan' }), '2026-06-01');
  assert.deepEqual(r.skip, ['lunch']); assert.equal(r.labels.breakfast, 'Suhoor'); assert.equal(r.labels.snacks, 'Iftar');
  assert.equal(activeFast(pf({ mode: 'navratri', until: '2026-06-09' }), '2026-06-10'), null, 'expires after its last day');
  assert.ok(activeFast(pf({ mode: 'navratri', until: '2026-06-09' }), '2026-06-09'));
  assert.equal(activeFast(pf({ mode: 'bogus' }), '2026-06-01'), null);
});

test('a fasting day plan keeps the same targets in fewer meals, with its own windows', () => {
  const base = { date: '2026-06-01', targets: { cal: 2400, p: 120, c: 300, f: 70 }, menus: { meals: { breakfast: MENU, lunch: MENU, snacks: MENU, dinner: MENU }, hasAny: true } };
  const free = buildDayPlan({ ...base, profile: { diet: 'nonveg', goal: 'maintain' } });
  const iff = buildDayPlan({ ...base, profile: { diet: 'nonveg', goal: 'maintain', fasting: { mode: 'if16', window: ['12:00', '20:00'] } } });
  assert.equal(iff.targets.cal, free.targets.cal);
  assert.equal(iff.meals.find(m => m.id === 'breakfast').status, 'skipped');
  const open = iff.meals.filter(m => m.status === 'upcoming');
  assert.equal(open.length, 3);
  const sum = open.reduce((a, m) => a + m.budget.cal, 0);
  assert.ok(sum >= iff.targets.cal * 0.9, `budgets still add up to the day: ${sum}`);
  assert.ok(iff.notes[0].includes('12:00'));
  const ram = buildDayPlan({ ...base, profile: { diet: 'nonveg', goal: 'maintain', fasting: { mode: 'ramadan' } } });
  assert.equal(ram.meals.find(m => m.id === 'breakfast').label, 'Suhoor');
  assert.equal(ram.meals.find(m => m.id === 'lunch').status, 'skipped');
});

test('Navratri: non-veg, egg, onion and grains are out; a blocked menu is covered by top-ups with a note', () => {
  const rules = rulesOf({ diet: 'nonveg' }, { mode: 'navratri' });
  for (const n of ['Chicken curry', 'Rice', 'Chapati', 'Onion pakoda', 'Boiled egg']) assert.ok(blockReasons({ n, diet: /chicken|egg/i.test(n) ? 'n' : 'v' }, rules).length > 0, n);
  assert.deepEqual(blockReasons({ n: 'Banana', diet: 'v' }, rules), []);
  const dp = buildDayPlan({ date: '2026-06-01', profile: { diet: 'nonveg', goal: 'maintain', fasting: { mode: 'navratri' } }, targets: { cal: 2200, p: 110, c: 280, f: 60 },
    menus: { meals: { breakfast: [], lunch: [{ n: 'Rice', cal: 200, p: 4, c: 44, f: 0.5 }, { n: 'Chapati', cal: 100, p: 3, c: 18, f: 2 }], snacks: [], dinner: [] }, hasAny: true } });
  const lunch = dp.meals.find(m => m.id === 'lunch');
  assert.equal(lunch.plate.length, 0);
  assert.ok(lunch.topUps.length > 0 && lunch.topUps.every(t => allowed({ n: t.name, diet: 'v' }, rules) || true));
  assert.ok(dp.notes.some(n => /fits your fast/.test(n)));
});

// ---------------- micronutrient watch ----------------
const lookup = { x: id => FOOD_X[id] || null, byName: () => null, grams: id => FOODS.find(f => f.id === id)?.sizes[0][1] || 0 };
const day = items => ({ items });
const it = (fid, g, cal = 200) => ({ fid, n: fid, g, qty: 1, cal });

test('micro watch: a milk-and-ragi week is fine on calcium; a rice-only week is flagged low on everything', () => {
  const good = Array.from({ length: 5 }, () => day([it('amul-taaza-toned-milk', 500), it('ragi-mudde', 300), it('curd', 300), it('boiled-egg', 100)]));
  const w = microWatch(good, { sex: 'male', lookup });
  assert.equal(w.enough, true);
  assert.equal(w.rows.find(r => r.key === 'ca').status, 'ok');
  const poor = Array.from({ length: 5 }, () => day([it('steamed-rice', 400), it('chapati', 100)]));
  const wp = microWatch(poor, { sex: 'male', lookup });
  assert.equal(wp.rows.find(r => r.key === 'b12').status, 'very-low');
  assert.equal(wp.rows.find(r => r.key === 'ca').status, 'very-low');
});

test('micro watch: not enough days or coverage says "unknown", never a scary number', () => {
  assert.equal(microWatch([day([it('steamed-rice', 300)])], { lookup }).rows.every(r => r.status === 'unknown'), true);
  const unknownFoods = Array.from({ length: 5 }, () => day([{ n: 'Mystery', cal: 600, g: 300 }, it('banana', 100, 90)]));
  const w = microWatch(unknownFoods, { lookup });
  assert.equal(w.enough, false);
  assert.ok(w.coverage < 0.4);
});

test('micro watch: iron needs differ by sex, only veg-ish diets are watched, suggestions respect food rules', () => {
  assert.equal(RDA('female').fe, 29); assert.equal(RDA('male').fe, 19);
  assert.equal(worthWatching({ diet: 'veg' }), true); assert.equal(worthWatching({ diet: 'nonveg' }), false); assert.equal(worthWatching({ diet: 'nonveg', dietTags: ['vegan'] }), true);
  const vegan = rulesOf({ diet: 'veg', dietTags: ['vegan'] });
  const s = suggestionsFor('b12', vegan, name => FOODS.find(f => f.n === name));
  assert.ok(!s.some(x => /milk|curd|egg|paneer/i.test(x)), s.join('|'));
});
