import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const read = f => JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const india = read('data/india-foods.json'), world = read('data/world-foods.json');
const { rowsToFoods, loadFoodDb, extraFoods, extraById } = await import('../../js/fooddb.js');
await loadFoodDb(url => Promise.resolve(read(url)));
const { searchFoods, getFood } = await import('../../js/search.js');
const { makeItem } = await import('../../js/nutrition.js');
const { evaluate } = await import('../../js/engine/verdict.js');
const { blockReasons, rulesOf } = await import('../../js/engine/diet.js');

const all = extraFoods();
const MEAT = /\b(beef|pork|chicken|turkey|lamb|mutton|bacon|ham|sausage|salami|pepperoni|fish|salmon|tuna|shrimp|prawn|crab|lobster|keema)\b/i;

test('both open datasets load: ~850 Indian recipes and ~7,400 world foods', () => {
  const indb = all.filter(f => f.src === 'indb'), usda = all.filter(f => f.src === 'usda');
  assert.ok(indb.length >= 800, indb.length);
  assert.ok(usda.length >= 7000, usda.length);
  assert.ok(india.license && world.license && india.source && world.source, 'source and licence travel with the data');
});

test('every imported food is well-formed', () => {
  const bad = [];
  for (const f of all) {
    if (!f.id || !f.n || f.k.length !== 4 || f.k.some(v => typeof v !== 'number' || v < 0)) bad.push(f.id + ' shape');
    if (!['v', 'e', 'n'].includes(f.diet)) bad.push(f.id + ' diet');
    if (!f.sizes.length || f.sizes.some(s => !s[0] || !(s[1] > 0))) bad.push(f.id + ' sizes');
    if (f.k[1] + f.k[2] + f.k[3] > 101) bad.push(f.id + ' macros > 100 g');
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('energy matches macros: every INDB recipe, and nearly all USDA foods (fibre/alcohol/polyols explain the rest)', () => {
  const off = f => f.k[0] > 20 && Math.abs(4 * f.k[1] + 4 * f.k[2] + 9 * f.k[3] - f.k[0]) > 0.15 * f.k[0];
  assert.equal(all.filter(f => f.src === 'indb' && off(f)).length, 0);
  // USDA uses food-specific Atwater factors and counts alcohol (7 kcal/g), so vegetables, spices and drinks legitimately differ
  const usda = all.filter(f => f.src === 'usda' && !/^(Beverages|Alcoholic Beverages|Vegetables|Spices)/.test(f.grp) && !/alcoholic/i.test(f.alias));
  const share = usda.filter(off).length / usda.length;
  assert.ok(share < 0.02, `${(share * 100).toFixed(1)}% of USDA foods off by > 15 %`);
  assert.ok(all.filter(f => f.src === 'indb').every(f => f.k[3] <= 35 || /ghee|butter|oil|mayonnaise|dressing|chocolate|almond|cashew|walnut|peanut|groundnut|sesame|til|chikki/i.test(f.n)), 'deep-fry oil artefacts were dropped');
});

test('diet safety: no food that names meat or fish is ever tagged vegetarian', () => {
  const wrong = all.filter(f => MEAT.test(f.n) && f.diet === 'v' && !/\b(vegetarian|meatless|imitation|substitute|veggie|flavou?r|flavored|soy)\b/i.test(f.n));
  assert.deepEqual(wrong.map(f => f.n).slice(0, 10), []);
});

test('diet safety: uncertain fast food is never called vegetarian', () => {
  const bigMac = all.find(f => /BIG MAC/i.test(f.alias || f.n));
  assert.ok(bigMac, 'Big Mac is in the data');
  assert.equal(bigMac.diet, 'n');
  assert.ok(blockReasons(bigMac, rulesOf({ diet: 'veg' })).includes('DIET:veg'));
});

test('INDB tags come from ingredients: chilli paneer has milk; rajma is vegan; dosa with potato is not Jain', () => {
  const find = re => all.find(f => f.src === 'indb' && re.test(f.n));
  const rajma = find(/rajmah? curry/i), chicken = find(/^chicken curry$/i);
  assert.ok(rajma.tags.includes('vegan')); assert.equal(rajma.diet, 'v');
  assert.equal(chicken.diet, 'n');
  const masala = find(/^masala dosa$/i);
  assert.ok(masala && !masala.tags.includes('jain'), 'potato filling');
  assert.ok(blockReasons(masala, rulesOf({ diet: 'veg', dietTags: ['jain'] })).includes('TAG:jain'));
  const raita = all.find(f => f.src === 'indb' && /raita/i.test(f.n));
  if (raita) assert.ok(raita.al.includes('lactose'));
});

test('search finds Indian dishes and world snacks, with the campus list still first', () => {
  assert.ok(searchFoods('rajma').some(f => f.src === 'indb'));
  assert.ok(searchFoods('potato chips barbecue').some(f => f.src === 'usda'));
  assert.ok(searchFoods('hummus').length > 0);
  assert.ok(searchFoods('pad thai').length > 0 || searchFoods('lasagna').length > 0);
  assert.notEqual(searchFoods('chapati')[0].src, 'usda', 'campus foods rank first on ties');
  const id = searchFoods('rajma').find(f => f.src === 'indb').id;
  assert.equal(getFood(id).id, id);
  assert.ok(extraById(id));
});

test('perf: a search over 8,600 foods stays fast', () => {
  searchFoods('warm');
  const t0 = performance.now();
  for (const q of ['paneer tikka', 'chocolate chip cookie', 'dal', 'pizza', 'masala dosa', 'apple juice', 'egg fried rice', 'oats', 'samosa', 'ramen']) searchFoods(q, { limit: 8 });
  const ms = (performance.now() - t0) / 10;
  assert.ok(ms < 40, `${ms.toFixed(1)} ms per search`);
});

test('logged items carry fibre, sugar and sodium, so verdicts can flag salty and sugary snacks', () => {
  const chips = all.find(f => f.src === 'usda' && /potato chips, plain, salted/i.test(f.alias || f.n)) || all.find(f => f.src === 'usda' && /potato chips/i.test(f.n) && f.x.na > 400);
  const it = makeItem(chips, { sizeIdx: chips.sizes.length - 1, qty: 2, meal: 'snacks' });      // 200 g
  assert.ok(it.sodium > 800, `sodium ${it.sodium}`);
  const v = evaluate({ items: [it], logged: { items: [] }, profile: { goal: 'lose', diet: 'veg', sex: 'male' }, targets: { cal: 2000, p: 120, floor: 1500 }, now: new Date(2026, 5, 1, 17), meal: 'snacks' });
  assert.ok(v.reasons.includes('HIGH_SODIUM'), v.reasons.join());
  const soda = all.find(f => f.src === 'usda' && /cola/i.test(f.n) && f.x.sug > 8);
  const s = makeItem(soda, { sizeIdx: soda.sizes.length - 1, qty: 3.3, meal: 'snacks' });
  assert.ok(evaluate({ items: [s], logged: { items: [] }, profile: { goal: 'maintain', diet: 'nonveg', sex: 'male' }, targets: { cal: 2400, p: 120, floor: 1500 }, now: new Date(2026, 5, 1, 17), meal: 'snacks' }).reasons.includes('HIGH_SUGAR'));
});

test('a vegan asking about an INDB dish with ghee is blocked from its ingredients, not its name', () => {
  const ghee = all.find(f => f.src === 'indb' && f.diet === 'v' && f.al?.includes('lactose') && !/ghee|milk|paneer|curd|butter|cream|cheese|kheer|lassi|raita/i.test(f.n));
  assert.ok(ghee, 'a dairy-containing dish whose name hides it');
  assert.ok(blockReasons(ghee, rulesOf({ diet: 'veg', dietTags: ['vegan'] })).includes('TAG:vegan'));
  assert.ok(blockReasons(ghee, rulesOf({ diet: 'veg', allergies: ['lactose'] })).includes('ALLERGEN:lactose'));
});

test('rowsToFoods keeps the compact format readable', () => {
  const [f] = rowsToFoods({ cols: india.cols, groups: ['Indian recipes'], rows: [['X1', 'Test dal', 0, 'v', 120, 6, 15, 4, 3, 1, 200, 0.5, 1.5, null, 30, null, [['1 bowl', 150]], ['lactose'], ['jain']]] }, 'indb');
  assert.equal(f.id, 'indb-X1'); assert.equal(f.cat, 'indian'); assert.deepEqual(f.sizes, [['1 bowl', 150], ['100 g', 100]]);
  assert.deepEqual(f.x, { fib: 3, sug: 1, na: 200, sat: 0.5, fe: 1.5, ca: 30 }); assert.deepEqual(f.al, ['lactose']);
});
