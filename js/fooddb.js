// =============================================================
// EXTENDED FOOD DATABASE — four open datasets beside the hand-curated
// campus list in data/foods.js, loaded lazily (cached by the service
// worker, so everything works offline after the first visit):
//
//   data/ifct-foods.json      528 Indian foods from IFCT 2017 (ICMR-NIN),
//                             with local names in ~16 Indian languages and
//                             diet tags taken from the official food group.
//   data/india-foods.json     ~850 cooked Indian recipes (INDB 2024).
//   data/packaged-foods.json  ~1,000 packs sold in India, each with its
//                             barcode, from Open Food Facts (ODbL).
//   data/world-foods.json     ~7,400 world foods and snacks, USDA SR Legacy.
//
// All four carry fibre, sugar, sodium, saturated fat, iron and calcium,
// which the verdict engine and the micronutrient watch use. Foods come out
// in the same shape as data/foods.js, so search, logging, Ask and Snap need
// no special cases.
//
// Built by tools/import-ifct.py, import-indb.py, import-off.py and import-usda.mjs.
// =============================================================

export const SOURCES = {
  ifct: { file: 'data/ifct-foods.json', cat: 'indian', prefix: 'ifct-', credit: 'IFCT 2017, ICMR–NIN' },
  indb: { file: 'data/india-foods.json', cat: 'indian', prefix: 'indb-', credit: 'Indian Nutrient Databank (INDB), Vijayakumar et al. 2024' },
  off: { file: 'data/packaged-foods.json', cat: 'packaged', prefix: 'off-', credit: 'Open Food Facts (ODbL)' },
  usda: { file: 'data/world-foods.json', cat: 'world', prefix: 'usda-', credit: 'USDA FoodData Central, SR Legacy' },
};

let foods = [];
const byId = new Map();
const byCode = new Map();
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
    // local names (IFCT) and the raw USDA description both go in `alias`, which search reads
    const alias = [C.alias != null && Array.isArray(r[C.alias]) ? r[C.alias].join(' ') : '', src === 'usda' ? r[C.name] : ''].filter(Boolean).join(' ');
    const f = {
      id: s.prefix + r[C.id], n: displayName(r[C.name], src), alias, cat: s.cat, grp: doc.groups[r[C.group]] || '',
      k: [r[C.kcal], r[C.p], r[C.c], r[C.f]], sizes: [...(r[C.portions] || []), ['100 g', 100]], diet: r[C.diet], src, x,
    };
    if (C.al != null && Array.isArray(r[C.al])) f.al = r[C.al];
    if (C.tags != null && Array.isArray(r[C.tags])) f.tags = r[C.tags];
    if (src === 'off' && /^\d{8,14}$/.test(r[C.id])) f.code = r[C.id];
    return f;
  });
}

export function addFoods(list) {
  for (const f of list) {
    if (byId.has(f.id)) continue;
    byId.set(f.id, f);
    foods.push(f);
    if (f.code && !byCode.has(f.code)) byCode.set(f.code, f);
  }
}

/** Load every dataset once. `get(url)` is injectable for tests. Resolves to the number of foods. */
export function loadFoodDb(get = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })) {
  if (loading) return loading;
  loading = Promise.all(Object.keys(SOURCES).map(src =>
    get(SOURCES[src].file)
      .then(doc => addFoods(rowsToFoods(doc, src)))
      .catch(e => console.warn('food database not loaded:', src, e.message || e))))
    .then(() => { ready = foods.length > 0; return foods.length; });
  return loading;
}

/** Run `cb` once every dataset is in (immediately if it already is). */
export function onFoodDbReady(cb) {
  if (ready) { cb(foods.length); return () => {}; }
  let cancelled = false;
  (loading || Promise.resolve(0)).then(n => { if (!cancelled) cb(n); });
  return () => { cancelled = true; };
}

export const extraFoods = () => foods;
export const extraById = id => byId.get(id) || null;
export const foodDbReady = () => ready;
export const creditFor = f => SOURCES[f?.src]?.credit || null;

/** A packaged food by its barcode, with no network. Leading zeros and EAN-8/13 both work. */
export function foodByBarcode(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (!c) return null;
  return byCode.get(c) || byCode.get(c.replace(/^0+/, '')) || byCode.get('0' + c) || null;
}
export const barcodeCount = () => byCode.size;
