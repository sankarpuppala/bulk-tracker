// =============================================================
// EXTENDED FOOD DATABASE — two open datasets beside the hand-curated
// campus list in data/foods.js, loaded lazily (≈1.2 MB, cached by the
// service worker, so it works offline after the first load):
//
//   data/india-foods.json  ~850 cooked Indian recipes, Indian Nutrient
//                          Databank (INDB, 2024). Diet, allergens, vegan
//                          and Jain tags come from each recipe's ingredients.
//   data/world-foods.json  ~7,400 foods and snacks, USDA FoodData Central
//                          SR Legacy (public domain).
//
// Both carry fibre, sugar, sodium, saturated fat, iron, calcium (and for
// USDA, B12 and vitamin D), which the verdict engine and the micronutrient
// watch use. Foods come out in the same shape as data/foods.js, so search,
// logging, Ask and Snap need no special cases.
// Built by tools/import-indb.py and tools/import-usda.mjs.
// =============================================================

export const SOURCES = {
  indb: { file: 'data/india-foods.json', cat: 'indian', prefix: 'indb-', credit: 'Indian Nutrient Databank (INDB), Vijayakumar et al. 2024' },
  usda: { file: 'data/world-foods.json', cat: 'world', prefix: 'usda-', credit: 'USDA FoodData Central, SR Legacy' },
};

let foods = [];
const byId = new Map();
let loading = null, ready = false;

/** USDA names read "Snacks, potato chips, barbecue-flavor"; keep them searchable but readable. */
export function displayName(name, src) {
  if (src !== 'usda') return name;
  return name.replace(/^(Snacks|Fast foods|Restaurant), /i, '').replace(/\bMcDONALD'S\b/g, 'McDonald’s').replace(/\bBURGER KING\b/g, 'Burger King').replace(/\bKFC\b/g, 'KFC');
}

/** Compact JSON rows → food objects (pure; the unit tests use it straight from disk). */
export function rowsToFoods(doc, src) {
  const s = SOURCES[src], C = Object.fromEntries(doc.cols.map((c, i) => [c, i]));
  return doc.rows.map(r => {
    const x = {};
    for (const k of ['fib', 'sug', 'na', 'sat', 'fe', 'b12', 'ca', 'd']) if (r[C[k]] != null) x[k] = r[C[k]];
    const f = {
      id: s.prefix + r[C.id], n: displayName(r[C.name], src), alias: src === 'usda' ? r[C.name] : '', cat: s.cat, grp: doc.groups[r[C.group]] || '',
      k: [r[C.kcal], r[C.p], r[C.c], r[C.f]], sizes: [...(r[C.portions] || []), ['100 g', 100]], diet: r[C.diet], src, x,
    };
    if (C.al != null && Array.isArray(r[C.al])) f.al = r[C.al];
    if (C.tags != null && Array.isArray(r[C.tags])) f.tags = r[C.tags];
    return f;
  });
}

export function addFoods(list) {
  for (const f of list) if (!byId.has(f.id)) { byId.set(f.id, f); foods.push(f); }
}

/** Load both datasets once. `get(url)` is injectable for tests. Resolves to the number of foods. */
export function loadFoodDb(get = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })) {
  if (loading) return loading;
  loading = Promise.all(Object.keys(SOURCES).map(src => get(SOURCES[src].file).then(doc => addFoods(rowsToFoods(doc, src))).catch(e => console.warn('food database not loaded:', src, e.message || e))))
    .then(() => { ready = foods.length > 0; return foods.length; });
  return loading;
}

export const extraFoods = () => foods;
export const extraById = id => byId.get(id) || null;
export const foodDbReady = () => ready;
export const creditFor = f => SOURCES[f?.src]?.credit || null;
