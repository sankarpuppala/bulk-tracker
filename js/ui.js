// =============================================================
// UI — overlays: toasts, bottom sheets, confirm dialogs.
// Charts live in components/charts.js and controls in
// components/controls.js; both are re-exported here so every
// existing `import { … } from '../ui.js'` keeps working.
//
// Sheets are modal dialogs: focus moves in on open, Tab is kept
// inside, Escape / the backdrop / a downward drag close them, the
// page behind is made inert, and focus goes back where it came
// from. Entry and exit are CSS (@starting-style) in css/sheets.css.
// =============================================================
import { h, fill, clamp } from './util.js';
import { icon } from './components/icons.js';

export * from './components/charts.js';
export * from './components/controls.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => matchMedia('(min-width: 900px)').matches;
let seq = 0;

// ---------- Toasts ----------
const TOAST_ICON = { ok: 'check', warn: 'alert', err: 'x' };
const TOAST_EXIT = 340;

export function toast(msg, type = 'ok', action, iconNode = null) {
  const host = document.getElementById('toasts');
  if (!host) return;
  let left = type === 'unlock' ? 5600 : action ? 4200 : 2400, timer = null, started = 0, gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true; clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), reduced() ? 0 : TOAST_EXIT);
  };
  const run = () => { started = Date.now(); clearTimeout(timer); timer = setTimeout(dismiss, left); };
  // hovering or focusing a toast holds it, so an Undo is never snatched away mid-reach
  const hold = () => { if (gone || timer == null) return; clearTimeout(timer); timer = null; left = Math.max(1400, left - (Date.now() - started)); };
  const resume = () => { if (!gone && timer == null) run(); };

  const el = h('div', { class: 'toast ' + type, role: type === 'err' ? 'alert' : 'status' },
    h('span', { class: 'toast-ic', 'aria-hidden': 'true' }, iconNode || icon(TOAST_ICON[type] || 'info', { size: 14, sw: 2.6 })),
    h('span', { class: 'toast-msg' }, msg),
    action && h('button', { class: 'toast-act', onclick: () => { action.fn(); dismiss(); } },
      /undo/i.test(action.label) && icon('undo', { size: 14, sw: 2.2 }), action.label));
  el.addEventListener('pointerenter', hold);
  el.addEventListener('pointerleave', resume);
  el.addEventListener('focusin', hold);
  el.addEventListener('focusout', resume);

  // swipe sideways to dismiss
  let sx = null;
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) { sx = e.clientX; el.setPointerCapture(e.pointerId); el.classList.add('dragging'); } });
  el.addEventListener('pointermove', e => { if (sx != null) el.style.translate = `${e.clientX - sx}px 0`; });
  const release = e => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null;
    el.classList.remove('dragging'); el.style.translate = '';
    if (Math.abs(dx) > 70) { el.style.setProperty('--toast-fling', (dx > 0 ? 1 : -1) * 120 + 'px'); dismiss(); }
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  host.appendChild(el);
  // keep the pile short: the oldest leaves when a fourth arrives
  const live = [...host.querySelectorAll('.toast:not(.out)')];
  if (live.length > 3) live[0].dispatchEvent(new CustomEvent('toast:dismiss'));
  el.addEventListener('toast:dismiss', dismiss);
  run();
}

