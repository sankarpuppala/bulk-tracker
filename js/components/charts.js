// =============================================================
// CHARTS — rings, line, bar and donut charts as inline SVG.
// Data in, <svg> out; no state beyond the element itself.
//
// Line and bar charts lay themselves out at the width they are
// actually given: a ResizeObserver repaints them once before the
// first frame (and again if the window is resized), so axis type
// stays 12 px and a bar stays a bar on a phone and on a 27" screen.
//
// Motion lives in css/progress.css. Every draw-in animates *from*
// nothing *to* the finished picture, which is what the markup holds,
// so with reduced motion (or before the CSS loads) the finished
// chart is simply there.
//
// Re-exported from js/ui.js, so `import { lineChart } from '../ui.js'`
// keeps working everywhere.
// =============================================================
import { s, clamp } from '../util.js';

let seq = 0;
const uid = p => `${p}${(++seq).toString(36)}`;
const r1 = n => Math.round(n * 10) / 10;
const GLYPH = 7.4;                       // advance of one 12 px JetBrains Mono glyph
const tagWidth = text => String(text).length * GLYPH + 16;
const fmtInt = n => Math.round(n || 0).toLocaleString('en-IN');

/**
 * Paint `svg` at the pixel width it is given. `paint(W, still)` rebuilds the
 * children; `still` is true for repaints after the first (a window resize),
 * which should not replay the entrance.
 */
function fitWidth(svg, H, paint) {
  let W = 320;
  svg.style.height = H + 'px';
  paint(W, false);
  if (typeof ResizeObserver !== 'function') return svg;
  let seen = false;
  const ro = new ResizeObserver(entries => {
    if (!svg.isConnected) { if (seen) ro.disconnect(); return; }
    const w = Math.round(entries[entries.length - 1].contentRect.width);
    if (w >= 120 && Math.abs(w - W) >= 2) { W = w; paint(W, seen); }
    seen = true;
  });
  ro.observe(svg);
  return svg;
}

/** Gridline values: round numbers that fall inside [lo, hi]. */
function niceTicks(lo, hi, count = 3) {
  const raw = (hi - lo) / count || 1;
  const pow = 10 ** Math.floor(Math.log10(raw)), e = raw / pow;
  const step = (e >= 7.07 ? 10 : e >= 3.16 ? 5 : e >= 1.41 ? 2 : 1) * pow;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/**
 * A smooth curve through every point: Catmull-Rom tangents turned into cubic
 * Béziers. Tangents are flattened at local peaks and dips and the control
 * points are kept inside each segment's range, so the curve never invents a
 * high or a low the data doesn't have.
 */
function smoothPath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  if (n === 2) return `M${r1(pts[0][0])} ${r1(pts[0][1])}L${r1(pts[1][0])} ${r1(pts[1][1])}`;
  const slope = (a, b) => (b[0] - a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0);
  const m = pts.map((p, i) => {
    if (i === 0) return slope(p, pts[1]);
    if (i === n - 1) return slope(pts[n - 2], p);
    const a = slope(pts[i - 1], p), b = slope(p, pts[i + 1]);
    return a * b <= 0 ? 0 : slope(pts[i - 1], pts[i + 1]);
  });
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = (x1 - x0) / 3;
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    d += `C${r1(x0 + dx)} ${r1(clamp(y0 + m[i] * dx, lo, hi))} ${r1(x1 - dx)} ${r1(clamp(y1 - m[i + 1] * dx, lo, hi))} ${r1(x1)} ${r1(y1)}`;
  }
  return d;
}
const straightPath = pts => pts.map((p, i) => (i ? 'L' : 'M') + r1(p[0]) + ' ' + r1(p[1])).join('');

/** A small rounded label ("goal 70", "64.2"). `tone` picks the CSS look. */
function tag(text, { x, y, anchor = 'middle', tone = 'ink', W }) {
  const w = tagWidth(text), h = 22;
  let left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  if (W) left = clamp(left, 0, W - w);
  return s('g', { class: 'c-tag ' + tone, transform: `translate(${r1(left)} ${r1(y - h / 2)})` },
    s('g', { class: 'c-tag-in' },
      s('rect', { width: r1(w), height: h, rx: h / 2 }),
      s('text', { x: r1(w / 2), y: 15, 'text-anchor': 'middle' }, String(text))));
}

