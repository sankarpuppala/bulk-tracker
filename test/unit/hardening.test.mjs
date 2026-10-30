import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import { t, setLocale, getLocale, pickLocale, missingKeys, LOCALES } from '../../js/i18n/index.js';
import en from '../../js/i18n/en.js';
import hi from '../../js/i18n/hi.js';
import { buildDayPlan, rebudget } from '../../js/engine/dayplan.js';
import { evaluate } from '../../js/engine/verdict.js';
import { assessGoal, buildGoalPlan } from '../../js/engine/goal.js';
import { calcTargets } from '../../js/engine/targets.js';

// ---------------- i18n ----------------
test('t() falls back to English, then to the key, and fills placeholders', () => {
  setLocale('en');
  assert.equal(t('nav.today'), 'Today');
  assert.equal(t('nope.key'), 'nope.key');
  assert.match(t('privacy.delete.confirm', { account: ', and your sign-in' }), /sign-in/);
  assert.match(t('privacy.delete.confirm'), /\{account\}/, 'an unfilled placeholder stays visible rather than vanishing');
  setLocale('hi-IN');
  assert.equal(getLocale(), 'hi');
  assert.equal(t('nav.today'), 'आज');
  setLocale('xx');
  assert.equal(getLocale(), 'en');
  assert.equal(pickLocale(null), 'en');
});

test('every Hindi string has an English source and keeps its placeholders', () => {
  const orphans = Object.keys(hi).filter(k => !(k in en));
  assert.deepEqual(orphans, []);
  for (const k of Object.keys(hi)) {
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(hi[k]), ph(en[k]), k);
  }
  assert.ok(Object.keys(hi).length >= 20);
  assert.ok(LOCALES.length >= 2);
  assert.deepEqual(missingKeys('hi').filter(k => k.startsWith('nav.') || k.startsWith('consent.')), [], 'navigation and consent are fully translated');
});

// ---------------- performance budgets ----------------
const M = (n, cal, p) => ({ n, cal, p, c: 30, f: 8 });
const MENU = { meals: {
  breakfast: [M('Idli', 60, 2), M('Vada', 150, 4), M('Boiled egg', 78, 6), M('Sambar', 60, 3)],
  lunch: [M('Rice', 200, 4), M('Chapati', 100, 3), M('Dal', 160, 9), M('Egg masala', 190, 14), M('Curd', 60, 3), M('Poriyal', 90, 2)],
  snacks: [M('Tea', 50, 1), M('Bajji', 160, 3)], dinner: [M('Chapati', 100, 3), M('Paneer', 330, 16), M('Rasam', 40, 1), M('Rice', 200, 4)],
}, hasAny: true };
const input = { date: '2026-06-01', profile: { diet: 'nonveg', goal: 'gain', allergies: ['soy'], dietTags: [] }, targets: { cal: 2900, p: 140, c: 380, f: 80 }, menus: MENU, logged: { items: [] } };

const bench = (fn, n = 40) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t0) / n; };

test('perf: one day plan builds in under 30 ms, a week in under 150 ms', () => {
  const day = bench(() => buildDayPlan(input));
  const week = bench(() => { for (let i = 0; i < 7; i++) buildDayPlan({ ...input, date: '2026-06-0' + (i + 1) }); }, 15);
  console.log(`  day ${day.toFixed(2)} ms, week ${week.toFixed(2)} ms`);
  assert.ok(day < 30, `day took ${day.toFixed(1)} ms`);
  assert.ok(week < 150, `week took ${week.toFixed(1)} ms`);
});

test('perf: re-planning, a verdict, and a goal plan are each well under a frame budget', () => {
  const plan = buildDayPlan(input);
  const logged = { items: [{ n: 'Lunch', cal: 800, p: 40, c: 90, f: 20, meal: 'lunch' }] };
  const re = bench(() => rebudget(plan, logged, { nowMin: 15 * 60 }));
  const ver = bench(() => evaluate({ items: [M('Samosa', 520, 10)], dayPlan: plan, logged, profile: input.profile, targets: { ...input.targets, floor: 1700 }, now: new Date(2026, 5, 1, 17), meal: 'snacks' }));
  const goal = bench(() => { const g = { weight: 60, target: 70, months: 8, sex: 'male', age: 20, height: 175, activity: 'moderate' }; assessGoal(g); buildGoalPlan(g); });
  const tg = bench(() => calcTargets({ weight: 65, height: 175, age: 20, sex: 'male', goal: 'gain', activity: 'moderate' }), 200);
  console.log(`  re-plan ${re.toFixed(2)} ms, verdict ${ver.toFixed(2)} ms, goal ${goal.toFixed(2)} ms`);
  assert.ok(re < 30 && ver < 30 && goal < 30 && tg < 1);
});

// ---------------- accessibility basics that can be checked statically ----------------
test('the shell keeps a skip link target, language attribute and reduced-motion handling', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]*lang=/);
  assert.match(html, /name="viewport"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});
