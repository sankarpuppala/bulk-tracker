// =============================================================
// UI PRIMITIVES — toasts, sheets, rings, charts, confetti
// =============================================================
import { h, s, clamp, haptic, fill } from './util.js';
import { icon } from './components/icons.js';

// ---------- Toasts ----------
export function toast(msg, type = 'ok', action) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast ' + type, role: 'status' },
    h('span', null, msg),
    action && h('button', { class: 'toast-act', onclick: () => { action.fn(); el.remove(); } }, action.label));
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), action ? 4200 : 2400);
  setTimeout(() => el.remove(), action ? 4600 : 2800);
}

// ---------- Bottom sheet / modal ----------
let openSheets = [];
export function sheet({ title, sub, body, wide = false, onClose }) {
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.add('closing');
    openSheets = openSheets.filter(x => x !== api);
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === api) close(); };
  const content = h('div', { class: 'sheet-body' });
  const panel = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div', { class: 'sheet-grip' }),
    title && h('div', { class: 'sheet-head' },
      h('div', null, h('h3', null, title), sub && h('p', { class: 'muted small' }, sub)),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', { size: 18 }))),
    content);
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onclick: close }), panel);
  if (body) content.appendChild(body);
  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey);
  // drag-to-dismiss on the grip
  let startY = null;
  panel.querySelector('.sheet-grip').addEventListener('pointerdown', e => { startY = e.clientY; panel.setPointerCapture(e.pointerId); });
  panel.addEventListener('pointermove', e => { if (startY != null) panel.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`; });
  panel.addEventListener('pointerup', e => {
    if (startY == null) return;
    const dy = e.clientY - startY; startY = null; panel.style.transform = '';
    if (dy > 90) close();
  });
  const api = { close, content, panel, set(node) { fill(content, node); } };
  openSheets.push(api);
  return api;
}

export function confirmSheet(message, { ok = 'Confirm', danger = false, detail } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); sh.close(); };
    const sh = sheet({
      title: message,
      body: h('div', { class: 'stack' },
        detail && h('p', { class: 'muted' }, detail),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost grow', onclick: () => finish(false) }, 'Cancel'),
          h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, ok))),
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

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

// ---------- Controls ----------
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: 'seg ' + cls, role: 'tablist' });
  options.forEach(o => {
    const b = h('button', { class: 'seg-btn' + (o.value === value ? ' on' : ''), role: 'tab', 'aria-selected': String(o.value === value), onclick: () => {
      wrap.querySelectorAll('.seg-btn').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-selected', 'true');
      haptic(); onChange(o.value);
    } }, o.icon ? h('span', { class: 'seg-ic' }, o.icon) : null, o.label);
    wrap.appendChild(b);
  });
  return wrap;
}

export function stepper(value, { min = 0, max = 99, step = 1, onChange, fmt = v => v } = {}) {
  let v = value;
  const out = h('span', { class: 'stepper-val' }, fmt(v));
  const set = nv => { v = Math.round(clamp(nv, min, max) * 100) / 100; out.textContent = fmt(v); haptic(); onChange && onChange(v); };
  return h('div', { class: 'stepper' },
    h('button', { class: 'stepper-btn', 'aria-label': 'Decrease', onclick: () => set(v - step) }, '−'),
    out,
    h('button', { class: 'stepper-btn', 'aria-label': 'Increase', onclick: () => set(v + step) }, '+'));
}

export function chip(label, { on = false, onclick, cls = '' } = {}) {
  return h('button', { class: 'chip ' + cls + (on ? ' on' : ''), onclick }, label);
}

export function emptyState(icon, title, text, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-ic' }, icon),
    h('div', { class: 'empty-t' }, title),
    text && h('p', { class: 'muted small' }, text),
    action);
}

// ---------- Confetti ----------
export function confetti(n = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = h('canvas', { class: 'confetti' });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const colors = ['#FF7A2E', '#FFB020', '#FF5C7A', '#34C77B', '#7C8BFF', '#F8F1E6'];
  const ps = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 18 * devicePixelRatio,
    vy: (-Math.random() * 16 - 6) * devicePixelRatio, r: (Math.random() * 6 + 4) * devicePixelRatio,
    c: colors[(Math.random() * colors.length) | 0], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
  }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.vy += 0.5 * devicePixelRatio; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    });
    if (++frame < 140) requestAnimationFrame(tick); else cv.remove();
  })();
}

// Animated number count-up
export function countUp(el, to, ms = 700) {
  const from = parseFloat(el.dataset.v || '0') || 0;
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { el.textContent = Math.round(to).toLocaleString('en-IN'); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-IN');
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
