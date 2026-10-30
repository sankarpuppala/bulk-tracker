// =============================================================
// SNAP MATCHING — turns what the vision model saw into numbers the
// app trusts (spec §5.6). Pure: the food search is passed in.
//
//   matchItem(rec, { candidates, search })  recognised item → SnapItem
//   macrosOf(item)                          current kcal / P / C / F
//   scaleItem(item, factor)                 portion chips (½×–2×)
//   judge(result)                           { ok } or a retake prompt
//   suggestOverride(items, candidates)      "update today's menu?"
//   toLogged(item, meal)                    the item as it is logged
//
// Macros come from the mess menu or the food DB whenever there is a match;
// the model's own per-100 g guess is only a fallback, always marked "≈ estimate".
// =============================================================
import { round, uid } from '../util.js';
import { dietOf } from './plate.js';

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stem = t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
const toks = s => norm(s).split(' ').filter(t => t.length > 1).map(stem);

/** 0..1 overlap of two dish names: 1 for identical, 0 for nothing shared. */
export function nameScore(a, b) {
  const x = toks(a), y = toks(b);
  if (!x.length || !y.length) return 0;
  if (norm(a) === norm(b)) return 1;
  const common = x.filter(t => y.includes(t)).length;
  return common / Math.max(x.length, y.length);
}

function bestCandidate(name, matched, candidates) {
  if (matched) {
    const exact = candidates.find(c => norm(c.n) === norm(matched));
    if (exact) return exact;                 // the model named a candidate exactly: trust it
  }
  let best = null, sc = 0;
  for (const c of candidates) { const s = Math.max(nameScore(name, c.n), matched ? nameScore(matched, c.n) : 0); if (s > sc) { sc = s; best = c; } }
  return sc >= 0.5 ? best : null;
}

const confOf = (model, source) => (source === 'menu' ? 'matched' : source === 'estimate' ? (model === 'low' ? 'low' : 'est') : model === 'high' ? 'high' : model === 'low' ? 'low' : 'est');

/**
 * @param rec         one item from vision.meal: { name, matched_candidate, count, grams, confidence, est_per_100g, cooking, visible_fat }
 * @param candidates  this meal's menu: [{ n, cal, p, c, f, diet }] per serving
 * @param search      (name) => foods, best first (searchFoods)
 */
export function matchItem(rec, { candidates = [], search = () => [] } = {}) {
  const grams = Math.max(1, +rec.grams || 100);
  const base = { key: uid(), name: rec.name, grams, count: rec.count || null, model: rec.confidence || 'medium', cooking: rec.cooking || 'unknown', fat: rec.visible_fat || 'none' };

  const c = bestCandidate(rec.name, rec.matched_candidate, candidates);
  if (c) {
    const servings = rec.count && rec.count > 0 ? rec.count : 1;
    return { ...base, name: c.n, source: 'menu', servings, perServing: { cal: +c.cal || 0, p: +c.p || 0, c: +c.c || 0, f: +c.f || 0 }, diet: c.diet || dietOf(c.n), conf: 'matched', est: false };
  }

  for (const f of search(rec.name).slice(0, 3)) {
    const s = nameScore(rec.name, `${f.brand || ''} ${f.n}`);
    if (s >= 0.5 || norm(rec.name).includes(norm(f.n)) || norm(f.n).includes(norm(rec.name))) {
      return { ...base, name: f.brand ? `${f.brand} ${f.n}` : f.n, source: 'db', fid: f.id, per100: { cal: f.k[0], p: f.k[1], c: f.k[2], f: f.k[3] }, diet: f.diet || dietOf(f.n), conf: confOf(base.model, 'db'), est: false };
    }
  }

  const e = rec.est_per_100g;
  if (e && e.kcal >= 0) return { ...base, source: 'estimate', per100: { cal: e.kcal, p: e.p, c: e.c, f: e.f }, diet: dietOf(rec.name), conf: confOf(base.model, 'estimate'), est: true };
  return { ...base, source: 'unknown', per100: null, diet: dietOf(rec.name), conf: 'low', est: true };
}

export function macrosOf(it) {
  const m = it.source === 'menu' ? { cal: it.perServing.cal * it.servings, p: it.perServing.p * it.servings, c: it.perServing.c * it.servings, f: it.perServing.f * it.servings }
    : it.per100 ? { cal: (it.per100.cal * it.grams) / 100, p: (it.per100.p * it.grams) / 100, c: (it.per100.c * it.grams) / 100, f: (it.per100.f * it.grams) / 100 }
      : { cal: 0, p: 0, c: 0, f: 0 };
  return { cal: round(m.cal), p: round(m.p, 1), c: round(m.c, 1), f: round(m.f, 1) };
}

