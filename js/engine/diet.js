// =============================================================
// DIET RULES — one place that says whether a food is allowed for
// this person today: veg / egg / non-veg, allergies, diet patterns
// (vegan, Jain, halal, no-beef, no-pork) and fasting rules.
//
//   blockReasons(item, rules)  → ['DIET:veg', 'ALLERGEN:peanut', 'TAG:vegan', 'FAST:navratri'…]
//   allowed(item, rules)       → boolean
//   rulesOf(profile, fast)     → the rules object the engines carry around
//
// Every engine that suggests food (plate planner, top-ups, alternatives,
// verdicts, Snap warnings) goes through here, so a hard filter is never
// missed in one place. Tags are matched on names until the database
// carries explicit ones; a food that declares `tags` / `al` wins.
// Pure: no DOM, no network.
// =============================================================
import { dietOf, dietAllows } from './plate.js';
import { allergenHits } from './allergens.js';

export const DIET_TAGS = [
  { id: 'vegan', label: 'Vegan', sub: 'No milk, curd, paneer, ghee, honey or egg' },
  { id: 'jain', label: 'Jain', sub: 'No onion, garlic or root vegetables' },
  { id: 'halal', label: 'Halal', sub: 'No pork or alcohol; check meat is halal' },
  { id: 'no-beef', label: 'No beef', sub: '' },
  { id: 'no-pork', label: 'No pork', sub: '' },
];

const DAIRY_HONEY = /\b(milk|paneer|curd|dahi|yogurt|yoghurt|cheese|butter|ghee|lassi|raita|kheer|payasam|ice cream|cream|whey|khoa|mawa|rasmalai|rasgulla|gulab jamun|barfi|kulfi|shake|latte|cappuccino|chai|tea|coffee|honey|kadhi|buttermilk|majjiga|cadbury|dairy milk|kitkat|kit kat|munch|snickers|nutella|ferrero|brownie|cake|pastry|donut|croissant|custard|mcflurry|cornetto|magnum|bournvita|horlicks|boost|mayo|mayonnaise|egg|omelette|omelet|bhurji)\b/i;
const ROOT = /\b(onion|onions|garlic|potato|potatoes|aloo|carrot|beetroot|radish|mooli|ginger|turnip|sweet potato|yam|samosa|vada pav|pav bhaji|bhel|pani puri|sev puri|dahi puri|chaat|tikki|dum aloo|biryani|pulao|manchurian|fried rice|noodles|maggi|momos|shawarma|frankie|puff|pakoda|bajji|bonda|bhaji|pizza|burger|fries|french fries|chips|wafers)\b/i;
const BEEF = /\b(beef|veal|buff|ox)\b/i;
const PORK = /\b(pork|bacon|ham|sausage|salami|pepperoni|lard)\b/i;
const ALCOHOL = /\b(beer|wine|rum|vodka|whisky|whiskey|brandy|gin|alcohol|liquor|cocktail)\b/i;

// fasting
const GRAIN_PULSE = /\b(rice|biryani|pulao|chapati|roti|phulka|paratha|naan|kulcha|poori|puri|bhatura|bread|pav|bun|dosa|idli|upma|poha|pongal|noodles|maggi|oats|corn flakes|wheat|atta|maida|semolina|rava|suji|dal|rajma|chana|chole|beans|sambar|rasam|khichdi|moong|toor|urad|pesarattu|vada)\b/i;
const ONION_GARLIC = /\b(onion|onions|garlic)\b/i;

const nameOf = it => `${it.brand || ''} ${it.n || it.name || ''}`;

export function rulesOf(profile = {}, fast = null) {
  return { diet: profile.diet || 'nonveg', allergies: profile.allergies || [], tags: profile.dietTags || [], fast: fast?.mode || null };
}

/** Why `item` is not allowed under `rules` (empty array = allowed). */
export function blockReasons(item, rules = {}) {
  const r = [];
  const d = item.diet || dietOf(item.n || item.name);
  const name = nameOf(item), declared = Array.isArray(item.tags), has = t => item.tags?.includes(t);
  if (!dietAllows(rules.diet || 'nonveg', d)) r.push(`DIET:${rules.diet}`);
  for (const a of allergenHits(item, rules.allergies)) r.push(`ALLERGEN:${a}`);
  for (const t of rules.tags || []) {
    if (t === 'vegan' && (declared ? !has('vegan') : d !== 'v' || DAIRY_HONEY.test(name))) r.push('TAG:vegan');
    else if (t === 'jain' && (declared ? !has('jain') : d !== 'v' || ROOT.test(name))) r.push('TAG:jain');
    else if (t === 'halal' && (PORK.test(name) || ALCOHOL.test(name))) r.push('TAG:halal');
    else if (t === 'no-beef' && BEEF.test(name)) r.push('TAG:no-beef');
    else if (t === 'no-pork' && PORK.test(name)) r.push('TAG:no-pork');
  }
  if (rules.fast === 'navratri' && (d !== 'v' || ONION_GARLIC.test(name) || GRAIN_PULSE.test(name) || /\b(biryani|fried rice)\b/i.test(name))) r.push('FAST:navratri');
  if (rules.fast === 'ekadashi' && (d !== 'v' || GRAIN_PULSE.test(name))) r.push('FAST:ekadashi');
  return r;
}

export const allowed = (item, rules) => blockReasons(item, rules).length === 0;

/** A one-line reason for the UI, in neutral wording. */
export function blockText(code) {
  const [k, v] = code.split(':');
  if (k === 'DIET') return v === 'veg' ? 'non-vegetarian food or egg' : 'meat or fish';
  if (k === 'ALLERGEN') return `${v}, which you’ve marked as an allergy`;
  if (k === 'TAG') return { vegan: 'animal products', jain: 'onion, garlic or root vegetables', halal: 'pork or alcohol', 'no-beef': 'beef', 'no-pork': 'pork' }[v] || v;
  if (k === 'FAST') return v === 'navratri' ? 'something outside a Navratri fast' : 'grains or pulses, outside an Ekadashi fast';
  return code;
}
