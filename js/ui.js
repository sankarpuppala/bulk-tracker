// =============================================================
// UI — overlays: toasts, bottom sheets, confirm dialogs.
// Charts live in components/charts.js and controls in
// components/controls.js; both are re-exported here so every
// existing `import { … } from '../ui.js'` keeps working.
// =============================================================
import { h, fill } from './util.js';
import { icon } from './components/icons.js';

export * from './components/charts.js';
export * from './components/controls.js';

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
