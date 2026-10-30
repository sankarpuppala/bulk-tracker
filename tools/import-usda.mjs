// Builds data/world-foods.json from USDA FoodData Central "SR Legacy" (public domain, CC0).
//
//   node tools/import-usda.mjs <folder with the unzipped SR Legacy CSVs> [out.json]
//   Download: https://fdc.nal.usda.gov/download-datasets  →  "SR Legacy" → CSV
//
// ~7,800 world foods and snacks with energy, protein, carbs, fat, fibre, sugar, sodium, saturated fat,
// iron, calcium, vitamin B12 and vitamin D per 100 g, plus household portions. Each food gets a
// veg / egg / non-veg tag from its USDA group and name. Uncertain prepared foods (fast food, restaurant
// dishes, soups, sauces) default to NON-VEG, so a vegetarian is never told something is vegetarian by guess.
//
// Output (compact; loaded lazily by js/worldfoods.js):
//   { v: 1, source, license, cols: [...], groups: [...], rows: [[fdcId, name, group, diet, kcal, p, c, f, fib, sug, na, sat, fe, b12, ca, d, [[label, grams], ...]], ...] }
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] || 'data/world-foods.json';
if (!dir) { console.error('usage: node tools/import-usda.mjs <SR Legacy CSV folder> [out.json]'); process.exit(2); }

// ---------- csv ----------
export function parseCsvLine(line) {
  const cells = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}
function* rows(file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const head = parseCsvLine(text[0]);
  for (let i = 1; i < text.length; i++) { if (!text[i]) continue; const c = parseCsvLine(text[i]); const o = {}; head.forEach((h, j) => { o[h] = c[j]; }); yield o; }
}

// ---------- diet ----------
const MEAT = /\b(beef|pork|chicken|turkey|duck|goose|lamb|mutton|veal|bacon|ham|sausage|salami|pepperoni|bologna|frankfurter|hot dog|wiener|bratwurst|fish|salmon|tuna|shrimp|prawn|crab|lobster|oyster|clam|mussel|squid|octopus|anchov|sardine|herring|mackerel|cod|tilapia|trout|catfish|haddock|pollock|bass|perch|snapper|swordfish|bison|buffalo|venison|rabbit|moose|elk|liver|giblet|gizzard|heart|tongue|tripe|meat|bouillon|broth|gelatin|lard|tallow|chorizo|pate|jerky|caviar|roe|eel|squab|pheasant|quail|goat|ostrich|emu|mortadella|pastrami|kielbasa|spam)\b/i;
const EGG = /\b(egg|eggs|omelet|omelette|mayonnaise|custard|meringue|eggnog|quiche|souffle)\b/i;
const MEAT_GROUPS = new Set(['Poultry Products', 'Beef Products', 'Pork Products', 'Lamb, Veal, and Game Products', 'Finfish and Shellfish Products', 'Sausages and Luncheon Meats']);
const PREPARED = new Set(['Fast Foods', 'Restaurant Foods', 'Meals, Entrees, and Side Dishes', 'Soups, Sauces, and Gravies', 'American Indian/Alaska Native Foods']);
const VEG_SAFE = /\b(french fries|fries|onion rings|cheese pizza|vegetarian|veggie|vegetable|salad|shake|ice cream|sundae|cone|cookie|brownie|pie|muffin|pancake|waffle|toast|cereal|oatmeal|rice|pasta|spaghetti|macaroni|noodles|beans?|lentil|chickpea|hummus|potato|corn|tomato|salsa|guacamole|ketchup|mustard|tofu|yogurt|milk|juice|coffee|tea|apple|banana|cheese|mushroom|spinach|fruit|nuts?|hash browns|tater|biscuit|gravy, (mushroom|onion|vegetable|brown)|sauce, (tomato|marinara|pasta|pizza|cheese|soy|teriyaki|hot|barbecue|sweet and sour|plum|hoisin))\b/i;
const BAKED_PLAIN = /\b(bread|bagel|roll|tortilla|pita|cracker|pretzel|crispbread|bun|english muffin|taco shell|pizza crust|matzo|naan|breadsticks?|croutons?)\b/i;

