// =============================================================
// CAMPUS MESSES
// Bundled menus are the fallback. Admins can publish updated
// menus and festival specials to Firestore, which take priority.
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

// C Mess (non-veg) — the original menu this app was built around.
const C_MESS = {
  Monday: {
    breakfast: [{ n: 'Poha / Rava Upma + Kesari Bath', cal: 260, p: 6, c: 46 }, { n: 'Oats bowl', cal: 150, p: 5, c: 27 }],
    lunch: [{ n: 'Egg Roast (2 eggs)', cal: 180, p: 13, c: 3 }, { n: 'Chapati x3 + Rice', cal: 400, p: 11, c: 78 }, { n: 'Sambar + Gongura chutney', cal: 150, p: 7, c: 20 }, { n: 'Seasonal fruit', cal: 70, p: 1, c: 17 }],
    snacks: [{ n: 'Masala Garelu + chutney', cal: 230, p: 6, c: 28 }, { n: 'Pazhampori', cal: 180, p: 2, c: 26 }],
    dinner: [{ n: 'Varatharacha / Chef Special Chicken Curry', cal: 290, p: 28, c: 6 }, { n: 'Ghee Rice + Chapati', cal: 420, p: 9, c: 70 }, { n: 'Cowpea curry', cal: 150, p: 8, c: 20 }, { n: 'Payasam', cal: 180, p: 4, c: 30 }],
  },
  Tuesday: {
    breakfast: [{ n: 'Idli (3) + Vada (2)', cal: 300, p: 9, c: 50 }],
    lunch: [{ n: 'Egg Masala (2 eggs)', cal: 190, p: 14, c: 4 }, { n: 'Chapati + Rice', cal: 380, p: 10, c: 74 }, { n: 'Dhaba Dal / Totakura pappu', cal: 160, p: 9, c: 22 }, { n: 'Soya roast', cal: 150, p: 13, c: 10 }, { n: 'Lassi', cal: 150, p: 5, c: 20 }],
    snacks: [{ n: 'Pizza slice(s)', cal: 320, p: 11, c: 36 }, { n: 'Banana Shake', cal: 220, p: 7, c: 34 }],
    dinner: [{ n: 'Fish curry / fry (extra counter)', cal: 260, p: 26, c: 5 }, { n: 'Veg Pulao / Tomato bath', cal: 380, p: 8, c: 66 }, { n: 'Majiga pulusu', cal: 100, p: 3, c: 12 }, { n: 'Seasonal fruit', cal: 70, p: 1, c: 17 }],
  },
  Wednesday: {
    breakfast: [{ n: 'Pongal + Vada', cal: 320, p: 8, c: 48 }],
    lunch: [{ n: 'Spicy Egg Garlic (2 eggs)', cal: 200, p: 14, c: 5 }, { n: 'Methi Roti + Matta rice', cal: 380, p: 10, c: 72 }, { n: 'Poricha kuzhambu', cal: 150, p: 7, c: 18 }, { n: 'Curd', cal: 60, p: 3, c: 5 }],
    snacks: [{ n: 'Chicken pakoda', cal: 280, p: 16, c: 14 }, { n: 'Paneer pakoda (veg opt)', cal: 270, p: 12, c: 16 }],
    dinner: [{ n: 'Mutton curry', cal: 300, p: 26, c: 6 }, { n: 'Dosa + Ragi mudde', cal: 350, p: 8, c: 60 }, { n: 'Mashed potato + Sambar', cal: 180, p: 5, c: 28 }, { n: 'Fruit custard', cal: 160, p: 4, c: 24 }],
  },
  Thursday: {
    breakfast: [{ n: 'Wheat Dosa / Semiya Upma', cal: 230, p: 6, c: 38 }, { n: 'Cornflakes bowl', cal: 140, p: 3, c: 28 }],
    lunch: [{ n: 'Boiled Egg x2 (extra)', cal: 156, p: 12, c: 1 }, { n: 'Chapati + Curd rice', cal: 380, p: 10, c: 72 }, { n: 'Rajma / Dal makhani', cal: 220, p: 12, c: 28 }, { n: 'Soppina palya', cal: 90, p: 3, c: 10 }, { n: 'Seasonal fruit', cal: 70, p: 1, c: 17 }],
    snacks: [{ n: 'Veg Sandwich + cheese', cal: 280, p: 10, c: 32 }, { n: 'Brownie', cal: 250, p: 3, c: 34 }],
    dinner: [{ n: 'Guntur Chicken dry / Chettinadu curry', cal: 290, p: 27, c: 7 }, { n: 'Mandi Rice', cal: 380, p: 8, c: 70 }, { n: 'Mix Dal Tadka', cal: 170, p: 9, c: 20 }, { n: 'Sweet', cal: 160, p: 3, c: 28 }],
  },
  Friday: {
    breakfast: [{ n: 'Appam (3) + Channa curry', cal: 300, p: 8, c: 48 }, { n: 'Dry fruits handful', cal: 120, p: 4, c: 10 }],
    lunch: [{ n: 'Egg-tomato gojju (2 eggs)', cal: 190, p: 13, c: 5 }, { n: 'Chapati + Matta rice', cal: 380, p: 10, c: 72 }, { n: 'Aviyal / Kootukari', cal: 140, p: 5, c: 16 }, { n: 'Kosambari', cal: 80, p: 4, c: 10 }],
    snacks: [{ n: 'Holige + mixture', cal: 260, p: 5, c: 38 }],
    dinner: [{ n: 'Chicken / Mutton Biryani', cal: 520, p: 24, c: 68 }, { n: 'Onion raita', cal: 70, p: 3, c: 8 }, { n: 'Papaya', cal: 60, p: 1, c: 15 }],
  },
  Saturday: {
    breakfast: [{ n: 'Idli (3) + Bonda (2)', cal: 290, p: 8, c: 48 }, { n: 'Cornflakes bowl', cal: 140, p: 3, c: 28 }],
    lunch: [{ n: 'Chicken Kabab / Pepper dry Chicken', cal: 270, p: 27, c: 5 }, { n: 'Paneer Butter Masala / Palak Paneer', cal: 300, p: 15, c: 12 }, { n: 'Methi roti', cal: 180, p: 5, c: 32 }, { n: 'Chow chow dal', cal: 150, p: 8, c: 18 }],
    snacks: [{ n: 'Chicken momos (6)', cal: 280, p: 16, c: 30 }, { n: 'Veg momos (veg opt)', cal: 240, p: 7, c: 34 }],
    dinner: [{ n: 'Boiled egg (extra)', cal: 78, p: 6, c: 1 }, { n: 'Poori + Bombay Saagu', cal: 400, p: 9, c: 56 }, { n: 'Gongura Pulihora / Lemon rice', cal: 280, p: 5, c: 52 }, { n: 'Carrot halwa', cal: 200, p: 4, c: 28 }],
  },
  Sunday: {
    breakfast: [{ n: 'Crunchy Masala Dosa', cal: 260, p: 6, c: 42 }, { n: 'Egg Dosa (extra)', cal: 220, p: 11, c: 30 }],
    lunch: [{ n: 'Chicken Ghee Roast / Chilli Chicken', cal: 300, p: 27, c: 8 }, { n: 'Bhatura + Kabuli chana', cal: 420, p: 13, c: 60 }, { n: 'Veg pulao / fried rice', cal: 280, p: 6, c: 52 }, { n: 'Ice cream', cal: 180, p: 3, c: 24 }],
    snacks: [{ n: 'Groundnut sundal', cal: 180, p: 9, c: 16 }, { n: 'Boiled corn', cal: 120, p: 4, c: 24 }],
    dinner: [{ n: 'Egg Omelette (2 eggs)', cal: 200, p: 13, c: 3 }, { n: "Veg fried rice / Chef's Bath", cal: 340, p: 7, c: 62 }, { n: 'Paruppu curry', cal: 140, p: 7, c: 16 }, { n: 'Boost / Bournvita glass', cal: 170, p: 6, c: 28 }],
  },
};

export const DEFAULT_MENUS = { CNV: C_MESS };
