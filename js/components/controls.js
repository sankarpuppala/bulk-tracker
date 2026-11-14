// =============================================================
// CONTROLS — segmented control, stepper, chip, empty state,
// confetti and the count-up number. Small builders; the only
// state they keep is presentational (where an indicator was, what
// a number last showed) so motion survives the app's re-renders.
// Re-exported from js/ui.js, so existing imports keep working.
// =============================================================
import { h, clamp, haptic } from '../util.js';
import { icon } from './icons.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Restart a one-shot CSS animation class (e.g. `num-tick`) on an element. `dir` sets --tick-dir (1 up, -1 down). */
export function numTick(el, dir = 1, cls = 'num-tick') {
  if (!el || calm()) return;
  el.style.setProperty('--tick-dir', dir < 0 ? -1 : 1);
  el.classList.remove(cls);
  void el.offsetWidth;            // a reflow, so the same class can play again
  el.classList.add(cls);
}

// ---------- sliding indicator (segmented control, week grid) ----------
// One element that glides to the active item. The app rebuilds a page on most
// changes, so the last move is remembered by `key`: a freshly built control whose
// selection just changed starts at the old item and glides to the new one.
const glideRecent = new Map();     // key -> { from, to, t }

/**
 * Give `wrap` a `.glide-thumb` that follows the item matching `activeSel`.
 * Sets --gx / --gy / --gw / --gh on the wrap and adds `.glide-live` once placed.
 * Returns `moveTo(index)` for click handlers that change selection in place.
 */
export function glide(wrap, { key, itemSel, activeSel, thumbCls = '' }) {
  const thumb = h('span', { class: ('glide-thumb ' + thumbCls).trim(), 'aria-hidden': 'true' });
  wrap.appendChild(thumb);
  const items = () => [...wrap.querySelectorAll(itemSel)];
  let at = '';                     // the geometry the thumb is (heading) at
  const place = (el, animate) => {
    if (!el || !el.offsetWidth) return false;          // not laid out yet; the observer calls again
    const g = [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
    if (g.join() === at) return true;                  // a resize that moved nothing: leave a glide in flight alone
    at = g.join();
    if (!animate) thumb.classList.add('glide-still');
    ['--gx', '--gy', '--gw', '--gh'].forEach((p, i) => wrap.style.setProperty(p, g[i] + 'px'));
    wrap.classList.add('glide-live');                  // before the reflow, so a rebuilt control doesn't fade its thumb in
    if (!animate) { void thumb.offsetWidth; thumb.classList.remove('glide-still'); }
    return true;
  };
  const recent = glideRecent.get(key);
  let pendingFrom = recent && performance.now() - recent.t < 1200 ? recent.from : -1;
  const sync = () => {
    const list = items(), on = wrap.querySelector(activeSel);
    if (!on) { wrap.classList.remove('glide-live'); at = ''; return; }
    const from = list[pendingFrom];
    if (from && from !== on && list.indexOf(on) === recent.to && place(from, false)) { void wrap.offsetWidth; place(on, true); }
    else place(on, false);
    if (on.offsetWidth) pendingFrom = -1;
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (!wrap.isConnected) { ro.disconnect(); return; } sync(); });
    ro.observe(wrap);
    // buttons change width when the web font arrives; watch them too
    requestAnimationFrame(() => items().forEach(b => ro.observe(b)));
  } else requestAnimationFrame(sync);
  // move = false only records the change, for controls whose callback rebuilds the page
  return (index, move = true) => {
    const list = items(), from = list.indexOf(wrap.querySelector(activeSel));
    glideRecent.set(key, { from, to: index, t: performance.now() });
    if (move && list[index]) place(list[index], true);
  };
}

/** Left / Right / Home / End move focus between the buttons of a tablist or radio row. */
function arrowKeys(wrap, itemSel) {
  wrap.addEventListener('keydown', e => {
    const list = [...wrap.querySelectorAll(itemSel)], i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i - 1 + list.length) % list.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    list[j].focus();
  });
}

