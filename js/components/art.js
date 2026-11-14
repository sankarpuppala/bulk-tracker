// =============================================================
// ART — the brand mark, Kato the mascot, and every illustration.
// Everything is inline SVG so it themes with the page and works
// offline. One style throughout (design/DESIGN.md §6): flat-shaded
// vector with soft volume, one key light from the top-left, a soft
// contact shadow under every object, 2–3 tones per surface.
//
// Colour rules:
//  · food keeps its real colour in every theme (dal is turmeric);
//  · steel is the brand material (--art-st-* from css/art.css,
//    with hex fallbacks so a piece still renders without the CSS);
//  · anything that is "the app" rather than "the food" — background
//    blobs, flags, handles, plates' accents — follows var(--accent);
//  · meal scenes are tinted with their meal hue (--hue-<meal>).
// Every gradient / clip id goes through uniq(): many copies of one
// piece render on a page. Motion lives in css/art.css.
// =============================================================
import { s } from '../util.js';

let n = 0;
const uniq = p => `${p}${++n}`;

/** Tiny deterministic PRNG so illustrations don't shuffle between renders. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

const FLAME = 'M32 11c1.6 6.8 10.4 10.8 10.4 20.4a10.4 10.4 0 0 1-20.8 0c0-4.4 2-6.8 4.4-9.2.4 2.8 1.6 4.4 3.2 5.2C28.4 22.2 29.6 16.2 32 11z';

/** A flame, used for streaks. */
export const flamePath = () => FLAME;

// ---------- palette ----------
const INK = '#1B0D04';                                   // outline ink: the logo and Kato only
const SHADOW = 'var(--art-shadow, rgba(80, 48, 10, 0.26))';
const STEAM = 'var(--art-steam, rgba(122, 92, 58, 0.36))';
const ST = {                                             // brushed steel, lit from the top-left
  hi: 'var(--art-st-hi, #FFFFFF)', md: 'var(--art-st-md, #DDD7CB)',
  lo: 'var(--art-st-lo, #A69F91)', dk: 'var(--art-st-dk, #827B6E)',
};
const ACC = { a: 'var(--accent)', hi: 'var(--accent-2)', lo: 'var(--accent-3)' };
const F = {
  dal: '#F3B73A', dalHi: '#FFD670', dalLo: '#D8941B',
  rajma: '#B5432B', rajmaHi: '#D9684E', rajmaLo: '#7E2417',
  curd: '#F6F0E2', curdLo: '#E3D9C0',
  sabzi: '#69A04B', sabziHi: '#8DC063', sabziLo: '#3F7A2E',
  roti: '#E9B07A', rotiHi: '#F6D2A4', rotiLo: '#C47C3E', char: '#9A5A26',
  chai: '#B8743A', chaiHi: '#DDA46C', chaiLo: '#8A4F22', foam: '#E9C79C',
  rice: '#FFFDF6', riceLo: '#E7DDC4',
  chilli: '#C8321E', chilliHi: '#E8583A', leaf: '#4E9A3A', leafHi: '#7CC25A', leafLo: '#2F6B26',
  lemon: '#F7D84A', lemonHi: '#FFF1A6',
  gold: '#F7C548', goldHi: '#FFE69A', goldLo: '#C98515',
  water: '#4FA3F0', waterHi: '#A9DCFF', waterLo: '#2C78D2',
  blush: '#FF7E73', tongue: '#F26B70', mouth: '#5A1E14', white: '#FFFFFF',
  idli: '#FCF8EE', idliLo: '#E6DAC0', fried: '#E0A042', friedHi: '#F4C46C', friedLo: '#B8742A',
  moon: '#FFEBB0', moonLo: '#F2CB6A', wood: '#7A4E2C', woodLo: '#55341C',
};

// ---------- tiny builders ----------
const f = v => +(+v).toFixed(2);
const url = id => `url(#${id})`;
const stop = ([offset, color, opacity]) => s('stop', { offset, 'stop-color': color, ...(opacity != null ? { 'stop-opacity': opacity } : {}) });
const lin = (id, [x1, y1, x2, y2], stops) => s('linearGradient', { id, x1, y1, x2, y2 }, ...stops.map(stop));
const rad = (id, [cx, cy, r], stops) => s('radialGradient', { id, cx, cy, r }, ...stops.map(stop));
const steelRad = (id, cx = 0.34, cy = 0.26, r = 0.92) => rad(id, [cx, cy, r], [[0, ST.hi], [0.52, ST.md], [1, ST.lo]]);
/** A soft contact shadow: a radial fade instead of a blur filter, so it costs nothing. */
const shadowGrad = id => rad(id, [0.5, 0.5, 0.5], [[0, SHADOW, 1], [0.5, SHADOW, 0.62], [1, SHADOW, 0]]);
const ell = (cx, cy, rx, ry, fill, extra = {}) => s('ellipse', { cx, cy, rx, ry, fill, ...extra });
const circ = (cx, cy, r, fill, extra = {}) => s('circle', { cx, cy, r, fill, ...extra });
const path = (d, fill, extra = {}) => s('path', { d, fill, ...extra });
const line = (d, stroke, w, extra = {}) => s('path', { d, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
const sparkD = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
const spark = (x, y, r, fill, cls = 'glint', extra = {}) => path(sparkD(x, y, r), fill, { class: cls, ...extra });
function starD(cx, cy, R, r = R * 0.5, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
  }
  return d + 'Z';
}
/** Rising steam: a wisp that css/art.css lifts and fades. */
const wisp = (d, cls = '', w = 3, color = STEAM) => line(d, color, w, { class: ('steam ' + cls).trim() });
/** A water / sweat drop pointing up. */
const dropD = (x, y, r) => `M${f(x)} ${f(y - r * 1.7)}C${f(x + r * 0.35)} ${f(y - r * 0.9)} ${f(x + r)} ${f(y - r * 0.4)} ${f(x + r)} ${f(y + r * 0.15)}A${f(r)} ${f(r)} 0 0 1 ${f(x - r)} ${f(y + r * 0.15)}C${f(x - r)} ${f(y - r * 0.4)} ${f(x - r * 0.35)} ${f(y - r * 0.9)} ${f(x)} ${f(y - r * 1.7)}Z`;

// ---------- shared objects ----------
/** A small steel katori seen at an angle, holding `food` — for 3/4 scenes. */
function katori3q(x, y, w, food, foodHi, g) {
  const h = w * 0.42;
  return [
    path(`M${f(x - w)} ${f(y)}A${f(w)} ${f(h * 1.9)} 0 0 0 ${f(x + w)} ${f(y)}Z`, url(g)),
    ell(x, y, w, h, ST.hi),
    ell(x, y + h * 0.12, w * 0.82, h * 0.66, food),
    ell(x - w * 0.22, y - h * 0.05, w * 0.36, h * 0.2, foodHi, { opacity: 0.85 }),
  ];
}
/** A steel plate in 3/4 view: rim, well and a lit lip. */
function plate3q(x, y, rx, ry, gSteel, gWell) {
  return [
    ell(x, y + ry * 0.16, rx, ry, ST.dk),
    ell(x, y, rx, ry, url(gSteel)),
    ell(x, y + ry * 0.06, rx * 0.8, ry * 0.72, url(gWell)),
    line(`M${f(x - rx * 0.86)} ${f(y - ry * 0.18)}Q${f(x - rx * 0.5)} ${f(y - ry * 0.92)} ${f(x + rx * 0.05)} ${f(y - ry * 0.98)}`, ST.hi, Math.max(1.2, ry * 0.12), { opacity: 0.9 }),
  ];
}
/** The cutting-chai glass, side view; `top` is the rim's y. */
function chaiGlass(x, top, w, hgt, g) {
  const bw = w * 0.78, b = top + hgt;
  const tea = top + hgt * 0.2;
  return [
    path(`M${f(x - w)} ${f(top)}L${f(x - bw)} ${f(b - 3)}Q${f(x - bw)} ${f(b)} ${f(x - bw + 3)} ${f(b)}H${f(x + bw - 3)}Q${f(x + bw)} ${f(b)} ${f(x + bw)} ${f(b - 3)}L${f(x + w)} ${f(top)}Z`, 'rgba(255,255,255,0.42)'),
    path(`M${f(x - w * 0.95)} ${f(tea)}L${f(x - bw * 0.96)} ${f(b - 3.4)}Q${f(x - bw * 0.96)} ${f(b - 1)} ${f(x - bw + 3)} ${f(b - 1)}H${f(x + bw - 3)}Q${f(x + bw * 0.96)} ${f(b - 1)} ${f(x + bw * 0.96)} ${f(b - 3.4)}L${f(x + w * 0.95)} ${f(tea)}Z`, url(g)),
    ell(x, tea, w * 0.95, w * 0.22, F.foam),
    line(`M${f(x - w * 0.5)} ${f(tea + 4)}L${f(x - bw * 0.52)} ${f(b - 3)}`, '#fff', 1.6, { opacity: 0.5 }),
    line(`M${f(x + w * 0.12)} ${f(tea + 4)}L${f(x + bw * 0.1)} ${f(b - 3)}`, '#fff', 1.1, { opacity: 0.3 }),
    ell(x, top, w, w * 0.22, 'none', { stroke: '#fff', 'stroke-width': 1.3, opacity: 0.85 }),
  ];
}

// =============================================================
// THE BRAND MARK
// =============================================================
/**
 * The brand mark: a thali seen from above — a steel rim with three katoris
 * and a mound of rice, on a tile that follows the accent. Built from
 * circles so it stays legible at 20 px in a tab bar.
 */
export function logoMark(size = 36) {
  const g = uniq('lg'), plate = uniq('lp'), sheen = uniq('lsh');
  const kat = (cx, cy, food, hi) => [
    circ(cx, cy, 7.1, '#F4F1EA', { stroke: INK, 'stroke-width': 1.7 }),
    circ(cx, cy, 5.1, food),
    circ(cx - 1.5, cy - 1.6, 1.6, hi, { opacity: 0.9 }),
  ];
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'logo-svg', role: 'img', 'aria-label': 'Thali' },
    s('defs', {},
      lin(g, [0, 0, 1, 1], [[0, 'var(--accent-2, #FFB05C)'], [0.55, 'var(--accent, #FF7A2E)'], [1, 'var(--accent-3, #E2481A)']]),
      lin(sheen, [0, 0, 0, 1], [[0, '#fff', 0.38], [0.5, '#fff', 0]]),
      rad(plate, [0.36, 0.3, 0.9], [[0, '#FFFFFF'], [0.6, '#E4DFD4'], [1, '#C4BDAE']])),
    s('rect', { width: 64, height: 64, rx: 18, fill: url(g) }),
    s('rect', { width: 64, height: 32, rx: 18, fill: url(sheen) }),
    circ(32, 34, 23.5, '#000', { opacity: 0.16 }),
    // the plate, with its rim
    circ(32, 32, 23, url(plate), { stroke: INK, 'stroke-width': 2.6 }),
    circ(32, 32, 17.6, 'none', { stroke: INK, 'stroke-width': 1.1, opacity: 0.22 }),
    // three katoris: dal, rajma, sabzi — the same colours as the big thali
    ...kat(32, 20.6, F.dal, F.dalHi),
    ...kat(42.2, 37.6, F.rajma, F.rajmaHi),
    ...kat(21.8, 37.6, F.sabzi, F.sabziHi),
    // rice in the middle
    circ(32, 33.2, 4.6, F.rice, { stroke: INK, 'stroke-width': 1.4 }),
    path('M15.5 25.5a18 18 0 0 1 9.5-9.2', 'none', { stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.85 }));
}

// =============================================================
// THE THALI (top-down hero)
// =============================================================
const KATORI = [
  { a: -90, base: F.dal, rim: F.dalLo, dots: [F.dalLo, F.dalHi, '#7FB24E'], name: 'dal' },
  { a: -18, base: F.rajma, rim: F.rajmaLo, dots: [F.rajmaLo, F.rajmaHi, '#5E1A10'], name: 'rajma' },
  { a: 54, base: F.curd, rim: F.curdLo, dots: ['#9FC98A', F.curdLo, '#D9662B'], name: 'curd' },
  { a: 126, base: F.sabzi, rim: F.sabziLo, dots: ['#F08A2C', F.sabziLo, F.sabziHi], name: 'sabzi' },
  { a: 198, base: '#E7A35E', rim: '#C27532', dots: ['#B5602A', '#F6D2A4', '#F3E3C2'], name: 'kheer' },
];

