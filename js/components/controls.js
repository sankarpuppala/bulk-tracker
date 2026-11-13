// =============================================================
// CONTROLS — segmented control, stepper, chip, empty state,
// confetti and the count-up number. Small, stateless builders.
// Re-exported from js/ui.js, so existing imports keep working.
// =============================================================
import { h, clamp, haptic } from '../util.js';

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
