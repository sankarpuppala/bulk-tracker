import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, edSignals, STEPS } from '../../js/engine/verdict.js';
import { explain, oneLine } from '../../js/engine/verdict-copy.js';
import { buildDayPlan } from '../../js/engine/dayplan.js';
import { allergenHits } from '../../js/engine/allergens.js';
import { calcTargets } from '../../js/engine/targets.js';

const at = h => new Date(2026, 5, 1, h, 0);                 // a Monday
const logged = cal => ({ items: cal ? [{ n: 'Eaten so far', cal, p: cal / 20, c: cal / 8, f: cal / 30, meal: 'extra' }] : [] });
const food = (n, cal, p, extra = {}) => ({ n, cal, p, c: Math.max(0, (cal - 4 * p) / 6), f: Math.max(0, (cal - 4 * p) / 18), ...extra });
const prof = (goal, o = {}) => ({ goal, diet: 'nonveg', allergies: [], sex: 'male', ...o });
const T = (cal, p = 140) => ({ cal, p, c: 250, f: 60, floor: 1500 });

// ---------------- spec §10.2 examples ----------------
test('cutter, 600 kcal flex, chicken biryani 700 kcal → go smaller, about half, with an if-anyway', () => {
  const v = evaluate({ items: [food('Chicken biryani', 700, 30)], logged: logged(1400), profile: prof('lose'), targets: T(2000), now: at(22) });
  assert.equal(v.kind, 'smaller');
  assert.equal(v.portion, 0.5);
  assert.ok(v.reasons.includes('OVER_FLEX'));
  assert.equal(v.numbers.flex, 600);
  assert.ok(v.ifAnyway, 'smaller verdicts carry an if-anyway');
  assert.ok(v.ifAnyway.overBy > 0);
});

test('bulker, 1,400 kcal left at 6 pm, biryani → go, plus protein to add', () => {
  const v = evaluate({ items: [food('Chicken biryani', 700, 25)], logged: logged(1600), profile: prof('gain'), targets: T(3000), now: at(18) });
  assert.equal(v.kind, 'go');
  assert.ok(v.reasons.includes('ADD_PROTEIN'));
  assert.ok(v.addProtein.length > 0 && v.addProtein.every(a => a.p >= 8));
});

test('veg user asks about a chicken roll → skip, diet reason, neutral copy, veg alternatives', () => {
  const v = evaluate({ items: [food('Chicken roll', 400, 22, { diet: 'n' })], logged: logged(500), profile: prof('lose', { diet: 'veg' }), targets: T(2000), now: at(13) });
  assert.equal(v.kind, 'skip');
  assert.equal(v.blocked, true);
  assert.deepEqual(v.reasons, ['DIET:veg']);
  assert.equal(v.ifAnyway, null, 'no override nudge on a hard block');
  assert.ok(v.alternatives.length > 0 && v.alternatives.every(a => a.diet === 'v'));
  const e = explain(v);
  assert.match(e.body, /non-vegetarian/);
  assert.doesNotMatch(e.body + (e.tip || ''), /should not|bad|guilt|cheat|sin/i);
  assert.equal(e.ifAnyway, null);
});

test('peanut-allergic user asking about peanut chikki → skip, allergen reason', () => {
  const v = evaluate({ items: [food('Peanut chikki', 150, 4)], logged: logged(300), profile: prof('lose', { allergies: ['peanut'] }), targets: T(2000), now: at(16) });
  assert.equal(v.kind, 'skip');
  assert.deepEqual(v.reasons, ['ALLERGEN:peanut']);
  assert.match(explain(v).body, /allergy/);
  assert.ok(v.alternatives.every(a => !allergenHits({ n: a.name }, ['peanut']).length), 'alternatives respect the allergy too');
});