// ---------- Bottom sheet / modal ----------
let openSheets = [];
const madeInert = new Set();
const NOT_PAGE = new Set(['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'CANVAS']);
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary';

/** Everything behind the top sheet is inert; toasts stay reachable so Undo still works. */
function syncInert() {
  const top = openSheets[openSheets.length - 1];
  const want = new Set();
  if (top) for (const el of document.body.children) {
    if (el === top.wrap || el.id === 'toasts' || NOT_PAGE.has(el.tagName)) continue;
    want.add(el);
  }
  for (const el of [...madeInert]) if (!want.has(el)) { el.inert = false; madeInert.delete(el); }
  for (const el of want) if (!madeInert.has(el) && !el.inert) { el.inert = true; madeInert.add(el); }
  document.documentElement.classList.toggle('sheet-open', !!top);
}

/** Apple's rubber-band curve: the further you pull, the harder it gets. */
const rubber = (d, dim = 120) => (1 - 1 / ((d * 0.55) / dim + 1)) * dim;

export function sheet({ title, sub, body, wide = false, onClose, footer, lead, cls = '' }) {
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const id = 'sheet-' + (++seq);
  let closed = false;

  const close = () => {
    if (closed || !wrap.isConnected) return;
    closed = true;
    wrap.classList.add('closing');
    openSheets = openSheets.filter(x => x !== api);
    document.removeEventListener('keydown', onKey);
    syncInert();
    // focus goes back to whatever opened the sheet, or to the sheet underneath
    const under = openSheets[openSheets.length - 1];
    try {
      if (opener && opener.isConnected && !wrap.contains(opener) && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
      else if (under) under.panel.focus({ preventScroll: true });
      else if (wrap.contains(document.activeElement)) document.activeElement.blur();
    } catch { /* focus is best-effort */ }
    setTimeout(() => wrap.remove(), reduced() ? 0 : 340);
    onClose && onClose();
  };

  const trap = e => {
    const els = [...panel.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden && el.getClientRects().length && !el.closest('[inert]'));
    if (!els.length) { e.preventDefault(); panel.focus(); return; }
    const first = els[0], last = els[els.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel || !panel.contains(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !panel.contains(at))) { e.preventDefault(); first.focus(); }
  };
  const onKey = e => {
    if (openSheets[openSheets.length - 1] !== api) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') trap(e);
  };

  const content = h('div', { class: 'sheet-body' });
  const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  const head = title ? h('div', { class: 'sheet-head' },
    lead ? h('div', { class: 'sheet-lead' }, lead) : null,
    h('div', { class: 'sheet-titles' },
      h('h2', { class: 'sheet-title', id: id + '-t' }, title),
      sub && h('p', { class: 'sheet-sub', id: id + '-s' }, sub)),
    h('button', { class: 'icon-btn sheet-x', 'aria-label': 'Close', onclick: close }, icon('x', { size: 18, sw: 2.2 }))) : null;
  const foot = footer ? h('div', { class: 'sheet-foot' }, footer) : null;
  const panel = h('div', {
    class: 'sheet' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') + (foot ? ' has-foot' : ''),
    role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
    'aria-label': title ? null : 'Dialog', 'aria-labelledby': title ? id + '-t' : null, 'aria-describedby': title && sub ? id + '-s' : null,
  }, grip, head, content, foot);
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: close });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, panel);
  if (body) content.appendChild(body);
  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey);

  // the page behind never scrolls under a wheel that lands on the overlay
  wrap.addEventListener('wheel', e => { if (!e.target.closest('.sheet-body')) e.preventDefault(); }, { passive: false });

  // ---- drag to dismiss: rubber-bands upward, follows the finger down, a flick closes ----
  let drag = null;
  const dragStart = y => {
    drag = { y0: y, dy: 0, pts: [[y, performance.now()]], h: panel.offsetHeight || 1 };
    wrap.classList.add('dragging');
  };
  const dragMove = y => {
    const dy = y - drag.y0;
    drag.dy = dy;
    drag.pts.push([y, performance.now()]);
    if (drag.pts.length > 8) drag.pts.shift();
    panel.style.translate = `0 ${dy >= 0 ? dy : -rubber(-dy)}px`;
    backdrop.style.opacity = String(clamp(1 - Math.max(0, dy) / drag.h, 0.2, 1));
  };
  const dragEnd = () => {
    const d = drag; drag = null;
    if (!d) return;
    const [y1, t1] = d.pts[d.pts.length - 1];
    const [y0, t0] = d.pts.find(([, t]) => t1 - t < 110) || d.pts[0];
    const v = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;          // px per ms, + is downward
    wrap.classList.remove('dragging');
    panel.style.translate = ''; backdrop.style.opacity = '';
    if (d.dy > Math.min(160, d.h * 0.3) || (v > 0.5 && d.dy > 10)) close();
  };
  // the grip and the header are handles for mouse, pen and touch
  const handleDown = e => {
    if (e.button !== 0 || isDesktop() || closed || e.target.closest('button, a, input, textarea, select')) return;
    dragStart(e.clientY);
    panel.setPointerCapture(e.pointerId);
  };
  grip.addEventListener('pointerdown', handleDown);
  head?.addEventListener('pointerdown', handleDown);
  panel.addEventListener('pointermove', e => { if (drag && !drag.touch) dragMove(e.clientY); });
  panel.addEventListener('pointerup', () => { if (drag && !drag.touch) dragEnd(); });
  panel.addEventListener('pointercancel', () => { if (drag && !drag.touch) dragEnd(); });
  // the body joins in when it is scrolled to the top and the finger pulls down (like iOS)
  let touch = null;
  content.addEventListener('touchstart', e => {
    touch = null;
    if (e.touches.length !== 1 || isDesktop() || closed || e.target.closest('input, textarea, select, video, .chip-scroll, [data-no-drag]')) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false };
  }, { passive: true });
  content.addEventListener('touchmove', e => {
    if (!touch) return;
    const t = e.touches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (!touch.on) {
      if (content.scrollTop > 0 || dy <= 0 || Math.abs(dx) > Math.abs(dy)) { touch = null; return; }
      touch.on = true; dragStart(t.clientY); drag.touch = true;
    }
    if (e.cancelable) e.preventDefault();
    dragMove(t.clientY);
  }, { passive: false });
  const touchEnd = () => { if (touch?.on) dragEnd(); touch = null; };
  content.addEventListener('touchend', touchEnd);
  content.addEventListener('touchcancel', touchEnd);

  const api = { close, content, panel, wrap, set(node) { fill(content, node); } };
  openSheets.push(api);
  syncInert();
  try { panel.focus({ preventScroll: true }); } catch { /* old browsers */ }
  return api;
}

