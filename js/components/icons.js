// =============================================================
// ICONS — one consistent stroke set: a 24-px grid with a 2-px
// safe margin (shapes live inside 3…21), 1.75 stroke, round caps
// and joins, filled dots only for tiny details. Chrome (nav,
// headings, buttons) uses these; emoji stay for content like
// dish names and festival banners.
// =============================================================
import { s } from '../util.js';

// Each icon is a list of SVG child specs: [tag, attrs].
const P = d => ['path', { d }];
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h, rx = 0) => ['rect', { x, y, width: w, height: h, rx }];
const DOT = (cx, cy, r = 0.9) => ['circle', { cx, cy, r, fill: 'currentColor' }];

/** An 8-tooth gear outline, computed once. */
function gear(cx = 12, cy = 12, ro = 9.2, ri = 6.9, teeth = 8) {
  const pt = (a, r) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const step = (Math.PI * 2) / teeth, base = 0.22, tip = 0.13;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    d += (i ? `A${ri} ${ri} 0 0 1 ` : 'M') + pt(a - base, ri) + `L${pt(a - tip, ro)}L${pt(a + tip, ro)}L${pt(a + base, ri)}`;
  }
  return d + `A${ri} ${ri} 0 0 1 ${pt(-Math.PI / 2 - base, ri)}Z`;
}

const CIRCLE = C(12, 12, 9);
const BACK = P('M14.5 5.5L8 12l6.5 6.5');
const NEXT = P('M9.5 5.5L16 12l-6.5 6.5');
const DOWN = P('M5.5 9.5L12 16l6.5-6.5');
const SPARK = 'M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z';
const THALI = [CIRCLE, C(12, 8.4, 2.3), C(8.6, 14.2, 2.3), C(15.4, 14.2, 2.3)];

