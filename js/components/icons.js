// =============================================================
// ICONS — one consistent stroke set (24px grid, 1.75 stroke,
// round caps). Chrome (nav, headings, buttons) uses these;
// emoji stay for content like dish names and festival banners.
// =============================================================
import { s } from '../util.js';

// Each icon is a list of SVG child specs: [tag, attrs].
const P = d => ['path', { d }];
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h, rx = 0) => ['rect', { x, y, width: w, height: h, rx }];

const PATHS = {
  // navigation
  today: [C(12, 12, 9), C(12, 12, 4.6), ['circle', { cx: 12, cy: 12, r: 0.9, fill: 'currentColor' }]],
  plan: [R(3.5, 5, 17, 15.5, 4), P('M3.5 10h17'), P('M8 3v4M16 3v4'), ['circle', { cx: 8.5, cy: 14.5, r: 0.8, fill: 'currentColor' }], ['circle', { cx: 12, cy: 14.5, r: 0.8, fill: 'currentColor' }], ['circle', { cx: 15.5, cy: 14.5, r: 0.8, fill: 'currentColor' }]],
  snap: [P('M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.7a1 1 0 0 1 .8-.4h4a1 1 0 0 1 .8.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z'), C(12, 12.5, 3.6)],
  ask: [P('M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7a2.5 2.5 0 0 1-2.5 2.5H13l-4 3.5v-3.5H5.5A2.5 2.5 0 0 1 3 14V7a2.5 2.5 0 0 1 2.5-2.5z'), P('M9.8 8.8a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2.9-1.2 1.7'), ['circle', { cx: 12, cy: 14.1, r: 0.6, fill: 'currentColor' }]],
  progress: [P('M3 17l5.2-5.4 3.8 3.2L20.5 6.5'), P('M15 6.5h5.5V12'), P('M3 21h18')],
  you: [C(12, 8.2, 3.7), P('M4.5 20.5a7.5 7.5 0 0 1 15 0')],
  // actions
  plus: [P('M12 5v14M5 12h14')],
  minus: [P('M5 12h14')],
  check: [P('M5 12.8l4.4 4.4L19 7.4')],
  x: [P('M6 6l12 12M18 6L6 18')],
  chevron: [P('M9 5.5l6.5 6.5L9 18.5')],
  down: [P('M5.5 9.5L12 16l6.5-6.5')],
  back: [P('M14.5 5.5L8 12l6.5 6.5')],
  search: [C(11, 11, 6.5), P('M20 20l-4.4-4.4')],
  mic: [R(9, 3, 6, 11, 3), P('M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3')],
  barcode: [P('M4 6v12M7.5 6v12M11 6v12M15 6v12M20 6v12'), P('M4 3.5h3M17 3.5h3M4 20.5h3M17 20.5h3')],
  edit: [P('M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z'), P('M14.5 6.5l3 3')],
  trash: [P('M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6')],
  undo: [P('M4 9h10a5.5 5.5 0 0 1 0 11H9'), P('M7.5 5.5L4 9l3.5 3.5')],
  copy: [R(8, 8, 12, 12, 3), P('M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8')],
  swap: [P('M6 8h12l-3-3M18 16H6l3 3')],
  send: [P('M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-6.5-4z')],
  download: [P('M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14')],
  upload: [P('M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14')],
  lock: [R(5, 10.5, 14, 10, 3), P('M8 10.5V8a4 4 0 0 1 8 0v2.5')],
  logout: [P('M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10M15 8l4 4-4 4M19 12H9.5')],
  settings: [C(12, 12, 3), P('M12 2.8v2.4M12 18.8v2.4M4.5 7.4l2 1.2M17.5 15.4l2 1.2M4.5 16.6l2-1.2M17.5 8.6l2-1.2')],
  // food + body
  star: [P('M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z')],
  flame: [P('M12 3c.8 3.4 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.4 2.2-4.6.2 1.4.8 2.2 1.6 2.6C10.2 8.6 10.8 5.6 12 3z')],
  drop: [P('M12 3.2s6.3 6.4 6.3 10.8a6.3 6.3 0 0 1-12.6 0C5.7 9.6 12 3.2 12 3.2z')],
  dumbbell: [P('M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12')],
  scale: [R(3.5, 3.5, 17, 17, 5), P('M8 10a4.6 4.6 0 0 1 8 0'), P('M12 10l1.8-2')],
  utensils: [P('M7 3v6.2a2 2 0 0 0 2 2h0V21M7 3v5M11 3v5M16.5 21V3c-2.2 1.2-3.5 3.8-3.5 7 0 1.5 1.3 2.5 3.5 2.5'), ],
  bowl: [P('M3.5 11h17a8.5 8.5 0 0 1-17 0z'), P('M8 7.5c0-1.5 1.5-1.5 1.5-3M12.5 7.5c0-1.5 1.5-1.5 1.5-3')],
  leaf: [P('M5 19c0-8 4-13.5 14-14 .5 9-4.5 14.5-12 14M5 19c2-4 5-7 9-9')],
  egg: [P('M12 3.5c3.6 0 6 5.5 6 9.5a6 6 0 0 1-12 0c0-4 2.4-9.5 6-9.5z')],
  bolt: [P('M13 2.5L5 13.5h6l-1 8 8-11h-6z')],
  target: [C(12, 12, 9), C(12, 12, 5), ['circle', { cx: 12, cy: 12, r: 1.2, fill: 'currentColor' }]],
  trophy: [P('M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.5 4.5M16 6h3.5c0 3-1.5 4.5-3.5 4.5M12 13v4M8.5 20.5h7M10 17h4')],
  wallet: [P('M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3'), R(4, 8, 16, 11.5, 3), ['circle', { cx: 16, cy: 13.8, r: 1, fill: 'currentColor' }]],
  clock: [C(12, 12, 9), P('M12 7v5.2l3.2 2')],
  bell: [P('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0')],
  sparkle: [P('M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z'), P('M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z')],
  info: [C(12, 12, 9), P('M12 11v5.5'), ['circle', { cx: 12, cy: 7.8, r: 0.7, fill: 'currentColor' }]],
  alert: [P('M12 3.5L2.8 19.5h18.4z'), P('M12 10v4.5'), ['circle', { cx: 12, cy: 17.2, r: 0.7, fill: 'currentColor' }]],
  flag: [P('M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11')],
  users: [C(9, 8.5, 3.2), P('M3 19.5a6 6 0 0 1 12 0'), P('M16 5.5a3 3 0 0 1 0 6M18 14.5a5.5 5.5 0 0 1 3 5')],
  image: [R(3.5, 4.5, 17, 15, 3.5), C(9, 10, 1.8), P('M4 17l5-4.5 4 3.5 3-2.5 4 3.5')],
  list: [P('M8.5 6.5H20M8.5 12H20M8.5 17.5H20'), ['circle', { cx: 4.5, cy: 6.5, r: 0.9, fill: 'currentColor' }], ['circle', { cx: 4.5, cy: 12, r: 0.9, fill: 'currentColor' }], ['circle', { cx: 4.5, cy: 17.5, r: 0.9, fill: 'currentColor' }]],
  // meals
  sunrise: [P('M3 18h18M6 18a6 6 0 0 1 12 0M12 5v3M4.8 9.8l1.8 1.8M19.2 9.8l-1.8 1.8')],
  sun: [C(12, 12, 4), P('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4')],
  cup: [P('M5 9h11v5.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.2 2.2 0 0 1 0 4.4H16M8 3.5c0 1.5 1.2 1.5 1.2 3M12 3.5c0 1.5 1.2 1.5 1.2 3')],
  moon: [P('M19.5 14.5A8 8 0 0 1 9.5 4.5a8.5 8.5 0 1 0 10 10z')],
};

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