// ---------- Controls ----------
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: 'seg ' + cls, role: 'tablist' });
  let moveTo = () => {};
  options.forEach((o, i) => {
    const b = h('button', { class: 'seg-btn' + (o.value === value ? ' on' : ''), role: 'tab', 'aria-selected': String(o.value === value), onclick: () => {
      moveTo(i);
      wrap.querySelectorAll('.seg-btn').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-selected', 'true');
      haptic(); onChange(o.value);
    } }, o.icon ? h('span', { class: 'seg-ic' }, o.icon) : null, h('span', { class: 'seg-l' }, o.label));
    wrap.appendChild(b);
  });
  moveTo = glide(wrap, { key: 'seg|' + cls + '|' + options.map(o => o.value).join('|'), itemSel: '.seg-btn', activeSel: '.seg-btn.on', thumbCls: 'seg-thumb' });
  arrowKeys(wrap, '.seg-btn');
  return wrap;
}

export function stepper(value, { min = 0, max = 99, step = 1, onChange, fmt = v => v } = {}) {
  let v = value;
  const out = h('span', { class: 'stepper-val num', 'aria-live': 'polite', 'aria-atomic': 'true' }, fmt(v));
  const wrap = h('div', { class: 'stepper' });
  const edge = () => { wrap.dataset.at = v <= min ? 'min' : v >= max ? 'max' : ''; };
  const set = nv => {
    const prev = v;
    v = Math.round(clamp(nv, min, max) * 100) / 100;
    out.textContent = fmt(v); haptic();
    if (v !== prev) numTick(out, v > prev ? 1 : -1);
    else numTick(out, nv > prev ? 1 : -1, 'at-limit');
    edge();
    onChange && onChange(v);
  };
  wrap.append(
    h('button', { class: 'stepper-btn', 'aria-label': 'Decrease', onclick: () => set(v - step) }, icon('minus', { size: 18, sw: 2.2 })),
    out,
    h('button', { class: 'stepper-btn', 'aria-label': 'Increase', onclick: () => set(v + step) }, icon('plus', { size: 18, sw: 2.2 })));
  edge();
  return wrap;
}

export function chip(label, { on = false, onclick, cls = '' } = {}) {
  return h('button', { class: 'chip ' + cls + (on ? ' on' : ''), onclick }, label);
}

/** art: any element (an icon(), an illustration, artMascot()) or text. */
export function emptyState(art, title, text, action) {
  const glyph = art instanceof Element && art.classList.contains('ico');
  return h('div', { class: 'empty' + (glyph ? ' is-glyph' : '') },
    art != null && h('div', { class: 'empty-ic ' + (glyph ? 'empty-glyph' : 'empty-art') }, art),
    h('div', { class: 'empty-t' }, title),
    text && h('p', { class: 'empty-p muted small' }, text),
    action && h('div', { class: 'empty-act' }, action));
}

// ---------- Confetti ----------
// Paper squares, dots and curling ribbons in the accent and the macro colours.
// They burst, then drift down with a little sway and flutter, and fade out.
const CONFETTI_TOKENS = ['--accent', '--accent-2', '--c-p', '--c-c', '--c-f', '--hue-snacks', '--hue-dinner', '--hue-breakfast', '--c-fib'];
function tokenColours() {
  const probe = h('i', { style: { position: 'fixed', opacity: '0', pointerEvents: 'none' } });
  document.body.appendChild(probe);
  const out = CONFETTI_TOKENS.map(t => { probe.style.color = `var(${t})`; return getComputedStyle(probe).color; }).filter(Boolean);
  probe.remove();
  return out.length ? out : ['rgb(255, 122, 46)'];
}

