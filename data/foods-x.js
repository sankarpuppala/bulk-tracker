// =============================================================
// FOOD DATABASE v2 — extra nutrients, kept beside the v1 table.
//
// data/foods.js stays as it was: k = [kcal, protein, carbs, fat] per 100 g.
// This file adds optional detail per food id, so every old reader and every
// saved log keeps working; a food with no entry simply has no extra data.
//
//   fib  fibre g        sug  sugar g       na  sodium mg      sat  saturated fat g
//   fe   iron mg        b12  vitamin B12 µg   ca  calcium mg     d    vitamin D µg
//
// Per 100 g (or 100 ml) as listed in foods.js. Values are rounded
// approximations from Indian food composition tables (IFCT 2017) and
// USDA FoodData Central, and vary by recipe: use them to see patterns
// across a week, not to count a single meal to the milligram.
// =============================================================

export const FOOD_X = {
  'steamed-rice': { fib: 0.4, sug: 0, na: 1, sat: 0.1, fe: 0.2, b12: 0, ca: 10, d: 0 },
  'matta-brown-rice': { fib: 1.8, sug: 0, na: 2, sat: 0.3, fe: 0.5, b12: 0, ca: 10, d: 0 },
  chapati: { fib: 4, sug: 1, na: 280, sat: 3, fe: 2.5, b12: 0, ca: 30, d: 0 },
  'ragi-mudde': { fib: 2.5, sug: 0, na: 5, sat: 0.1, fe: 1.4, b12: 0, ca: 70, d: 0 },
  sambar: { fib: 2, sug: 2, na: 250, sat: 0.5, fe: 1, b12: 0, ca: 25, d: 0 },
  'dal-tadka': { fib: 3, sug: 1, na: 300, sat: 1.5, fe: 1.5, b12: 0, ca: 25, d: 0 },
  'plain-dal-no-tadka': { fib: 3, sug: 1, na: 200, sat: 0.2, fe: 1.4, b12: 0, ca: 22, d: 0 },
  'rajma-curry': { fib: 6, sug: 2, na: 280, sat: 1, fe: 2.4, b12: 0, ca: 40, d: 0 },
  'chole-chana-masala': { fib: 6.5, sug: 3, na: 300, sat: 1.2, fe: 2.5, b12: 0, ca: 50, d: 0 },
  'palak-paneer': { fib: 2, sug: 2, na: 280, sat: 6, fe: 2.3, b12: 0.3, ca: 150, d: 0 },
  'paneer-butter-masala': { fib: 1.5, sug: 4, na: 380, sat: 8, fe: 0.8, b12: 0.4, ca: 130, d: 0 },
  paneer: { fib: 0, sug: 1, na: 20, sat: 11, fe: 0.2, b12: 0.8, ca: 208, d: 0.1 },
  curd: { fib: 0, sug: 4, na: 46, sat: 1.9, fe: 0.1, b12: 0.4, ca: 120, d: 0 },
  raita: { fib: 0.5, sug: 3, na: 200, sat: 1.2, fe: 0.2, b12: 0.3, ca: 90, d: 0 },
  buttermilk: { fib: 0, sug: 3, na: 200, sat: 0.5, fe: 0.1, b12: 0.2, ca: 40, d: 0 },
  'amul-taaza-toned-milk': { fib: 0, sug: 5, na: 45, sat: 1.9, fe: 0.1, b12: 0.45, ca: 120, d: 0.5 },
  'amul-gold-full-cream-milk': { fib: 0, sug: 5, na: 45, sat: 3.4, fe: 0.1, b12: 0.45, ca: 120, d: 0.5 },
  'double-toned-skim-milk': { fib: 0, sug: 5, na: 45, sat: 0.9, fe: 0.1, b12: 0.45, ca: 125, d: 0.5 },
  'greek-yogurt-plain': { fib: 0, sug: 4, na: 40, sat: 2, fe: 0.1, b12: 0.5, ca: 110, d: 0 },
  'boiled-egg': { fib: 0, sug: 0.4, na: 124, sat: 3.3, fe: 1.8, b12: 1.1, ca: 50, d: 2 },
  omelette: { fib: 0, sug: 0.5, na: 250, sat: 4, fe: 1.7, b12: 1, ca: 55, d: 1.8 },
  'egg-curry': { fib: 0.8, sug: 2, na: 350, sat: 3, fe: 1.5, b12: 0.7, ca: 45, d: 1.2 },
  'chicken-breast-grilled': { fib: 0, sug: 0, na: 75, sat: 1, fe: 1, b12: 0.3, ca: 11, d: 0.1 },
  'chicken-curry': { fib: 1, sug: 2, na: 400, sat: 3, fe: 1.2, b12: 0.3, ca: 25, d: 0.1 },
  'chicken-biryani': { fib: 1, sug: 1, na: 350, sat: 3, fe: 1.2, b12: 0.3, ca: 25, d: 0.1 },
  'fish-curry': { fib: 0.5, sug: 1, na: 380, sat: 2, fe: 1.2, b12: 2, ca: 40, d: 2.5 },
  'fish-fry': { fib: 0, sug: 0, na: 420, sat: 3, fe: 1.1, b12: 2.2, ca: 45, d: 3 },
  'soya-chunks-dry': { fib: 13, sug: 7, na: 20, sat: 1.5, fe: 9, b12: 0, ca: 240, d: 0 },
  tofu: { fib: 0.3, sug: 0.6, na: 7, sat: 1, fe: 2.7, b12: 0, ca: 350, d: 0 },
  'sprouts-boiled-mix': { fib: 4.5, sug: 2, na: 15, sat: 0.2, fe: 2, b12: 0, ca: 30, d: 0 },
  'roasted-chana': { fib: 15, sug: 5, na: 20, sat: 0.6, fe: 5, b12: 0, ca: 58, d: 0 },
  'rolled-oats-dry': { fib: 10, sug: 1, na: 5, sat: 1.2, fe: 4.7, b12: 0, ca: 54, d: 0 },
  dates: { fib: 7, sug: 63, na: 2, sat: 0, fe: 1, b12: 0, ca: 40, d: 0 },
  banana: { fib: 2.6, sug: 12, na: 1, sat: 0.1, fe: 0.3, b12: 0, ca: 5, d: 0 },
  orange: { fib: 2.4, sug: 9, na: 0, sat: 0, fe: 0.1, b12: 0, ca: 40, d: 0 },
  guava: { fib: 5.4, sug: 8, na: 2, sat: 0.1, fe: 0.3, b12: 0, ca: 18, d: 0 },
  papaya: { fib: 1.7, sug: 8, na: 8, sat: 0, fe: 0.3, b12: 0, ca: 20, d: 0 },
  apple: { fib: 2.4, sug: 10, na: 1, sat: 0, fe: 0.1, b12: 0, ca: 6, d: 0 },
  almonds: { fib: 12, sug: 4, na: 1, sat: 4, fe: 3.7, b12: 0, ca: 260, d: 0 },
  'roasted-peanuts': { fib: 8, sug: 4, na: 10, sat: 7, fe: 2, b12: 0, ca: 60, d: 0 },
  idli: { fib: 1, sug: 0.5, na: 200, sat: 0.1, fe: 0.8, b12: 0, ca: 15, d: 0 },
  'masala-dosa': { fib: 2, sug: 1, na: 350, sat: 2, fe: 1.1, b12: 0, ca: 30, d: 0 },
  samosa: { fib: 3, sug: 2, na: 450, sat: 5, fe: 1.2, b12: 0, ca: 25, d: 0 },
  pickle: { fib: 3, sug: 2, na: 2000, sat: 1, fe: 1, b12: 0, ca: 40, d: 0 },
  'papad-roasted': { fib: 6, sug: 1, na: 1500, sat: 0.5, fe: 4, b12: 0, ca: 30, d: 0 },
  'lay-s-classic-salted': { fib: 3, sug: 0.5, na: 600, sat: 14, fe: 1, b12: 0, ca: 10, d: 0 },
  'lay-s-india-s-magic-masala': { fib: 3, sug: 2, na: 720, sat: 14, fe: 1, b12: 0, ca: 15, d: 0 },
  'parle-parle-g': { fib: 1, sug: 25, na: 310, sat: 3, fe: 2, b12: 0, ca: 30, d: 0 },
  'cadbury-dairy-milk': { fib: 1, sug: 56, na: 60, sat: 18, fe: 1.5, b12: 0.5, ca: 200, d: 0 },
  'coca-cola-coke': { fib: 0, sug: 10.6, na: 10, sat: 0, fe: 0, b12: 0, ca: 0, d: 0 },
  sugar: { fib: 0, sug: 100, na: 0, sat: 0, fe: 0, b12: 0, ca: 0, d: 0 },
  honey: { fib: 0, sug: 82, na: 4, sat: 0, fe: 0.4, b12: 0, ca: 6, d: 0 },
  ghee: { fib: 0, sug: 0, na: 1, sat: 62, fe: 0, b12: 0, ca: 5, d: 0 },
  'amul-butter': { fib: 0, sug: 0, na: 550, sat: 51, fe: 0, b12: 0.1, ca: 24, d: 0 },
  'maggi-masala-noodles-dry': { fib: 3, sug: 3, na: 1400, sat: 6, fe: 3, b12: 0, ca: 60, d: 0 },
};

export const MICRO_KEYS = ['fe', 'b12', 'ca', 'd'];
export const hasX = id => Object.prototype.hasOwnProperty.call(FOOD_X, id);