const PATHS = {
  // navigation
  today: THALI,                     // the Today tab is the plate
  plan: [R(3.5, 5, 17, 15.5, 4), P('M3.5 10h17'), P('M8 3v4M16 3v4'), DOT(8.5, 14.5, 0.8), DOT(12, 14.5, 0.8), DOT(15.5, 14.5, 0.8)],
  snap: [P('M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.7a1 1 0 0 1 .8-.4h4a1 1 0 0 1 .8.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z'), C(12, 12.5, 3.6)],
  ask: [P('M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7a2.5 2.5 0 0 1-2.5 2.5H13l-4 3.5v-3.5H5.5A2.5 2.5 0 0 1 3 14V7a2.5 2.5 0 0 1 2.5-2.5z'), P('M9.8 8.8a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2.9-1.2 1.7'), DOT(12, 14.1, 0.6)],
  progress: [P('M3 17l5.2-5.4 3.8 3.2L20.5 6.5'), P('M15 6.5h5.5V12'), P('M3 21h18')],
  you: [C(12, 8.2, 3.7), P('M4.5 20.5a7.5 7.5 0 0 1 15 0')],
  home: [P('M4 10.4L12 4l8 6.4v8.6a1.5 1.5 0 0 1-1.5 1.5H14.5v-5.5h-5v5.5H5.5A1.5 1.5 0 0 1 4 19z')],
  // actions
  plus: [P('M12 5v14M5 12h14')],
  minus: [P('M5 12h14')],
  check: [P('M5 12.8l4.4 4.4L19 7.4')],
  x: [P('M6 6l12 12M18 6L6 18')],
  chevron: [NEXT],
  'chevron-right': [NEXT],
  'chevron-left': [BACK],
  'chevron-up': [P('M5.5 14.5L12 8l6.5 6.5')],
  'chevron-down': [DOWN],
  down: [DOWN],
  back: [BACK],
  'arrow-right': [P('M4.5 12h15M13.5 6l6 6-6 6')],
  'arrow-left': [P('M19.5 12h-15M10.5 6l-6 6 6 6')],
  'arrow-up-right': [P('M7 17L17 7M9 7h8v8')],
  external: [P('M14 4.5h5.5V10M19.5 4.5L11 13'), P('M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4')],
  search: [C(11, 11, 6.5), P('M20 20l-4.4-4.4')],
  mic: [R(9, 3, 6, 11, 3), P('M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3')],
  barcode: [P('M4 6v12M7.5 6v12M11 6v12M15 6v12M20 6v12'), P('M4 3.5h3M17 3.5h3M4 20.5h3M17 20.5h3')],
  scan: [P('M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2'), P('M7.5 12h9')],
  edit: [P('M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z'), P('M14.5 6.5l3 3')],
  trash: [P('M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6')],
  undo: [P('M4 9h10a5.5 5.5 0 0 1 0 11H9'), P('M7.5 5.5L4 9l3.5 3.5')],
  refresh: [P('M19.5 12a7.5 7.5 0 1 1-2.3-5.4'), P('M19.5 4.5v4.2h-4.2')],
  copy: [R(8, 8, 12, 12, 3), P('M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8')],
  swap: [P('M6 8h12l-3-3M18 16H6l3 3')],
  send: [P('M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-6.5-4z')],
  share: [P('M12 14.5v-11M8 7.5l4-4 4 4'), P('M8 10.5H6.5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H16')],
  download: [P('M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14')],
  upload: [P('M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14')],
  lock: [R(5, 10.5, 14, 10, 3), P('M8 10.5V8a4 4 0 0 1 8 0v2.5')],
  logout: [P('M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10M15 8l4 4-4 4M19 12H9.5')],
  settings: [P(gear()), C(12, 12, 2.9)],
  filter: [P('M4 6.5h16M7 12h10M10 17.5h4')],
  more: [DOT(6, 12, 1.4), DOT(12, 12, 1.4), DOT(18, 12, 1.4)],
  eye: [P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), C(12, 12, 3)],
  'eye-off': [P('M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5'), P('M9.9 9.9a3 3 0 0 0 4.2 4.2'), P('M4 4l16 16')],
  bookmark: [P('M6.5 5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 17.5 5v15.5L12 16.5l-5.5 4z')],
  heart: [P('M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z')],
  'plus-circle': [CIRCLE, P('M12 8v8M8 12h8')],
  'minus-circle': [CIRCLE, P('M8 12h8')],
  'check-circle': [CIRCLE, P('M8.2 12.4l2.6 2.6 5-5.2')],
  'x-circle': [CIRCLE, P('M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6')],
  help: [CIRCLE, P('M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8v.3'), DOT(12, 16.6, 0.9)],
  play: [P('M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6z')],
  pause: [P('M8.5 5.5v13M15.5 5.5v13')],
  // food + body
  star: [P('M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z')],
  flame: [P('M12 3c.8 3.4 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.4 2.2-4.6.2 1.4.8 2.2 1.6 2.6C10.2 8.6 10.8 5.6 12 3z')],
  drop: [P('M12 3.2s6.3 6.4 6.3 10.8a6.3 6.3 0 0 1-12.6 0C5.7 9.6 12 3.2 12 3.2z')],
  water: [P('M5.8 4h12.4l-1.6 15.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8z'), P('M6.8 11.2c1.7-1.1 3.4-1.1 5.2 0s3.5 1.1 5.2 0')],
  dumbbell: [R(5, 7, 3.5, 10, 1.6), R(15.5, 7, 3.5, 10, 1.6), P('M2.5 10v4M21.5 10v4M8.5 12h7')],
  scale: [R(3.5, 3.5, 17, 17, 5), P('M8 10a4.6 4.6 0 0 1 8 0'), P('M12 10l1.8-2')],
  utensils: [P('M6 3v5a3 3 0 0 0 6 0V3M9 3v18'), P('M17.5 21V3.5c-2.2 1.3-3.5 4-3.5 7.5 0 1.5.9 2.5 2.4 2.5h1.1')],
  bowl: [P('M3.5 11h17a8.5 8.5 0 0 1-17 0z'), P('M8 7.5c0-1.5 1.5-1.5 1.5-3M12.5 7.5c0-1.5 1.5-1.5 1.5-3')],
  'bowl-steam': [P('M4 11.5h16a8 8 0 0 1-16 0z'), P('M8.5 8c-1-1.2 1-2.1 0-3.6M12 8c-1-1.2 1-2.1 0-3.6M15.5 8c-1-1.2 1-2.1 0-3.6')],
  thali: THALI,
  leaf: [P('M5 19c0-8 4-13.5 14-14 .5 9-4.5 14.5-12 14M5 19c2-4 5-7 9-9')],
  egg: [P('M12 3.5c3.6 0 6 5.5 6 9.5a6 6 0 0 1-12 0c0-4 2.4-9.5 6-9.5z')],
  bolt: [P('M13 2.5L5 13.5h6l-1 8 8-11h-6z')],
  target: [CIRCLE, C(12, 12, 5), DOT(12, 12, 1.2)],
  trophy: [P('M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.5 4.5M16 6h3.5c0 3-1.5 4.5-3.5 4.5M12 13v4M8.5 20.5h7M10 17h4')],
  gift: [R(4, 8, 16, 4.5, 1.5), P('M5.5 12.5v6.5A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.5M12 8v12.5'), P('M12 8C10.5 4.5 6.5 4 6.5 6.4 6.5 8 10 8 12 8zM12 8c1.5-3.5 5.5-4 5.5-1.6C17.5 8 14 8 12 8z')],
  wallet: [P('M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3'), R(4, 8, 16, 11.5, 3), DOT(16, 13.8, 1)],
  clock: [CIRCLE, P('M12 7v5.2l3.2 2')],
  timer: [C(12, 13.5, 7.5), P('M12 13.5V10M10 3h4M18.4 7l1.4-1.4')],
  calendar: [R(3.5, 5, 17, 15.5, 4), P('M3.5 10h17'), P('M8 3v4M16 3v4')],
  bell: [P('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0')],
  sparkle: [P(SPARK), P('M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z')],
  sparkles: [P('M10 4.5l1.6 4.6 4.6 1.6-4.6 1.6L10 16.9l-1.6-4.6-4.6-1.6 4.6-1.6z'), P('M18 3.5v4M16 5.5h4'), P('M17.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z')],
  info: [CIRCLE, P('M12 11v5.5'), DOT(12, 7.8, 0.7)],
  alert: [P('M10.3 4.6a2 2 0 0 1 3.4 0l7.4 12.8a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3z'), P('M12 10v4'), DOT(12, 16.9, 0.7)],
  flag: [P('M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11')],
  pin: [P('M12 21s6.5-6.1 6.5-11a6.5 6.5 0 0 0-13 0c0 4.9 6.5 11 6.5 11z'), C(12, 10, 2.4)],
  users: [C(9, 8.5, 3.2), P('M3 19.5a6 6 0 0 1 12 0'), P('M16 5.5a3 3 0 0 1 0 6M18 14.5a5.5 5.5 0 0 1 3 5')],
  image: [R(3.5, 4.5, 17, 15, 3.5), C(9, 10, 1.8), P('M4 17l5-4.5 4 3.5 3-2.5 4 3.5')],
  list: [P('M8.5 6.5H20M8.5 12H20M8.5 17.5H20'), DOT(4.5, 6.5), DOT(4.5, 12), DOT(4.5, 17.5)],
  grid: [R(4, 4, 6.5, 6.5, 2), R(13.5, 4, 6.5, 6.5, 2), R(4, 13.5, 6.5, 6.5, 2), R(13.5, 13.5, 6.5, 6.5, 2)],
  chart: [R(4.5, 12.5, 3.6, 7, 1.2), R(10.2, 8, 3.6, 11.5, 1.2), R(15.9, 4.5, 3.6, 15, 1.2)],
  // meals and the day
  sunrise: [P('M3 18h18M6 18a6 6 0 0 1 12 0M12 5v3M4.8 9.8l1.8 1.8M19.2 9.8l-1.8 1.8')],
  sun: [C(12, 12, 4), P('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4')],
  'sun-moon': [C(12, 12, 4.4), ['path', { d: 'M12 7.6a4.4 4.4 0 0 1 0 8.8z', fill: 'currentColor' }], P('M12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1')],
  cup: [P('M5 9h11v5.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.2 2.2 0 0 1 0 4.4H16M8 3.5c0 1.5 1.2 1.5 1.2 3M12 3.5c0 1.5 1.2 1.5 1.2 3')],
  moon: [P('M19.5 14.5A8 8 0 0 1 9.5 4.5a8.5 8.5 0 1 0 10 10z')],
  // settings
  globe: [CIRCLE, P('M3.2 12h17.6'), P('M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z')],
  shield: [P('M12 3.2l7 2.7v5.6c0 4.3-2.9 7.8-7 9.3-4.1-1.5-7-5-7-9.3V5.9z'), P('M9 12.1l2.2 2.2 4-4.3')],
  key: [C(8, 15.5, 4), P('M10.9 12.6L19.5 4M16 7.5l2.4 2.4M18 5.5l2 2')],
  palette: [P('M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7-8.5-7z'),
    ...[[7.6, 11.2], [9.4, 7.5], [13.8, 6.8], [16.8, 9.6]].map(([cx, cy]) => ['circle', { cx, cy, r: 1.15, fill: 'currentColor', stroke: 'none' }])],
  ban: [C(12, 12, 8.5), P('M6 18L18 6')],
  archive: [R(3.5, 4.5, 17, 4.5, 1.6), P('M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4')],
};

/** Every icon name, for galleries and pickers. */
export const ICON_NAMES = Object.keys(PATHS);

export function icon(name, { size = 22, cls = '', sw = 1.75, label } = {}) {
  const parts = PATHS[name] || PATHS.info;
  const svg = s('svg', {
    viewBox: '0 0 24 24', width: size, height: size, class: 'ico ' + cls,
    fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }),
  });
  parts.forEach(p => { const [tag, attrs] = p; svg.appendChild(s(tag, attrs)); });
  return svg;
}

export const MEAL_ICON = { breakfast: 'sunrise', lunch: 'sun', snacks: 'cup', dinner: 'moon' };
export const mealIcon = (id, opts) => icon(MEAL_ICON[id] || 'bowl', opts);