// ---------- Activity rings ----------
// rings: [{value, max, color, track, over}] outermost first
export function rings(list, size = 200, stroke = 16, gap = 4) {
  const c = size / 2;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'rings', 'aria-hidden': 'true', focusable: 'false' });
  const defs = s('defs');
  svg.appendChild(defs);
  const glow = size >= 80 ? uid('rg') : null;
  if (glow) defs.appendChild(s('filter', { id: glow, x: '-30%', y: '-30%', width: '160%', height: '160%' }, s('feGaussianBlur', { stdDeviation: stroke * 0.32 })));
  list.forEach((r, i) => {
    const rad = c - stroke / 2 - i * (stroke + gap);
    if (rad <= 0) return;
    const circ = 2 * Math.PI * rad;
    const pct = r.max > 0 ? r.value / r.max : 0;
    const shown = clamp(pct, 0, 1);
    const gid = uid('rgr');
    // lit from the top-left: a lighter tint of the colour sweeping into its deep end
    defs.appendChild(s('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: c - rad, y1: c - rad, x2: c + rad, y2: c + rad },
      s('stop', { offset: '0', style: `stop-color: color-mix(in srgb, ${r.color} 62%, white)` }),
      s('stop', { offset: '0.55', style: `stop-color: ${r.color}` }),
      s('stop', { offset: '1', style: `stop-color: color-mix(in srgb, ${r.color} 82%, black)` })));
    const ring = (attrs, cls) => s('circle', { cx: c, cy: c, r: r1(rad), fill: 'none', 'stroke-width': stroke, transform: `rotate(-90 ${c} ${c})`, class: cls, ...attrs });
    const g = s('g', { class: 'ring', style: `--i:${i}; --circ:${r1(circ)}` });
    g.appendChild(ring({ style: `stroke: ${r.track || r.color}` }, 'ring-track'));
    if (shown > 0) {
      const dash = `${r1(circ * shown)} ${r1(circ)}`;
      if (glow) g.appendChild(ring({ style: `stroke: ${r.color}`, 'stroke-linecap': 'round', 'stroke-dasharray': dash, filter: `url(#${glow})` }, 'ring-glow'));
      g.appendChild(ring({ stroke: `url(#${gid})`, 'stroke-linecap': 'round', 'stroke-dasharray': dash }, 'ring-arc'));
    }
    if (pct > 1) {
      // the second lap: a deeper tone, cut out of the first by a hairline of the surface
      const lap = clamp(pct - 1, 0, 1);
      const deep = r.over || `color-mix(in srgb, ${r.color} 72%, black)`;
      const lapDash = `${r1(circ * lap)} ${r1(circ)}`;
      g.appendChild(ring({ 'stroke-width': stroke + 3, 'stroke-linecap': 'round', 'stroke-dasharray': lapDash }, 'ring-cap'));
      g.appendChild(ring({ style: `stroke: ${deep}`, 'stroke-linecap': 'round', 'stroke-dasharray': lapDash }, 'ring-lap'));
    }
    svg.appendChild(g);
  });
  return svg;
}

export function miniRing(value, max, color, size = 44, stroke = 5) {
  return rings([{ value, max, color }], size, stroke, 0);
}

// ---------- Charts ----------
/**
 * points: [{ x, y, trend?, label? }] actual readings (x in any unit, usually days).
 * lines:  [{ points: [{ x, y }], color, dashed, label }] extra series (the plan line).
 * bands:  [{ x0, x1, kind }] shaded phase columns behind the chart.
 * ticks:  [{ x, label }] labels along the bottom.
 * Drag across it (or hover) to read any point; let go and it returns to the latest.
 */
