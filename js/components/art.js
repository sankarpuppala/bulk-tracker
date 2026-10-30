// =============================================================
// ART — the brand mark and the illustrations. Everything is
// inline SVG so it themes with the page and works offline.
// Colours come from CSS variables where they should follow the
// theme, and from fixed food colours where they should not
// (turmeric dal is yellow in every theme).
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

/** The brand mark: a plate rim around an ember flame, on an ember tile. */
export function logoMark(size = 36) {
  const g = uniq('lg');
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'logo-svg', role: 'img', 'aria-label': 'Fuel & Forge' },
    s('defs', {},
      s('linearGradient', { id: g, x1: 0, y1: 0, x2: 1, y2: 1 },
        s('stop', { offset: '0%', 'stop-color': '#FFB05C' }),
        s('stop', { offset: '100%', 'stop-color': '#F2561D' }))),
    s('rect', { width: 64, height: 64, rx: 18, fill: `url(#${g})` }),
    s('circle', { cx: 32, cy: 32, r: 22.5, fill: 'none', stroke: '#1B0D04', 'stroke-width': 3.2, opacity: '0.88' }),
    s('path', { d: FLAME, fill: '#1B0D04' }));
}

// ---------- the thali ----------
const KATORI = [
  { a: -90, base: '#F3B73A', dots: ['#D8941B', '#FFD36B'], name: 'dal' },
  { a: -18, base: '#B5432B', dots: ['#7E2417', '#D9684E'], name: 'rajma' },
  { a: 54, base: '#F6F0E2', dots: ['#BFD9A8', '#E3D9C0'], name: 'curd' },
  { a: 126, base: '#69A04B', dots: ['#F08A2C', '#3F7A2E'], name: 'sabzi' },
  { a: 198, base: '#E9B07A', dots: ['#C46A2D', '#F6D2A4'], name: 'sweet' },
];

