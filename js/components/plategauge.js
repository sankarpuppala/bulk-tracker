// =============================================================
// PLATE GAUGE — the hero. Calories are an ember arc set into the
// rim of a brushed-steel thali; the three macros are katoris that
// fill with food as you eat.
//
// The steel is drawn once per render as static SVG. The arc, its
// glow, the start cap and the bead are CSS layers driven by one
// number, --pct, so they can never drift apart. Everything is
// sized in container units, so the gauge scales to any width.
// =============================================================
import { h, s, clamp, round, fmtNum } from '../util.js';
import { icon } from './icons.js';

let n = 0;
const uid = p => `${p}${++n}`;
const CX = 120, CY = 120;

// ---------- motion that survives re-renders ----------
// Today rebuilds its whole tree on every log, so an animated value keeps
// its state here under a stable key. When a new element is built while the
// previous one is still on the page (an in-place re-render), it carries on
// from wherever that one was; a fresh arrival draws in from `start`.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rootVar = name => (typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '');
const curves = {};
/** The token's linear() spring as a JS function, so numbers move on the same curve as CSS. */
function curve(token) {
  if (curves[token]) return curves[token];
  const m = /^linear\((.+)\)$/.exec(rootVar(token));
  const pts = m ? m[1].split(',').map(parseFloat).filter(Number.isFinite) : [];
  const f = pts.length > 1
    ? k => { const x = clamp(k, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)); return pts[i] + (pts[i + 1] - pts[i]) * (x - i); }
    : k => 1 - Math.pow(1 - clamp(k, 0, 1), 4);
  return (curves[token] = f);
}
const dur = (token, fallback) => { const v = parseFloat(rootVar(token)); return Number.isFinite(v) && v > 0 ? v : fallback; };

const live = new Map();
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
function at(st, t) {
  const k = clamp((t - st.t0) / st.ms, 0, 1), e = st.ease(k), ec = Math.min(e, 1);
  return [st.from.map((f, i) => f + (st.to[i] - f) * e), st.from.map((f, i) => f + (st.to[i] - f) * ec), k];
}

/**
 * Tween a few numbers that belong to one thing on screen.
 *   key    stable id ('today:kcal'), or null for a one-off
 *   el     the element being built (must be connected by the next frame)
 *   to     the numbers it should end on
 *   paint  (values, valuesWithoutOvershoot, progress) → paints them
 * A fresh draw-in uses --ease-soft over --dur-6; a change uses the springier
 * --ease-spring over --dur-5. Reduced motion paints the end state at once.
 */