export function lineChart(points, { height = 160, color = 'var(--accent)', goal, fmt = v => v, yPad = 1, label = 'Trend chart', lines = [], bands = [], ticks = [] } = {}) {
  const H = height;
  const last = points[points.length - 1];
  const svg = s('svg', { viewBox: `0 0 320 ${H}`, class: 'chart chart-line', role: 'img', 'aria-label': last ? `${label}. Latest ${fmt(last.y)}.` : label });
  const extra = lines.flatMap(l => l.points);
  if (points.length === 0 && extra.length === 0) { svg.style.height = H + 'px'; return svg; }

  const ys = points.map(p => p.y).concat(points.filter(p => p.trend != null).map(p => p.trend), extra.map(p => p.y), goal != null ? [goal] : []);
  let min = Math.min(...ys) - yPad, max = Math.max(...ys) + yPad;
  if (max - min < 1) { max += 1; min -= 1; }
  const xs = points.map(p => p.x).concat(extra.map(p => p.x), bands.flatMap(b => [b.x0, b.x1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const grid = niceTicks(min, max, H >= 180 ? 4 : 3);
  const gutter = Math.max(...grid.map(v => String(fmt(v)).length)) * GLYPH + 10;
  let geo = null;                                 // what the scrubber needs from the last paint

  const paint = (W, still) => {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('still', still);
    const P = { l: gutter, r: 14, t: 30, b: ticks.length ? 26 : 12 };
    const X = x => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
    const Y = y => P.t + (1 - (y - min) / (max - min)) * (H - P.t - P.b);
    const base = H - P.b;
    const ids = { area: uid('ga'), glow: uid('gg') };
    svg.appendChild(s('defs', {},
      s('linearGradient', { id: ids.area, x1: 0, x2: 0, y1: 0, y2: 1 },
        s('stop', { offset: '0', style: `stop-color: ${color}; stop-opacity: 0.34` }),
        s('stop', { offset: '0.55', style: `stop-color: ${color}; stop-opacity: 0.1` }),
        s('stop', { offset: '1', style: `stop-color: ${color}; stop-opacity: 0` })),
      s('filter', { id: ids.glow, x: '-10%', y: '-40%', width: '120%', height: '180%' }, s('feGaussianBlur', { stdDeviation: 4 }))));

    // phase bands, then the grid, then the goal
    bands.forEach((b, i) => {
      const bx = X(b.x0), bw = Math.max(1, X(b.x1) - bx);
      svg.appendChild(s('rect', { x: r1(bx), y: P.t - 10, width: r1(bw), height: r1(base - P.t + 10), rx: 8, class: 'band ' + b.kind }));
      if (i > 0) svg.appendChild(s('line', { x1: r1(bx), x2: r1(bx), y1: P.t - 10, y2: base, class: 'band-edge' }));
    });
    grid.forEach(v => {
      const y = r1(Y(v));
      svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: 'grid' }));
      svg.appendChild(s('text', { x: P.l - 10, y: y + 4, class: 'axis', 'text-anchor': 'end' }, fmt(v)));
    });
    ticks.forEach((t, i) => svg.appendChild(s('text', { x: r1(X(t.x)), y: H - 6, class: 'axis tick', 'text-anchor': i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle' }, t.label)));
    if (goal != null) {
      const gy = r1(Y(goal));
      svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: gy, y2: gy, class: 'goal-line' }));
    }
    // the goal's label sits on top of everything drawn later, so a line never runs through it
    const goalTag = goal != null ? tag('goal ' + fmt(goal), { x: W - P.r, y: r1(Y(goal)), anchor: 'end', tone: 'goal', W }) : null;

    // everything that belongs to the data is revealed left to right, in step with the line
    const reveal = s('g', { class: 'c-reveal' });
    svg.appendChild(reveal);
    lines.forEach(l => {
      if (l.points.length < 2) return;
      const d = straightPath(l.points.map(p => [X(p.x), Y(p.y)]));
      reveal.appendChild(s('path', { d, fill: 'none', style: `stroke: ${l.color || 'var(--ink)'}`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': l.dashed ? '5 6' : null, class: 'plan-line' + (l.dashed ? ' dashed' : '') }, l.label ? s('title', {}, l.label) : null));
    });
    if (points.length === 0) { if (goalTag) svg.appendChild(goalTag); geo = null; return; }

    const pts = points.map(p => [X(p.x), Y(p.y)]);
    const d = smoothPath(pts);
    if (pts.length > 1) {
      reveal.appendChild(s('path', { d: `${d}L${r1(pts[pts.length - 1][0])} ${base}L${r1(pts[0][0])} ${base}Z`, fill: `url(#${ids.area})`, class: 'c-area' }));
      reveal.appendChild(s('path', { d, fill: 'none', style: `stroke: ${color}`, 'stroke-width': 5, 'stroke-linecap': 'round', filter: `url(#${ids.glow})`, class: 'c-glow' }));
    }
    if (points.some(p => p.trend != null)) {
      const td = smoothPath(points.filter(p => p.trend != null).map(p => [X(p.x), Y(p.trend)]));
      reveal.appendChild(s('path', { d: td, fill: 'none', 'stroke-width': 1.6, 'stroke-dasharray': '3 5', 'stroke-linecap': 'round', class: 'c-trend' }));
    }
    if (points.length <= 31) points.forEach((p, i) => {
      if (i === points.length - 1) return;
      reveal.appendChild(s('circle', { cx: r1(pts[i][0]), cy: r1(pts[i][1]), r: 3, class: 'c-dot', style: `fill: ${color}` }, s('title', {}, `${p.label || ''} ${fmt(p.y)}`.trim())));
    });
    if (pts.length > 1) svg.appendChild(s('path', { d, fill: 'none', style: `stroke: ${color}`, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1, class: 'c-line' }));
    if (goalTag) svg.appendChild(goalTag);

    // the latest reading: a glowing halo and its value; the scrubber moves both
    const guide = s('line', { y1: P.t - 10, y2: base, class: 'c-guide' });
    const mark = s('g', { class: 'c-mark' },
      s('g', { class: 'c-mark-in' },
        s('circle', { r: 12, class: 'c-halo', style: `fill: ${color}` }),
        s('circle', { r: 6.5, class: 'c-ring', style: `stroke: ${color}` }),
        s('circle', { r: 2.6, style: `fill: ${color}` })));
    const holder = s('g', { class: 'c-now' });
    svg.append(guide, mark, holder);
    geo = { pts, W, P, guide, mark, holder };
    point(points.length - 1, false);
  };

  // move the marker and its value to point i
  const point = (i, scrubbing) => {
    if (!geo) return;
    const [px, py] = geo.pts[i];
    geo.mark.setAttribute('transform', `translate(${r1(px)} ${r1(py)})`);
    geo.guide.setAttribute('x1', r1(px)); geo.guide.setAttribute('x2', r1(px));
    svg.classList.toggle('scrubbing', scrubbing);
    const p = points[i];
    const above = py - 30 >= 2;
    // in the left third the label reads rightwards from the point, so it never covers the y axis;
    // in the right third it reads leftwards; in between it centres over the point
    const { P, W } = geo, third = (W - P.l - P.r) / 3;
    const anchor = px < P.l + third ? 'start' : px > W - P.r - third ? 'end' : 'middle';
    const x = anchor === 'start' ? Math.max(P.l - 2, px - 12) : anchor === 'end' ? px + 12 : px;
    geo.holder.replaceChildren(tag(scrubbing && p.label ? `${fmt(p.y)} · ${shortDate(p.label)}` : fmt(p.y), { x, y: above ? py - 22 : py + 24, anchor, tone: 'ink', W }));
  };
  const nearest = e => {
    const b = svg.getBoundingClientRect();
    if (!geo || !b.width) return -1;
    const x = (e.clientX - b.left) * (geo.W / b.width);
    let best = 0;
    geo.pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(geo.pts[best][0] - x)) best = i; });
    return best;
  };
  svg.addEventListener('pointermove', e => { const i = nearest(e); if (i >= 0) { svg.classList.add('touched'); point(i, true); } });
  const reset = () => { if (geo && svg.classList.contains('scrubbing')) point(points.length - 1, false); };
  svg.addEventListener('pointerleave', reset);
  svg.addEventListener('pointercancel', reset);

  return fitWidth(svg, H, paint);
}

/** '2026-11-08' → '8 Nov'; anything else passes through. */
function shortDate(label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
  const [y, m, d] = label.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * bars: [{ v, label, short, color }] oldest first.
 * today: index of the bar to highlight (gets its value on top); -1 for none.
 */
export function barChart(bars, { height = 150, target, color = 'var(--accent)', label = 'Bar chart', today = -1, fmt = fmtInt } = {}) {
  const H = height;
  const svg = s('svg', { viewBox: `0 0 320 ${H}`, class: 'chart chart-bar', role: 'img', 'aria-label': label });
  if (!bars.length) { svg.style.height = H + 'px'; return svg; }
  const max = Math.max(target || 0, ...bars.map(b => b.v)) * 1.12 || 1;
  const n = bars.length;
  svg.style.setProperty('--bar-step', Math.min(45, 640 / n).toFixed(1) + 'ms');

  const paint = (W, still) => {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('still', still);
    const P = { l: 2, r: 2, t: 30, b: 24 };
    const base = H - P.b;
    const slot = (W - P.l - P.r) / n;
    const bw = clamp(slot * 0.62, 3, 24);
    const Y = v => P.t + (1 - v / max) * (base - P.t);
    svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: base + 0.5, y2: base + 0.5, class: 'grid base' }));
    const every = Math.max(1, Math.ceil(26 / slot));
    bars.forEach((b, i) => {
      const x = P.l + i * slot + (slot - bw) / 2, cx = r1(x + bw / 2);
      const fill = b.color || color;
      const isToday = i === today;
      if (b.v > 0) {
        const y = Math.min(Y(b.v), base - 2), r = Math.min(5, bw / 2, base - y);
        const d = `M${r1(x)} ${base}V${r1(y + r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + r)} ${r1(y)}H${r1(x + bw - r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + bw)} ${r1(y + r)}V${base}Z`;
        svg.appendChild(s('path', { d, class: 'c-bar' + (isToday ? ' today' : ''), style: `fill: ${fill}; --i:${i}` }, s('title', {}, `${b.label}: ${fmt(b.v)}`)));
      } else {
        // nothing logged: a quiet bead on the baseline, never a red bar
        svg.appendChild(s('rect', { x: r1(cx - Math.min(bw, 8) / 2), y: base - 4, width: r1(Math.min(bw, 8)), height: 3, rx: 1.5, class: 'c-stub', style: `--i:${i}` }, s('title', {}, `${b.label}: nothing logged`)));
      }
      const show = n <= 10 || i === n - 1 || (i % every === (n - 1) % every && n - 1 - i >= every);
      if (show) svg.appendChild(s('text', { x: cx, y: H - 6, class: 'axis' + (isToday ? ' now' : ''), 'text-anchor': 'middle' }, b.short || ''));
    });
    if (target) {
      const ty = r1(Y(target));
      svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: ty, y2: ty, class: 'goal-line' }));
      svg.appendChild(tag('target ' + fmt(target), { x: P.l, y: ty, anchor: 'start', tone: 'goal', W }));
    }
    // today's value floats above it and above any neighbour its label would cover
    const tb = bars[today];
    if (tb && tb.v > 0) {
      const text = fmt(tb.v), reach = Math.ceil(tagWidth(text) / 2 / slot);
      const near = bars.slice(Math.max(0, today - reach), today + reach + 1).map(b => Y(b.v));
      const cx = P.l + today * slot + slot / 2;
      svg.appendChild(tag(text, { x: cx, y: Math.max(12, Math.min(...near, base) - 16), tone: 'ink', W }));
    }
  };
  return fitWidth(svg, H, paint);
}