/** Top-down thali: steel plate, five katoris, rice, a roti and a pappad. */
export function thaliArt({ size = 320, cls = '' } = {}) {
  const steel = uniq('st'), well = uniq('wl'), kat = uniq('kt'), blur = uniq('bl'), rice = uniq('rc');
  const cx = 180, cy = 178;
  const svg = s('svg', { viewBox: '0 0 360 360', width: size, height: size, class: 'art-thali ' + cls, 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      rad(steel, [0.34, 0.26, 0.95], [[0, ST.hi], [0.5, '#E2DDD2'], [0.86, '#BDB6A8'], [1, '#A49D8F']]),
      rad(well, [0.4, 0.34, 0.9], [[0, '#F1EEE7'], [0.7, '#D3CDC1'], [1, '#BDB6A8']]),
      rad(kat, [0.34, 0.28, 0.95], [[0, '#FFFFFF'], [0.55, '#DAD4C8'], [1, '#9A9385']]),
      rad(rice, [0.38, 0.3, 0.8], [[0, '#FFFFFF'], [0.75, F.rice], [1, '#EDE3CC']]),
      s('filter', { id: blur, x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feGaussianBlur', { stdDeviation: 7 }))),
    // soft shadow
    ell(cx + 4, cy + 14, 160, 154, '#000', { opacity: 0.3, filter: url(blur) }),
    // plate: rim, a brushed ring, the well, the lip's light
    circ(cx, cy, 168, url(steel)),
    circ(cx, cy, 160, 'none', { stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 1.5 }),
    circ(cx, cy, 152, 'none', { stroke: '#000', 'stroke-opacity': 0.08, 'stroke-width': 3 }),
    circ(cx, cy, 148, url(well), { stroke: '#000', 'stroke-opacity': 0.12, 'stroke-width': 1.5 }),
    circ(cx, cy, 128, 'none', { stroke: '#fff', 'stroke-opacity': 0.35, 'stroke-width': 1 }),
    line(`M${cx - 150} ${cy - 30}A153 153 0 0 1 ${cx - 52} ${cy - 144}`, '#fff', 4, { opacity: 0.7 }));

  // pappad, tucked under the rice
  const pap = s('g', {},
    circ(cx + 44, cy + 40, 37, '#E8B864', { stroke: '#C08433', 'stroke-width': 1.5 }),
    circ(cx + 44, cy + 40, 30, 'none', { stroke: '#F6D592', 'stroke-width': 3, opacity: 0.6 }));
  const r1 = rng(7);
  for (let i = 0; i < 12; i++) {
    const a = r1() * Math.PI * 2, d = 6 + r1() * 26;
    pap.appendChild(circ(f(cx + 44 + Math.cos(a) * d), f(cy + 40 + Math.sin(a) * d), f(1.5 + r1() * 1.6), '#B97C27', { opacity: 0.5 }));
  }
  svg.appendChild(pap);

  // a folded roti in the gap between sabzi and kheer
  svg.appendChild(s('g', { transform: `rotate(162 ${cx} ${cy})` },
    path(`M${cx + 70} ${cy - 30}A34 34 0 0 1 ${cx + 70} ${cy + 30}Q${cx + 58} ${cy} ${cx + 70} ${cy - 30}Z`, F.roti),
    path(`M${cx + 78} ${cy - 18}A22 22 0 0 1 ${cx + 80} ${cy + 14}`, 'none', { stroke: F.rotiHi, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.8 }),
    circ(cx + 88, cy - 6, 3, F.char, { opacity: 0.55 }), circ(cx + 80, cy + 12, 2.2, F.char, { opacity: 0.45 })));

  // katoris
  KATORI.forEach((k, i) => {
    const a = (k.a * Math.PI) / 180, x = cx + Math.cos(a) * 104, y = cy + Math.sin(a) * 104;
    const g = s('g', { class: 'katori', transform: `translate(${f(x)} ${f(y)})` },
      circ(3, 6, 40, '#000', { opacity: 0.26, filter: url(blur) }),
      circ(0, 0, 39, url(kat)),
      circ(0, 0, 35.5, 'none', { stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1.2 }),
      circ(0, 0, 32.5, k.base, { stroke: k.rim, 'stroke-width': 2.5, 'stroke-opacity': 0.55 }),
      path('M-23 -13A27 27 0 0 1 9 -25', 'none', { stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': 3.2, 'stroke-linecap': 'round' }));
    const r = rng(31 + i * 17);
    for (let j = 0; j < 7; j++) {
      const aa = r() * Math.PI * 2, dd = r() * 21;
      g.appendChild(circ(f(Math.cos(aa) * dd), f(Math.sin(aa) * dd + 2), f(1.8 + r() * 3), k.dots[j % 3], { opacity: 0.7 }));
    }
    svg.appendChild(g);
  });

  // rice mound
  const mound = s('g', {},
    circ(cx + 3, cy + 7, 54, '#000', { opacity: 0.24, filter: url(blur) }),
    circ(cx, cy, 50, url(rice)),
    circ(cx, cy, 50, 'none', { stroke: '#000', 'stroke-opacity': 0.08, 'stroke-width': 1.5 }));
  const r2 = rng(99);
  for (let i = 0; i < 30; i++) {
    const a = r2() * Math.PI * 2, d = Math.sqrt(r2()) * 42, x = f(cx + Math.cos(a) * d), y = f(cy + Math.sin(a) * d);
    mound.appendChild(ell(x, y, 5.4, 2.1, F.riceLo, { opacity: 0.85, transform: `rotate(${(r2() * 180).toFixed(0)} ${x} ${y})` }));
  }
  mound.appendChild(ell(cx - 15, cy - 19, 17, 8.5, '#fff', { opacity: 0.75 }));
  // a sprig of coriander on top
  mound.appendChild(path(`M${cx + 6} ${cy - 8}c6-6 14-5 16 0-6 4-12 4-16 0z`, F.leafHi));
  mound.appendChild(path(`M${cx + 4} ${cy - 6}c-2-8 2-14 8-14 1 7-2 12-8 14z`, F.leaf));
  svg.appendChild(mound);

  // glints
  [[88, 70, 9], [292, 300, 6]].forEach(([x, y, r]) => svg.appendChild(spark(x, y, r, '#fff', 'glint', { opacity: 0.9 })));
  return svg;
}

// =============================================================
// SMALL SCENES FOR EMPTY STATES (existing names, refined)
// =============================================================
const A = (size, vb, cls, ...kids) => s('svg', { viewBox: vb, width: size, height: size, class: 'art ' + cls, 'aria-hidden': 'true', focusable: 'false' }, ...kids);
/** The soft accent disc most spot illustrations sit on. */
const blob = (cx = 60, cy = 58, r = 46, o = 0.13) => circ(cx, cy, r, ACC.a, { opacity: o, class: 'art-blob' });

/** An empty steel plate with two empty katoris, waiting for food. */
export function artEmptyPlate(size = 132) {
  const sh = uniq('es'), st = uniq('est'), wl = uniq('ew'), kt = uniq('ek');
  return A(size, '0 0 120 120', 'art-empty',
    s('defs', {}, shadowGrad(sh), steelRad(st, 0.3, 0.2, 1), rad(wl, [0.4, 0.3, 0.9], [[0, '#F6F3EC'], [1, '#C9C2B4']]), steelRad(kt, 0.3, 0.2, 1)),
    blob(60, 56, 46),
    ell(60, 94, 46, 8, url(sh)),
    ...plate3q(60, 76, 46, 17, st, wl),
    ...katori3q(42, 70, 12, '#D9D2C4', '#EEE9E0', kt),
    ...katori3q(73, 67, 10, '#D9D2C4', '#EEE9E0', kt),
    line('M84 82l11-4', ST.dk, 3.4), ell(99, 76.4, 4.6, 2.8, ST.md, { transform: 'rotate(-20 99 76.4)' }),
    wisp('M54 50c-3-5 3-7 0-12', '', 2.6), wisp('M64 46c-3-5 3-7 0-12', 'steam-2', 2.6),
    spark(94, 34, 5, ACC.a));
}

/** Camera corners around a plate — the Snap / Ask scene. */
export function artViewfinder(size = 168) {
  const st = uniq('vs'), kt = uniq('vk'), sh = uniq('vh');
  const corner = d => line(d, ACC.a, 5);
  const bowl = (x, y, r, food, hi) => [circ(x, y, r + 3, url(kt)), circ(x, y, r, food), circ(x - r * 0.3, y - r * 0.35, r * 0.32, hi, { opacity: 0.8 })];
  return A(size, '0 0 160 160', 'art-finder',
    s('defs', {}, steelRad(st, 0.32, 0.26, 0.95), steelRad(kt, 0.3, 0.25, 1), shadowGrad(sh)),
    circ(80, 80, 54, ACC.a, { opacity: 0.12, class: 'art-blob' }),
    corner('M18 48V36a18 18 0 0 1 18-18h12'), corner('M142 48V36a18 18 0 0 0-18-18h-12'),
    corner('M18 112v12a18 18 0 0 0 18 18h12'), corner('M142 112v12a18 18 0 0 1-18 18h-12'),
    ell(82, 88, 44, 42, url(sh)),
    circ(80, 81, 40, url(st)),
    circ(80, 81, 31, 'none', { stroke: '#000', 'stroke-opacity': 0.1, 'stroke-width': 1.5 }),
    ...bowl(68, 72, 9.5, F.dal, F.dalHi), ...bowl(93, 70, 8.5, F.rajma, F.rajmaHi), ...bowl(82, 95, 10, F.sabzi, F.sabziHi),
    circ(66, 94, 6, F.rice),
    line('M50 62a34 34 0 0 1 22-20', '#fff', 2.6, { opacity: 0.85 }),
    spark(122, 42, 7, ACC.a), spark(36, 128, 4, ACC.a, 'glint', { opacity: 0.6 }));
}

/** A sprout in a pot — goals, progress, "start here". */
export function artSprout(size = 132) {
  const sh = uniq('ss'), pot = uniq('sp');
  return A(size, '0 0 120 120', 'art-sprout',
    s('defs', {}, shadowGrad(sh), lin(pot, [0, 0, 1, 0], [[0, ACC.hi], [0.45, ACC.a], [1, ACC.lo]])),
    blob(60, 56, 44),
    ell(60, 105, 32, 6, url(sh)),
    path('M38 72h44l-5.4 27.5a7 7 0 0 1-6.9 5.5H50.3a7 7 0 0 1-6.9-5.5z', url(pot)),
    path('M34 68h52a4 4 0 0 1 0 8H34a4 4 0 0 1 0-8z', ACC.lo),
    path('M34 68h52a4 4 0 0 1 3.4 2H30.6a4 4 0 0 1 3.4-2z', ACC.hi, { opacity: 0.8 }),
    ell(60, 69.6, 23, 2.4, '#5A3A22', { opacity: 0.85 }),
    line('M60 70V46', F.leafLo, 3.6),
    s('g', { class: 'leaf' },
      path('M60 54c-13.5 0-21.5-7.6-21.5-19.5 13.5 0 21.5 7.6 21.5 19.5z', F.leaf),
      line('M59 53c-6-4.6-10-9-13-14', F.leafLo, 1.4, { opacity: 0.55 })),
    s('g', { class: 'leaf leaf-2' },
      path('M60 47c12 0 19.5-6.8 19.5-17.5-12 0-19.5 6.8-19.5 17.5z', F.leafHi),
      line('M61 46c5-4 8.6-8 11.4-12.4', F.leaf, 1.3, { opacity: 0.6 })),
    line('M42 80l3 16', '#fff', 2.4, { opacity: 0.35 }),
    spark(88, 30, 5, ACC.a), spark(30, 46, 3.2, F.gold));
}

/** A little board with a rising line — progress empty state. */
export function artTrend(size = 132) {
  const sh = uniq('ts'), bd = uniq('tb');
  const bar = (x, h, c) => s('rect', { x, y: 88 - h, width: 9, height: h, rx: 3, fill: c, opacity: 0.9 });
  return A(size, '0 0 120 120', 'art-trend',
    s('defs', {}, shadowGrad(sh), lin(bd, [0, 0, 0, 1], [[0, 'var(--card-top, #fff)'], [1, 'var(--card-hi, #F5ECDB)']])),
    blob(60, 56, 46),
    ell(60, 104, 44, 6, url(sh)),
    s('rect', { x: 16, y: 22, width: 88, height: 78, rx: 16, fill: url(bd), stroke: 'var(--line-strong)', 'stroke-width': 1.5 }),
    bar(28, 16, F.dal), bar(43, 24, F.sabzi), bar(58, 20, F.rajmaHi), bar(73, 32, F.dal), bar(88, 40, F.sabzi),
    line('M26 92h70', 'var(--line-strong)', 1.6),
    line('M27 68l16-12 15 6 18-18 16-8', ACC.a, 4.6),
    circ(92, 36, 6.4, ACC.a), circ(92, 36, 2.6, 'var(--card, #fff)'),
    spark(102, 22, 5.5, ACC.a));
}

/** A glass of cutting chai with steam — reminders and the daily routine. */
export function artChai(size = 132) {
  const sh = uniq('cs'), tea = uniq('ct');
  return A(size, '0 0 120 120', 'art-chai',
    s('defs', {}, shadowGrad(sh), lin(tea, [0, 0, 1, 0], [[0, F.chaiHi], [0.5, F.chai], [1, F.chaiLo]])),
    blob(60, 58, 44),
    ell(60, 103, 28, 5.5, url(sh)),
    ...chaiGlass(60, 40, 20, 61, tea),
    wisp('M51 34c-4-6 4-8 0-15', '', 3), wisp('M61 31c-4-6 4-8 0-15', 'steam-2', 3), wisp('M71 34c-3.5-5 3.5-7 0-12', 'steam-3', 2.6),
    // a biscuit leaning on the glass
    s('g', { transform: 'rotate(-14 88 92)' },
      s('rect', { x: 78, y: 80, width: 20, height: 24, rx: 4, fill: F.friedHi }),
      ...[[83, 86], [93, 86], [88, 92], [83, 98], [93, 98]].map(([x, y]) => circ(x, y, 1.2, F.friedLo, { opacity: 0.8 }))));
}

/** A stacked steel tiffin — saved meals, templates, "nothing here yet". */
export function artTiffin(size = 132) {
  const sh = uniq('tfs'), st = uniq('tft');
  const tier = (y, h) => [
    path(`M34 ${y}h52v${h - 4}a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4z`, url(st)),
    s('rect', { x: 32, y: y - 2, width: 56, height: 5, rx: 2.5, fill: ST.md }),
    s('rect', { x: 32, y: y - 2, width: 56, height: 2, rx: 1, fill: '#fff', opacity: 0.8 }),
    line(`M40 ${y + 6}V${y + h - 4}`, '#fff', 2.4, { opacity: 0.75 }),
  ];
  return A(size, '0 0 120 120', 'art-tiffin',
    s('defs', {}, shadowGrad(sh), lin(st, [0, 0, 1, 0], [[0, ST.lo], [0.18, ST.hi], [0.55, ST.md], [1, ST.lo]])),
    blob(60, 58, 46),
    ell(60, 104, 34, 6, url(sh)),
    ...tier(80, 22), ...tier(60, 20), ...tier(40, 20),
    path('M36 40c0-8 10.7-12 24-12s24 4 24 12z', url(st)),
    // side clips and the carry handle
    line('M30 42v54M90 42v54', ST.dk, 3), line('M30 42v54', '#fff', 1, { opacity: 0.5 }),
    line('M30 44V24a10 10 0 0 1 10-10h40a10 10 0 0 1 10 10v20', ST.dk, 3.4),
    circ(60, 27, 4, ACC.a), circ(58.8, 25.8, 1.3, '#fff', { opacity: 0.7 }),
    spark(96, 18, 4.5, ACC.a));
}

/** A bathroom scale — weigh-ins. */
export function artScale(size = 132) {
  const sh = uniq('scs'), top = uniq('sct');
  return A(size, '0 0 120 120', 'art-scale',
    s('defs', {}, shadowGrad(sh), lin(top, [0, 0, 0, 1], [[0, 'var(--card-top, #fff)'], [1, 'var(--card-hi, #F5ECDB)']])),
    blob(60, 58, 46),
    ell(60, 101, 42, 6, url(sh)),
    s('rect', { x: 18, y: 50, width: 84, height: 50, rx: 16, fill: ST.lo }),
    s('rect', { x: 18, y: 46, width: 84, height: 50, rx: 16, fill: url(top), stroke: 'var(--line-strong)', 'stroke-width': 1.5 }),
    s('rect', { x: 37, y: 56, width: 46, height: 20, rx: 8, fill: '#2A231C' }),
    line('M47 66h7M60 62v8M66 66h6', ACC.hi, 3.2),
    ell(36, 88, 8, 4, ST.md), ell(84, 88, 8, 4, ST.md),
    path('M42 38a18 18 0 0 1 36 0', 'none', { stroke: ACC.a, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.45 }),
    line('M60 38l7-9', ACC.a, 3.2), circ(60, 38, 4.4, ACC.a), spark(92, 26, 5, ACC.a));
}

/** A speech bubble over a plate — the coach and "ask me". */
export function artAsk(size = 132) {
  const sh = uniq('as'), st = uniq('ast'), wl = uniq('aw');
  return A(size, '0 0 120 120', 'art-ask',
    s('defs', {}, shadowGrad(sh), steelRad(st, 0.3, 0.2, 1), rad(wl, [0.4, 0.3, 0.9], [[0, '#F6F3EC'], [1, '#C9C2B4']])),
    ell(60, 104, 36, 6, url(sh)),
    ...plate3q(60, 90, 34, 11, st, wl),
    ell(48, 87, 7.5, 3.2, F.dal), ell(62, 85, 6.8, 3, F.rajma), ell(74, 89, 7, 3, F.sabzi), ell(58, 92, 8, 3, F.rice),
    path('M26 14h68a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H58l-14 11v-11H26a12 12 0 0 1-12-12V26a12 12 0 0 1 12-12z', ACC.a),
    path('M26 14h68a12 12 0 0 1 12 12v6H14v-6a12 12 0 0 1 12-12z', '#fff', { opacity: 0.16 }),
    circ(44, 37, 4, 'var(--accent-ink, #1E0D03)', { class: 'dot-1' }), circ(60, 37, 4, 'var(--accent-ink, #1E0D03)', { class: 'dot-2' }), circ(76, 37, 4, 'var(--accent-ink, #1E0D03)', { class: 'dot-3' }));
}

/** A flame with a ring — streaks. `days` is drawn inside when given. */
export function artStreak(size = 120, days = null) {
  const fl = uniq('fl'), core = uniq('fc');
  return A(size, '0 0 120 120', 'art-streak',
    s('defs', {},
      lin(fl, [0, 0, 0, 1], [[0, ACC.hi], [0.55, ACC.a], [1, ACC.lo]]),
      lin(core, [0, 0, 0, 1], [[0, '#FFF6D6'], [1, '#FFD27A']])),
    circ(60, 60, 44, ACC.a, { opacity: 0.12 }),
    circ(60, 60, 44, 'none', { stroke: ACC.a, 'stroke-width': 2, opacity: 0.35, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }),
    s('g', { class: 'flame-live', transform: 'translate(10.6 13.4) scale(1.55)' },
      path(FLAME, url(fl)),
      path('M32 26c.9 4 6 6.4 6 12a6 6 0 0 1-12 0c0-2.6 1.2-4 2.6-5.4.2 1.6.9 2.6 1.8 3 .2-4.6 0-7.2 1.6-9.6z', url(core)),
      path('M27 34c-1.4 2-2 4-1.6 6.4', 'none', { stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.55 })),
    spark(92, 30, 4.5, ACC.a),
    days != null && s('text', { x: 60, y: 108, 'text-anchor': 'middle', fill: 'var(--ink)', style: 'font:700 20px var(--font-d)' }, String(days)));
}

// =============================================================
// CONTRACT — art for the Thali redesign (design/DESIGN.md §6).
// Signatures are fixed; screens place these freely. Each returns
// an <svg> with class "art art-<name>", decorative (aria-hidden)
// unless a `label` is passed.
// =============================================================
export const MOODS = ['happy', 'proud', 'hungry', 'sleepy', 'cheer', 'think', 'wave', 'cool'];

const svgArt = (size, vb, name, extra = {}, ...kids) =>
  s('svg', { viewBox: vb, width: size, height: size, class: `art art-${name}`, 'aria-hidden': 'true', focusable: 'false', ...extra }, ...kids);

// ---------- Kato ----------
/**
 * Kato, the katori mascot. `mood` is one of MOODS. A small round steel bowl of
 * dal with a face and a curl of steam for hair. Drawn on a 120-unit grid with
 * a 3.2-unit ink outline (2 px at 64), so it reads from a 48 px avatar to a
 * 240 px hero. Kato is kind: never sad — hungry or sleepy at worst.
 */
export function artMascot({ mood = 'happy', size = 120, label = null } = {}) {
  if (!MOODS.includes(mood)) mood = 'happy';
  const gB = uniq('kb'), gR = uniq('kr'), gI = uniq('ki'), gS = uniq('ks');
  const O = INK, ow = 3.2;
  const ink = (d, w = 3) => line(d, O, w);
  // an arm: an ink capsule under a steel one, with a round mitten at the end
  const arm = (d, hx, hy, cls, extra = {}) => s('g', { class: cls, ...extra },
    line(d, O, 11.6), circ(hx, hy, 6.8, O),
    line(d, ST.md, 5.6), circ(hx, hy, 4.6, ST.md));
  const eye = (x, y, big = false) => s('g', {},
    ell(x, y, big ? 5.2 : 4.7, big ? 6.3 : 5.7, O),
    circ(x - 1.5, y - 2.2, big ? 2.1 : 1.75, '#fff'),
    big && circ(x + 1.8, y + 2.3, 0.95, '#fff'));
  const closedUp = x => ink(`M${x - 5.4} 78.6Q${x} 71.6 ${x + 5.4} 78.6`, 3.3);     // ^ — delighted
  const closedDown = x => ink(`M${x - 5.4} 76Q${x} 81 ${x + 5.4} 76`, 3.3);        // ‿ — asleep
  const openMouth = (w, dy) => [   // an open smile with a tongue
    path(`M${60 - w} 84.4Q60 86.4 ${60 + w} 84.4Q${60 + w - 0.8} ${93 + dy} 60 ${93 + dy}Q${60 - w + 0.8} ${93 + dy} ${60 - w} 84.4Z`, F.mouth),
    path(`M${60 - w * 0.58} ${90.6 + dy * 0.7}Q60 ${87.4 + dy * 0.5} ${60 + w * 0.58} ${90.6 + dy * 0.7}Q${60 + w * 0.36} ${93 + dy} 60 ${93 + dy}Q${60 - w * 0.36} ${93 + dy} ${60 - w * 0.58} ${90.6 + dy * 0.7}Z`, F.tongue),
    path(`M${60 - w} 84.4Q60 86.4 ${60 + w} 84.4Q${60 + w - 0.8} ${93 + dy} 60 ${93 + dy}Q${60 - w + 0.8} ${93 + dy} ${60 - w} 84.4Z`, 'none', { stroke: O, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
  ];
  const cheeks = [ell(35.5, 85, 6.2, 3.6, F.blush, { opacity: 0.55 }), ell(84.5, 85, 6.2, 3.6, F.blush, { opacity: 0.55 })];
  const curl = 'M61 53C55 47 66.5 42.5 60.5 35C56.5 30 60 23.5 66 25C70.5 26.2 69.5 32 65 31.2';
  const hair = s('g', { class: 'k-steam' }, line(curl, O, 8.4), line(curl, '#fff', 4.4));

  const behind = [], front = [], face = [], props = [];
  let eyes = [eye(46, 76), eye(74, 76)], blink = true, steamOn = true;
  let mouth = openMouth(7.5, 0);

  if (mood === 'proud') {
    blink = false;
    eyes = [closedUp(46), closedUp(74)];
    mouth = [ink('M52.5 85Q60 92 67.5 85', 3.1)];
    front.push(arm('M23.5 71.5L13 79.5L26 88', 26, 88, 'k-arm'), arm('M96.5 71.5L107 79.5L94 88', 94, 88, 'k-arm'));
    props.push(s('g', { class: 'k-star' },
      path(starD(22, 26, 13, 6.4, -100), F.gold, { stroke: O, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }),
      path(starD(22, 26, 7, 3.4, -100), F.goldHi, { opacity: 0.7 }),
      circ(17.6, 21.6, 1.8, '#fff', { opacity: 0.9 })),
      spark(40, 14, 4, F.gold, 'k-spark'), spark(8, 44, 3, ACC.a, 'k-spark'));
  } else if (mood === 'hungry') {
    eyes = [eye(46, 75.6, true), eye(74, 75.6, true)];
    mouth = [
      ink('M52.5 84.8Q59.5 91.5 67 84.8', 3.1),
      path('M62.6 87.6c3.6-.4 6.4.6 6 4.2-.3 2.8-2.9 3.6-4.6 2.6-1.6-1-1.9-3.9-1.4-6.8z', F.tongue, { stroke: O, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    ];
    behind.push(s('g', {}, line('M96 77Q101 78 104 76', O, 11.6), line('M96 77Q101 78 104 76', ST.md, 5.6)));
    behind.push(arm('M24 77Q17 80 15.5 87', 15.5, 87, 'k-arm'));
    props.push(s('g', { class: 'k-spoon' },
      line('M106 98V60', O, 6.6), line('M106 98V60', ST.md, 2.6),
      ell(106, 50, 6.6, 9, url(gB), { stroke: O, 'stroke-width': 2.6 }),
      ell(104.4, 47.6, 2, 3.4, '#fff', { opacity: 0.8 }),
      circ(105.4, 76.6, 6.8, O), circ(105.4, 76.6, 4.6, ST.md)));
  } else if (mood === 'sleepy') {
    blink = false; steamOn = false;
    eyes = [closedDown(46), closedDown(74)];
    mouth = [ell(60, 88.6, 2.7, 3.1, F.mouth, { stroke: O, 'stroke-width': 2 })];
    props.push(s('g', { class: 'k-cap' },
      path('M27 54C29 32 52 18 79 21C94 23 104 30 105 41C97 35 89 36 88 52Z', '#6D7CF0', { stroke: O, 'stroke-width': ow, 'stroke-linejoin': 'round' }),
      line('M47 27Q60 36 67 52', '#9AA6FF', 4.2, { opacity: 0.9 }),
      line('M69 21.6Q78 32 80 51', '#9AA6FF', 4.2, { opacity: 0.9 }),
      path('M24.5 55Q60 65 96 53L94.6 45.6Q60 56 26 47.4Z', '#F7F3EA', { stroke: O, 'stroke-width': ow, 'stroke-linejoin': 'round' }),
      circ(105, 43, 6.4, '#F7F3EA', { stroke: O, 'stroke-width': ow })),
      s('g', { class: 'k-z k-z1' }, line('M18 32h8l-8 9h8', 'var(--hue-dinner, #7C8BFF)', 3)),
      s('g', { class: 'k-z k-z2' }, line('M8 15h5.6l-5.6 6.4h5.6', 'var(--hue-dinner, #7C8BFF)', 2.4)));
  } else if (mood === 'cheer') {
    blink = false;
    eyes = [closedUp(46), closedUp(74)];
    mouth = openMouth(9.4, 2.4);
    behind.push(arm('M25 70Q15 63 13 51', 13, 50, 'k-arm k-arm-l'), arm('M95 70Q105 63 107 51', 107, 50, 'k-arm k-arm-r'));
    props.push(spark(24, 26, 7.5, F.gold, 'k-spark'), spark(98, 22, 6.5, ACC.a, 'k-spark'), spark(84, 8, 3.6, F.gold, 'k-spark'),
      spark(38, 9, 3, ACC.a, 'k-spark'), circ(111, 34, 1.9, F.gold, { class: 'k-spark' }), circ(8, 34, 1.7, ACC.a, { class: 'k-spark' }));
  } else if (mood === 'think') {
    eyes = [eye(47.6, 74.6), eye(75.6, 74.6)];
    mouth = [ink('M55 88.4q3.2-2.4 6.4-1q2.6 1.1 4.4-.8', 2.9)];
    front.push(arm('M97 80Q86 92 70 92', 70, 92, 'k-arm'));
    props.push(s('g', { class: 'k-bubble' },
      circ(86, 45, 2.3, '#fff', { stroke: O, 'stroke-width': 2 }),
      circ(92, 37.5, 3.4, '#fff', { stroke: O, 'stroke-width': 2.2 }),
      path('M88.5 25a7.6 7.6 0 0 1 5.4-11.7a9.4 9.4 0 0 1 16.2 .6a7.4 7.4 0 0 1 2.6 13.4a6.6 6.6 0 0 1-8.2 5.4h-10.6a6.8 6.8 0 0 1-5.4-7.7z', '#fff', { stroke: O, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
      circ(101, 22.4, 6.4, '#ECE7DD', { stroke: O, 'stroke-width': 1.6 }),
      circ(99, 20.6, 2, F.dal), circ(103.4, 21.4, 1.8, F.rajma), circ(100.6, 25, 1.9, F.sabzi)));
  } else if (mood === 'wave') {
    mouth = openMouth(8.2, 1);
    behind.push(arm('M24.5 78Q16.5 81 15.5 88', 15.5, 88, 'k-arm'));
    props.push(s('g', { class: 'k-wave', style: 'transform-origin: 96px 73px' },
      arm('M96 73Q106 69 107.5 56', 108, 54, 'k-arm'),
      line('M115.6 45q2.8 3.6 1.4 8.2', ACC.a, 2.4), line('M110.6 39.6q4.4 1.8 5.8 5.2', ACC.a, 2.4)));
  } else if (mood === 'cool') {
    blink = false;
    const lens = x => path(`M${x - 11} 71h22q2 0 1.7 2.1l-1 5.9q-.9 4.8-5.9 4.8h-11.6q-5 0-5.9-4.8l-1-5.9q-.3-2.1 1.7-2.1z`, '#1B0D04');
    eyes = [];
    mouth = [ink('M52.5 86.6Q61 91.4 67.6 84.2', 3.1)];
    props.push(s('g', { class: 'k-shades' },
      ink('M24 70.6L36 72.4M96 70.6L84 72.4', 2.6),
      lens(46), lens(74), ink('M57 73.6q3-2 6 0', 2.6),
      line('M38.6 77.6l5.6-4.6M66.6 77.6l5.6-4.6', '#fff', 1.7, { opacity: 0.75 }),
      line('M44.6 79.2l2.6-2.2M72.6 79.2l2.6-2.2', '#fff', 1.4, { opacity: 0.45 })),
      spark(96, 16, 5, ACC.a, 'k-spark'));
  }

  const body = [
    s('rect', { x: 46, y: 95, width: 28, height: 9.5, rx: 4.6, fill: ST.lo, stroke: O, 'stroke-width': 3 }),
    path('M20 56A40 44 0 0 0 100 56Z', url(gB), { stroke: O, 'stroke-width': ow, 'stroke-linejoin': 'round' }),
    line('M27.6 70Q31 87.5 46.5 95.6', '#fff', 3.4, { opacity: 0.85 }),
    circ(25.6, 64.4, 1.7, '#fff', { opacity: 0.85 }),
    line('M94 71Q91.4 84 82 91.6', '#fff', 2, { opacity: 0.35 }),
    ell(60, 56, 40, 9.6, url(gR), { stroke: O, 'stroke-width': ow }),
    ell(60, 56.9, 33.6, 6.3, url(gI)),
    ell(60, 58.2, 29, 4.5, F.dal),
    ell(53, 57.3, 11, 1.5, F.dalHi),
    line('M28.6 51.6Q40 47.8 53.6 47.3', '#fff', 2.2, { opacity: 0.9 }),
  ];
  if (blink) face.push(s('g', { class: 'k-eyes' }, ...eyes)); else face.push(...eyes);
  face.push(...cheeks, ...mouth);

  return s('svg', {
    viewBox: '0 0 120 120', width: size, height: size, class: `art art-mascot kato-${mood}`, 'data-mood': mood, focusable: 'false',
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }),
  },
    s('defs', {},
      rad(gB, [0.32, 0.16, 0.98], [[0, ST.hi], [0.42, ST.md], [1, ST.lo]]),
      lin(gR, [0, 0, 1, 1], [[0, ST.hi], [1, ST.md]]),
      lin(gI, [0, 0, 0, 1], [[0, ST.lo], [1, ST.md]]),
      shadowGrad(gS)),
    ell(60, 106, 31, 5.4, url(gS), { class: 'k-shadow' }),
    s('g', { class: 'k-bob' }, ...behind, ...body, steamOn && hair, ...front, ...face, ...props));
}

// ---------- meal scenes ----------
/**
 * A small scene for a meal: 'breakfast' | 'lunch' | 'snacks' | 'dinner'.
 * A sky disc tinted with the meal's hue, a horizon, and the meal in front of it.
 */
export function artMeal(meal = 'lunch', size = 96) {
  if (!['breakfast', 'lunch', 'snacks', 'dinner'].includes(meal)) meal = 'lunch';
  const hue = `var(--hue-${meal})`;
  const H = { breakfast: 74, lunch: 66, snacks: 72, dinner: 72 }[meal];
  const sky = uniq('ms'), clip = uniq('mc'), above = uniq('ma'), sh = uniq('mh'), st = uniq('mt'), wl = uniq('mw'), kt = uniq('mk'), x1 = uniq('mx');
  const defs = s('defs', {},
    lin(sky, [0, 0, 0, 1], [[0, hue, meal === 'dinner' ? 0.62 : 0.5], [0.72, hue, 0.2], [1, hue, 0.14]]),
    s('clipPath', { id: clip }, circ(60, 56, 50, '#000')),
    s('clipPath', { id: above }, s('rect', { x: 0, y: 0, width: 120, height: H })),
    shadowGrad(sh), steelRad(st, 0.3, 0.2, 1),
    rad(wl, [0.4, 0.3, 0.9], [[0, '#F6F3EC'], [1, '#C9C2B4']]),
    steelRad(kt, 0.3, 0.2, 1),
    meal === 'snacks' || meal === 'breakfast'
      ? lin(x1, [0, 0, 1, 0], [[0, F.chaiHi], [0.5, F.chai], [1, F.chaiLo]])
      : lin(x1, [0, 0, 0, 1], [[0, F.rotiHi], [1, F.roti]]));
  const horizon = (y, o = 0.3) => [
    s('rect', { x: 0, y, width: 120, height: 70, fill: hue, opacity: o }),
    s('rect', { x: 0, y, width: 120, height: 1.4, fill: '#fff', opacity: 0.35 }),
  ];
  const GLOW = { breakfast: '#FFF0C2', lunch: '#FFF3D9', snacks: '#FFE0CC', dinner: '#C9D0FF' }[meal];
  const frame = (skyKids, ground) => [
    circ(60, 56, 50, url(sky)),
    s('g', { 'clip-path': url(clip) },
      meal !== 'lunch' && ell(60, H, 46, 13, GLOW, { opacity: meal === 'dinner' ? 0.2 : 0.5 }),
      s('g', { 'clip-path': url(above) }, ...skyKids), ...ground),
    circ(60, 56, 49.4, 'none', { stroke: '#fff', 'stroke-opacity': 0.18, 'stroke-width': 1.2 }),
  ];
  let kids;
  if (meal === 'breakfast') {
    const rays = s('g', { class: 'sun-rays', style: 'transform-origin: 60px 74px' });
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      rays.appendChild(line(`M${f(60 + Math.cos(a) * 25)} ${f(74 + Math.sin(a) * 25)}L${f(60 + Math.cos(a) * 32)} ${f(74 + Math.sin(a) * 32)}`, '#FFB52E', 3.2, { opacity: 0.85 }));
    }
    const idli = (x, y, w) => [
      path(`M${x - w} ${y}C${x - w} ${y - w * 0.95} ${x + w} ${y - w * 0.95} ${x + w} ${y}Q${x} ${y + w * 0.3} ${x - w} ${y}Z`, F.idli, { stroke: F.idliLo, 'stroke-width': 0.8 }),
      path(`M${x + w * 0.2} ${y - w * 0.68}C${x + w * 0.8} ${y - w * 0.5} ${x + w} ${y - w * 0.2} ${x + w} ${y}Q${x + w * 0.5} ${y + w * 0.2} ${x + w * 0.1} ${y + w * 0.22}C${x + w * 0.6} ${y - w * 0.2} ${x + w * 0.5} ${y - w * 0.5} ${x + w * 0.2} ${y - w * 0.68}Z`, F.idliLo),
      ell(x - w * 0.4, y - w * 0.45, w * 0.28, w * 0.13, '#fff', { opacity: 0.9, transform: `rotate(-24 ${x - w * 0.4} ${y - w * 0.45})` }),
    ];
    kids = [
      ...frame([
        circ(60, 74, 22, '#FFD978', { opacity: 0.4 }), rays,
        circ(60, 74, 16, '#FFC43D'), circ(56, 69, 7, '#FFE08A', { opacity: 0.7 }),
      ], horizon(74)),
      ell(48, 102, 34, 5.6, url(sh)), ell(91, 102, 12, 3, url(sh)),
      ...plate3q(48, 92, 33, 10.5, st, wl),
      path('M20 92.4C28 85 58 83 74 88.6C62 98 32 99 20 92.4Z', '#5FA846'),
      path('M22 92.2C34 89 56 88 72 88.8', 'none', { stroke: '#8BCB66', 'stroke-width': 1.4, 'stroke-linecap': 'round' }),
      ...idli(37, 92, 11), ...idli(55, 93.4, 11.5),
      ell(66, 86.4, 6, 2.4, '#E6EED2'), circ(64.6, 85.8, 0.9, F.leaf), circ(68, 86.8, 0.8, F.chilli),
      ...chaiGlass(91, 68, 11, 33, x1),
      wisp('M87 62c-3-4 3-6 0-11', '', 2.4, 'rgba(255,255,255,0.8)'), wisp('M95 60c-3-4 3-6 0-11', 'steam-2', 2.4, 'rgba(255,255,255,0.8)'),
    ];
  } else if (meal === 'lunch') {
    kids = [
      ...frame([
        circ(60, 24, 17, '#FFE29A', { opacity: 0.45, class: 'sun-glow' }), circ(60, 24, 10, '#FFD34E'), circ(57.4, 21.6, 4, '#FFF1B8', { opacity: 0.8 }),
        line('M60 8v-3M76 24h3M41 24h3M71.3 12.7l2.1-2.1M48.7 12.7l-2.1-2.1', '#FFD34E', 2.6, { opacity: 0.9 }),
      ], horizon(66)),
      ell(60, 104, 48, 6, url(sh)),
      ...plate3q(60, 88, 48, 15.5, st, wl),
      ...katori3q(37, 82, 10.5, F.dal, F.dalHi, kt), ...katori3q(58, 79, 10, F.rajma, F.rajmaHi, kt),
      ...katori3q(79, 80, 10, F.sabzi, F.sabziHi, kt),
      path('M70 95c0-8 7-12 13-12s12 4 12 12q-12 3-25 0z', F.rice),
      path('M85 84c4 1 8 5 9 10q-4 1.2-8 1.4c1.6-4 1.2-8-1-11.4z', F.riceLo),
      ell(78.6, 87.6, 3.4, 1.6, '#fff', { opacity: 0.9 }),
      path('M30 95a14 6.4 0 0 1 26 0q-13 4-26 0z', url(x1)), circ(38, 93, 1.4, F.char, { opacity: 0.6 }), circ(47, 92.6, 1.1, F.char, { opacity: 0.5 }),
      path('M58.6 97.4c4-3 9-3.4 12-1.6', 'none', { stroke: F.leaf, 'stroke-width': 3, 'stroke-linecap': 'round' }),
      wisp('M55 66c-3-4 3-6 0-11', '', 2.4, 'rgba(255,255,255,0.85)'), wisp('M84 74c-3-4 3-6 0-11', 'steam-2', 2.4, 'rgba(255,255,255,0.85)'),
    ];
  } else if (meal === 'snacks') {
    const samosa = (x, y, w, flip) => {
      const hgt = w * 1.25, k = flip ? -1 : 1;
      return [
        path(`M${x - w} ${y}L${x + w * 0.1 * k} ${y - hgt}L${x + w} ${y}Q${x} ${y + w * 0.3} ${x - w} ${y}Z`, F.friedHi, { 'stroke-linejoin': 'round', stroke: F.friedHi, 'stroke-width': 3 }),
        path(`M${x + w * 0.1 * k} ${y - hgt}L${x + w} ${y}Q${x + w * 0.55} ${y + w * 0.2} ${x + w * 0.25} ${y + w * 0.24}Z`, F.fried, { 'stroke-linejoin': 'round', stroke: F.fried, 'stroke-width': 3 }),
        circ(x - w * 0.35, y - w * 0.3, 0.9, F.friedLo, { opacity: 0.7 }), circ(x - w * 0.05, y - w * 0.65, 0.8, F.friedLo, { opacity: 0.6 }),
      ];
    };
    kids = [
      ...frame([
        circ(78, 66, 13, '#FFC3A0', { opacity: 0.95 }), circ(78, 66, 19, '#FFD2B8', { opacity: 0.35 }),
        path('M50 30a6 6 0 0 1 11-3a7 7 0 0 1 13 3a5 5 0 0 1-1 6H53a5 5 0 0 1-3-6z', '#fff', { opacity: 0.55 }),
        path('M80 28a5 5 0 0 1 9-2.6a6 6 0 0 1 11 2.6a4 4 0 0 1-1 5H82a4 4 0 0 1-2-5z', '#fff', { opacity: 0.45 }),
      ], horizon(72)),
      ell(34, 103, 13, 3.2, url(sh)), ell(76, 103, 30, 5, url(sh)),
      ...chaiGlass(34, 62, 12, 39, x1),
      wisp('M30 56c-3.4-5 3.4-7 0-12', '', 2.6, 'rgba(255,255,255,0.85)'), wisp('M39 54c-3.4-5 3.4-7 0-12', 'steam-2', 2.6, 'rgba(255,255,255,0.85)'),
      ...plate3q(76, 94, 30, 9.5, st, wl),
      ...samosa(68, 94, 12, false), ...samosa(85, 96, 11, true),
      ell(92, 89, 5, 2, '#5FA046'), circ(91, 88.6, 0.9, '#8DC063'),
    ];
  } else {
    kids = [
      ...frame([
        path('M86 16a17 17 0 1 0 9 30a14 14 0 1 1-9-30z', F.moon, { class: 'moon-glow' }),
        circ(80, 35, 2.4, F.moonLo, { opacity: 0.55 }), circ(84, 27, 1.5, F.moonLo, { opacity: 0.5 }),
        spark(30, 26, 4.4, '#FFF4CF', 'twinkle'), spark(48, 14, 2.8, '#FFF4CF', 'twinkle tw-2'), spark(104, 54, 3, '#FFF4CF', 'twinkle tw-3'),
        circ(40, 40, 1.3, '#FFF4CF', { class: 'twinkle tw-2' }), circ(66, 22, 1.1, '#FFF4CF', { class: 'twinkle tw-3' }), circ(18, 52, 1.2, '#FFF4CF', { class: 'twinkle' }),
      ], horizon(72, 0.34)),
      ell(58, 104, 44, 5.6, url(sh)),
      ...plate3q(58, 92, 42, 12.5, st, wl),
      ell(40, 93.6, 19, 6.4, F.rotiLo), ell(40, 91, 19, 6.4, F.roti), ell(41, 88, 19, 6.4, url(x1)),
      circ(35, 87, 1.8, F.char, { opacity: 0.55 }), circ(46, 89, 1.4, F.char, { opacity: 0.5 }), circ(42, 85.6, 1.1, F.char, { opacity: 0.45 }),
      ...katori3q(75, 86, 12, F.dal, F.dalHi, kt),
      line('M71 86.6l3-1.4M79 87l2.4-.6', F.leaf, 1.6),
      wisp('M70 76c-3.4-5 3.4-7 0-12', '', 2.6, 'rgba(255,255,255,0.85)'), wisp('M80 74c-3.4-5 3.4-7 0-12', 'steam-2', 2.6, 'rgba(255,255,255,0.85)'),
    ];
  }
  return svgArt(size, '0 0 120 120', 'meal', { 'data-meal': meal, class: `art art-meal art-meal-${meal}` }, defs, ...kids);
}

// ---------- water ----------
/** A steel tumbler of water — hydration. */
export function artWater(size = 120) {
  const sh = uniq('wsh'), body = uniq('wb'), wat = uniq('ww');
  const drop = (x, y, r, o = 1) => [path(dropD(x, y, r), F.waterHi, { opacity: 0.9 * o }), circ(x - r * 0.35, y - r * 0.1, r * 0.3, '#fff', { opacity: 0.9 * o })];
  return svgArt(size, '0 0 120 120', 'water', {},
    s('defs', {}, shadowGrad(sh),
      lin(body, [0, 0, 1, 0], [[0, ST.lo], [0.2, ST.hi], [0.42, ST.md], [0.78, ST.lo], [1, ST.dk]]),
      lin(wat, [0, 0, 0, 1], [[0, F.waterHi], [1, F.water]])),
    circ(60, 58, 46, 'var(--c-water, #4F8BFF)', { opacity: 0.13 }),
    ell(60, 104, 26, 5, url(sh)),
    path('M34 32L40.6 97A20 6 0 0 0 79.4 97L86 32Z', url(body)),
    line('M45 40l4 52', '#fff', 3.4, { opacity: 0.8 }), line('M53 40l2.4 50', '#fff', 1.4, { opacity: 0.45 }),
    line('M41 96.2a19 5 0 0 0 38 0', ST.dk, 1.4, { opacity: 0.5 }),
    ell(60, 32, 26, 7.4, ST.md), ell(60, 32, 26, 7.4, 'none', { stroke: '#fff', 'stroke-width': 1.6, opacity: 0.9 }),
    ell(60, 33.4, 22.6, 5.6, url(wat)),
    ell(60, 33.6, 9, 2.2, 'none', { stroke: '#fff', 'stroke-width': 1.2, opacity: 0.8, class: 'ripple' }),
    ell(60, 33.6, 9, 2.2, 'none', { stroke: '#fff', 'stroke-width': 1.2, opacity: 0.8, class: 'ripple ripple-2' }),
    ell(50, 32.4, 6, 1.2, '#fff', { opacity: 0.7 }),
    ...drop(70, 58, 3.2), ...drop(49, 70, 2.6), ...drop(74, 80, 2.4, 0.85), ...drop(57, 52, 1.8, 0.8),
    s('g', { class: 'drip' }, ...drop(88, 16, 3.6)),
    circ(80, 22, 1.6, F.waterHi, { opacity: 0.9 }), circ(95, 24, 1.3, F.waterHi, { opacity: 0.8 }));
}

// ---------- dumbbell ----------
/** Dumbbells — training, rest days, no workout logged. */
export function artDumbbell(size = 120) {
  const sh = uniq('dsh'), bar = uniq('dbr'), pl = uniq('dpl');
  const plate = (x, w, h) => [
    s('rect', { x: x - w / 2, y: 64 - h / 2 + 2, width: w, height: h, rx: w * 0.42, fill: ACC.lo }),
    s('rect', { x: x - w / 2, y: 64 - h / 2, width: w, height: h, rx: w * 0.42, fill: url(pl) }),
    s('rect', { x: x - w / 2 + 2, y: 64 - h / 2 + 4, width: 2.2, height: h * 0.42, rx: 1.1, fill: '#fff', opacity: 0.55 }),
  ];
  return svgArt(size, '0 0 120 120', 'dumbbell', {},
    s('defs', {}, shadowGrad(sh),
      lin(bar, [0, 0, 0, 1], [[0, ST.hi], [0.5, ST.md], [1, ST.lo]]),
      lin(pl, [0, 0, 1, 0], [[0, ACC.hi], [0.4, ACC.a], [1, ACC.lo]])),
    blob(60, 56, 46),
    ell(60, 100, 44, 6, url(sh)),
    s('g', { transform: 'rotate(-14 60 70)' },
      s('rect', { x: 26, y: 60, width: 68, height: 9, rx: 4.5, fill: url(bar) }),
      line('M50 61.6v6M54 61.6v6M58 61.6v6M62 61.6v6M66 61.6v6M70 61.6v6', ST.dk, 1, { opacity: 0.55 }),
      s('rect', { x: 12, y: 60, width: 8, height: 9, rx: 3, fill: url(bar) }), s('rect', { x: 100, y: 60, width: 8, height: 9, rx: 3, fill: url(bar) }),
      ...plate(22, 9, 30), ...plate(32, 12, 42), ...plate(88, 12, 42), ...plate(98, 9, 30)),
    path(dropD(96, 26, 3.4), F.waterHi, { opacity: 0.9 }),
    spark(26, 30, 5, ACC.a), spark(102, 44, 3.2, F.gold));
}

// ---------- trophy ----------
/** A trophy — badges, goals reached, challenges. */
export function artTrophy(size = 120) {
  const sh = uniq('tsh'), gold = uniq('tg'), base = uniq('tbs');
  const rays = s('g', { class: 'trophy-rays', opacity: 0.1 });
  for (let i = 0; i < 12; i++) {
    const a = ((i * 30 - 90) * Math.PI) / 180, b = a + 0.16;
    rays.appendChild(path(`M60 50L${f(60 + Math.cos(a - 0.08) * 46)} ${f(50 + Math.sin(a - 0.08) * 46)}L${f(60 + Math.cos(b) * 46)} ${f(50 + Math.sin(b) * 46)}Z`, ACC.hi));
  }
  return svgArt(size, '0 0 120 120', 'trophy', {},
    s('defs', {}, shadowGrad(sh),
      lin(gold, [0, 0, 1, 0], [[0, F.goldHi], [0.3, F.gold], [0.72, '#E3A126'], [1, F.goldLo]]),
      lin(base, [0, 0, 0, 1], [[0, F.wood], [1, F.woodLo]])),
    blob(60, 56, 46, 0.12), rays,
    ell(60, 104, 32, 5.6, url(sh)),
    line('M40 33h-6.6a7.4 7.4 0 0 0 0 14.8H40M80 33h6.6a7.4 7.4 0 0 1 0 14.8H80', F.goldLo, 5),
    line('M40 33h-6.6a7.4 7.4 0 0 0 0 14.8H40M80 33h6.6a7.4 7.4 0 0 1 0 14.8H80', F.gold, 2.4),
    path('M38 24h44v16a22 22 0 0 1-44 0z', url(gold)),
    ell(60, 24, 22, 4.4, '#E9AE34'), ell(60, 24.8, 18.6, 3, F.goldLo, { opacity: 0.7 }),
    path('M55 61h10l-1.6 11h-6.8z', url(gold)),
    ell(60, 73, 9, 2.8, F.goldLo),
    path(starD(60, 40, 8.4, 4.2), F.goldHi, { opacity: 0.95 }),
    line('M44 30v10a16 16 0 0 0 6 12', '#fff', 2.8, { opacity: 0.6 }),
    s('rect', { x: 43, y: 75, width: 34, height: 9, rx: 2.6, fill: url(base) }),
    s('rect', { x: 39, y: 84, width: 42, height: 12, rx: 3, fill: url(base) }),
    s('rect', { x: 51, y: 87.6, width: 18, height: 4.8, rx: 1.6, fill: F.gold }),
    s('rect', { x: 39, y: 84, width: 42, height: 1.6, rx: 0.8, fill: '#fff', opacity: 0.2 }),
    spark(28, 24, 6, F.gold), spark(94, 18, 4.4, ACC.a, 'glint glint-2'), spark(96, 70, 3.4, F.gold, 'glint glint-3'),
    s('rect', { x: 22, y: 60, width: 4, height: 2.2, rx: 1, fill: ACC.a, transform: 'rotate(30 24 61)' }),
    s('rect', { x: 92, y: 46, width: 4, height: 2.2, rx: 1, fill: F.sabzi, transform: 'rotate(-24 94 47)' }),
    circ(30, 44, 1.6, '#FF5C93'), circ(86, 8, 1.4, F.sabzi));
}

// ---------- goal ----------
/** A flag on a summit — the goal planner and the goal card. */
export function artGoal(size = 120) {
  const sh = uniq('gsh'), clip = uniq('gcl');
  return svgArt(size, '0 0 120 120', 'goal', {},
    s('defs', {}, shadowGrad(sh), s('clipPath', { id: clip }, circ(60, 58, 46, '#000'))),
    blob(60, 58, 46, 0.14),
    s('g', { 'clip-path': url(clip) },
      circ(88, 34, 7, ACC.hi, { opacity: 0.8 }),
      path('M18 40a5 5 0 0 1 9-2.6a6 6 0 0 1 11 2.6a4 4 0 0 1-1 5H20a4 4 0 0 1-2-5z', '#fff', { opacity: 0.55 }),
      // far ridge
      path('M50 104L84 54L120 104Z', '#CDBFA6'), path('M84 54L120 104H96Z', '#B5A68B'),
      // the summit
      path('M14 104L62 30L110 104Z', '#E9DFCC'), path('M62 30L110 104H74Z', '#CDBFA6'),
      path('M62 30L52.4 44.6l5 3.6 4.6-4.2 4.8 4.4 4.4-2.6z', '#fff'),
      path('M62 30l9.2 15.8-4.4 2.6-4.8-4.4z', '#E7E2DA'),
      // the near hill
      path('M-4 104Q24 66 52 104Z', '#D9CBB1'),
      line('M30 104Q38 90 50 86T60 66T63 46', ACC.a, 2.4, { 'stroke-dasharray': '1 5.4', opacity: 0.9 })),
    ell(60, 104, 40, 4.4, url(sh)),
    line('M62 31V9', '#6B5A48', 2.4),
    s('g', { class: 'flag', style: 'transform-origin: 62px 10px' },
      path('M62.6 9.2q8.4-3.4 17 .6v10.4q-8.6-4-17-.6z', ACC.a),
      path('M62.6 9.2q8.4-3.4 17 .6v3.6q-8.6-4-17-.6z', ACC.hi, { opacity: 0.6 })),
    circ(62, 8.4, 2, F.gold),
    spark(98, 16, 4.6, ACC.a), spark(22, 62, 3, F.gold));
}

// ---------- search ----------
/** A magnifier over a plate — search with no results. One lonely grain of rice. */
export function artSearch(size = 120) {
  const sh = uniq('ssh'), st = uniq('sst'), wl = uniq('swl'), lens = uniq('sln'), ring = uniq('srg'), cl = uniq('scl');
  return svgArt(size, '0 0 120 120', 'search', {},
    s('defs', {}, shadowGrad(sh), steelRad(st, 0.3, 0.2, 1), rad(wl, [0.4, 0.3, 0.9], [[0, '#F6F3EC'], [1, '#C9C2B4']]),
      rad(lens, [0.3, 0.25, 0.8], [[0, '#FFFFFF', 0.5], [0.45, '#FFFFFF', 0.06], [1, '#CFE6FF', 0.22]]),
      lin(ring, [0, 0, 1, 1], [[0, ST.hi], [0.5, ST.md], [1, ST.dk]]),
      s('clipPath', { id: cl }, circ(54, 62, 21, '#000'))),
    blob(60, 56, 46),
    ell(58, 103, 46, 6, url(sh)),
    ...plate3q(54, 86, 44, 15, st, wl),
    ell(30, 86, 2.6, 1.1, F.riceLo, { transform: 'rotate(-16 30 86)' }),
    // the lens: what's under it, bigger
    s('g', { 'clip-path': url(cl) },
      circ(54, 62, 21, '#E4DFD5'),
      ell(54, 98, 74, 34, '#CFC8BA'),
      ell(56, 72, 11, 2.6, '#000', { opacity: 0.12 }),
      ell(55, 68, 11, 4.6, F.rice, { transform: 'rotate(-18 55 68)', stroke: '#CDBF9F', 'stroke-width': 1 }),
      ell(52.6, 66.4, 5, 1.4, '#fff', { transform: 'rotate(-18 52.6 66.4)' }),
      ell(57.8, 70, 7, 1.4, F.riceLo, { transform: 'rotate(-18 57.8 70)' })),
    circ(54, 62, 21, url(lens)),
    line('M71 79l17.6 17.6', ACC.lo, 10.6), line('M71 79l17.6 17.6', ACC.a, 7), line('M73 79.4l14 14', ACC.hi, 2, { opacity: 0.7 }),
    line('M69.6 77.6l3.6 3.6', ST.dk, 8),
    circ(54, 62, 21, 'none', { stroke: url(ring), 'stroke-width': 5.6 }),
    path('M40 54a16 16 0 0 1 11-9', 'none', { stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.9 }),
    circ(42.4, 60, 1.6, '#fff', { opacity: 0.9 }),
    spark(92, 30, 5, ACC.a), spark(22, 34, 3.2, F.gold));
}

// ---------- the welcome hero ----------
/** A ring of kolam loops around a circle, as one path (so CSS can draw it in). */
function kolamRing(cx, cy, R, loops, amp) {
  const N = loops * 28;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2, k = loops * t;
    // a trochoid wrapped round a circle: the tangential swing is big enough to loop back on itself
    const r = R + amp * Math.cos(k), tang = -amp * 1.5 * Math.sin(k);
    const x = cx + Math.cos(t) * r - Math.sin(t) * tang, y = cy + Math.sin(t) * r + Math.cos(t) * tang;
    d += (i ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d + 'Z';
}

/** The landing / onboarding hero: a thali on a kolam, with chai, spices, leaves and steam. */
export function artWelcome(size = 280) {
  const C = 200;
  const blur = uniq('wbl'), steel = uniq('wst'), well = uniq('wwl'), kat = uniq('wkt'), glow = uniq('wgl'), rice = uniq('wrc'), tea = uniq('wte');
  const katori = (a, dist, r, food, rim, hi, specks) => {
    const x = f(C + Math.cos(a) * dist), y = f(C + Math.sin(a) * dist);
    return s('g', { class: 'katori', transform: `translate(${x} ${y})` },
      circ(3, 6, r + 1, '#000', { opacity: 0.25, filter: url(blur) }),
      circ(0, 0, r, url(kat)),
      circ(0, 0, r - 3.4, 'none', { stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1.2 }),
      circ(0, 0, r - 6, food, { stroke: rim, 'stroke-width': 2.2, 'stroke-opacity': 0.5 }),
      ell(-(r - 6) * 0.3, -(r - 6) * 0.36, (r - 6) * 0.42, (r - 6) * 0.26, hi, { opacity: 0.55 }),
      ...specks.map(([sx, sy, sr, c]) => circ(sx, sy, sr, c, { opacity: 0.8 })),
      path(`M${-(r - 2) * 0.82} ${-(r - 2) * 0.4}A${r - 2} ${r - 2} 0 0 1 ${(r - 2) * 0.3} ${-(r - 2) * 0.95}`, 'none', { stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 3, 'stroke-linecap': 'round' }));
  };
  const heap = (x, y, r, c, hi) => [
    circ(x + 2, y + 4, r + 4, '#000', { opacity: 0.22, filter: url(blur) }),
    circ(x, y, r + 4, url(kat)), circ(x, y, r + 1.2, 'none', { stroke: '#fff', 'stroke-opacity': 0.7, 'stroke-width': 1 }),
    circ(x, y, r - 0.6, c), path(`M${x - r * 0.62} ${y + r * 0.1}Q${x - r * 0.1} ${y - r * 0.75} ${x + r * 0.5} ${y - r * 0.2}`, 'none', { stroke: hi, 'stroke-width': r * 0.34, 'stroke-linecap': 'round', opacity: 0.8 })];
  const leafP = (x, y, a, l, c) => path(`M0 0C${l * 0.3} ${-l * 0.32} ${l * 0.75} ${-l * 0.3} ${l} 0C${l * 0.75} ${l * 0.3} ${l * 0.3} ${l * 0.32} 0 0Z`, c, { transform: `translate(${x} ${y}) rotate(${a})` });
  const dots = s('g', { class: 'kolam-dots' });
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    dots.appendChild(circ(f(C + Math.cos(t) * 181), f(C + Math.sin(t) * 181), 3, ACC.a, { opacity: 0.65 }));
  }
  const r2 = rng(5), grains = [];
  for (let i = 0; i < 10; i++) {
    const a = r2() * Math.PI * 2, d = Math.sqrt(r2()) * 30, x = f(C + Math.cos(a) * d), y = f(C + 4 + Math.sin(a) * d);
    grains.push(ell(x, y, 4.6, 1.8, F.riceLo, { opacity: 0.85, transform: `rotate(${(r2() * 180).toFixed(0)} ${x} ${y})` }));
  }
  return svgArt(size, '0 0 400 400', 'welcome', {},
    s('defs', {},
      s('filter', { id: blur, x: '-30%', y: '-30%', width: '160%', height: '160%' }, s('feGaussianBlur', { stdDeviation: 6 })),
      rad(steel, [0.34, 0.26, 0.95], [[0, ST.hi], [0.5, '#E2DDD2'], [0.86, '#BDB6A8'], [1, '#A49D8F']]),
      rad(well, [0.4, 0.34, 0.9], [[0, '#F1EEE7'], [0.7, '#D3CDC1'], [1, '#BDB6A8']]),
      rad(kat, [0.34, 0.28, 0.95], [[0, '#FFFFFF'], [0.55, '#DAD4C8'], [1, '#9A9385']]),
      rad(glow, [0.5, 0.5, 0.5], [[0, ACC.a, 0.26], [0.6, ACC.a, 0.1], [1, ACC.a, 0]]),
      rad(rice, [0.38, 0.3, 0.8], [[0, '#FFFFFF'], [0.75, F.rice], [1, '#EDE3CC']]),
      rad(tea, [0.4, 0.38, 0.7], [[0, F.chaiHi], [1, F.chai]])),
    circ(C, C, 200, url(glow)),
    // the kolam around the plate
    path(kolamRing(C, C, 168, 12, 15), 'none', { stroke: ACC.a, 'stroke-width': 2.2, 'stroke-opacity': 0.55, pathLength: 1, class: 'kolam-line', 'stroke-linejoin': 'round' }),
    circ(C, C, 152, 'none', { stroke: ACC.a, 'stroke-width': 1.6, 'stroke-opacity': 0.35, 'stroke-dasharray': '0.01 0.0365', 'stroke-linecap': 'round', pathLength: 1, class: 'kolam-line kl-2' }),
    dots,
    // the plate
    ell(C + 6, C + 16, 136, 132, '#000', { opacity: 0.32, filter: url(blur) }),
    circ(C, C, 138, url(steel)),
    circ(C, C, 131, 'none', { stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 1.4 }),
    circ(C, C, 122, url(well), { stroke: '#000', 'stroke-opacity': 0.1, 'stroke-width': 2 }),
    line(`M${C - 124} ${C - 26}A127 127 0 0 1 ${C - 44} ${C - 119}`, '#fff', 4, { opacity: 0.7 }),
    // pappad and roti under everything
    circ(C + 38, C + 46, 32, '#E8B864', { stroke: '#C08433', 'stroke-width': 1.4 }),
    circ(C + 50, C + 52, 2.2, '#B97C27', { opacity: 0.5 }), circ(C + 56, C + 36, 1.5, '#B97C27', { opacity: 0.5 }),
    s('g', { transform: `rotate(150 ${C} ${C})` },
      path(`M${C + 52} ${C - 30}A34 34 0 0 1 ${C + 52} ${C + 30}Q${C + 40} ${C} ${C + 52} ${C - 30}Z`, F.roti, { stroke: F.rotiLo, 'stroke-width': 1.2, 'stroke-opacity': 0.6 }),
      path(`M${C + 60} ${C - 19}A23 23 0 0 1 ${C + 62} ${C + 15}`, 'none', { stroke: F.rotiHi, 'stroke-width': 3.6, 'stroke-linecap': 'round', opacity: 0.85 }),
      circ(C + 72, C - 6, 2.8, F.char, { opacity: 0.55 }), circ(C + 64, C + 14, 2, F.char, { opacity: 0.45 }), circ(C + 76, C + 8, 1.6, F.char, { opacity: 0.45 })),
    katori(-Math.PI / 2, 84, 32, F.dal, F.dalLo, F.dalHi, [[-8, 2, 2.4, F.dalLo], [6, -4, 1.8, '#6FA84A'], [4, 8, 2.2, F.dalLo]]),
    katori(-Math.PI / 2 + 1.26, 84, 30, F.rajma, F.rajmaLo, F.rajmaHi, [[-6, 0, 3, F.rajmaLo], [5, 5, 2.6, F.rajmaLo], [3, -7, 2.2, '#5E1A10']]),
    katori(-Math.PI / 2 + 2.52, 84, 29, F.curd, F.curdLo, '#fff', [[-4, 2, 1.8, '#9FC98A'], [5, -3, 1.4, '#D9662B']]),
    katori(-Math.PI / 2 + 3.77, 84, 30, F.sabzi, F.sabziLo, F.sabziHi, [[-6, -2, 3, '#F08A2C'], [6, 4, 2.6, F.sabziLo], [2, -8, 2, F.sabziHi]]),
    katori(-Math.PI / 2 + 5.03, 84, 28, '#E7A35E', '#C27532', '#F6D2A4', [[-4, 3, 1.8, '#B5602A'], [5, -2, 1.6, '#86B05A']]),
    // rice
    circ(C + 3, C + 8, 42, '#000', { opacity: 0.22, filter: url(blur) }),
    circ(C, C + 4, 40, url(rice)),
    ...grains,
    ell(C - 12, C - 12, 13, 6.4, '#fff', { opacity: 0.75 }),
    path(`M${C + 6} ${C - 6}c6-6 14-5 16 0-6 4-12 4-16 0z`, F.leafHi), path(`M${C + 4} ${C - 4}c-2-8 2-14 8-14 1 7-2 12-8 14z`, F.leaf),
    // around the plate: chai, spices, curry leaves, chillies, lemon
    circ(C + 152, C - 136, 25, '#000', { opacity: 0.22, filter: url(blur) }),
    circ(C + 150, C - 140, 25, 'rgba(255,255,255,0.55)', { stroke: '#fff', 'stroke-width': 2, 'stroke-opacity': 0.9 }),
    circ(C + 150, C - 140, 20, url(tea)), circ(C + 150, C - 140, 20, 'none', { stroke: F.foam, 'stroke-width': 3 }),
    ell(C + 144, C - 146, 6, 3, '#fff', { opacity: 0.45 }),
    ...heap(C - 154, C + 124, 15, F.dal, F.dalHi), ...heap(C - 118, C + 156, 13, F.chilli, F.chilliHi), ...heap(C - 166, C + 166, 11, '#B08A4E', '#CDA86A'),
    circ(C - 132, C + 128, 1.6, '#8A6538'), circ(C - 138, C + 136, 1.3, '#8A6538'), circ(C - 128, C + 138, 1.4, '#3B2A22'),
    line(`M${C - 168} ${C - 150}Q${C - 138} ${C - 128} ${C - 112} ${C - 124}`, F.leafLo, 2.2),
    leafP(C - 160, C - 144, -60, 22, F.leaf), leafP(C - 146, C - 134, -96, 22, F.leafHi), leafP(C - 146, C - 134, 0, 20, F.leaf),
    leafP(C - 130, C - 127, -76, 20, F.leaf), leafP(C - 130, C - 127, 18, 19, F.leafHi), leafP(C - 114, C - 124, -30, 18, F.leaf),
    s('g', { transform: `translate(${C + 128} ${C + 128}) rotate(-34)` },
      path('M-26 0C-16 -7 10 -7 24 -2C14 4 -14 6 -26 0Z', F.leaf), line('M-27 -1q-4-2-6-6', F.leafLo, 2.6),
      path('M-18 -2C-8 -5 8 -5 18 -2', 'none', { stroke: F.leafHi, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.8 })),
    s('g', { transform: `translate(${C + 150} ${C + 108}) rotate(-58)` },
      path('M-22 0C-13 -6 8 -6 20 -2C12 3 -12 5 -22 0Z', F.chilli), line('M-23 -1q-4-2-5-6', F.leafLo, 2.4),
      path('M-15 -2C-6 -4 6 -4 14 -2', 'none', { stroke: F.chilliHi, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.8 })),
    circ(C - 158, C + 6, 16, '#000', { opacity: 0.18, filter: url(blur) }),
    circ(C - 160, C + 2, 16, F.lemon), circ(C - 160, C + 2, 12.5, F.lemonHi),
    line(`M${C - 160} ${C - 9}V${C + 13}M${C - 171} ${C + 2}H${C - 149}M${C - 168} ${C - 6}l16 16M${C - 152} ${C - 6}l-16 16`, F.lemon, 1.4, { opacity: 0.8 }),
    // steam and glints
    wisp(`M${C - 6} ${C - 98}c-6-9 6-13 0-24`, 'w-1', 3.2, 'rgba(255,255,255,0.9)'), wisp(`M${C + 8} ${C - 102}c-6-9 6-13 0-24`, 'steam-2', 3.2, 'rgba(255,255,255,0.9)'),
    wisp(`M${C + 150} ${C - 172}c-5-8 5-11 0-20`, 'steam-3', 3, STEAM),
    spark(C - 104, C - 94, 9, '#fff', 'glint', { opacity: 0.95 }), spark(C + 112, C + 96, 6, '#fff', 'glint glint-2', { opacity: 0.9 }),
    spark(C + 172, C - 40, 6, ACC.a, 'glint glint-3'));
}

// ---------- kolam ----------
/**
 * A sikku kolam on an n × n grid of dots: lines run diagonally between the
 * dots and loop around the border ones. Returns one path per closed line.
 */
function kolamPaths(n, step) {
  const max = 2 * (n - 1), h = step / 2, r = f((step * Math.SQRT2) / 4);
  const valid = (x, y) => ((x + y) & 1) === 1 && x >= 0 && x <= max && y >= 0 && y <= max;
  const used = new Set(), key = (x, y, dx, dy) => `${x},${y},${dx},${dy}`;
  const P = (x, y) => `${f(x * h)} ${f(y * h)}`;
  const foot = (qx, qy, dx, dy, cx, cy) => { const t = ((cx - qx) * dx + (cy - qy) * dy) / 2; return [qx + t * dx, qy + t * dy]; };
  const out = [];
  for (let y0 = 0; y0 <= max; y0++) for (let x0 = 0; x0 <= max; x0++) {
    if (!valid(x0, y0)) continue;
    for (const [dx0, dy0] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (used.has(key(x0, y0, dx0, dy0))) continue;
      let x = x0, y = y0, dx = dx0, dy = dy0, d = 'M' + P(x, y), guard = 0;
      do {
        used.add(key(x, y, dx, dy));
        let qx = x + dx, qy = y + dy;
        while (!valid(qx, qy) && guard++ < 999) {
          const vert = qy < 0 || qy > max;
          const cx = vert ? qx : qx - dx, cy = vert ? qy - dy : qy;      // the border dot we loop around
          const ndx = vert ? dx : -dx, ndy = vert ? -dy : dy;
          const [ax, ay] = foot(qx, qy, dx, dy, cx, cy), [bx, by] = foot(qx, qy, ndx, ndy, cx, cy);
          d += `L${P(ax, ay)}A${r} ${r} 0 0 ${dx * ndy - dy * ndx > 0 ? 1 : 0} ${P(bx, by)}`;
          dx = ndx; dy = ndy; qx += dx; qy += dy;
        }
        d += 'L' + P(qx, qy);
        used.add(key(qx, qy, -dx, -dy));
        x = qx; y = qy;
      } while (!(x === x0 && y === y0 && dx === dx0 && dy === dy0) && ++guard < 999);
      out.push(d.replace(/L([\d.-]+ [\d.-]+)$/, 'Z'));
    }
  }
  return out;
}

/** A kolam line motif for backgrounds; strokes draw themselves in (css/art.css). */
export function artKolam({ size = 240, cls = '' } = {}) {
  const N = 5, step = 32, span = (N - 1) * step, o = 120 - span / 2;
  const lineAttrs = cls => ({ stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, class: cls });
  const grid = s('g', { transform: `translate(${o} ${o})` });
  kolamPaths(N, step).forEach((d, i) => grid.appendChild(path(d, 'none', lineAttrs(`kolam-line kl-${i + 1}`))));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) grid.appendChild(circ(i * step, j * step, 2.8, 'currentColor', { class: 'kolam-dot', opacity: 0.8 }));
  // eight lotus petals around the square: big ones off the corners, small ones off the sides
  const petals = s('g', { transform: 'translate(120 120)' });
  const petal = (rot, from, len, wide) => s('g', { transform: `rotate(${rot})` },
    path(`M0 ${-from}C${-wide} ${-from - len * 0.35} ${-wide * 0.7} ${-from - len * 0.85} 0 ${-from - len}C${wide * 0.7} ${-from - len * 0.85} ${wide} ${-from - len * 0.35} 0 ${-from}Z`, 'none', lineAttrs('kolam-line kl-petal')),
    circ(0, -from - len * 0.52, 2.6, 'currentColor', { class: 'kolam-dot', opacity: 0.8 }));
  for (let k = 0; k < 4; k++) petals.append(petal(45 + k * 90, span / 2 * Math.SQRT2 + 16, 30, 11), petal(k * 90, span / 2 + 18, 20, 8));
  return s('svg', { viewBox: '0 0 240 240', width: size, height: size, class: ('art art-kolam ' + cls).trim(), 'aria-hidden': 'true', focusable: 'false' }, grid, petals);
}

// ---------- spices ----------
/** A spice box (masala dabba), top-down — food rules, allergies, diet patterns. */
export function artSpices(size = 120) {
  const sh = uniq('xsh'), tin = uniq('xtn'), fl = uniq('xfl'), kt = uniq('xkt');
  const SPICES = [   // [colour, highlight, seed colour or null]
    ['#3B2A22', '#5E463A', '#7A5E4C'],   // mustard seeds — the centre
    [F.dal, F.dalHi, null],               // turmeric
    [F.chilli, F.chilliHi, null],         // red chilli
    ['#B08A4E', '#CDA86A', null],         // coriander
    ['#8A6538', '#A98252', '#5E4222'],    // cumin
    ['#D29A2C', '#E8B84E', '#9E6E16'],    // fenugreek
    ['#7A3E22', '#9E5A33', null],         // garam masala
  ];
  const kids = [];
  SPICES.forEach(([c, hi, seed], i) => {
    const a = ((i - 1) * 60 - 90) * Math.PI / 180, d = i ? 25 : 0;
    const x = f(60 + Math.cos(a) * d), y = f(60 + Math.sin(a) * d);
    kids.push(circ(x, y, 11.6, url(kt)), circ(x, y, 9.2, c), ell(x - 2.6, y - 3, 4, 2.6, hi, { opacity: 0.85 }));
    if (seed) [[-3, 3], [3, 1], [0, -2], [4, -4]].forEach(([sx, sy]) => kids.push(ell(x + sx, y + sy, 1.3, 0.8, seed, { transform: `rotate(${30 + sx * 10} ${x + sx} ${y + sy})` })));
  });
  return svgArt(size, '0 0 120 120', 'spices', {},
    s('defs', {}, shadowGrad(sh), steelRad(tin, 0.32, 0.26, 0.95),
      rad(fl, [0.4, 0.34, 0.9], [[0, '#EFEBE3'], [1, '#B9B2A4']]), steelRad(kt, 0.3, 0.25, 1)),
    blob(60, 60, 50, 0.1),
    ell(63, 66, 52, 50, url(sh)),
    circ(60, 60, 48, url(tin)),
    circ(60, 60, 45.6, 'none', { stroke: '#fff', 'stroke-width': 1.4, opacity: 0.85 }),
    circ(60, 60, 42, url(fl)),
    ...kids,
    // the little steel spoon
    line('M66 68L94 92', ST.dk, 3.6), line('M66 68L94 92', ST.hi, 1.4, { opacity: 0.7 }),
    ell(63, 65.4, 5, 3.4, ST.md, { transform: 'rotate(40 63 65.4)' }),
    line('M22 44a40 40 0 0 1 22-24', '#fff', 2.6, { opacity: 0.8 }),
    // a dried red chilli fallen out
    s('g', { transform: 'translate(98 102) rotate(-30)' },
      path('M-14 0C-8 -5 6 -5 13 -1C6 3 -8 4 -14 0Z', F.chilli), line('M-15 -1q-3-1-4-5', F.leafLo, 2)));
}

// ---------- moon ----------
/** A crescent moon over a plate — dinner, night, fasting. */
export function artMoon(size = 120) {
  const sh = uniq('nsh'), sky = uniq('nsk'), st = uniq('nst'), wl = uniq('nwl'), kt = uniq('nkt'), mn = uniq('nmn');
  return svgArt(size, '0 0 120 120', 'moon', {},
    s('defs', {}, shadowGrad(sh), steelRad(st, 0.3, 0.2, 1), rad(wl, [0.4, 0.3, 0.9], [[0, '#F6F3EC'], [1, '#C9C2B4']]), steelRad(kt, 0.3, 0.2, 1),
      lin(sky, [0, 0, 0, 1], [[0, 'var(--hue-dinner, #7C8BFF)', 0.5], [1, 'var(--hue-dinner, #7C8BFF)', 0.12]]),
      lin(mn, [0, 0, 1, 1], [[0, '#FFF6D2'], [1, F.moonLo]]),
      rad(uniq('ng') && (sh + 'g'), [0.5, 0.5, 0.5], [[0, F.moon, 0.45], [1, F.moon, 0]])),
    circ(60, 56, 48, url(sky)),
    circ(64, 40, 32, url(sh + 'g'), { class: 'moon-glow' }),
    path('M62 18a22 22 0 1 0 25 30a18 18 0 1 1-25-30z', url(mn)),
    circ(56, 46, 3, F.moonLo, { opacity: 0.5 }), circ(62, 56, 2, F.moonLo, { opacity: 0.45 }), circ(52, 36, 1.6, F.moonLo, { opacity: 0.4 }),
    spark(28, 30, 4.6, '#FFF4CF', 'twinkle'), spark(94, 20, 3.4, '#FFF4CF', 'twinkle tw-2'), spark(98, 62, 2.6, '#FFF4CF', 'twinkle tw-3'),
    circ(36, 54, 1.3, '#FFF4CF', { class: 'twinkle tw-3' }), circ(82, 30, 1.2, '#FFF4CF', { class: 'twinkle tw-2' }),
    ell(60, 104, 40, 5.6, url(sh)),
    ...plate3q(60, 94, 38, 11, st, wl),
    ...katori3q(60, 86, 15, '#F6EBD0', '#FFF8E6', kt),
    circ(55, 85.6, 1.1, '#9BC46A'), circ(62, 87.4, 1, '#E8962E'), circ(66, 85.2, 1.1, '#9BC46A'),
    wisp('M56 76c-3-4 3-6 0-11', '', 2.4, STEAM), wisp('M65 74c-3-4 3-6 0-11', 'steam-2', 2.4, STEAM));
}

// =============================================================
// v3.1 ART LAYER — art you can't miss: a landscape band in every
// page header, garnish around the thali gauge, a vignette for the
// desktop rail, and a kolam corner. Scene colours are theme- and
// time-aware custom properties (--sc-*) set in css/art.css.
// Every looping animation reads var(--phase) so a scene that is
// rebuilt on a tap carries on where it was instead of restarting.
// =============================================================
export const SCENE_TIMES = ['dawn', 'day', 'dusk', 'night'];
export const SCENE_MOTIFS = ['mess', 'trail', 'market', 'summit', 'hostel', 'gym'];

/** Which sky to paint: dawn 5–9, day 9–16, dusk 16–19, night otherwise. */
export function sceneTime(d = new Date()) {
  const hr = d.getHours() + d.getMinutes() / 60;
  return hr >= 5 && hr < 9 ? 'dawn' : hr >= 9 && hr < 16 ? 'day' : hr >= 16 && hr < 19 ? 'dusk' : 'night';
}

const V = name => `var(--sc-${name})`;
/** A soft cumulus resting on y, `w` wide. */
const cloudD = (x, y, w) => {
  const h = w * 0.3;
  return `M${f(x)} ${f(y)}h${f(w)}a${f(h * 0.42)} ${f(h * 0.42)} 0 0 0 ${f(-w * 0.12)} ${f(-h * 0.62)}a${f(h * 0.62)} ${f(h * 0.62)} 0 0 0 ${f(-w * 0.3)} ${f(-h * 0.5)}a${f(h * 0.52)} ${f(h * 0.52)} 0 0 0 ${f(-w * 0.32)} ${f(h * 0.22)}a${f(h * 0.4)} ${f(h * 0.4)} 0 0 0 ${f(-w * 0.26)} ${f(h * 0.9)}z`;
};
/** Coconut-palm fronds radiating from (x, y), as one path. */
function frondsD(x, y, L) {
  let d = '';
  for (const [a, k, dr] of [[-168, 0.9, 0.34], [-136, 1, 0.12], [-102, 0.82, 0], [-68, 0.96, 0.08], [-30, 1, 0.3], [6, 0.86, 0.46], [158, 0.8, 0.5]]) {
    const r = (a * Math.PI) / 180, l = L * k;
    const ex = x + Math.cos(r) * l, ey = y + Math.sin(r) * l + l * dr;
    const mx = x + Math.cos(r) * l * 0.5, my = y + Math.sin(r) * l * 0.5 - l * 0.14;
    const nx = -Math.sin(r) * l * 0.1, ny = Math.cos(r) * l * 0.1;
    d += `M${f(x)} ${f(y)}Q${f(mx + nx)} ${f(my + ny)} ${f(ex)} ${f(ey)}Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)}Z`;
  }
  return d;
}
/** A coconut palm: a leaning trunk and a crown that sways (css). */
const palm = (x, y, h, lean, trunk, crown, cls = 'palm-top') => {
  const tx = x + lean, ty = y - h;
  return [
    line(`M${x} ${y}Q${x + lean * 0.2} ${y - h * 0.55} ${tx} ${ty}`, trunk, Math.max(3, h * 0.05)),
    s('g', { class: cls, style: `transform-origin: ${f(tx)}px ${f(ty)}px` }, path(frondsD(tx, ty, h * 0.42), crown), circ(tx, ty + 2, h * 0.035, trunk)),
  ];
};
/** A rain tree: short trunk, wide umbrella crown. */
const rainTree = (x, y, w, trunk, crown, hi) => [
  line(`M${x} ${y}V${y - w * 0.3}M${x} ${y - w * 0.22}L${x - w * 0.2} ${y - w * 0.44}M${x} ${y - w * 0.24}L${x + w * 0.22} ${y - w * 0.42}`, trunk, Math.max(2.4, w * 0.04)),
  path(`M${f(x - w * 0.5)} ${f(y - w * 0.4)}a${f(w * 0.2)} ${f(w * 0.13)} 0 0 1 ${f(w * 0.18)} ${f(-w * 0.16)}a${f(w * 0.24)} ${f(w * 0.16)} 0 0 1 ${f(w * 0.42)} ${f(-w * 0.06)}a${f(w * 0.2)} ${f(w * 0.14)} 0 0 1 ${f(w * 0.36)} ${f(w * 0.14)}a${f(w * 0.12)} ${f(w * 0.1)} 0 0 1 ${f(w * 0.04)} ${f(w * 0.12)}Q${f(x)} ${f(y - w * 0.32)} ${f(x - w * 0.5)} ${f(y - w * 0.4)}Z`, crown),
  hi && ell(f(x - w * 0.14), f(y - w * 0.58), f(w * 0.2), f(w * 0.05), hi),
];
const bird = (x, y, sc, cls) => s('g', { class: 'bird ' + cls, style: `transform-origin: ${x}px ${y}px` }, line(`M${x - 10 * sc} ${y - 3 * sc}q${5 * sc} ${-4 * sc} ${10 * sc} ${3 * sc}q${5 * sc} ${-7 * sc} ${10 * sc} ${-3 * sc}`, V('bird'), 2));
/** Blocks for a skyline silhouette: [x, width, height] on a baseline. */
const blocksD = (base, list) => list.map(([x, w, h]) => `M${x} ${base}V${base - h}h${w}V${base}Z`).join('');
/** Kato, nested into a scene: his drawing at `size` units, feet on (cx, base). */
function katoAt(mood, cx, base, size) {
  const k = artMascot({ mood, size });
  const sc = size / 120;
  k.setAttribute('x', f(cx - 60 * sc));
  k.setAttribute('y', f(base - 104.5 * sc));
  k.setAttribute('width', f(size)); k.setAttribute('height', f(size));
  k.setAttribute('overflow', 'visible');
  return k;
}
const wispUp = (x, y, h, cls, w = 3.4) => line(`M${x} ${y}c${-h * 0.2} ${-h * 0.25} ${h * 0.2} ${-h * 0.45} 0 ${-h * 0.7}s${h * 0.2} ${-h * 0.18} ${h * 0.05} ${-h * 0.3}`, V('steam'), w, { class: 'steam ' + cls });

/** Each motif: the page's hero at x≈880–1180, a perch for Kato at ~1180–1330, a frame object at the right. */
const MOTIF = {
  mess(id) {
    const tiles = id + 'tl';
    const bx = 878, by = 300;
    const banana = [path(`M${bx - 5} ${by}C${bx - 6} ${by - 30} ${bx - 3} ${by - 52} ${bx - 1} ${by - 62}H${bx + 5}C${bx + 5} ${by - 50} ${bx + 6} ${by - 28} ${bx + 7} ${by}Z`, V('trunk'))];
    [[-152, 56, 'leaf'], [-120, 64, 'leaf-2'], [-86, 58, 'leaf'], [-52, 62, 'leaf-2'], [-18, 54, 'leaf']].forEach(([a, L, c]) => banana.push(
      s('g', { transform: `translate(${bx + 2} ${by - 60}) rotate(${a})` },
        path(`M0 0C${f(L * 0.2)} ${f(-L * 0.17)} ${f(L * 0.72)} ${f(-L * 0.21)} ${L} ${f(-L * 0.04)}C${f(L * 0.66)} ${f(L * 0.13)} ${f(L * 0.2)} ${f(L * 0.11)} 0 0Z`, V(c)),
        line(`M3 0Q${f(L * 0.5)} ${f(-L * 0.06)} ${f(L * 0.94)} ${f(-L * 0.04)}`, V('leaf-hi'), 1.3, { opacity: 0.7 }))));
    const arch = (x, y, w, hh) => `M${x} ${y + hh}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + hh}Z`;
    const win = x => [path(arch(x, 236, 26, 42), V('glass'), { class: 'lit' }), line(`M${x + 13} 238V278M${x} 256H${x + 26}`, V('wall-2'), 2.2), s('rect', { x: x - 3, y: 277, width: 32, height: 4, rx: 1.5, fill: V('wall-2') })];
    const handi = [
      path('M1338 286C1332 262 1350 242 1382 242C1414 242 1432 262 1426 286Z', url(id + 'st')),
      line('M1346 278C1344 264 1352 254 1366 250', '#fff', 3, { opacity: 0.75 }),
      ell(1382, 243, 30, 6.4, ST.md), ell(1382, 241, 25, 5, url(id + 'st')), circ(1382, 236, 3.4, ST.dk),
      wispUp(1370, 228, 40, 'steam-2'), wispUp(1392, 230, 34, 'steam-3'),
    ];
    return [
      ...banana,
      // chimney behind the roof, smoke from the kitchen
      s('rect', { x: 1112, y: 158, width: 22, height: 48, fill: V('wall-2') }), s('rect', { x: 1108, y: 153, width: 30, height: 8, rx: 2, fill: V('roof-2') }),
      wispUp(1118, 148, 50, ''), wispUp(1128, 150, 44, 'steam-2'),
      // the mess hall
      s('rect', { x: 900, y: 218, width: 262, height: 84, fill: V('wall') }),
      s('rect', { x: 900, y: 218, width: 262, height: 10, fill: V('wall-2') }),
      path('M880 224L922 178H1140L1182 224Z', V('roof')), path('M880 224L922 178H1140L1182 224Z', url(tiles)),
      line('M922 178H1140', V('roof-2'), 5), line('M880 224H1182', V('roof-2'), 4.4),
      ...win(914), ...win(958), ...win(1078), ...win(1122),
      path(arch(1010, 240, 42, 62), V('door'), { class: 'lit' }),
      path('M1016 302V262a15 15 0 0 1 30 0V302', 'none', { stroke: V('wall-2'), 'stroke-width': 2 }),
      line('M1004 236Q1031 244 1058 236', V('trunk'), 1.4),
      path('M1008 237.4l3 6 3-5.2M1018 239.4l3 6 3-5M1028 240.6l3 6 3-5.4M1038 240l3 6 3-5.2M1048 238.6l3 6 3-5.6', V('leaf'), { stroke: V('leaf'), 'stroke-width': 1, 'stroke-linejoin': 'round' }),
      s('rect', { x: 894, y: 298, width: 274, height: 7, rx: 2, fill: V('wall-2') }),
      // the compound wall Kato sits on, and the big steel handi
      s('rect', { x: 1166, y: 288, width: 290, height: 40, fill: V('wall-2') }),
      s('rect', { x: 1162, y: 282, width: 296, height: 9, rx: 2.5, fill: V('wall') }),
      line('M1166 300H1456M1210 291V300M1290 291V300M1370 291V300M1250 300V312M1330 300V312M1410 300V312', V('wall-3'), 1.4),
      ...handi,
    ];
  },
  market(id) {
    const bulbs = s('g', {});
    const P0 = [860, 182], P1 = [1010, 228], P2 = [1160, 190], P3 = [1300, 230], P4 = [1430, 186];
    const q = (a, b, c, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
    [[P0, P1, P2], [P2, P3, P4]].forEach(([a, b, c], si) => [0.1, 0.27, 0.44, 0.61, 0.78, 0.95].forEach((t, i) => {
      const [x, y] = q(a, b, c, t);
      bulbs.appendChild(circ(f(x), f(y + 5), 4.2, V('bulb'), { class: `bulb b${(i + si) % 3}`, stroke: V('bulb'), 'stroke-width': 7, 'stroke-opacity': 0.25 }));
    }));
    const stripes = [];
    for (let i = 0; i < 6; i += 2) stripes.push(`M${f(922 + i * 36.3)} 146H${f(922 + (i + 1) * 36.3)}L${f(900 + (i + 1) * 43.7)} 170H${f(900 + i * 43.7)}Z`);
    let scallop = 'M900 170';
    for (let i = 0; i < 8; i++) scallop += 'a16.4 9 0 0 0 32.75 0';
    const wheel = x => [circ(x, 282, 17, 'none', { stroke: V('wood-2'), 'stroke-width': 4.4 }), line(`M${x - 15} 282H${x + 15}M${x} 267V297M${x - 10.6} 271.4l21.2 21.2M${x + 10.6} 271.4l-21.2 21.2`, V('wood-2'), 1.8), circ(x, 282, 3.6, V('wood-2'))];
    const glass = x => [path(`M${x - 5} 206L${x - 4} 220H${x + 4}L${x + 5} 206Z`, 'rgba(255,255,255,0.5)'), path(`M${x - 4.6} 210L${x - 4} 220H${x + 4}L${x + 4.6} 210Z`, F.chai)];
    return [
      line(`M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}Q${P3[0]} ${P3[1]} ${P4[0]} ${P4[1]}`, V('wire'), 1.4),
      // the chai cart
      ...wheel(940), ...wheel(1120),
      s('rect', { x: 906, y: 226, width: 250, height: 50, rx: 6, fill: V('wood') }),
      s('rect', { x: 906, y: 252, width: 250, height: 8, fill: ACC.a, opacity: 0.85 }),
      line('M968 230V250M1031 230V250M1094 230V250M968 262V272M1031 262V272M1094 262V272', V('wood-2'), 1.6),
      line('M913 220V170M1149 220V170', V('wood-2'), 4),
      s('rect', { x: 898, y: 218, width: 266, height: 9, rx: 3, fill: V('wood-2') }),
      path('M900 170L922 146H1140L1162 170Z', V('awning')), path(stripes.join(''), ACC.a), path(scallop + 'Z', ACC.lo),
      line('M922 146H1140', V('wood-2'), 3),
      // on the counter: kettle, a jar of biscuits, samosas, glasses
      path('M928 218C926 204 934 194 948 194C962 194 970 204 968 218Z', url(id + 'st')),
      path('M966 206Q976 204 984 192', 'none', { stroke: ST.md, 'stroke-width': 4.4, 'stroke-linecap': 'round' }),
      path('M934 202Q930 186 948 184Q964 186 962 202', 'none', { stroke: ST.dk, 'stroke-width': 2.4 }),
      ell(948, 195, 14, 3.4, ST.md), circ(948, 190, 2.6, ST.dk), line('M936 212C935 204 940 199 946 198', '#fff', 2.2, { opacity: 0.8 }),
      wispUp(984, 186, 34, ''), wispUp(992, 182, 28, 'steam-3', 2.8),
      s('rect', { x: 994, y: 190, width: 28, height: 29, rx: 6, fill: 'rgba(255,255,255,0.4)', stroke: 'rgba(255,255,255,0.7)', 'stroke-width': 1.2 }),
      s('rect', { x: 996, y: 186, width: 24, height: 6, rx: 2, fill: ACC.lo }),
      circ(1002, 212, 4.4, F.friedHi), circ(1013, 211, 4.4, F.fried), circ(1008, 202, 4.2, F.friedHi),
      ell(1066, 218, 26, 4, ST.md),
      path('M1046 216L1056 200L1066 216Z', F.friedHi), path('M1060 217L1070 200L1080 217Z', F.fried), path('M1072 216L1082 202L1090 216Z', F.friedHi),
      ...glass(1118), ...glass(1132),
      // a moodha (cane stool) for Kato, and a bamboo pole holding the lights
      path('M1206 300L1222 282L1206 264H1294L1278 282L1294 300Z', V('cane')),
      line('M1214 270H1286M1220 277H1280M1220 287H1280M1214 294H1286', V('cane-2'), 1.6),
      ell(1250, 264, 44, 5, V('cane-2')),
      line('M1430 300V180', V('wood-2'), 4.4),
      bulbs,
    ];
  },
  trail() {
    return [
      path('M760 300C860 268 950 236 1040 228C1150 218 1280 244 1440 262V320H760Z', V('grass-2')),
      path('M840 304C900 280 960 214 1040 198C1120 184 1200 214 1290 252C1340 272 1400 286 1440 290V320H840Z', V('grass')),
      path('M840 304C900 280 960 214 1040 198C1010 214 980 246 960 300Z', V('grass-hi'), { opacity: 0.55 }),
      // the winding path up to the flag
      line('M1186 304C1140 296 1080 300 1080 284C1080 268 1130 264 1110 248', V('path'), 13),
      line('M1110 248C1092 234 1050 238 1050 222C1050 212 1046 206 1042 200', V('path'), 8),
      line('M1186 304C1140 296 1080 300 1080 284', V('path-2'), 1.6, { 'stroke-dasharray': '1 7', opacity: 0.7 }),
      // milestones
      ...[[1078, 286, 1], [1112, 246, 0.8], [1052, 222, 0.62]].map(([x, y, k]) => s('g', { transform: `translate(${x} ${y}) scale(${k})` },
        path('M-7 2V-10a7 7 0 0 1 14 0V2Z', V('stone')), path('M-7 -9.6a7 7 0 0 1 14 0V-6H-7Z', ACC.a), s('rect', { x: -9, y: 1, width: 18, height: 3, rx: 1, fill: V('grass-2') }))),
      // bushes
      ...[[904, 286, 13], [972, 236, 9], [1176, 222, 11], [1240, 244, 12], [1362, 276, 14]].flatMap(([x, y, r]) => [circ(x, y, r, V('leaf-2')), circ(x - r * 0.3, y - r * 0.3, r * 0.5, V('leaf'))]),
      // the goal flag on the top
      line('M1040 199V150', V('trunk'), 2.6),
      s('g', { class: 'flag', style: 'transform-origin: 1040px 152px' }, path('M1041 150q14-5 28 1v17q-14-6-28-1z', ACC.a), path('M1041 150q14-5 28 1v5q-14-6-28-1z', ACC.hi, { opacity: 0.6 })),
      circ(1040, 149, 2.6, F.gold),
    ];
  },
  summit() {
    const step = (x1, x2, y, c, top) => [
      path(`M${x1} 330V${y + 10}Q${x1} ${y} ${x1 + 12} ${y}H${x2 - 12}Q${x2} ${y} ${x2} ${y + 10}V330Z`, V(c)),
      path(`M${x1 + 2} ${y + 7}Q${x1 + 3} ${y} ${x1 + 12} ${y}H${x2 - 12}Q${x2 - 3} ${y} ${x2 - 2} ${y + 7}Z`, V(top)),
    ];
    return [
      ...step(1000, 1090, 196, 'grass-2', 'grass-hi'),
      ...step(960, 1150, 222, 'grass-2', 'grass'),
      ...step(910, 1220, 248, 'grass-2', 'grass'),
      ...step(860, 1310, 274, 'grass-2', 'grass'),
      ...step(800, 1440, 296, 'grass-2', 'grass'),
      // little crops in rows on the terraces
      line('M930 242h10M956 242h10M1170 242h10M1196 242h10M886 268h10M912 268h10M1236 268h10M1262 268h10M980 216h8M1124 216h8', V('leaf'), 3),
      ...[[880, 262, 10], [1290, 262, 11], [1200, 236, 8]].flatMap(([x, y, r]) => [circ(x, y, r, V('leaf-2')), circ(x - r * 0.3, y - r * 0.3, r * 0.5, V('leaf'))]),
      // the peak: a flag with a trophy on it
      line('M1045 197V138', V('trunk'), 2.8),
      s('g', { class: 'flag', style: 'transform-origin: 1045px 140px' },
        path('M1046 138q17-6 34 1v21q-17-7-34-1z', ACC.a),
        path('M1056 144h12v4a6 6 0 0 1-12 0zM1060 154h4v3h3v2h-10v-2h3z', F.gold)),
      circ(1045, 137, 2.8, F.gold),
      spark(1092, 150, 6, F.gold, 'twinkle'), spark(1004, 168, 4, '#fff', 'twinkle tw-2'),
    ];
  },
  hostel(id) {
    const hw = id + 'hw';
    const litAt = [[934, 228], [1030, 228], [1070, 268], [982, 268], [934, 188], [1118, 188]];
    return [
      ...palm(866, 302, 132, -14, V('trunk'), V('leaf-2')),
      s('rect', { x: 900, y: 172, width: 262, height: 130, fill: V('wall') }),
      s('rect', { x: 896, y: 166, width: 270, height: 9, rx: 2, fill: V('wall-2') }),
      s('rect', { x: 900, y: 172, width: 262, height: 130, fill: url(hw) }),
      line('M900 214H1162M900 254H1162', V('wall-2'), 3),
      ...litAt.map(([x, y], i) => s('rect', { x, y, width: 18, height: 22, rx: 2, fill: V('glass'), class: 'lit win-tw w' + (i % 3) })),
      // the sintex tank on the roof
      s('rect', { x: 1114, y: 146, width: 30, height: 22, rx: 6, fill: V('tank') }), ell(1129, 147, 15, 3.4, V('tank-2')),
      // a balcony with plants and the day's washing
      s('rect', { x: 1002, y: 238, width: 96, height: 6, fill: V('wall-2') }),
      line('M1004 246V262M1016 246V262M1028 246V262M1040 246V262M1052 246V262M1064 246V262M1076 246V262M1088 246V262M1002 246H1098', V('rail'), 1.8),
      s('rect', { x: 1002, y: 260, width: 96, height: 4, fill: V('wall-2') }),
      line('M1006 222Q1050 230 1094 222', V('rail'), 1.2),
      s('g', { class: 'cloth', style: 'transform-origin: 1020px 224px' }, path('M1012 224h16l3 6-4 1v14h-14v-14l-4-1z', ACC.a)),
      s('g', { class: 'cloth c2', style: 'transform-origin: 1048px 227px' }, path('M1040 226h16v18h-16z', F.dal), line('M1040 232h16M1040 238h16', '#fff', 1.4, { opacity: 0.6 })),
      s('g', { class: 'cloth c3', style: 'transform-origin: 1074px 226px' }, path('M1066 224h16l2 18h-6l-2-11-2 11h-6z', 'var(--hue-dinner, #7C8BFF)')),
      path('M1012 246c-4-10 4-14 8-8 2-8 10-6 8 2 6-2 8 6 2 8z', V('leaf')), s('rect', { x: 1012, y: 246, width: 14, height: 10, rx: 2, fill: V('pot') }),
      path('M1076 246c-4-8 2-14 7-8 3-7 10-4 7 3 5-1 6 6 1 7z', V('leaf-2')), s('rect', { x: 1076, y: 246, width: 13, height: 10, rx: 2, fill: V('pot') }),
      // entrance
      s('rect', { x: 1112, y: 262, width: 30, height: 40, rx: 3, fill: V('door'), class: 'lit' }),
      // boundary wall, a gate pillar with a lamp
      s('rect', { x: 1166, y: 288, width: 290, height: 40, fill: V('wall-2') }),
      s('rect', { x: 1162, y: 282, width: 296, height: 9, rx: 2.5, fill: V('wall') }),
      s('rect', { x: 1360, y: 238, width: 28, height: 50, fill: V('wall') }), s('rect', { x: 1356, y: 232, width: 36, height: 8, rx: 2, fill: V('wall-2') }),
      circ(1374, 224, 7, V('bulb'), { class: 'bulb b1', stroke: V('bulb'), 'stroke-width': 9, 'stroke-opacity': 0.22 }),
      ...palm(1420, 300, 120, 12, V('trunk'), V('leaf')),
    ];
  },
  gym(id) {
    const db = (x, y, k = 1) => [line(`M${x - 9 * k} ${y}H${x + 9 * k}`, ST.dk, 2.4), s('rect', { x: x - 13 * k, y: y - 6 * k, width: 5 * k, height: 12 * k, rx: 1.6, fill: ACC.a }), s('rect', { x: x + 8 * k, y: y - 6 * k, width: 5 * k, height: 12 * k, rx: 1.6, fill: ACC.lo })];
    return [
      ell(1330, 304, 150, 10, V('shade')),
      // the big shade tree, framing the right edge
      s('g', { transform: 'translate(118 -6)' }, path('M1338 302C1334 270 1336 246 1326 222C1320 210 1300 200 1284 196L1288 190C1306 194 1326 204 1336 216C1340 200 1352 190 1370 186L1372 192C1356 198 1346 212 1346 232C1348 256 1350 278 1352 302Z', V('trunk')),
      path('M1110 206a40 26 0 0 1 60-30a56 34 0 0 1 96-22a56 30 0 0 1 104 4a44 30 0 0 1 64 28a30 22 0 0 1-16 30Q1300 196 1110 206Z', V('leaf-2')),
      path('M1150 190a40 24 0 0 1 58-26a50 28 0 0 1 90-10a40 24 0 0 1 56 20Q1250 168 1150 190Z', V('leaf'), { opacity: 0.9 })),
      // pull-up bar
      line('M900 302V214M986 302V214', ST.dk, 6), line('M900 302V214M986 302V214', ST.md, 3),
      line('M896 218H990', ST.md, 5), line('M896 216H990', '#fff', 1.4, { opacity: 0.7 }),
      // the dumbbell rack
      line('M1012 302L1028 234M1148 302L1132 234M1024 252H1136M1018 276H1142', V('wood-2'), 5),
      ...db(1046, 246), ...db(1080, 246), ...db(1114, 246), ...db(1042, 270, 1.2), ...db(1080, 270, 1.2), ...db(1118, 270, 1.2),
      // a kettlebell and a plyo box for Kato
      path('M1166 300a12 12 0 1 1 22 0Z', ACC.lo), path('M1170 290a7 8 0 0 1 14 0', 'none', { stroke: ACC.lo, 'stroke-width': 3.4 }),
      s('rect', { x: 1202, y: 280, width: 100, height: 24, rx: 3, fill: V('wood') }), s('rect', { x: 1202, y: 280, width: 100, height: 5, rx: 2, fill: V('wood-2') }),
      line('M1216 289V299M1288 289V299', V('wood-2'), 1.4),
    ];
  },
};
/** Where Kato sits in each motif: [centre x, base y, size]. */
const KATO_SPOT = { mess: [1252, 284, 150], market: [1250, 266, 148], trail: [1262, 300, 150], summit: [1250, 296, 150], hostel: [1256, 284, 150], gym: [1252, 282, 146] };

/**
 * A wide panorama for a page header: sky for the time of day, a campus skyline
 * with atmospheric perspective, a page-specific foreground (motif), optional Kato.
 * Fills its box (width/height 100%, xMaxYMax slice): phones see the right half
 * (x ≥ ~740), desktops see it all; the readable band is y ≈ 165–310.
 */
export function artScene({ time = 'day', motif = 'mess', kato = null, cls = '' } = {}) {
  if (!SCENE_TIMES.includes(time)) time = 'day';
  if (!MOTIF[motif]) motif = 'mess';
  const id = uniq('scn');
  const sky = id + 'sk', glow = id + 'gl', fw = id + 'fw', tiles = id + 'tl', hw = id + 'hw';
  const lit = time === 'dusk' || time === 'night';
  const defs = s('defs', {},
    lin(sky, [0, 0, 0, 1], [[0, V('sky-1')], [0.55, V('sky-2')], [0.86, V('sky-3')]]),
    rad(glow, [0.5, 0.5, 0.5], [[0, V('sun'), 0.55], [0.4, V('sun'), 0.18], [1, V('sun'), 0]]),
    steelRad(id + 'st', 0.32, 0.24, 0.95),
    s('pattern', { id: fw, width: 16, height: 18, patternUnits: 'userSpaceOnUse' }, s('rect', { x: 5, y: 5, width: 6, height: 8, rx: 1, fill: V('far-win') })),
    s('pattern', { id: tiles, width: 12, height: 11, patternUnits: 'userSpaceOnUse' }, path('M0 10.4h12M6 0v10', 'none', { stroke: V('roof-2'), 'stroke-width': 1.3, opacity: 0.6 })),
    s('pattern', { id: hw, x: 900, y: 172, width: 48, height: 40, patternUnits: 'userSpaceOnUse' },
      s('rect', { x: 15, y: 16, width: 18, height: 22, rx: 2, fill: V('glass-off') }), line('M24 17v20', V('wall-2'), 1.4)));

  const kids = [s('rect', { width: 1440, height: 360, fill: url(sky) })];
  // sun or moon, low for dawn and dusk; stars at night
  const [sx, sy, sr] = { dawn: [812, 246, 30], day: [806, 196, 24], dusk: [800, 240, 34], night: [806, 196, 20] }[time];
  kids.push(circ(sx, sy, sr * 4.2, url(glow), { class: 'sun-glow' }));
  if (time === 'night') {
    kids.push(path(`M${sx + 4} ${sy - sr}a${sr} ${sr} 0 1 0 ${sr * 0.9} ${sr * 1.62}a${sr * 0.82} ${sr * 0.82} 0 1 1 ${-sr * 0.9} ${-sr * 1.62}z`, V('sun')));
    const r = rng(11);
    for (let i = 0; i < 22; i++) {
      const x = f(140 + r() * 1290), y = f(120 + r() * 120), big = r() > 0.72;
      kids.push(big ? spark(x, y, 4 + r() * 2.4, V('star'), `twinkle tw-${i % 3 + 1}`) : circ(x, y, 1 + r() * 1.2, V('star'), { class: `twinkle tw-${i % 3 + 1}` }));
    }
  } else {
    kids.push(circ(sx, sy, sr, V('sun')), circ(sx - sr * 0.28, sy - sr * 0.3, sr * 0.42, '#fff', { opacity: 0.35 }));
    kids.push(s('g', { class: 'cloud' }, path(cloudD(560, 214, 120), V('cloud'))),
      s('g', { class: 'cloud cl-2' }, path(cloudD(960, 178, 150), V('cloud'))),
      s('g', { class: 'cloud cl-3' }, path(cloudD(240, 196, 100), V('cloud'), { opacity: 0.8 })));
  }
  // far campus, hazy: hostel blocks, then a nearer row with towers
  kids.push(path(blocksD(292, [[130, 110, 64], [250, 84, 92], [344, 130, 58], [486, 92, 76], [676, 120, 62], [850, 104, 74], [968, 148, 86], [1130, 98, 66], [1240, 150, 80], [1394, 60, 70]]), V('far')));
  const far2 = [[160, 88, 48], [420, 74, 60], [700, 96, 40], [900, 120, 52], [1060, 86, 64], [1280, 120, 46]];
  kids.push(path(blocksD(296, far2), V('far-2')), path(blocksD(296, far2), url(fw)));
  // a clock tower, a water tower and a gopuram
  kids.push(
    path('M318 296V176h34v120Z M312 178l23-26 23 26Z', V('far-2')), circ(335, 194, 8, V('far-win')), line('M335 194v-5M335 194l3.4 2', V('far-2'), 1.6),
    line('M548 296l8-58M588 296l-8-58M552 268h32M550 282h36', V('far-2'), 2.6),
    path('M546 240h44v-22a22 6 0 0 0-44 0Z M544 220l24-14 24 14Z', V('far-2')),
    path('M600 296l4-18h-3l3-16h-3l3-16h-3l3-16h-3l3-14h44l3 14h-3l3 16h-3l3 16h-3l3 16h-3l4 18Z M612 216a24 10 0 0 1 48 0Z M626 206v-8M636 204v-10M646 206v-8', V('far-2')),
    line('M606 278h60M608 262h56M611 246h50M614 230h44', V('far'), 1.4, { opacity: 0.8 }));
  if (lit) {
    [[930, 252], [972, 262], [1004, 246], [1098, 240], [1110, 262], [1300, 258], [1340, 264], [448, 246], [192, 256], [720, 266]].forEach(([x, y], i) =>
      kids.push(s('rect', { x, y, width: 6, height: 8, rx: 1, fill: V('win'), class: `win-tw w${i % 3}` })));
  }
  // trees and palms in silhouette, a little nearer
  kids.push(
    ...rainTree(220, 298, 130, V('mid'), V('mid')), ...rainTree(470, 296, 110, V('mid'), V('mid')), ...rainTree(780, 298, 120, V('mid'), V('mid')),
    ...palm(140, 298, 110, 12, V('mid'), V('mid'), 'palm-top pt-2'), ...palm(380, 298, 96, -10, V('mid'), V('mid')), ...palm(690, 298, 120, 14, V('mid'), V('mid'), 'palm-top pt-3'));
  // birds over the fields
  if (time !== 'night') kids.push(bird(700, 196, 1, ''), bird(726, 186, 0.8, 'bd-2'), bird(1010, 156, 0.9, 'bd-3'));
  // the land: a far field, then the ground the motif stands on
  kids.push(
    path('M0 288C180 278 360 284 540 290S900 282 1100 288S1340 280 1440 286V360H0Z', V('hill')),
    path('M0 300C300 294 620 302 900 298S1300 292 1440 296V360H0Z', V('ground')));
  kids.push(...MOTIF[motif](id));
  if (kato && MOODS.includes(kato)) {
    const [kx, ky, ks] = KATO_SPOT[motif];
    kids.push(katoAt(kato, kx, ky, ks));
  }
  kids.push(path('M0 312C400 306 800 314 1440 306V360H0Z', V('ground-2')));
  return s('svg', { viewBox: '0 0 1440 360', width: '100%', height: '100%', preserveAspectRatio: 'xMaxYMax slice', class: ('art art-scene scene-' + time + ' motif-' + motif + ' ' + cls).trim(), 'aria-hidden': 'true', focusable: 'false' },
    defs, ...kids);
}

// ---------- garnish around the thali gauge ----------
const GARNISH = {
  // each item is drawn in place so the key light stays top-left in every corner
  leafSprig(x, y, a, L) {
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const t = 0.16 + i * 0.15, side = i % 2 ? 1 : -1, ll = L * (0.36 - i * 0.025);
      leaves.push(s('g', { transform: `translate(${f(t * L)} 0) rotate(${side * 52})` },
        path(`M0 0C${f(ll * 0.3)} ${f(-ll * 0.3)} ${f(ll * 0.76)} ${f(-ll * 0.3)} ${f(ll)} 0C${f(ll * 0.76)} ${f(ll * 0.3)} ${f(ll * 0.3)} ${f(ll * 0.3)} 0 0Z`, i % 3 ? F.leaf : F.leafHi),
        line(`M1 0H${f(ll * 0.9)}`, F.leafLo, 0.8, { opacity: 0.6 })));
    }
    return s('g', { transform: `translate(${x} ${y}) rotate(${a})` }, line(`M0 0Q${L * 0.5} ${-L * 0.05} ${L} 0`, F.leafLo, 1.8), ...leaves);
  },
  chilli(x, y, a, L, c, hi, stem = F.leafLo) {
    return s('g', { transform: `translate(${x} ${y}) rotate(${a})` },
      path(`M0 0C${L * 0.3} ${-L * 0.18} ${L * 0.75} ${-L * 0.16} ${L} ${L * 0.06}C${L * 0.72} ${-L * 0.02} ${L * 0.3} ${L * 0.06} 0 ${L * 0.08}Z`, c),
      path(`M${L * 0.12} ${-L * 0.04}C${L * 0.36} ${-L * 0.12} ${L * 0.62} ${-L * 0.11} ${L * 0.82} ${-L * 0.02}`, 'none', { stroke: hi, 'stroke-width': L * 0.03, 'stroke-linecap': 'round', opacity: 0.85 }),
      path(`M0 ${L * 0.04}q${-L * 0.06} ${-L * 0.02} ${-L * 0.12} ${-L * 0.1}`, 'none', { stroke: stem, 'stroke-width': L * 0.05, 'stroke-linecap': 'round' }),
      ell(L * 0.02, L * 0.04, L * 0.05, L * 0.07, stem));
  },
  lemon(x, y, r) {
    const seg = [];
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; seg.push(`M${x} ${y}L${f(x + Math.cos(a) * r * 0.74)} ${f(y + Math.sin(a) * r * 0.74)}`); }
    return [circ(x, y, r, F.lemon), circ(x, y, r * 0.84, '#FFF8D2'), circ(x, y, r * 0.76, F.lemonHi), line(seg.join(''), '#FFF8D2', r * 0.07), circ(x, y, r * 0.08, '#FFF8D2'),
      path(`M${f(x - r * 0.7)} ${f(y - r * 0.45)}A${r * 0.84} ${r * 0.84} 0 0 1 ${f(x - r * 0.1)} ${f(y - r * 0.83)}`, 'none', { stroke: '#fff', 'stroke-width': r * 0.08, 'stroke-linecap': 'round', opacity: 0.8 })];
  },
  katori(x, y, r, food, hi, g) {
    return [circ(x, y, r, url(g)), circ(x, y, r * 0.86, 'none', { stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1 }), circ(x, y, r * 0.74, food),
      path(`M${f(x - r * 0.5)} ${f(y + r * 0.1)}Q${f(x - r * 0.1)} ${f(y - r * 0.6)} ${f(x + r * 0.4)} ${f(y - r * 0.2)}`, 'none', { stroke: hi, 'stroke-width': r * 0.26, 'stroke-linecap': 'round', opacity: 0.85 })];
  },
  cardamom(x, y, a) {
    return s('g', { transform: `translate(${x} ${y}) rotate(${a})` }, ell(0, 0, 7, 4.2, '#9DBE6A'), path('M-6 0Q0 -2.4 6 0', 'none', { stroke: '#7C9E4C', 'stroke-width': 0.9 }), ell(-2, -1.6, 3, 1.2, '#C3DA92', { opacity: 0.85 }), circ(7, 0, 1, '#7C9E4C'));
  },
  anise(x, y, r, a) {
    const g = s('g', { transform: `translate(${x} ${y}) rotate(${a})` });
    for (let i = 0; i < 8; i++) g.appendChild(path(`M0 0C${r * 0.3} ${-r * 0.32} ${r * 0.82} ${-r * 0.22} ${r} 0C${r * 0.82} ${r * 0.22} ${r * 0.3} ${r * 0.32} 0 0Z`, i % 2 ? '#8A4A28' : '#9E5A33', { transform: `rotate(${i * 45})` }));
    g.appendChild(circ(0, 0, r * 0.18, '#5E2E16'));
    for (let i = 0; i < 4; i++) g.appendChild(ell(Math.cos(i * 1.57 + 0.4) * r * 0.55, Math.sin(i * 1.57 + 0.4) * r * 0.55, r * 0.11, r * 0.07, '#D9A24E', { transform: `rotate(${i * 90 + 23} ${f(Math.cos(i * 1.57 + 0.4) * r * 0.55)} ${f(Math.sin(i * 1.57 + 0.4) * r * 0.55)})` }));
    return g;
  },
  coriander(x, y, a, L) {
    const leaf = (lx, ly, r, c) => path(`M${lx} ${ly}m${-r} 0a${r} ${r * 0.9} 0 0 1 ${r * 0.7} ${-r * 0.8}a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.6} ${r * 0.1}a${r * 0.7} ${r * 0.8} 0 0 1 ${r * 0.7} ${r * 0.7}a${r} ${r * 0.7} 0 0 1 ${-2 * r} 0z`, c);
    return s('g', { transform: `translate(${x} ${y}) rotate(${a})` },
      line(`M0 0Q${L * 0.4} ${-L * 0.1} ${L} ${-L * 0.06}M${L * 0.45} ${-L * 0.06}l${L * 0.16} ${-L * 0.28}M${L * 0.7} ${-L * 0.06}l${L * 0.1} ${L * 0.24}`, F.leafLo, 1.4),
      leaf(L, -L * 0.06, L * 0.22, F.leafHi), leaf(L * 0.61, -L * 0.36, L * 0.18, F.leaf), leaf(L * 0.8, L * 0.2, L * 0.17, F.leaf));
  },
};

/** One garnish cluster for a corner of a card ('tl' | 'tr' | 'bl' | 'br'): leaves, chilli, lemon, spice bowls. */
export function artGarnish({ corner = 'tl', size = 120 } = {}) {
  if (!['tl', 'tr', 'bl', 'br'].includes(corner)) corner = 'tl';
  const sh = uniq('gs'), kt = uniq('gk');
  const G = GARNISH;
  const shadow = (x, y, rx, ry) => ell(x + 3, y + 5, rx, ry, url(sh));
  const sets = {
    tl: () => [
      shadow(4, 20, 34, 30), ...G.katori(4, 18, 30, F.dal, F.dalHi, kt),
      G.leafSprig(-8, 64, -26, 84),
      shadow(52, 16, 9, 6), G.cardamom(52, 14, 30), shadow(70, 34, 8, 5), G.cardamom(70, 33, -20),
    ],
    tr: () => [
      shadow(112, 12, 32, 30), ...G.lemon(112, 10, 30),
      G.chilli(116, 64, 178, 64, F.leaf, F.leafHi),
      shadow(70, 20, 12, 12), G.anise(70, 18, 13, 12),
    ],
    bl: () => [
      shadow(8, 110, 34, 30), ...G.katori(8, 108, 30, F.chilli, F.chilliHi, kt),
      G.chilli(-6, 64, -12, 70, '#B5281A', '#E8583A', '#5E7A2E'),
      G.coriander(40, 96, -36, 42),
      shadow(56, 112, 8, 5), G.cardamom(56, 110, -10),
    ],
    br: () => [
      G.leafSprig(124, 120, 216, 88),
      shadow(102, 104, 14, 14), G.anise(102, 102, 15, -8),
      G.chilli(122, 66, 196, 52, F.leaf, F.leafHi),
      shadow(70, 112, 9, 9), ...G.katori(70, 110, 10, '#B08A4E', '#CDA86A', kt),
    ],
  };
  return s('svg', { viewBox: '0 0 120 120', width: size, height: size, class: 'art art-garnish garnish-' + corner, 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, shadowGrad(sh), rad(kt, [0.32, 0.26, 0.95], [[0, '#FFFFFF'], [0.55, '#DAD4C8'], [1, '#9A9385']])),
    ...sets[corner]());
}

// ---------- the rail vignette ----------
/** A tall vignette for the desktop rail's empty middle (viewBox 240 × 280): Kato on a tiffin, tulsi, chai, a kolam. */
export function artRail({ width = 220 } = {}) {
  const sh = uniq('rs'), st = uniq('rt'), pot = uniq('rp'), tea = uniq('rc'), arch = uniq('ra');
  const kolam = [path(kolamRing(0, 0, 74, 10, 9), 'none', { stroke: ACC.a, 'stroke-width': 2.6, 'stroke-linejoin': 'round', pathLength: 1, class: 'kolam-line' }),
    circ(0, 0, 56, 'none', { stroke: ACC.a, 'stroke-width': 2, 'stroke-dasharray': '0.01 0.06', 'stroke-linecap': 'round', pathLength: 1 })];
  const tier = (y, h) => [
    path(`M88 ${y}h64v${h - 4}a4 4 0 0 1-4 4H92a4 4 0 0 1-4-4z`, url(st)),
    s('rect', { x: 85, y: y - 2.5, width: 70, height: 6, rx: 3, fill: ST.md }),
    s('rect', { x: 85, y: y - 2.5, width: 70, height: 2.2, rx: 1.1, fill: '#fff', opacity: 0.8 }),
    line(`M96 ${y + 7}V${y + h - 4}`, '#fff', 3, { opacity: 0.7 }),
  ];
  const leaves = [];
  [[46, 166, -30, 16], [56, 160, 20, 15], [42, 152, -60, 14], [58, 148, 40, 14], [48, 140, -10, 13], [40, 176, -80, 13], [62, 172, 60, 13], [52, 132, 12, 11]].forEach(([x, y, a, L], i) =>
    leaves.push(path(`M0 0C${L * 0.3} ${-L * 0.36} ${L * 0.76} ${-L * 0.36} ${L} 0C${L * 0.76} ${L * 0.36} ${L * 0.3} ${L * 0.36} 0 0Z`, i % 2 ? F.leaf : F.leafHi, { transform: `translate(${x} ${y}) rotate(${a - 90})` })));
  return s('svg', { viewBox: '0 0 240 280', width, height: Math.round((width * 280) / 240), class: 'art art-rail', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, shadowGrad(sh),
      lin(st, [0, 0, 1, 0], [[0, ST.lo], [0.2, ST.hi], [0.55, ST.md], [1, ST.lo]]),
      lin(pot, [0, 0, 1, 0], [[0, '#E0875A'], [0.5, '#C8643C'], [1, '#9E4A28']]),
      lin(tea, [0, 0, 1, 0], [[0, F.chaiHi], [0.5, F.chai], [1, F.chaiLo]]),
      lin(arch, [0, 0, 0, 1], [[0, ACC.a, 0.16], [1, ACC.a, 0.04]])),
    // an arched window of light behind, and the floor with a kolam
    path('M48 236V96a72 72 0 0 1 144 0v140Z', url(arch)),
    path('M60 236V100a60 60 0 0 1 120 0v136', 'none', { stroke: ACC.a, 'stroke-width': 1.4, 'stroke-opacity': 0.3 }),
    ell(120, 246, 104, 20, ACC.a, { opacity: 0.08 }),
    s('g', { transform: 'translate(120 248) scale(1 0.3)', opacity: 0.6 }, ...kolam),
    // tulsi in a terracotta pot
    ell(52, 236, 26, 5, url(sh)),
    line('M51 194V128', F.leafLo, 2.2), ...leaves,
    path('M30 196h44l-5 36a6 6 0 0 1-6 5H41a6 6 0 0 1-6-5z', url(pot)),
    s('rect', { x: 27, y: 190, width: 50, height: 9, rx: 3, fill: '#B5532E' }),
    line('M38 210h28M40 220h24', '#F6D2A4', 1.6, { opacity: 0.6 }),
    // the tiffin, and Kato on top of it
    ell(120, 244, 44, 7, url(sh)),
    ...tier(208, 34), ...tier(176, 32), ...tier(146, 30),
    path('M90 146c0-8 13.6-12 30-12s30 4 30 12z', url(st)),
    line('M84 152v86M156 152v86', ST.dk, 3), line('M84 152v86', '#fff', 1, { opacity: 0.5 }),
    s('rect', { x: 80, y: 186, width: 8, height: 12, rx: 2, fill: ST.md }), s('rect', { x: 152, y: 186, width: 8, height: 12, rx: 2, fill: ST.md }),
    katoAt('happy', 120, 138, 100),
    // a glass of chai with steam
    ell(194, 240, 18, 4, url(sh)),
    ...chaiGlass(194, 202, 13, 38, tea),
    wisp('M190 194c-4-6 4-8 0-14', '', 2.6), wisp('M199 192c-4-6 4-8 0-14', 'steam-2', 2.6));
}

// ---------- kolam corner ----------
/** A kolam corner ornament, drawn for the top-left corner (rotate/flip in CSS for others). */
export function artCorner(size = 72) {
  const L = (d, cls = '') => path(d, 'none', { stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, class: ('kolam-line ' + cls).trim() });
  return s('svg', { viewBox: '0 0 72 72', width: size, height: size, class: 'art art-corner', 'aria-hidden': 'true', focusable: 'false' },
    L('M6 52C6 24 24 6 52 6'),
    L('M14 52C14 30 30 14 52 14', 'kl-2'),
    L('M8 8C22 6 34 18 30 30C18 34 6 22 8 8Z', 'kl-3'),
    L('M52 6c8 0 13 5 11 10-2 4-8 3-7-1', 'kl-2'),
    L('M6 52c0 8 5 13 10 11 4-2 3-8-1-7', 'kl-2'),
    L('M52 14c4 4 3 9-1 9', 'kl-3'), L('M14 52c4 4 9 3 9-1', 'kl-3'),
    circ(19, 19, 1.8, 'currentColor'), circ(36, 9.6, 1.6, 'currentColor'), circ(9.6, 36, 1.6, 'currentColor'),
    circ(66, 6, 1.4, 'currentColor'), circ(6, 66, 1.4, 'currentColor'));
}
