// =============================================================
// CAMPUS MESSES
// Bundled menus (the 2026 charts) are the fallback. Admins can publish
// updated menus and festival specials to Firestore, which take priority.
// Menu item: { n, cal, p, c, f? } per one serving.
// =============================================================

export const MESSES = [
  { id: 'AV',  name: 'A Mess',  kind: 'Veg' },
  { id: 'BV',  name: 'B Mess',  kind: 'Veg' },
  { id: 'BNV', name: 'B Mess',  kind: 'Non-veg' },
  { id: 'CV',  name: 'C Mess',  kind: 'Veg' },
  { id: 'CNV', name: 'C Mess',  kind: 'Non-veg' },
  { id: 'DV',  name: 'D Mess',  kind: 'Veg' },
  { id: 'EV',  name: 'E Mess',  kind: 'Veg' },
];

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { id: 'snacks',    label: 'Snacks',    icon: '🫖' },
  { id: 'dinner',    label: 'Dinner',    icon: '🌙' },
];

// Typical mess hours; users can override in their routine.
export const DEFAULT_TIMINGS = {
  breakfast: ['07:30', '09:30'],
  lunch:     ['12:30', '14:15'],
  snacks:    ['16:30', '17:45'],
  dinner:    ['19:30', '21:30'],
};

export const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The real 2026 charts of all five messes (data/mess-menus.js), with
// per-serving macros attached by js/engine/dishes.js. B and C serve
// non-veg on the side, so their veg menus (BV, CV) leave those dishes out.
import { RAW, DAILY, MESS_SOURCES, MENU_INFO } from './mess-menus.js';
import { buildWeek } from '../js/engine/dishes.js';

export const DEFAULT_MENUS = Object.fromEntries(Object.entries(MESS_SOURCES).map(([id, s]) =>
  [id, buildWeek(RAW[s.chart], DAILY[s.chart], { nonVeg: s.nonVeg }).week]));

/** Where a bundled menu came from, for the "Menu from …" line. */
export const menuSourceFor = id => MENU_INFO[MESS_SOURCES[id]?.chart] || null;

// -------------------------------------------------------------
// SAMPLE WEEKS
// NOT any real mess's menu. These are typical South Indian hostel
// weeks offered inside the menu editor as a starting point, so a
// mess rep edits a draft instead of typing 28 meals from scratch.
// They are never shown as a mess's actual menu.
// -------------------------------------------------------------
const i = (n, cal, p, c, f) => ({ n, cal, p, c, f });

