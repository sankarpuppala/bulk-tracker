import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Minimal in-memory localStorage so guest mode runs under Node. */
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { store } = await import('../../js/store.js');
const { Planner } = await import('../../js/planner.js');
const { addDays, todayKey, weekdayOf } = await import('../../js/util.js');

const it = (n, cal, p, c = 20) => ({ n, cal, p, c, f: Math.max(0, (cal - 4 * p - 4 * c) / 9) });
const MEALS = {
  breakfast: [it('Idli', 60, 2, 12), it('Vada', 150, 4, 14), it('Boiled egg', 78, 6, 1)],
  lunch: [it('Rice', 200, 4, 44), it('Chapati', 100, 3, 18), it('Dal', 160, 9, 20), it('Egg masala', 190, 14, 6)],
  snacks: [it('Tea', 50, 1, 8), it('Bajji', 160, 3, 18)],
  dinner: [it('Chapati', 100, 3, 18), it('Paneer butter masala', 330, 16, 12)],
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekWith = (dinner, onlyDay) => Object.fromEntries(DAYS.map(d => [d, { ...MEALS, dinner: !onlyDay || onlyDay === d ? dinner : MEALS.dinner }]));
const ALOO = [it('Chapati', 100, 3, 18), it('Aloo gobi', 150, 3, 18)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const today = todayKey();
const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));

mem.set('ff.guest.profile', JSON.stringify({
  name: 'Tester', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'gain', weight: 65, height: 175, age: 20,
  menuOverrides: { CNV: weekWith(MEALS.dinner) },
}));
await store.start('guest');
const planner = new Planner(store);
await planner.start();

const dinnerOf = (plan) => plan.meals.find(m => m.id === 'dinner');

test('plans exist for today and the next six days, built once', () => {
  const plans = dates.map(d => planner.planFor(d));
  plans.forEach((p, i) => { assert.equal(p.date, dates[i]); assert.equal(p.version, 1); assert.equal(p.reason, 'initial'); });
  assert.equal(planner.planFor(today), planner.planFor(today), 'unchanged inputs return the cached plan');
  assert.equal(planner.pendingChange(), null);
});

test('a menu edit on a future day re-plans only that day', () => {
  const before = dates.map(d => planner.planFor(d));
  const target = addDays(today, 2);
  store.saveProfile({ menuOverrides: { CNV: weekWith(ALOO, weekdayOf(target)) } });
  dates.forEach((d, i) => {
    const p = planner.planFor(d);
    if (d === target) {
      assert.equal(p.version, before[i].version + 1);
      assert.equal(p.reason, 'menu-change');
      assert.ok(dinnerOf(p).plate.some(x => x.name === 'Aloo gobi'));
    } else assert.equal(p, before[i], `${d} untouched`);
  });
});

test('the change is recorded with a readable explanation and survives until acknowledged', () => {
  const target = addDays(today, 2);
  const p = planner.planFor(target);
  assert.ok(p.change, 'banner data present');
  assert.match(p.change.text, /Dinner changed: Paneer butter masala → Aloo gobi/);
  assert.ok(p.change.diffs.some(d => d.meal === 'dinner' && d.dP <= -5));
  assert.equal(planner.cache.get(target).history.length, 1, 'previous version kept');
  assert.equal(planner.cache.get(target).history[0].version, 1);
});

test('a change to tomorrow shows on the Today banner until acknowledged', () => {
  const tomorrow = addDays(today, 1);
  store.saveProfile({ menuOverrides: { CNV: { ...weekWith(ALOO, weekdayOf(addDays(today, 2))), [weekdayOf(tomorrow)]: { ...MEALS, dinner: ALOO } } } });
  const pending = planner.pendingChange();
  assert.equal(pending.date, tomorrow);
  assert.match(pending.change.text, /Dinner changed/);
  planner.ack(tomorrow);
  assert.notEqual(planner.pendingChange()?.date, tomorrow);
});

test('editing a dinner that is already logged leaves that meal alone', () => {
  const eaten = { id: 'x1', n: 'Dinner out', meal: 'dinner', cal: 700, p: 30, c: 60, f: 20, diet: 'n', cat: 'custom', ts: Date.now() };
  store.updateDay(today, d => { d.items.push(eaten); });
  const before = dinnerOf(planner.planFor(today));
  assert.equal(before.status, 'logged');
  store.saveProfile({ menuOverrides: { CNV: weekWith([it('Mushroom curry', 120, 5, 10)], weekdayOf(today)) } });
  const after = dinnerOf(planner.planFor(today));
  assert.deepEqual(after.plate, before.plate);
  assert.equal(after.status, 'logged');
  assert.ok(!(planner.planFor(today).change?.diffs || []).some(d => d.meal === 'dinner'));
});

test('a festival special overrides the regular menu for that day', () => {
  const day = addDays(today, 4);
  store.shared.specials = [{ id: 's1', date: day, title: 'Diwali Feast', messes: ['CNV'], meals: { dinner: [it('Gulab jamun thali', 500, 9, 70)] } }];
  store.emit('shared');
  const p = planner.planFor(day);
  assert.equal(p.reason, 'menu-change');
  assert.equal(p.special.title, 'Diwali Feast');
  assert.ok(dinnerOf(p).plate.some(x => x.name === 'Gulab jamun thali'));
  assert.ok(!dinnerOf(p).plate.some(x => x.name === 'Paneer butter masala'));
  store.shared.specials = []; store.emit('shared');
  assert.ok(dinnerOf(planner.planFor(day)).plate.every(x => x.name !== 'Gulab jamun thali'));
});

test('"not this today" re-plans that meal from the dishes you typed, and can be undone', () => {
  const day = addDays(today, 3);
  const before = dinnerOf(planner.planFor(day));
  planner.setOverride(day, 'dinner', [it('Egg curry', 220, 15, 6)]);
  const p = planner.planFor(day);
  assert.equal(p.reason, 'override');
  assert.equal(dinnerOf(p).source.kind, 'custom');
  assert.deepEqual(dinnerOf(p).plate.map(x => x.name), ['Egg curry']);
  assert.ok(store.day(day).dayOverrides.dinner, 'saved on the day, so it syncs');
  planner.setOverride(day, 'dinner', null);
  assert.deepEqual(dinnerOf(planner.planFor(day)).plate.map(x => x.name), before.plate.map(x => x.name));
});

test('plans persist, and a menu that changed while the app was closed is noticed on the next start', async () => {
  const day = addDays(today, 5);
  planner.planFor(day);
  await sleep(1500);                                              // persistence is debounced
  assert.ok(mem.get('ff.guest.plan.' + day), 'plan written for the guest');
  // "closed": the committee changes a menu behind our back
  planner.reset();
  store.profile.menuOverrides = { CNV: weekWith(ALOO, weekdayOf(day)) };
  const next = new Planner(store);
  await next.start();
  const p = next.planFor(day);
  assert.equal(p.reason, 'menu-change');
  assert.ok(p.version >= 2 && p.change, 'banner data on first launch');
  next.reset();
});

test('no view calls planPlate or topUps directly', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js');
  for (const dir of ['views', 'components']) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter(x => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(root, dir, f), 'utf8');
      assert.ok(!/\bplanPlate\b|\btopUps\s*\(/.test(src), `${dir}/${f} reaches into the plate engine`);
    }
  }
});

test.after(() => { planner.reset(); });