export function dietOf(name, group) {
  if (MEAT_GROUPS.has(group)) return 'n';
  const meat = MEAT.test(name);
  if (PREPARED.has(group)) return meat ? 'n' : EGG.test(name) && VEG_SAFE.test(name) ? 'e' : VEG_SAFE.test(name) ? 'v' : 'n';
  if (meat) return 'n';
  if (EGG.test(name) || (group === 'Dairy and Egg Products' && /\begg\b/i.test(name))) return 'e';
  if (group === 'Baked Products') return BAKED_PLAIN.test(name) ? 'v' : 'e';
  return 'v';
}

// ---------- build ----------
const SKIP = new Set(['Baby Foods', 'Quality Control Materials', 'Branded Food Products Database']);
const NUT = { 1008: 'kcal', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fib', 2000: 'sug', 1093: 'na', 1258: 'sat', 1089: 'fe', 1178: 'b12', 1087: 'ca', 1114: 'd' };

const cats = new Map([...rows('food_category.csv')].map(r => [r.id, r.description]));
const foods = new Map();
for (const r of rows('sr_legacy_food.csv')) void r;           // ensures the file exists/parses
for (const r of rows('food.csv')) {
  const g = cats.get(r.food_category_id) || '';
  if (r.data_type !== 'sr_legacy_food' || SKIP.has(g)) continue;
  foods.set(r.fdc_id, { id: +r.fdc_id, name: r.description.trim(), group: g, n: {} });
}
for (const r of rows('food_nutrient.csv')) {
  const f = foods.get(r.fdc_id), k = NUT[r.nutrient_id];
  if (f && k && r.amount !== '') f.n[k] = +r.amount;
}
const units = new Map([...rows('measure_unit.csv')].map(r => [r.id, r.name]));
const portions = new Map();
for (const r of rows('food_portion.csv')) {
  const f = foods.get(r.fdc_id); if (!f || !(+r.gram_weight > 0)) continue;
  const amt = +r.amount || 1, u = units.get(r.measure_unit_id);
  const unit = u && u !== 'undetermined' ? u : '';
  const label = [amt === 1 ? '1' : String(amt), unit, r.portion_description, r.modifier].map(s => String(s || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 48);
  if (!label) continue;
  const list = portions.get(r.fdc_id) || [];
  if (list.length < 3 && !list.some(p => p[0] === label)) list.push([label, Math.round((+r.gram_weight / amt) * amt * 10) / 10]);
  portions.set(r.fdc_id, list);
}

const groups = [...new Set([...foods.values()].map(f => f.group))].sort();
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const list = [];
let dropped = 0;
for (const f of foods.values()) {
  const n = f.n;
  if (n.kcal == null || n.p == null || n.c == null || n.f == null) { dropped++; continue; }
  if (n.kcal === 0 && n.p + n.c + n.f === 0 && !/water|tea|coffee|salt|vinegar|sweetener|spice|seasoning/i.test(f.name)) { dropped++; continue; }
  list.push([f.id, f.name, groups.indexOf(f.group), dietOf(f.name, f.group), Math.round(n.kcal), r1(n.p), r1(n.c), r1(n.f),
    r1(n.fib), r1(n.sug), n.na == null ? null : Math.round(n.na), r1(n.sat), r1(n.fe), r1(n.b12), n.ca == null ? null : Math.round(n.ca), r1(n.d), portions.get(String(f.id)) || []]);
}
list.sort((a, b) => a[1].localeCompare(b[1]));
const doc = {
  v: 1, source: 'USDA FoodData Central, SR Legacy (April 2018)', license: 'Public domain (CC0 1.0). https://fdc.nal.usda.gov/',
  note: 'Values per 100 g. Diet tags are inferred; uncertain prepared foods are tagged non-veg on purpose.',
  cols: ['id', 'name', 'group', 'diet', 'kcal', 'p', 'c', 'f', 'fib', 'sug', 'na', 'sat', 'fe', 'b12', 'ca', 'd', 'portions'],
  groups, rows: list,
};
fs.writeFileSync(out, JSON.stringify(doc));
console.log(`${list.length} foods written to ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB), ${dropped} dropped for missing energy or macros`);