export function tween(key, el, to, paint, { start = null, delay = 0, fresh = ['--ease-soft', '--dur-6', 1400], change = ['--ease-spring', '--dur-5', 820] } = {}) {
  const t = performance.now();
  const prev = key ? live.get(key) : null;
  const inPlace = !!prev?.el?.isConnected;
  let st;
  if (inPlace && same(prev.to, to)) st = { ...prev };
  else if (inPlace) st = { from: at(prev, t)[0], to, t0: t, ms: dur(change[1], change[2]), ease: curve(change[0]) };
  else st = { from: start || to.map(() => 0), to, t0: t + delay, ms: dur(fresh[1], fresh[2]), ease: curve(fresh[0]) };
  if (reduced()) { st.from = to; st.t0 = t - st.ms; }
  if (prev) cancelAnimationFrame(prev.raf);
  st.el = el;
  if (key) live.set(key, st);
  const v = at(st, t);
  paint(v[0], v[1], v[2]);
  if (v[2] < 1) {
    const frame = now => {
      const w = at(st, now);
      paint(w[0], w[1], w[2]);
      if (w[2] < 1) st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  }
  return st;
}

/** True when this key's last element is still on the page (we're re-rendering in place). */
export const isLive = key => !!live.get(key)?.el?.isConnected;
/** The last value a keyed tween was heading to (undefined before the first render). */
export const lastTo = key => live.get(key)?.to;

// ---------- svg helpers ----------
const stop = ([offset, color, opacity]) => s('stop', { offset, style: `stop-color:${color}${opacity != null ? `;stop-opacity:${opacity}` : ''}` });
const grad = (tag, id, attrs, stops) => s(tag, { id, ...attrs }, ...stops.map(stop));
/** a point on a circle, `a` in radians clockwise from 12 o'clock */
const P = (r, a) => [+(CX + Math.sin(a) * r).toFixed(2), +(CY - Math.cos(a) * r).toFixed(2)];
const arc = (r, a0, a1) => { const [x0, y0] = P(r, a0), [x1, y1] = P(r, a1); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; };

/** A brushed-steel thali seen from above: rolled lip, engraved bezel, a groove for the arc, a concave well. */
function thali() {
  const id = uid('pg');
  const svg = s('svg', { viewBox: '0 0 240 240', class: 'pg', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      grad('radialGradient', id + 'r', { cx: 0.32, cy: 0.24, r: 0.98 }, [[0, 'var(--pg-hi)'], [0.4, 'var(--steel-1)'], [1, 'var(--steel-2)']]),
      grad('linearGradient', id + 'l', { x1: 0.14, y1: 0.06, x2: 0.86, y2: 0.94 }, [[0, 'var(--pg-hi)'], [0.45, 'var(--steel-1)'], [1, 'var(--pg-shade)']]),
      grad('linearGradient', id + 'b', { x1: 0.14, y1: 0.06, x2: 0.86, y2: 0.94 }, [[0, 'var(--pg-shade)'], [1, 'var(--pg-hi)']]),
      grad('radialGradient', id + 'g', { cx: CX, cy: CY, r: 99.5, gradientUnits: 'userSpaceOnUse' },
        [[0.785, 'var(--pg-shade)'], [0.82, 'var(--pg-groove)'], [0.955, 'var(--pg-groove)'], [1, 'var(--pg-shade)']]),
      grad('radialGradient', id + 'w', { cx: 0.4, cy: 0.34, r: 0.74 }, [[0, 'var(--pg-well-hi)'], [0.62, 'var(--plate-in)'], [1, 'var(--pg-well-edge)']]),
      s('filter', { id: id + 'f', x: '-30%', y: '-30%', width: '160%', height: '160%' }, s('feGaussianBlur', { stdDeviation: 1.6 }))),
    // rolled outer lip, then the rim face
    s('circle', { cx: CX, cy: CY, r: 119.5, fill: `url(#${id}l)` }),
    s('circle', { cx: CX, cy: CY, r: 117.2, fill: `url(#${id}r)` }));

  // brushed: fine lathe rings on the rim face
  const brush = s('g', { class: 'pg-brush' });
  for (let r = 102.6, i = 0; r < 116.6; r += 1.45, i++) brush.appendChild(s('circle', { cx: CX, cy: CY, r: r.toFixed(2), class: i % 2 ? 'b-d' : 'b-l' }));
  svg.appendChild(brush);

  // engraved bezel: a dark cut with a lit lower-right wall
  const ticks = s('g', { class: 'pg-ticks' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, major = i % 5 === 0, quarter = i % 15 === 0;
    const r1 = quarter ? 103.4 : major ? 104.6 : 107.2, r2 = quarter ? 114 : major ? 112.6 : 111.4;
    const [x1, y1] = P(r1, a), [x2, y2] = P(r2, a);
    const w = quarter ? 2.1 : major ? 1.5 : 0.8;
    ticks.appendChild(s('line', { x1, y1, x2, y2, class: 't-cut', 'stroke-width': w }));
    ticks.appendChild(s('line', { x1: x1 + 0.55, y1: y1 + 0.55, x2: x2 + 0.55, y2: y2 + 0.55, class: 't-lit', 'stroke-width': w * 0.7 }));
  }
  svg.appendChild(ticks);

  svg.append(
    // the lamp catching the rim, top-left; a faint bounce bottom-right
    s('path', { d: arc(111.5, -1.38, -0.28), class: 'pg-spec soft', filter: `url(#${id}f)` }),
    s('path', { d: arc(117.6, -1.3, -0.42), class: 'pg-spec crisp' }),
    s('path', { d: arc(111.5, 1.95, 2.55), class: 'pg-spec bounce', filter: `url(#${id}f)` }),
    // step down into the groove the arc runs in
    s('circle', { cx: CX, cy: CY, r: 101, fill: 'none', stroke: `url(#${id}b)`, 'stroke-width': 2.6 }),
    s('circle', { cx: CX, cy: CY, r: 99.5, fill: `url(#${id}g)` }),
    // the raised edge of the well, lit from the top-left, then the well
    s('circle', { cx: CX, cy: CY, r: 78.4, fill: `url(#${id}l)` }),
    s('circle', { cx: CX, cy: CY, r: 76.6, fill: `url(#${id}w)` }),
    s('circle', { cx: CX, cy: CY, r: 64, class: 'pg-lathe' }),
    s('circle', { cx: CX, cy: CY, r: 46, class: 'pg-lathe' }),
    s('ellipse', { cx: 96, cy: 84, rx: 30, ry: 12, transform: 'rotate(-36 96 84)', class: 'pg-well-spec', filter: `url(#${id}f)` }));
  return svg;
}

/**
 * Calorie plate. `eaten` / `target` in kcal.
 * size: a number of px, or any CSS length (Today passes a clamp()).
 * key: pass a stable key to animate from the previous render instead of drawing in again.
 */
export function plateGauge({ eaten, target, size = 232, show = 'left', key = null }) {
  const left = target - eaten;
  const over = show !== 'target' && left < 0;
  const num = h('div', { class: 'pg-num num' }, fmtNum(show === 'target' ? target : Math.abs(left)));
  const label = show === 'target' ? `${fmtNum(target)} calories a day`
    : left >= 0 ? `${fmtNum(left)} calories left of ${fmtNum(target)}` : `${fmtNum(-left)} calories over ${fmtNum(target)}`;
  const el = h('div', {
    class: 'plate-gauge' + (over ? ' over' : ''), role: 'img', 'aria-label': label,
    style: `--pg-size:${typeof size === 'number' ? size + 'px' : size}`,
  },
    thali(),
    h('div', { class: 'pg-ring', 'aria-hidden': 'true' },
      h('i', { class: 'pg-glow' }, h('i', { class: 'pg-arc' })),
      h('i', { class: 'pg-arc' }),
      h('i', { class: 'pg-lap' }),
      h('i', { class: 'pg-cap0' }),
      h('i', { class: 'pg-arm' }, h('i', { class: 'pg-bead' }))),
    h('div', { class: 'pg-center' },
      num,
      h('div', { class: 'pg-cap' }, show === 'target' ? 'kcal a day' : over ? 'kcal over' : 'kcal left'),
      show !== 'target' && h('div', { class: 'pg-sub num' }, `${fmtNum(eaten)} / ${fmtNum(target)}`)));

  // one tween drives the arc, the bead and the number together
  tween(key, el, [eaten, target], ([e, t], [en, tn]) => {
    const p = t > 0 ? clamp(e / t, 0, 2) : 0;
    el.style.setProperty('--pct', p.toFixed(4));
    num.textContent = fmtNum(show === 'target' ? tn : over ? Math.max(0, en - tn) : Math.max(0, tn - en));
  }, { start: [0, target], delay: key ? 140 : 220 });
  return el;
}

// ---------- the katori ----------
// A steel bowl seen from a little above. The food is a pool inside the rim
// that rises and widens as the macro fills; low levels sit deeper in the
// bowl and are partly hidden by the front wall, the way a real katori looks.
const SPECKS = {
  p: [[-14, -1, 2.6, 1.7], [9, 2, 2.2, 1.5], [-3, 3.5, 1.9, 1.3], [17, -2.5, 1.8, 1.2], [3, -3, 2.3, 1.5]],       // dal: a few whole beans
  c: [[-16, 0, 2.4, 0.9], [-6, 3, 2.2, 0.8], [5, -2.5, 2.4, 0.9], [14, 1.5, 2.1, 0.8], [-1, -0.5, 2, 0.8], [20, -1, 1.9, 0.7]],   // rice grains
  f: [[-12, -1, 1.6, 1.3], [8, 2.5, 1.2, 1], [15, -2, 1.4, 1.1], [-2, 2, 1, 0.8]],                                // ghee drops
};
const MACRO = { protein: 'p', carbs: 'c', fat: 'f' };
const levelOf = L => (L <= 0 ? { dy: 8, sc: 0.2, op: 0 } : { dy: 8 * (1 - L), sc: 0.24 + 0.76 * Math.sqrt(1 - (1 - L) ** 2), op: Math.min(1, L * 14) });

function katori(color, kind, id) {
  const pool = s('g', { class: 'kt-pool' },
    s('ellipse', { cx: 50, cy: 32.5, rx: 36, ry: 10, fill: `url(#${id}q)` }),
    ...(SPECKS[kind] || []).map(([x, y, rx, ry], i) => s('ellipse', { cx: 50 + x, cy: 32.5 + y, rx, ry, class: 'kt-speck' + (i % 2 ? ' lt' : ''), transform: `rotate(${(i * 47) % 180 - 90} ${50 + x} ${32.5 + y})` })),
    s('ellipse', { cx: 50, cy: 32.5, rx: 13, ry: 3.6, class: 'kt-ripple' }),
    s('ellipse', { cx: 50, cy: 32.5, rx: 13, ry: 3.6, class: 'kt-ripple r2' }),
    s('ellipse', { cx: 37, cy: 29.2, rx: 9, ry: 1.9, class: 'kt-glint' }),
    s('ellipse', { cx: 50, cy: 32.5, rx: 35.3, ry: 9.5, class: 'kt-meniscus' }));
  const svg = s('svg', { viewBox: '0 0 100 86', class: 'bowl', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      grad('radialGradient', id + 's', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'var(--shadow-c)'], [1, 'var(--shadow-c)', 0]]),
      grad('radialGradient', id + 'b', { cx: 0.28, cy: 0.12, r: 1.05 }, [[0, 'var(--pg-hi)'], [0.34, 'var(--steel-1)'], [1, 'var(--steel-2)']]),
      grad('linearGradient', id + 'r', { x1: 0, y1: 0, x2: 0.3, y2: 1 }, [[0, 'var(--pg-hi)'], [1, 'var(--steel-1)']]),
      grad('linearGradient', id + 'i', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'var(--pg-shade)'], [0.3, 'var(--steel-1)'], [1, 'var(--steel-2)']]),
      grad('radialGradient', id + 'q', { cx: 0.42, cy: 0.38, r: 0.62 }, [[0, 'var(--kt-lit)'], [0.55, 'var(--kc)'], [1, 'var(--kt-deep)']]),
      s('clipPath', { id: id + 'c' }, s('ellipse', { cx: 50, cy: 32.5, rx: 36, ry: 10 }))),
    s('ellipse', { cx: 50, cy: 77.5, rx: 36, ry: 6.5, fill: `url(#${id}s)` }),
    s('ellipse', { cx: 50, cy: 72.4, rx: 18, ry: 4.4, class: 'kt-foot' }),
    s('path', { d: 'M10 32C10 56.5 27.5 72.5 50 72.5S90 56.5 90 32Z', fill: `url(#${id}b)` }),
    s('path', { d: 'M18.5 41C20 52.5 26.5 61.5 36 66.5', class: 'kt-sheen wide' }),
    s('path', { d: 'M18.5 41C20 52.5 26.5 61.5 36 66.5', class: 'kt-sheen' }),
    s('path', { d: 'M84 44C82 54 75 63 66 67.5', class: 'kt-bounce' }),
    s('ellipse', { cx: 50, cy: 32, rx: 40, ry: 12, fill: `url(#${id}r)`, class: 'kt-rim' }),
    s('ellipse', { cx: 50, cy: 32.5, rx: 36, ry: 10, fill: `url(#${id}i)` }),
    s('g', { 'clip-path': `url(#${id}c)` }, pool),
    s('path', { d: 'M14.5 34.5A36 10.4 0 0 0 85.5 34.5', class: 'kt-lip' }),
    s('ellipse', { cx: 25, cy: 27.6, rx: 5, ry: 1.3, class: 'kt-rim-spec', transform: 'rotate(-14 25 27.6)' }),
    s('path', { d: 'M61 41.2c.4 4.2 1.2 7.6 2.6 9.4a2.6 2.6 0 0 1-4.3 2.4c-.8-1.6-.5-6.3.2-11.6Z', class: 'kt-drip' }));
  return { svg, pool };
}

