import test from 'node:test';
import assert from 'node:assert/strict';
import { RAW, DAILY, MESS_SOURCES, MENU_INFO } from '../../data/mess-menus.js';
import { DEFAULT_MENUS, MESSES, WEEK, menuSourceFor } from '../../data/messes.js';
import { buildWeek, macrosFor, RULES, parseMeal } from '../../js/engine/dishes.js';
import { dietOf } from '../../js/engine/plate.js';

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const NONVEG = /\b(chicken|mutton|fish|rohu|katla|bhetki|prawn|egg|omelet+e|muri ghonto)\b/i;

test('every campus mess has a full bundled week from its 2026 chart', () => {
  for (const m of MESSES) {
    const w = DEFAULT_MENUS[m.id];
    assert.ok(w, m.id);
    for (const d of WEEK) for (const meal of MEALS) assert.ok(w[d]?.[meal]?.length > 0, `${m.id} ${d} ${meal} is empty`);
    assert.ok(menuSourceFor(m.id).file, m.id);
  }
  assert.equal(Object.keys(MENU_INFO).length, 5);
});

test('every dish on every chart has macros: nothing is left out or made up silently', () => {
  for (const [id, s] of Object.entries(MESS_SOURCES)) {
    assert.deepEqual(buildWeek(RAW[s.chart], DAILY[s.chart], { nonVeg: s.nonVeg }).missing, [], id);
  }
});

test('veg menus never carry a non-veg or egg dish; the non-veg menus do', () => {
  for (const id of ['AV', 'BV', 'CV', 'DV', 'EV']) {
    for (const d of WEEK) for (const meal of MEALS) for (const it of DEFAULT_MENUS[id][d][meal]) {
      assert.equal(it.diet, 'v', `${id} ${d} ${meal}: ${it.n}`);
      assert.doesNotMatch(it.n, NONVEG, `${id} ${d} ${meal}: ${it.n}`);
      // a veg mess's brownie is eggless, so the chart's own tag wins over the generic name guess
      if (!/brownie|cake/i.test(it.n)) assert.notEqual(dietOf(it.n), 'n', `name-based check agrees for ${it.n}`);
    }
  }
  const nv = id => WEEK.flatMap(d => MEALS.flatMap(m => DEFAULT_MENUS[id][d][m])).filter(i => i.diet !== 'v');
  assert.ok(nv('BNV').length >= 14 && nv('CNV').length >= 14);
  assert.ok(nv('BNV').some(i => /chicken biryani/i.test(i.n)) && nv('CNV').some(i => /mutton/i.test(i.n)));
  assert.ok(nv('CNV').filter(i => /egg|omelet/i.test(i.n)).every(i => i.diet === 'e'), 'egg dishes are tagged egg, not meat');
});

test('dish macros are internally consistent (energy within 20 % of 4p + 4c + 9f) and sensible per serving', () => {
  for (const r of RULES) {
    const { cal, p, c, f } = r.m, calc = 4 * p + 4 * c + 9 * f;
    assert.ok(Math.abs(calc - cal) <= 0.2 * cal + 10, `${r.re}: ${cal} kcal vs ${calc} from macros`);
    assert.ok(cal > 0 && cal <= 650, `${r.re}: ${cal} kcal per serving`);
  }
});

test('specific dishes beat generic ones', () => {
  const k = n => macrosFor(n).cal;
  assert.equal(k('Moong dal halwa'), 280, 'a halwa, not a dal');
  assert.equal(k('Dosakaya pachadi'), 30, 'a pickle, not a dosa');
  assert.equal(k('Fryums'), 60, 'not a fried vegetable');
  assert.equal(k('Onion uttappam'), 270, 'an uttapam, not an onion');
  assert.equal(k('Aloo tikki'), 260);
  assert.ok(macrosFor('Paneer biryani').p > macrosFor('Veg biryani').p);
  assert.ok(macrosFor('Chicken biryani').p >= 20);
  assert.equal(macrosFor('Idli (3) + Vada (2)').cal, 180 + 280, '"+" adds the parts');
  assert.equal(macrosFor('Pizza / Garlic bread').cal, 450, '"/" uses the first option');
  assert.equal(macrosFor('Chole (Pindi / Amritsari)').cal, macrosFor('Chole').cal, 'a "/" inside brackets is a description, not an alternative');
});

test('a dish with no rule is reported, not invented', () => {
  const r = parseMeal('Dal tadka; Unicorn steak tartare; NV: Chicken curry', { nonVeg: false });
  assert.deepEqual(r.missing, ['Unicorn steak tartare']);
  assert.deepEqual(r.items.map(i => i.n), ['Dal tadka']);
});

test('menus give a realistic day: veg messes 60-200 g protein on offer, non-veg more than veg', () => {
  const day = (id, d) => MEALS.reduce((a, m) => a + DEFAULT_MENUS[id][d][m].reduce((x, i) => x + i.p, 0), 0);
  for (const id of Object.keys(DEFAULT_MENUS)) for (const d of WEEK) {
    const p = day(id, d);
    assert.ok(p >= 60 && p <= 260, `${id} ${d}: ${p} g`);
  }
  for (const d of WEEK) { assert.ok(day('BNV', d) > day('BV', d)); assert.ok(day('CNV', d) > day('CV', d)); }
});