/**
 * parts: [{ v, color }]. opts: { label (accessible name), value, caption } —
 * value and caption are printed in the hole.
 */
export function donut(parts, size = 120, stroke = 18, { label, value, caption, gap = 3 } = {}) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const c = size / 2, r = c - stroke / 2, circ = 2 * Math.PI * r;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut',
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }) });
  const spin = s('g', { class: 'd-spin' });
  svg.appendChild(s('circle', { cx: c, cy: c, r: r1(r), fill: 'none', 'stroke-width': stroke, class: 'd-track' }));
  svg.appendChild(spin);
  const live = parts.filter(p => p.v > 0);
  let off = 0;
  parts.forEach((p, i) => {
    const len = (p.v / total) * circ;
    if (p.v <= 0) return;
    // round ends reach stroke/2 past each end of the dash, so pull them in to keep a clean gap
    const roundable = live.length > 1 ? len - gap - stroke > 1 : true;
    const dash = live.length === 1 ? circ : roundable ? len - gap - stroke : Math.max(0.5, len - gap);
    const start = live.length === 1 ? 0 : off + gap / 2 + (roundable ? stroke / 2 : 0);
    spin.appendChild(s('circle', {
      cx: c, cy: c, r: r1(r), fill: 'none', 'stroke-width': stroke, 'stroke-linecap': roundable && live.length > 1 ? 'round' : 'butt',
      'stroke-dasharray': `${r1(dash)} ${r1(circ)}`, 'stroke-dashoffset': r1(-start), transform: `rotate(-90 ${c} ${c})`,
      class: 'd-seg', style: `stroke: ${p.color}; --i:${i}; --circ:${r1(circ)}`,
    }));
    off += len;
  });
  if (value != null) {
    svg.appendChild(s('text', { x: c, y: caption ? c + 4 : c + 9, 'text-anchor': 'middle', class: 'd-value' }, String(value)));
    if (caption) svg.appendChild(s('text', { x: c, y: c + 22, 'text-anchor': 'middle', class: 'd-cap' }, caption));
  }
  return svg;
}