// ---------------- table-driven: 45 cases ----------------
// goal, eaten kcal, item kcal, item protein, hour, trainingDay, expected kind, expected portion (or null)
const TABLE = [
  // cut at 22:00 (nothing left planned): flex = 2000 − eaten
  ['lose', 1000, 400, 20, 22, false, 'go', 1], ['lose', 1000, 600, 20, 22, false, 'go', 1], ['lose', 1000, 700, 20, 22, false, 'smaller', 0.75],
  ['lose', 1000, 1000, 40, 22, false, 'smaller', 0.5], ['lose', 1000, 1200, 40, 22, false, 'smaller', 0.5], ['lose', 1000, 1300, 40, 22, false, 'swap', 0],
  ['lose', 1700, 400, 20, 22, false, 'swap', 0], ['lose', 2100, 300, 10, 22, false, 'skip', 0], ['lose', 1500, 100, 5, 22, false, 'go', 1],
  ['lose', 1500, 250, 5, 22, true, 'go', 1], ['lose', 1200, 800, 30, 22, true, 'smaller', 0.5], ['lose', 300, 1500, 60, 22, false, 'smaller', 2 / 3],
  ['lose', 1000, 480, 12, 22, true, 'go', 1], ['lose', 1000, 900, 30, 22, true, 'smaller', 2 / 3], ['lose', 1800, 150, 10, 22, false, 'smaller', 0.75],
  // cut, morning 08:00 (lunch/snacks/dinner still to come: flex = 2000 − eaten − 900)
  ['lose', 300, 400, 20, 8, false, 'go', 1], ['lose', 300, 600, 20, 8, false, 'smaller', 0.75], ['lose', 300, 800, 20, 8, false, 'smaller', 0.5],
  ['lose', 0, 500, 25, 8, true, 'go', 1], ['lose', 300, 1100, 30, 8, false, 'swap', 0],
  // maintain / recomp: symmetric 0.8 / 1.4
  ['maintain', 1000, 700, 25, 22, false, 'go', 1], ['maintain', 1000, 900, 25, 22, false, 'smaller', 0.75], ['maintain', 1000, 1400, 40, 22, false, 'smaller', 0.5],
  ['maintain', 1000, 1500, 40, 22, false, 'swap', 0], ['maintain', 2100, 400, 10, 22, false, 'skip', 0], ['maintain', 300, 400, 20, 8, true, 'go', 1],
  ['maintain', 300, 1000, 20, 8, false, 'smaller', 0.5], ['maintain', 1500, 400, 25, 22, true, 'go', 1],
  ['recomp', 1000, 900, 25, 22, false, 'smaller', 0.75], ['recomp', 1000, 700, 40, 22, true, 'go', 1], ['recomp', 1000, 1600, 40, 22, false, 'swap', 0],
  ['recomp', 600, 400, 30, 8, false, 'go', 1],
  // bulk: under-eating is the risk, skip only past 125 %
  ['gain', 1000, 700, 30, 22, false, 'go', 1], ['gain', 1000, 700, 60, 22, true, 'go', 1], ['gain', 3300, 700, 30, 22, false, 'smaller', 0.5],
  ['gain', 3600, 700, 30, 22, false, 'skip', 0], ['gain', 0, 3000, 150, 12, false, 'go', 1], ['gain', 2000, 500, 10, 18, false, 'go', 1],
  ['gain', 3000, 600, 20, 22, false, 'go', 1], ['gain', 3500, 300, 20, 22, false, 'smaller', 0.75], ['gain', 3500, 400, 20, 22, false, 'smaller', 0.5],
  ['gain', 500, 900, 20, 8, true, 'go', 1], ['gain', 1500, 1200, 80, 14, false, 'go', 1], ['gain', 3700, 100, 5, 22, false, 'smaller', 0.5],
];