/** Top-down thali: steel plate, five katoris, rice and a pappad. */
export function thaliArt({ size = 320, cls = '' } = {}) {
  const steel = uniq('st'), well = uniq('wl'), kat = uniq('kt'), blur = uniq('bl');
  const cx = 180, cy = 178;
  const svg = s('svg', { viewBox: '0 0 360 360', width: size, height: size, class: 'art-thali ' + cls, 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      s('radialGradient', { id: steel, cx: 0.35, cy: 0.28, r: 0.95 },
        s('stop', { offset: '0%', 'stop-color': '#FBF9F4' }), s('stop', { offset: '55%', 'stop-color': '#D6D1C6' }), s('stop', { offset: '100%', 'stop-color': '#A59F92' })),
      s('radialGradient', { id: well, cx: 0.4, cy: 0.35, r: 0.9 },
        s('stop', { offset: '0%', 'stop-color': '#ECE8DF' }), s('stop', { offset: '100%', 'stop-color': '#BEB8AB' })),
      s('radialGradient', { id: kat, cx: 0.35, cy: 0.3, r: 0.95 },
        s('stop', { offset: '0%', 'stop-color': '#F2EFE8' }), s('stop', { offset: '100%', 'stop-color': '#9B9588' })),
      s('filter', { id: blur, x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feGaussianBlur', { stdDeviation: 7 }))),
    // soft shadow
    s('ellipse', { cx, cy: cy + 14, rx: 160, ry: 154, fill: '#000', opacity: '0.3', filter: `url(#${blur})` }),
    // plate
    s('circle', { cx, cy, r: 168, fill: `url(#${steel})` }),
    s('circle', { cx, cy, r: 158, fill: 'none', stroke: '#fff', 'stroke-opacity': '0.7', 'stroke-width': 1.5 }),
    s('circle', { cx, cy, r: 148, fill: `url(#${well})`, stroke: '#000', 'stroke-opacity': '0.14', 'stroke-width': 1.5 }),
    s('circle', { cx, cy, r: 140, fill: 'none', stroke: '#fff', 'stroke-opacity': '0.4', 'stroke-width': 1 }));

  // pappad, tucked under the rice
  const pap = s('g', {},
    s('circle', { cx: cx + 40, cy: cy + 38, r: 36, fill: '#E5B25E', stroke: '#B97C27', 'stroke-width': 1.5 }));
  const r1 = rng(7);
  for (let i = 0; i < 16; i++) {
    const a = r1() * Math.PI * 2, d = r1() * 28;
    pap.appendChild(s('circle', { cx: cx + 40 + Math.cos(a) * d, cy: cy + 38 + Math.sin(a) * d, r: 1.6 + r1() * 1.6, fill: '#B97C27', opacity: '0.55' }));
  }
  svg.appendChild(pap);

  // katoris
  KATORI.forEach((k, i) => {
    const a = (k.a * Math.PI) / 180, x = cx + Math.cos(a) * 104, y = cy + Math.sin(a) * 104;
    const g = s('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
      s('circle', { cx: 2, cy: 5, r: 40, fill: '#000', opacity: '0.28', filter: `url(#${blur})` }),
      s('circle', { r: 39, fill: `url(#${kat})` }),
      s('circle', { r: 33, fill: k.base }),
      s('circle', { r: 33, fill: 'none', stroke: '#000', 'stroke-opacity': '0.16', 'stroke-width': 2 }),
      s('path', { d: 'M-24 -14A28 28 0 0 1 12 -26', fill: 'none', stroke: '#fff', 'stroke-opacity': '0.35', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    const r = rng(31 + i * 17);
    for (let j = 0; j < 9; j++) {
      const aa = r() * Math.PI * 2, dd = r() * 22;
      g.appendChild(s('circle', { cx: Math.cos(aa) * dd, cy: Math.sin(aa) * dd, r: 1.8 + r() * 3.2, fill: k.dots[j % 2], opacity: '0.6' }));
    }
    svg.appendChild(g);
  });

  // rice mound
  const rice = s('g', {},
    s('circle', { cx: cx + 2, cy: cy + 6, r: 54, fill: '#000', opacity: '0.25', filter: `url(#${blur})` }),
    s('circle', { cx, cy, r: 50, fill: '#FFFDF6' }),
    s('circle', { cx, cy, r: 50, fill: 'none', stroke: '#000', 'stroke-opacity': '0.1', 'stroke-width': 1.5 }));
  const r2 = rng(99);
  for (let i = 0; i < 46; i++) {
    const a = r2() * Math.PI * 2, d = Math.sqrt(r2()) * 43;
    rice.appendChild(s('ellipse', { cx: cx + Math.cos(a) * d, cy: cy + Math.sin(a) * d, rx: 5.5, ry: 2.2, fill: '#E7DDC4', opacity: '0.85', transform: `rotate(${(r2() * 180).toFixed(0)} ${(cx + Math.cos(a) * d).toFixed(1)} ${(cy + Math.sin(a) * d).toFixed(1)})` }));
  }
  rice.appendChild(s('ellipse', { cx: cx - 14, cy: cy - 18, rx: 18, ry: 9, fill: '#fff', opacity: '0.7' }));
  svg.appendChild(rice);

  // glints
  [[88, 70, 9], [292, 300, 6]].forEach(([x, y, r]) => svg.appendChild(s('path', {
    d: `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`, fill: '#fff', opacity: '0.85', class: 'glint',
  })));
  return svg;
}

// ---------- small scenes for empty states ----------
const A = (size, vb, cls, ...kids) => s('svg', { viewBox: vb, width: size, height: size, class: 'art ' + cls, 'aria-hidden': 'true', focusable: 'false' }, ...kids);

/** An empty plate with two bowls and a little steam. */
export function artEmptyPlate(size = 132) {
  return A(size, '0 0 120 120', 'art-empty',
    s('ellipse', { cx: 60, cy: 98, rx: 40, ry: 6, fill: 'var(--ink)', opacity: '0.08' }),
    s('circle', { cx: 60, cy: 66, r: 40, fill: 'var(--card-hi)', stroke: 'var(--line-strong)', 'stroke-width': 2 }),
    s('circle', { cx: 60, cy: 66, r: 29, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2, 'stroke-dasharray': '3 6', 'stroke-linecap': 'round' }),
    s('circle', { cx: 60, cy: 66, r: 10, fill: 'var(--accent-soft)' }),
    s('path', { d: 'M52 32c0-5 5-5 5-10M62 30c0-5 5-5 5-10', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: '0.7', class: 'steam' }));
}

/** Camera corners around a plate — the Snap / Ask scene. */
export function artViewfinder(size = 168) {
  const L = 'none';
  return A(size, '0 0 160 160', 'art-finder',
    s('rect', { x: 14, y: 14, width: 132, height: 132, rx: 22, fill: 'var(--accent-soft)', opacity: '0.5' }),
    s('path', { d: 'M18 46V34a16 16 0 0 1 16-16h12', fill: L, stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    s('path', { d: 'M142 46V34a16 16 0 0 0-16-16h-12', fill: L, stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    s('path', { d: 'M18 114v12a16 16 0 0 0 16 16h12', fill: L, stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    s('path', { d: 'M142 114v12a16 16 0 0 1-16 16h-12', fill: L, stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    s('circle', { cx: 80, cy: 82, r: 36, fill: 'var(--card-solid)', stroke: 'var(--line-strong)', 'stroke-width': 2 }),
    s('circle', { cx: 80, cy: 82, r: 26, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2 }),
    s('circle', { cx: 70, cy: 76, r: 8, fill: '#F3B73A' }),
    s('circle', { cx: 91, cy: 74, r: 7, fill: '#B5432B' }),
    s('circle', { cx: 82, cy: 93, r: 9, fill: '#69A04B' }),
    s('path', { d: 'M118 44l2.2 6 6 2.2-6 2.2-2.2 6-2.2-6-6-2.2 6-2.2z', fill: 'var(--accent)', class: 'glint' }));
}

/** A sprout in a pot — goals, progress, "start here". */
export function artSprout(size = 132) {
  return A(size, '0 0 120 120', 'art-sprout',
    s('ellipse', { cx: 60, cy: 104, rx: 34, ry: 5, fill: 'var(--ink)', opacity: '0.08' }),
    s('path', { d: 'M38 74h44l-5 28a6 6 0 0 1-6 5H49a6 6 0 0 1-6-5z', fill: 'var(--accent)' }),
    s('path', { d: 'M34 70h52a3 3 0 0 1 0 8H34a3 3 0 0 1 0-8z', fill: 'var(--accent)', opacity: '0.7' }),
    s('path', { d: 'M60 70V44', stroke: '#4F9A4A', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }),
    s('path', { d: 'M60 52c-14 0-22-8-22-20 14 0 22 8 22 20z', fill: '#69A04B' }),
    s('path', { d: 'M60 46c12 0 20-7 20-18-12 0-20 7-20 18z', fill: '#8DC063' }));
}

/** Plate with a rising chart — progress empty state. */
export function artTrend(size = 132) {
  return A(size, '0 0 120 120', 'art-trend',
    s('rect', { x: 14, y: 18, width: 92, height: 80, rx: 18, fill: 'var(--card-hi)', stroke: 'var(--line-strong)', 'stroke-width': 2 }),
    s('path', { d: 'M26 82l22-22 16 12 30-34', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('circle', { cx: 94, cy: 38, r: 6, fill: 'var(--accent)' }),
    s('path', { d: 'M26 90h68', stroke: 'var(--line-strong)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '2 7' }));
}