const SAMPLE_VEG = {
  Monday: {
    breakfast: [i('Idli (3) + Sambar', 290, 9, 54, 3), i('Coconut chutney', 90, 1, 3, 8), i('Boiled egg / Banana (extra)', 90, 3, 15, 2)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Sambar', 90, 4, 12, 3), i('Beans poriyal', 100, 3, 10, 5), i('Curd', 60, 3, 5, 3), i('Pickle + Papad', 90, 2, 10, 5)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Biscuits / Mixture', 150, 3, 20, 7)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Dal tadka', 160, 8, 20, 5), i('Aloo curry', 120, 2, 16, 5), i('Rasam', 40, 1, 5, 1)],
  },
  Tuesday: {
    breakfast: [i('Pongal + Vada', 320, 8, 48, 11), i('Sambar + chutney', 110, 4, 12, 5)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Rajma / Chana masala', 190, 8, 24, 7), i('Cabbage poriyal', 90, 2, 9, 5), i('Curd', 60, 3, 5, 3), i('Seasonal fruit', 70, 1, 17, 0)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Onion pakoda', 230, 5, 22, 14)],
    dinner: [i('Veg fried rice / Pulao', 340, 7, 56, 9), i('Manchurian gravy', 140, 3, 16, 7), i('Soup', 60, 2, 9, 2)],
  },
  Wednesday: {
    breakfast: [i('Masala dosa (2)', 350, 8, 50, 13), i('Sambar + chutney', 110, 4, 12, 5)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Mixed dal', 160, 8, 20, 5), i('Bhindi fry', 120, 3, 10, 8), i('Curd', 60, 3, 5, 3), i('Papad', 50, 3, 7, 1)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Veg sandwich', 180, 6, 26, 6)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Paneer butter masala', 220, 8, 8, 17), i('Jeera aloo', 110, 2, 14, 5), i('Rasam', 40, 1, 5, 1)],
  },
  Thursday: {
    breakfast: [i('Poha / Upma', 270, 6, 44, 8), i('Sprouts bowl', 90, 7, 12, 1)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Sambar', 90, 4, 12, 3), i('Soya chunk curry', 190, 16, 15, 7), i('Curd', 60, 3, 5, 3), i('Salad', 30, 1, 6, 0)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Bread pakoda / Bajji', 240, 5, 26, 13)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Chana masala', 190, 8, 24, 7), i('Mixed veg curry', 130, 3, 13, 8), i('Sweet', 150, 3, 25, 4)],
  },
  Friday: {
    breakfast: [i('Puri (3) + Saagu', 420, 8, 56, 18), i('Tea / Milk', 110, 4, 12, 5)],
    lunch: [i('Veg biryani', 420, 9, 66, 13), i('Raita', 60, 2, 5, 3), i('Papad', 50, 3, 7, 1), i('Seasonal fruit', 70, 1, 17, 0)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Samosa', 260, 5, 29, 14)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Dal fry', 160, 8, 20, 5), i('Potato peas curry', 130, 4, 17, 5), i('Rasam', 40, 1, 5, 1)],
  },
  Saturday: {
    breakfast: [i('Uttapam (2) / Set dosa', 300, 7, 48, 9), i('Sambar + chutney', 110, 4, 12, 5)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Dal', 160, 8, 20, 5), i('Paneer / Veg kurma', 200, 7, 12, 14), i('Curd', 60, 3, 5, 3)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Veg momos / Noodles', 220, 6, 32, 7)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Mixed dal', 160, 8, 20, 5), i('Gobi masala', 130, 3, 13, 8), i('Ice cream / Sweet', 160, 3, 24, 6)],
  },
  Sunday: {
    breakfast: [i('Chole bhature / Poori', 480, 11, 60, 21), i('Tea / Milk', 110, 4, 12, 5)],
    lunch: [i('Rice + Chapati (2)', 420, 11, 82, 5), i('Sambar', 90, 4, 12, 3), i('Aloo gobi', 120, 3, 13, 6), i('Curd rice', 130, 4, 20, 4), i('Sweet', 160, 3, 26, 5)],
    snacks: [i('Tea / Coffee', 60, 2, 8, 2), i('Boiled corn / Sundal', 140, 5, 22, 3)],
    dinner: [i('Chapati (3) + Rice', 400, 11, 76, 6), i('Dal tadka', 160, 8, 20, 5), i('Veg curry', 130, 3, 13, 8), i('Rasam', 40, 1, 5, 1)],
  },
};

// Non-veg week: same base, with the usual chicken/egg/fish counters.
const SAMPLE_NONVEG = structuredClone(SAMPLE_VEG);
SAMPLE_NONVEG.Monday.lunch.splice(1, 0, i('Egg curry (2 eggs)', 190, 13, 5, 13));
SAMPLE_NONVEG.Tuesday.dinner.splice(1, 0, i('Chicken curry', 220, 21, 7, 12));
SAMPLE_NONVEG.Wednesday.lunch.splice(1, 0, i('Egg masala (2 eggs)', 190, 13, 5, 13));
SAMPLE_NONVEG.Thursday.dinner.splice(1, 0, i('Chicken fry / 65', 250, 20, 10, 15));
SAMPLE_NONVEG.Friday.lunch = [i('Chicken biryani', 520, 24, 64, 19), i('Raita', 60, 2, 5, 3), i('Boiled egg (extra)', 78, 6, 1, 5), i('Seasonal fruit', 70, 1, 17, 0)];
SAMPLE_NONVEG.Saturday.lunch.splice(1, 0, i('Fish fry / curry', 210, 20, 8, 11));
SAMPLE_NONVEG.Sunday.dinner.splice(1, 0, i('Chicken curry / Omelette', 220, 21, 7, 12));

export const SAMPLE_WEEKS = [
  { id: 'veg', label: 'Typical veg mess week', week: SAMPLE_VEG },
  { id: 'nonveg', label: 'Typical non-veg mess week', week: SAMPLE_NONVEG },
];