test(`verdict table: ${TABLE.length} cases across cut / maintain / recomp / bulk, morning / evening, training / rest`, () => {
  assert.ok(TABLE.length >= 40);
  const bad = [];
  for (const [goal, eaten, cal, p, hour, training, kind, portion] of TABLE) {
    const v = evaluate({ items: [food('Test dish', cal, p)], logged: logged(eaten), profile: prof(goal), targets: { ...T(goal === 'gain' ? 3000 : 2000), floor: 1000 }, now: at(hour), trainingDay: training });
    const tag = `${goal} eaten ${eaten} item ${cal}/${p}g @${hour}h ${training ? 'train' : 'rest'}`;
    if (v.kind !== kind) bad.push(`${tag}: expected ${kind}, got ${v.kind} (${v.reasons})`);
    else if (portion !== null && Math.abs(v.portion - portion) > 1e-9) bad.push(`${tag}: expected portion ${portion}, got ${v.portion}`);
  }
  assert.deepEqual(bad, []);
});

// ---------------- rules ----------------
test('a verdict never contains a portion outside the allowed steps', () => {
  for (const [goal, eaten, cal, p, hour] of TABLE) {
    const v = evaluate({ items: [food('x', cal, p)], logged: logged(eaten), profile: prof(goal), targets: T(goal === 'gain' ? 3000 : 2000), now: at(hour) });
    if (v.kind === 'smaller') assert.ok(STEPS.some(s => Math.abs(s - v.portion) < 1e-9), `portion ${v.portion}`);
  }
});

test('the calorie floor wins over a "smaller" or "skip" verdict', () => {
  const v = evaluate({ items: [food('Big thali', 1500, 60)], logged: logged(300), profile: prof('lose'), targets: T(2000), now: at(22) });
  assert.equal(v.kind, 'go');
  assert.deepEqual(v.reasons.slice(0, 1), ['FLOOR']);
  assert.match(explain(v).body, /1,500 kcal/);
});

test('with an eating-disorder signal active nothing is ever "smaller", "swap" or "skip" for calories', () => {
  const v = evaluate({ items: [food('Biryani', 1400, 30)], logged: logged(1800), profile: prof('lose'), targets: T(2000), now: at(22), restrictionPaused: true });
  assert.equal(v.kind, 'go');
  assert.ok(v.reasons.includes('RESTRICTION_PAUSED'));
  assert.doesNotMatch(explain(v).body, /skip|smaller|over/i);
});

test('hard blocks still apply while restriction is paused', () => {
  const v = evaluate({ items: [food('Chicken roll', 400, 22, { diet: 'n' })], logged: logged(0), profile: prof('lose', { diet: 'veg' }), targets: T(2000), now: at(13), restrictionPaused: true });
  assert.equal(v.kind, 'skip');
});

test('combos add up: two items are judged as one plate', () => {
  const v = evaluate({ items: [food('Rice', 300, 6), food('Dal', 200, 12)], logged: logged(1000), profile: prof('lose'), targets: T(2000), now: at(22) });
  assert.equal(v.numbers.cal, 500);
  assert.equal(v.names, 'Rice + Dal');
  assert.equal(v.kind, 'go');
});

test('alternatives come from the meal menu first, then favourites, then top-ups, and never repeat the food asked about', () => {
  const dayPlan = buildDayPlan({
    date: '2026-06-01', profile: prof('lose'), targets: T(2000),
    menus: { meals: { breakfast: [], lunch: [], snacks: [food('Sprouts salad', 120, 9), food('Samosa', 260, 5)], dinner: [] }, hasAny: true },
    logged: { items: [] }, nowMin: -1,
  });
  const fav = { n: 'Roasted chana', cal: 140, p: 8, c: 20, f: 3, diet: 'v', fid: 'x' };
  const v = evaluate({ items: [food('Samosa', 520, 10)], dayPlan, logged: logged(1400), profile: prof('lose'), targets: T(2000), now: at(16), meal: 'snacks', favourites: [fav] });
  assert.ok(['smaller', 'swap'].includes(v.kind));
  assert.equal(v.alternatives[0].source, 'menu');
  assert.equal(v.alternatives[0].name, 'Sprouts salad');
  assert.ok(v.alternatives.every(a => a.name !== 'Samosa'));
  const sources = v.alternatives.map(a => a.source);
  assert.deepEqual([...sources].sort((a, b) => ['menu', 'favourite', 'topup'].indexOf(a) - ['menu', 'favourite', 'topup'].indexOf(b)), sources, 'ranked by source');
});

