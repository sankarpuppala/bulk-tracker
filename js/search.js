// =============================================================
// FOOD SEARCH · QUICK-LOG PARSER · OPEN FOOD FACTS
// =============================================================
import { FOODS, CATEGORIES, POPULAR } from '../data/foods.js';
import { dietAllows } from './nutrition.js';
import { store } from './store.js';

const catLabel = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));
const byId = new Map(FOODS.map(f => [f.id, f]));

export function allFoods() {
  return store.profile.customFoods.concat(FOODS);
}
export function getFood(id) {
  return byId.get(id) || store.profile.customFoods.find(f => f.id === id) || null;
}

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9₹ ]+/g, ' ');
const stem = t => (t.length > 3 && t.endsWith('es') && !t.endsWith('ies') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

function hay(f) {
  if (!f._hay) {
    f._name = norm(f.n).split(/\s+/).filter(Boolean).map(stem);
    f._hay = norm(`${f.n} ${f.brand || ''} ${f.alias || ''} ${catLabel[f.cat] || ''}`).split(/\s+/).filter(Boolean).map(stem);
  }
  return f;
}

function near(a, b) {
  // edit distance ≤ 1 for typo tolerance ("bingoo", "parleg")
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function searchFoods(q, { diet, cat, limit = 40 } = {}) {
  const tokens = norm(q).split(/\s+/).filter(t => t && !/^\d+$/.test(t)).map(stem);
  let pool = allFoods();
  if (cat) pool = pool.filter(f => f.cat === cat);
  if (diet) pool = pool.filter(f => dietAllows(diet, f.diet || 'v'));
  if (!tokens.length) return cat ? pool.slice(0, limit) : [];
  const scored = [];
  for (const f of pool) {
    hay(f);
    let sc = 0, hits = 0;
    for (const t of tokens) {
      if (f._name.some(w => w === t)) { sc += 4; hits++; }
      else if (f._name.some(w => w.startsWith(t))) { sc += 3; hits++; }
      else if (f._hay.some(w => w.startsWith(t))) { sc += 2; hits++; }
      else if (t.length >= 4 && f._hay.some(w => near(w, t))) { sc += 1; hits++; }
      else sc -= 2.5;
    }
    if (!hits) continue;
    if (hits === tokens.length) sc += 2;
    // head noun: "milk" should prefer "Toned Milk" over "Milk Bikis"
    if (tokens.includes(f._name[f._name.length - 1])) sc += 1.5;
    sc -= f._name.length * 0.15;
    if (f.src === 'custom') sc += 0.5;
    if (POPULAR.has(f.id)) sc += 1.5;
    scored.push([sc, f]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}

// ---------- natural-language quick log ----------
const WORDNUM = { half: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2 };
const FILLER = /\b(of|the|some|pcs|pc|pieces|piece|nos|no|x|plate|plates|bowl|bowls|glass|glasses|cup|cups|katori|pack|packet|packs|slice|slices|scoop|scoops|serving|servings|bar|bars|bottle|can|tbsp|tsp|spoon|spoons)\b/g;

/**
 * "2 eggs, bingo chilli 20rs, 1 glass milk + 150g chicken"
 *  → [{raw, food, sizeIdx, qty, grams}]
 */
export function parseQuickLog(text, diet) {
  return String(text).split(/,|\n|\+|;|\band\b|\bwith\b/i).map(s => s.trim()).filter(Boolean).map(raw => {
    let t = raw.toLowerCase();
    let price = null, grams = null, qty = 1;
    const pm = t.match(/(?:₹|rs\.?|inr)\s*(\d+)|(\d+)\s*(?:₹|rs\.?|rupees?|rupee|\/-|bucks)/);
    if (pm) { price = +(pm[1] || pm[2]); t = t.replace(pm[0], ' '); }
    const gm = t.match(/(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|ml)\b/);
    if (gm) { grams = +gm[1]; t = t.replace(gm[0], ' '); }
    const qm = t.match(/^\s*(\d+(?:\.\d+)?|half|an?|one|two|three|four|five|six|seven|eight|nine|ten|couple)\s*(?:x|\*)?\s+/) || t.match(/\s(?:x|\*)\s*(\d+(?:\.\d+)?)\s*$/);
    if (qm) { qty = WORDNUM[qm[1]] ?? +qm[1]; t = t.replace(qm[0], ' '); }
    const hint = t;
    const q = t.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    // among the top matches, prefer one whose serving sizes match words like "glass" or "plate"
    const cands = q ? searchFoods(q, { diet: null, limit: 5 }) : [];
    const hintWords = new Set(hint.split(/[^a-z]+/).map(stem));
    const sizeHit = f => f.sizes.some(s => s[0].toLowerCase().split(/[^a-z]+/).some(w => w.length > 2 && hintWords.has(stem(w))));
    const food = cands.find(sizeHit) || cands[0] || null;
    let sizeIdx = 0;
    if (food) {
      if (price != null) {
        let best = -1, bd = Infinity;
        food.sizes.forEach((s, i) => { if (s[2] != null && Math.abs(s[2] - price) < bd) { bd = Math.abs(s[2] - price); best = i; } });
        if (best >= 0) sizeIdx = best;
      } else {
        const i = food.sizes.findIndex(s => s[0].toLowerCase().split(/\s+/).some(w => w.length > 2 && hint.includes(w)));
        if (i >= 0) sizeIdx = i;
      }
    }
    return { raw, food, sizeIdx, qty: qty || 1, grams: food && grams ? grams : null };
  });
}

// ---------- Open Food Facts ----------
const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity';

function offToFood(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
  if (kcal == null || !p.product_name) return null;
  const sizes = [];
  const sq = parseFloat(p.serving_quantity);
  if (sq > 0) sizes.push([`1 serving${p.serving_size ? ' (' + p.serving_size + ')' : ''}`, sq]);
  const pq = parseFloat(p.product_quantity);
  if (pq > 0 && pq !== sq) sizes.push([`Whole pack (${p.quantity || pq + ' g'})`, pq]);
  sizes.push(['100 g', 100]);
  return {
    id: 'off-' + p.code, n: p.product_name.trim(), brand: (p.brands || '').split(',')[0].trim(), cat: 'custom', src: 'off',
    k: [Math.round(kcal), +(n.proteins_100g || 0).toFixed(1), +(n.carbohydrates_100g || 0).toFixed(1), +(n.fat_100g || 0).toFixed(1)],
    sizes, diet: 'v', code: p.code,
  };
}

async function offFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function offSearch(q) {
  const qs = `search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${OFF_FIELDS}`;
  let data = await offFetch(`https://in.openfoodfacts.org/cgi/search.pl?${qs}`);
  let list = (data.products || []).map(offToFood).filter(Boolean);
  if (list.length < 5) {
    data = await offFetch(`https://world.openfoodfacts.org/cgi/search.pl?${qs}`);
    const seen = new Set(list.map(f => f.id));
    list = list.concat((data.products || []).map(offToFood).filter(f => f && !seen.has(f.id)));
  }
  return list;
}

export async function offBarcode(code) {
  const data = await offFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (data.status !== 1 || !data.product) return null;
  return offToFood({ ...data.product, code });
}
