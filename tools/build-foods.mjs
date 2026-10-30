// Validates every entry in data/foods.js (and prints a summary). Run: node tools/build-foods.mjs
// Also imported by test/unit/foods.test.mjs so a bad entry fails the build.
import { FOODS, CATEGORIES } from '../data/foods.js';

export const ENERGY_TOLERANCE = 0.15;
// Foods whose label energy legitimately differs from 4p+4c+9f (fibre, polyols, alcohol, rounding on tiny values)
export const ENERGY_EXEMPT = new Map([
  ['boiled-corn-bhutta', 'fibre-rich: Atwater factors overstate energy'],
  ['watermelon', 'fibre and water: Atwater factors overstate energy'],
]);

export function validateFood(f, cats = new Set(CATEGORIES.map(c => c.id))) {
  const errs = [];
  if (!f.id || typeof f.id !== 'string') errs.push('missing id');
  if (!f.n) errs.push('missing name');
  if (!cats.has(f.cat)) errs.push(`unknown category ${f.cat}`);
  if (!Array.isArray(f.k) || f.k.length !== 4 || f.k.some(v => typeof v !== 'number' || !isFinite(v) || v < 0)) errs.push('k must be [kcal, protein, carbs, fat] of non-negative numbers');
  if (!['v', 'e', 'n'].includes(f.diet)) errs.push(`diet tag must be v/e/n, got ${f.diet}`);
  if (!Array.isArray(f.sizes) || !f.sizes.length || f.sizes.some(s => !s[0] || !(s[1] > 0))) errs.push('sizes need a label and a positive amount');
  if (Array.isArray(f.k) && f.k.length === 4 && !errs.some(e => e.startsWith('k '))) {
    const [kcal, p, c, fat] = f.k;
    if (p + c + fat > 100.5) errs.push(`macros add up to ${(p + c + fat).toFixed(1)} g per 100 g`);
    const calc = 4 * p + 4 * c + 9 * fat;
    if (kcal > 20 && !ENERGY_EXEMPT.has(f.id) && Math.abs(calc - kcal) > ENERGY_TOLERANCE * kcal) errs.push(`energy ${kcal} kcal vs ${calc.toFixed(0)} from macros (${(100 * Math.abs(calc - kcal) / kcal).toFixed(0)}% off)`);
  }
  return errs;
}

export function validateAll(foods = FOODS) {
  const out = [], seen = new Set();
  for (const f of foods) {
    const e = validateFood(f);
    if (seen.has(f.id)) e.push('duplicate id');
    seen.add(f.id);
    if (e.length) out.push({ id: f.id, n: f.n, errors: e });
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('build-foods.mjs')){
  const bad = validateAll();
  console.log(`${FOODS.length} foods, ${bad.length} with problems`);
  for (const b of bad) console.log(`  ${b.id} (${b.n}): ${b.errors.join('; ')}`);
  process.exit(bad.length ? 1 : 0);
}