test('"if you eat it anyway" names the biggest single change to the rest of the plan', () => {
  const dayPlan = buildDayPlan({
    date: '2026-06-01', profile: prof('lose'), targets: T(2000),
    menus: { meals: { breakfast: [], lunch: [], snacks: [], dinner: [food('Rice', 260, 5), food('Dal', 160, 10), food('Chicken curry', 280, 26)] }, hasAny: true },
    logged: { items: [] }, nowMin: -1,
  });
  const v = evaluate({ items: [food('Burger and fries', 900, 25, { fried: true })], dayPlan, logged: logged(1000), profile: prof('lose'), targets: T(2000), now: at(17), meal: 'snacks' });
  assert.notEqual(v.kind, 'go');
  assert.ok(v.ifAnyway.changes.length > 0, JSON.stringify(v.ifAnyway));
  assert.equal(v.ifAnyway.changes[0].meal, 'dinner');
  assert.ok(v.ifAnyway.changes[0].dCal < 0);
  assert.match(explain(v).ifAnyway, /^dinner /);
});

test('quality flags: fried food gets a reason code and a note', () => {
  const v = evaluate({ items: [food('Samosa', 260, 5)], logged: logged(500), profile: prof('lose'), targets: T(2000), now: at(22) });
  assert.ok(v.reasons.includes('FRIED'));
  assert.equal(v.numbers.quality, -1);
});

test('time moves the verdict: the same snack is fine in the morning and tight late at night', () => {
  const args = { items: [food('Pastry', 450, 6)], logged: logged(1300), profile: prof('lose'), targets: T(2000) };
  const morning = evaluate({ ...args, now: at(8), meal: 'breakfast' });
  const night = evaluate({ ...args, now: at(22), meal: 'dinner' });
  assert.ok(morning.numbers.flex < night.numbers.flex, 'planned meals still to come shrink the flex');
});

// ---------------- properties ----------------
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test('property: a "go" never takes a cutter more than 10 % over target, and no recommendation breaks the floor', () => {
  const r = rng(7);
  const menu = { meals: { breakfast: [food('Idli', 60, 2)], lunch: [food('Rice', 260, 5), food('Dal', 160, 10)], snacks: [food('Tea', 50, 1)], dinner: [food('Chapati', 100, 3), food('Paneer', 330, 16)] }, hasAny: true };
  for (let i = 0; i < 400; i++) {
    const goal = ['lose', 'maintain', 'recomp', 'gain'][Math.floor(r() * 4)];
    const sex = r() < 0.5 ? 'male' : 'female';
    const targets = calcTargets({ weight: 55 + r() * 40, height: 155 + r() * 30, age: 18 + r() * 12, sex, goal, activity: 'moderate', pace: 0.5 });
    const eatenCal = Math.round(r() * targets.cal * 1.2), hour = Math.floor(6 + r() * 17);
    const meal = ['breakfast', 'lunch', 'snacks', 'dinner'][Math.floor(r() * 4)];
    const dayPlan = r() < 0.6 ? buildDayPlan({ date: '2026-06-01', profile: prof(goal), targets, menus: menu, logged: logged(eatenCal), nowMin: hour * 60 }) : null;
    const it = food('Random dish', 50 + r() * 1200, 2 + r() * 50);
    const v = evaluate({ items: [it], dayPlan, logged: logged(eatenCal), profile: prof(goal, { sex }), targets, now: at(hour), meal });
    if (v.kind === 'go' && goal === 'lose' && !v.reasons.includes('FLOOR')) {
      assert.ok(eatenCal + it.cal <= 1.1 * targets.cal + 1, `cut go over 110 %: ${eatenCal}+${it.cal} vs ${targets.cal}`);
    }
    if (v.kind === 'go' && goal === 'gain') assert.ok(eatenCal + it.cal <= 1.25 * targets.cal + 1 || v.reasons.includes('FLOOR'));
    if (v.kind === 'smaller') assert.ok(v.portion > 0 && v.portion < 1);
    if (v.ifAnyway?.projected != null && v.kind !== 'go') assert.ok(v.numbers.projected >= targets.floor - 1, `recommendation below floor: ${v.numbers.projected} < ${targets.floor}`);
    if (v.kind === 'swap') assert.ok(v.alternatives.length > 0);
    if (v.kind === 'skip' && !v.blocked) assert.equal(v.portion, 0);
  }
});