/** A katori that fills with food as the macro is eaten. `key` animates from the previous render. */
export function bowlGauge({ label, value, max, color, unit = 'g', show = 'left', key = null }) {
  const pct = max > 0 ? value / max : 0;
  const left = max - value;
  const over = show !== 'target' && pct > 1.05;
  const hit = show !== 'target' && pct >= 1 && !over;
  const kind = MACRO[String(label).toLowerCase()] || 'p';
  const { svg, pool } = katori(color, kind, uid('kt'));
  const v = h('span', { class: 'bv-n' }, show === 'target' ? round(max) : over ? `+${round(-left)}` : hit ? round(value) : round(Math.max(0, left)));
  const el = h('div', { class: `bowl-gauge k-${kind}${over ? ' over' : ''}${hit ? ' hit' : ''}`, style: `--kc:${color}`, role: 'img', 'aria-label': `${label}: ${round(value)} of ${round(max)} ${unit}${hit ? ', target hit' : ''}` },
    h('div', { class: 'bowl-art' }, svg, hit && h('span', { class: 'bowl-badge' }, icon('check', { size: 14, sw: 3 }))),
    h('div', { class: 'bowl-l' }, label),
    show === 'target'
      ? [h('div', { class: 'bowl-v num' }, v, h('small', null, unit)), h('div', { class: 'bowl-s' }, 'a day')]
      : hit
        ? [h('div', { class: 'bowl-v num' }, v, h('small', null, unit)), h('div', { class: 'bowl-s' }, 'target hit')]
        : [h('div', { class: 'bowl-v num' }, v, h('small', null, unit)), h('div', { class: 'bowl-s' }, over ? 'over' : 'left')]);

  tween(key, el, [value, max], ([val, mx], [vn, mn]) => {
    const L = mx > 0 ? clamp(val / mx, 0, 1.04) : 0;
    const { dy, sc, op } = levelOf(Math.min(L, 1));
    pool.setAttribute('transform', `translate(0 ${dy.toFixed(2)}) translate(50 32.5) scale(${sc.toFixed(4)}) translate(-50 -32.5)`);
    pool.style.opacity = op.toFixed(3);
    if (show === 'target') v.textContent = round(mn);
    else if (hit) v.textContent = round(vn);
    else if (!over) v.textContent = round(Math.max(0, mn - vn));
  }, { start: [0, max], delay: key ? 260 : 380 });
  return el;
}