/** n pieces; `origin` (an element or {x, y} in CSS px) bursts from one point, otherwise two cannons fire from the lower corners. */
export function confetti(n = 90, { origin } = {}) {
  if (calm()) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  const colors = tokenColours();
  const rnd = (a, b) => a + Math.random() * (b - a);
  let pt = null;
  if (origin instanceof Element) { const r = origin.getBoundingClientRect(); pt = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  else if (origin && typeof origin.x === 'number') pt = origin;
  const ps = Array.from({ length: n }, (_, i) => {
    let x, y, ang, sp;
    if (pt) { x = pt.x * dpr; y = pt.y * dpr; ang = rnd(-Math.PI * 0.9, -Math.PI * 0.1); sp = rnd(9, 19); }
    else {
      // two cannons in the lower corners, aimed up and a little inward
      const left = i % 2 === 0;
      x = (left ? rnd(-0.02, 0.05) : rnd(0.95, 1.02)) * W; y = H * rnd(0.9, 1.02);
      ang = left ? rnd(-Math.PI * 0.46, -Math.PI * 0.28) : rnd(-Math.PI * 0.72, -Math.PI * 0.54); sp = rnd(24, 37);
    }
    const kind = Math.random();
    return {
      x, y, vx: Math.cos(ang) * sp * dpr, vy: Math.sin(ang) * sp * dpr,
      shape: kind < 0.5 ? 'paper' : kind < 0.78 ? 'dot' : 'ribbon',
      s: rnd(5, 9) * dpr, c: colors[(Math.random() * colors.length) | 0],
      rot: rnd(0, Math.PI * 2), vr: rnd(-0.16, 0.16), flip: rnd(0, Math.PI * 2), vf: rnd(0.08, 0.2),
      sway: rnd(0, Math.PI * 2), vs: rnd(0.03, 0.07), dx: rnd(0.95, 0.962), dy: rnd(0.972, 0.978), life: rnd(170, 230),
    };
  });
  const g = 0.32 * dpr, tMax = 250;
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of ps) {
      p.vx *= p.dx; p.vy = p.vy * p.dy + g;
      if (p.vy > 2.6 * dpr) p.vy = 2.6 * dpr;            // terminal velocity: paper floats, it does not fall
      p.sway += p.vs; p.rot += p.vr; p.flip += p.vf;
      p.x += p.vx + Math.sin(p.sway) * 0.9 * dpr; p.y += p.vy;
      const fade = Math.max(0, Math.min(1, (p.life - frame) / 30));
      if (fade <= 0 || p.y > H + 40) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
      if (p.shape === 'paper') { ctx.scale(1, Math.cos(p.flip)); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); }
      else if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.s * 0.38, 0, Math.PI * 2); ctx.fill(); }
      else {
        // a short curling streamer
        ctx.lineWidth = p.s * 0.32; ctx.lineCap = 'round'; ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const t = k / 6; const xx = (t - 0.5) * p.s * 2.4, yy = Math.sin(t * Math.PI * 2 + p.flip) * p.s * 0.45; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (++frame < tMax && alive) requestAnimationFrame(tick); else cv.remove();
  })();
}

// ---------- Animated number ----------
const countMemory = new Map();     // key -> the value the number last showed
const fmtIN = v => Math.round(v).toLocaleString('en-IN');

/**
 * Count `el` up (or down) to `to`. The third argument is either the duration in ms
 * (the old signature) or { key, ms, fmt }: with a `key`, the value is remembered
 * across re-renders, so a rebuilt number counts on from where it was instead of 0.
 */
export function countUp(el, to, opts = 700) {
  const o = typeof opts === 'number' ? { ms: opts } : (opts || {});
  const ms = o.ms ?? 700, fmt = o.fmt || fmtIN, key = o.key;
  const from = key != null && countMemory.has(key) ? countMemory.get(key) : (parseFloat(el.dataset.v || '0') || 0);
  el.dataset.v = to;
  if (key != null) countMemory.set(key, to);
  if (calm() || from === to) { el.textContent = fmt(to); return; }
  el.textContent = fmt(from);
  numTick(el, to > from ? 1 : -1);
  const t0 = performance.now();
  (function step(t) {
    if (t > t0 + 34 && !el.isConnected) return;        // a newer render took over
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    const now = from + (to - from) * e;
    el.textContent = fmt(k < 1 ? now : to);
    if (key != null) countMemory.set(key, k < 1 ? now : to);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