test('property: no verdict contradicts its own copy (kind words stay consistent)', () => {
  const r = rng(11);
  for (let i = 0; i < 200; i++) {
    const goal = ['lose', 'maintain', 'gain'][Math.floor(r() * 3)];
    const v = evaluate({ items: [food('Dish', 50 + r() * 1000, 2 + r() * 40)], logged: logged(Math.round(r() * 2400)), profile: prof(goal), targets: T(goal === 'gain' ? 3000 : 2000), now: at(Math.floor(6 + r() * 17)) });
    const text = oneLine(v);
    assert.ok(text.length > 10);
    if (v.kind === 'smaller') assert.match(text, /Have /);
    if (v.kind === 'swap') assert.match(text, /fits better/);
    assert.doesNotMatch(text, /NaN|undefined|null/);
  }
});

// ---------------- eating-disorder signals ----------------
const day = (cal, target = 2000, logged = true) => ({ cal, target, logged });
test('edSignals: five very-low days out of seven raise the flag', () => {
  const s = edSignals({ days: [day(900), day(1000), day(1100), day(1900), day(1000), day(2000), day(800)] });
  assert.equal(s.flag, true);
  assert.deepEqual(s.reasons, ['LOW_INTAKE']);
  assert.equal(s.helpline.number, '14416');
});
test('edSignals: ordinary weeks, and unlogged days, do not', () => {
  assert.equal(edSignals({ days: [day(1900), day(2100), day(1800), day(0, 2000, false), day(0, 2000, false), day(1700), day(2000)] }).flag, false);
  assert.equal(edSignals({ days: [day(0, 2000, false), day(0, 2000, false), day(0, 2000, false), day(0, 2000, false), day(0, 2000, false), day(0, 2000, false), day(0, 2000, false)] }).flag, false);
});
test('edSignals: repeated skips, rapid loss and concerning text', () => {
  assert.deepEqual(edSignals({ verdicts: ['skip', 'skip', 'skip', 'go', 'skip', 'skip', 'smaller'] }).reasons, ['SKIP_ASKS']);
  assert.deepEqual(edSignals({ loss: { observed: -1.2, planned: -0.5 } }).reasons, ['RAPID_LOSS']);
  assert.equal(edSignals({ loss: { observed: -0.5, planned: -0.5 } }).flag, false);
  assert.equal(edSignals({ text: 'I want to punish myself for lunch' }).flag, true);
  assert.equal(edSignals({ text: 'can I eat a samosa' }).flag, false);
});

test('regression: at dinner time, skipping a huge plate means eating the planned dinner, so the floor does not force a "go"', () => {
  const targets = { cal: 2050, p: 140, floor: 1675 };
  const dayPlan = buildDayPlan({
    date: '2026-06-01', profile: prof('lose'), targets,
    menus: { meals: { breakfast: [food('Idli', 180, 6)], lunch: [food('Rice', 260, 5)], snacks: [food('Tea', 80, 2)], dinner: [food('Chapati', 270, 9), food('Dal', 160, 9), food('Paneer curry', 280, 14)] }, hasAny: true },
    logged: logged(1300), nowMin: 19 * 60 + 45,
  });
  const v = evaluate({ items: [food('3 x chicken biryani', 1890, 84)], dayPlan, logged: logged(1300), profile: prof('lose'), targets, now: new Date(2026, 5, 1, 19, 45), meal: 'dinner' });
  assert.notEqual(v.kind, 'go', v.reasons.join());
  assert.ok(!v.reasons.includes('FLOOR'));
  assert.ok(v.numbers.projected >= targets.floor);
});