export const sumMacros = items => items.reduce((a, it) => { const m = macrosOf(it); return { cal: a.cal + m.cal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }; }, { cal: 0, p: 0, c: 0, f: 0 });

/** Portion chips: ½×, 1×, 1½×, 2× the recognised amount. Always scales from the original. */
export function scaleItem(it, factor) {
  const o = it.original || { grams: it.grams, servings: it.servings };
  return { ...it, original: o, factor, grams: round(o.grams * factor), servings: it.servings != null ? round((o.servings ?? 1) * factor, 2) : it.servings };
}

/**
 * Decide whether the result can be shown at all. A non-food, unusable or all-low-confidence
 * photo gets a retake prompt, never a fabricated table.
 */
export function judge(result) {
  if (!result || result.is_food === false) return { ok: false, reason: 'not-food', hint: result?.retake_hint || 'That doesn’t look like food. Try again, closer to the plate.' };
  if (result.usable === false) return { ok: false, reason: 'unusable', hint: result.retake_hint || 'The photo is too dark or blurry. Try again with more light.' };
  const items = result.items || [];
  if (!items.length) return { ok: false, reason: 'empty', hint: 'Couldn’t see any food clearly. Retake it, or search instead.' };
  if (items.every(i => i.confidence === 'low')) return { ok: false, reason: 'unsure', hint: 'Couldn’t see food clearly. Retake it, or search instead.' };
  return { ok: true };
}

/**
 * When the plate is mostly not what the menu says, offer to fix the menu for that meal today.
 * Returns the replacement menu items, or null when the plate matches the plan.
 */
export function suggestOverride(items, candidates) {
  if (!candidates.length || items.length < 2) return null;
  const onMenu = items.filter(i => i.source === 'menu').length;
  if (onMenu / items.length >= 0.5) return null;
  const real = items.filter(i => i.conf !== 'low' && i.source !== 'unknown');
  if (real.length < 2) return null;
  return real.map(i => {
    const m = i.source === 'menu' ? i.perServing : macrosOf(i);
    return { n: i.name, cal: round(m.cal), p: round(m.p, 1), c: round(m.c, 1), f: round(m.f, 1), diet: i.diet };
  });
}

/** The item as it goes into the log: same shape as makeItem/makeMessItem, plus provenance. */
export function toLogged(it, meal) {
  const m = macrosOf(it);
  return {
    id: uid(), fid: it.fid || undefined, n: it.name,
    unit: it.source === 'menu' ? `${it.servings} serving${it.servings === 1 ? '' : 's'}` : `${round(it.grams)} g`,
    qty: it.source === 'menu' ? it.servings : 1, g: round(it.grams),
    cal: m.cal, p: m.p, c: m.c, f: m.f, price: null, meal, diet: it.diet || 'v', cat: it.source === 'menu' ? 'mess' : 'custom',
    ts: Date.now(), src: 'photo', conf: it.conf, est: !!it.est,
  };
}

/** Menu-chart result → the text format the paste-a-week importer reads. */
export function menuToText(week) {
  const lines = [];
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    const day = week?.[d]; if (!day) continue;
    lines.push(d.toUpperCase());
    for (const m of ['breakfast', 'lunch', 'snacks', 'dinner']) {
      const names = (day[m] || []).map(x => String(x.n || '').replace(/[,\n]/g, ' ').trim()).filter(Boolean);
      if (names.length) lines.push(`${m[0].toUpperCase() + m.slice(1)}: ${names.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Label result → the "create a food" form fields (per 100 g, as printed). */
export function labelToFood(label) {
  const per = label.per_100 || null, ps = label.per_serving || null;
  const g = label.serving_grams || null;
  const src = per && per.kcal != null ? per : ps && g ? { kcal: ps.kcal != null ? (ps.kcal / g) * 100 : null, protein_g: ps.protein_g != null ? (ps.protein_g / g) * 100 : null, carbs_g: ps.carbs_g != null ? (ps.carbs_g / g) * 100 : null, fat_g: ps.fat_g != null ? (ps.fat_g / g) * 100 : null } : null;
  if (!src) return null;
  return {
    n: label.product || '', brand: label.brand || '', serving: label.serving_size || '1 serving', g: g || 100,
    per100: { cal: round(src.kcal ?? 0), p: round(src.protein_g ?? 0, 1), c: round(src.carbs_g ?? 0, 1), f: round(src.fat_g ?? 0, 1) },
    diet: label.diet_mark === 'nonveg' ? 'n' : 'v', converted: !!label.energy_converted, unreadable: label.unreadable_fields || [],
  };
}
