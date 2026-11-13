// =============================================================
// CHARTS — rings, line, bar and donut charts as inline SVG.
// Pure DOM builders: data in, <svg> out. No layout, no state.
// Re-exported from js/ui.js, so `import { lineChart } from '../ui.js'`
// keeps working everywhere.
// =============================================================
import { s, clamp } from '../util.js';

// ---------- Activity rings ----------
// rings: [{value, max, color, track}] outermost first
export function rings(list, size = 200, stroke = 16, gap = 4) {
  const c = size / 2;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'rings', 'aria-hidden': 'true' });
  list.forEach((r, i) => {
    const rad = c - stroke / 2 - i * (stroke + gap);
    if (rad <= 0) return;
    const circ = 2 * Math.PI * rad;
    const pct = r.max > 0 ? r.value / r.max : 0;
    const shown = clamp(pct, 0, 1);
    svg.appendChild(s('circle', { cx: c, cy: c, r: rad, fill: 'none', stroke: r.color, 'stroke-opacity': '0.16', 'stroke-width': stroke }));
    const arc = s('circle', {
      cx: c, cy: c, r: rad, fill: 'none', stroke: r.color, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': circ, 'stroke-dashoffset': circ, transform: `rotate(-90 ${c} ${c})`, class: 'ring-arc',
    });
    svg.appendChild(arc);
    requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', circ * (1 - shown))));
    if (pct > 1) {
      // overflow lap drawn on top with a darker tone
      const over = s('circle', {
        cx: c, cy: c, r: rad, fill: 'none', stroke: r.over || r.color, 'stroke-width': stroke * 0.5, 'stroke-linecap': 'round',
        'stroke-dasharray': `${circ * clamp(pct - 1, 0, 1)} ${circ}`, transform: `rotate(-90 ${c} ${c})`, opacity: '0.9',
      });
      svg.appendChild(over);
    }
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
 */
export function lineChart(points, { height = 160, color = 'var(--accent)', goal, fmt = v => v, yPad = 1, label = 'Trend chart', lines = [], bands = [], ticks = [] } = {}) {
  const W = 320, H = height, P = { l: 38, r: 12, t: 22, b: ticks.length ? 24 : 20 };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  const extra = lines.flatMap(l => l.points);
  if (points.length === 0 && extra.length === 0) return svg;
  const ys = points.map(p => p.y).concat(extra.map(p => p.y), goal != null ? [goal] : []);
  let min = Math.min(...ys) - yPad, max = Math.max(...ys) + yPad;
  if (max - min < 1) { max += 1; min -= 1; }
  const xs = points.map(p => p.x).concat(extra.map(p => p.x), bands.flatMap(b => [b.x0, b.x1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1;
  const X = x => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const Y = y => P.t + (1 - (y - min) / (max - min)) * (H - P.t - P.b);
  bands.forEach(b => svg.appendChild(s('rect', { x: X(b.x0), y: P.t, width: Math.max(1, X(b.x1) - X(b.x0)), height: H - P.t - P.b, class: 'band ' + b.kind })));
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    svg.appendChild(s('text', { x: 2, y: Y(v) + 3, class: 'axis' }, fmt(v)));
  }
  ticks.forEach((t, i) => svg.appendChild(s('text', { x: X(t.x), y: H - 4, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle' }, t.label)));
  if (goal != null) {
    svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: Y(goal), y2: Y(goal), class: 'goal-line' }));
    svg.appendChild(s('text', { x: W - P.r - 2, y: Y(goal) - 4, class: 'axis', 'text-anchor': 'end' }, 'goal ' + fmt(goal)));
  }
  lines.forEach(l => {
    if (l.points.length < 2) return;
    const d = l.points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    svg.appendChild(s('path', { d, fill: 'none', stroke: l.color || 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': l.dashed ? '6 4' : null, 'stroke-opacity': l.dashed ? '0.7' : '1', class: 'plan-line' }, l.label ? s('title', {}, l.label) : null));
  });
  if (points.length === 0) return svg;
  const d = points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  const area = d + ` L ${X(points[points.length - 1].x)} ${H - P.b} L ${X(points[0].x)} ${H - P.b} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  svg.appendChild(s('defs', {}, s('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 },
    s('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.35' }),
    s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }))));
  svg.appendChild(s('path', { d: area, fill: `url(#${gid})` }));
  svg.appendChild(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'draw' }));
  if (points.some(p => p.trend != null)) {
    const td = points.filter(p => p.trend != null).map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.trend).toFixed(1)).join(' ');
    svg.appendChild(s('path', { d: td, fill: 'none', stroke: 'var(--ink)', 'stroke-opacity': '0.5', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
  }
  points.forEach(p => svg.appendChild(s('circle', { cx: X(p.x), cy: Y(p.y), r: 2.6, fill: color }, s('title', {}, `${p.label || ''} ${fmt(p.y)}`))));
  // the latest reading gets a halo and its value
  const last = points[points.length - 1];
  svg.appendChild(s('circle', { cx: X(last.x), cy: Y(last.y), r: 6, fill: 'var(--card)', stroke: color, 'stroke-width': 3 }));
  svg.appendChild(s('text', { x: X(last.x) - 9, y: Y(last.y) - 11, class: 'axis now', 'text-anchor': 'end' }, fmt(last.y)));
  return svg;
}

export function barChart(bars, { height = 150, target, color = 'var(--accent)', label = 'Bar chart' } = {}) {
  const W = 320, H = height, P = { l: 4, r: 4, t: 10, b: 18 };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  if (!bars.length) return svg;
  const max = Math.max(target || 0, ...bars.map(b => b.v)) * 1.1 || 1;
  const bw = (W - P.l - P.r) / bars.length;
  const Y = v => P.t + (1 - v / max) * (H - P.t - P.b);
  bars.forEach((b, i) => {
    const x = P.l + i * bw + bw * 0.18, w = bw * 0.64;
    const y = Y(b.v);
    const fill = b.color || color;
    svg.appendChild(s('rect', { x, y, width: w, height: Math.max(0, H - P.b - y), rx: Math.min(4, w / 2), fill, class: 'cbar', style: `animation-delay:${i * 8}ms` },
      s('title', {}, `${b.label}: ${Math.round(b.v)}`)));
    if (bars.length <= 16 || i % 2 === 0) svg.appendChild(s('text', { x: x + w / 2, y: H - 4, class: 'axis', 'text-anchor': 'middle' }, b.short || ''));
  });
  if (target) {
    svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: Y(target), y2: Y(target), class: 'goal-line' }));
  }
  return svg;
}

export function donut(parts, size = 120, stroke = 18) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const c = size / 2, r = c - stroke / 2, circ = 2 * Math.PI * r;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut' });
  let off = 0;
  parts.forEach(p => {
    const len = (p.v / total) * circ;
    svg.appendChild(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: p.color, 'stroke-width': stroke, 'stroke-dasharray': `${Math.max(0, len - 2)} ${circ}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})` }));
    off += len;
  });
  return svg;
}