/**
 * A small sliding highlight for a segmented control (decorative). The
 * active option's box is copied into custom properties; CSS decides
 * whether that is a pill, an underline or a hue wash. Returns `place`,
 * to call after changing the selection in code.
 */
export function glide(seg) {
  const ink = h('span', { class: 'seg-glide', 'aria-hidden': 'true' });
  seg.prepend(ink);
  seg.classList.add('has-glide');
  const place = (instant = false) => {
    const on = seg.querySelector('.seg-btn.on');
    if (!on || !on.offsetWidth) return;
    if (instant) seg.classList.add('glide-still');
    ink.style.setProperty('--gx', on.offsetLeft + 'px');
    ink.style.setProperty('--gy', on.offsetTop + 'px');
    ink.style.setProperty('--gw', on.offsetWidth + 'px');
    ink.style.setProperty('--gh', on.offsetHeight + 'px');
    if (instant) { void ink.offsetWidth; requestAnimationFrame(() => seg.classList.remove('glide-still')); }
  };
  seg.addEventListener('click', e => { if (e.target.closest('.seg-btn')) place(); });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => place(true));
    ro.observe(seg);
    seg.querySelectorAll('.seg-btn').forEach(b => ro.observe(b));
  }
  requestAnimationFrame(() => place(true));
  return place;
}

export function confirmSheet(message, { ok = 'Confirm', danger = false, detail } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); sh.close(); };
    const sh = sheet({
      title: message,
      cls: 'confirm' + (danger ? ' is-danger' : ''),
      lead: danger ? h('span', { class: 'confirm-mark' }, icon('alert', { size: 20, sw: 2.2 })) : null,
      body: detail ? h('p', { class: 'confirm-detail' }, detail) : null,
      footer: h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, danger && icon('trash', { size: 16, sw: 2 }), ok)),
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}
