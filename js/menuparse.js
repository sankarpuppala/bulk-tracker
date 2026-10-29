// =============================================================
// MENU PASTE PARSER
// Turns a pasted mess chart (WhatsApp text, a PDF copy-paste, a
// table) into a week of meals. Dish names are taken verbatim;
// macros are filled in only when a dish matches the food database
// confidently, otherwise they're left blank for a human to fill.
// Guessing macros would be worse than leaving them empty.
// =============================================================
import { WEEK, MEALS } from '../data/messes.js';
import { searchFoods } from './search.js';
import { dietOf } from './nutrition.js';
import { round } from './util.js';

const DAY_RE = /^(mon|tues?|wednes|wed|thurs?|thu|fri|satur|sat|sun)(day)?/i;
const DAY_OF = p => ({ mon: 'Monday', tue: 'Tuesday', tues: 'Tuesday', wed: 'Wednesday', wednes: 'Wednesday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', fri: 'Friday', sat: 'Saturday', satur: 'Saturday', sun: 'Sunday' })[p.toLowerCase()];

const MEAL_RE = [
  ['breakfast', /^(break\s*fast|breakfeast|b\s*\/?\s*f\b|tiffin|morning)/i],
  ['lunch', /^(lunch|after\s*noon|noon|mid\s*day)/i],
  ['snacks', /^(evening\s*snacks?|snacks?|evening|eve\b|high\s*tea|tea\s*time)/i],
  ['dinner', /^(dinner|supper|night)/i],
];

const SEP = /^[\s:.\-–—)|]+/;
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function matchMeal(line) {
  for (const [id, re] of MEAL_RE) {
    const m = line.match(re);
    if (m) return { id, len: m[0].length };
  }
  return null;
}

function matchDay(line) {
  const m = line.match(DAY_RE);
  if (!m) return null;
  const day = DAY_OF(m[1]);
  if (!day) return null;
  const after = line.slice(m[0].length);
  const rest = after.replace(SEP, '');
  // "MONDAY" / "Monday:" / "Monday - Breakfast: ..." / "Mon | Idli, Vada"
  if (rest === '' || /^[\s:.\-–—|)]/.test(after) || matchMeal(rest)) return { day, rest };
  return null;
}

/** Split one line into dish names. Slashes are kept ("Poha / Upma" is one choice). */
function splitItems(s) {
  return s
    .split(/[,;•·]|\t|\s\|\s|(?:^|\s)\d+[.)]\s+/g)
    .map(x => x.replace(/^[\s\-–—*•·.)\d]+/, '').replace(/[\s.:-]+$/, '').trim())
    .filter(x => x.length > 1 && x.length <= 80 && /[a-z]/i.test(x));
}

/**
 * Macros for a dish name, or null when nothing in the database is a
 * confident match. Requires most of the matched food's own name words
 * to appear in the dish, so "Rice + Chapati" won't borrow plain rice.
 */
export function guessMacros(name) {
  const target = norm(name);
  if (!target) return null;
  const asWords = new RegExp('(^| )' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)');
  for (const f of searchFoods(name, { limit: 5 })) {
    const fname = norm(f.n);
    const toks = fname.split(' ').filter(t => t.length > 2);
    if (!toks.length) continue;
    const hit = toks.filter(t => target.includes(t)).length / toks.length;
    // accept either way round: the dish covers the food's name ("Dal Tadka"),
    // or the dish is a shorter form of it ("Dal" → "Dal Tadka", "Rice" → "Steamed Rice")
    if (hit < 0.6 && !target.includes(fname) && !asWords.test(fname)) continue;
    const g = f.sizes[0][1] / 100;
    return {
      cal: round(f.k[0] * g), p: round(f.k[1] * g, 1), c: round(f.k[2] * g, 1), f: round(f.k[3] * g, 1),
      from: `${f.brand ? f.brand + ' ' : ''}${f.n} · ${f.sizes[0][0]}`,
    };
  }
  return null;
}

/**
 * Parse pasted text into { week, stats }.
 * week is the same shape the menu editor uses: {Monday: {breakfast: [...]}}
 */
export function parseWeekText(text, { lookup = true } = {}) {
  const week = {};
  WEEK.forEach(d => { week[d] = {}; MEALS.forEach(m => { week[d][m.id] = []; }); });

  let day = null, meal = null;
  const seen = new Set();
  let items = 0, matched = 0;
  const unmatched = [];

  const add = (d, m, text) => {
    for (const name of splitItems(text)) {
      const key = d + '|' + m + '|' + norm(name);
      if (seen.has(key)) continue;
      seen.add(key);
      items++;
      const g = lookup ? guessMacros(name) : null;
      if (g) matched++; else unmatched.push(name);
      week[d][m].push({
        n: name,
        cal: g ? g.cal : '', p: g ? g.p : '', c: g ? g.c : '', f: g ? g.f : '',
        diet: dietOf(name), source: g ? g.from : null,
      });
    }
  };

  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    let line = raw.replace(/[*_#>`"]/g, '').trim();
    if (!line) continue;

    // table row: "Mon <tab> Idli, Vada <tab> Rice, Sambar <tab> Tea <tab> Chapati, Dal"
    const cells = line.split(/\t|\s\|\s/).map(c => c.trim()).filter(Boolean);
    if (cells.length >= 3) {
      const head = matchDay(cells[0]);
      if (head && head.rest === '') {
        day = head.day; meal = null;
        const order = cells.length >= 5 ? ['breakfast', 'lunch', 'snacks', 'dinner'] : ['breakfast', 'lunch', 'dinner'];
        cells.slice(1).forEach((cell, i) => { if (order[i]) add(day, order[i], cell); });
        continue;
      }
    }

    const d = matchDay(line);
    if (d) { day = d.day; meal = null; line = d.rest; if (!line) continue; }

    const m = matchMeal(line);
    if (m) { meal = m.id; line = line.slice(m.len).replace(SEP, ''); if (!line) continue; }

    if (!day) continue;
    if (!meal) meal = 'breakfast';       // a day block that starts listing before naming a meal
    add(day, meal, line);
  }

  const daysFound = WEEK.filter(d => MEALS.some(m => week[d][m.id].length));
  const mealsFound = daysFound.reduce((a, d) => a + MEALS.filter(m => week[d][m.id].length).length, 0);
  return {
    week,
    stats: {
      days: daysFound, meals: mealsFound, items, matched,
      unmatched: [...new Set(unmatched)],
      missingDays: WEEK.filter(d => !daysFound.includes(d)),
    },
  };
}

export const SAMPLE_PASTE = `MONDAY
Breakfast: Idli, Medu Vada, Sambar, Coconut chutney
Lunch: Rice, Chapati, Sambar, Beans poriyal, Curd, Pickle
Snacks: Tea, Onion pakoda
Dinner: Chapati, Dal tadka, Aloo curry, Rasam, Rice

TUESDAY
Breakfast: Pongal, Vada, Sambar
...`;
