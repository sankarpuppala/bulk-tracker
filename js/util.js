// =============================================================
// SMALL HELPERS
// =============================================================

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Tiny DOM builder. Never uses innerHTML for strings, so anything
 * user-generated (names, menus from other users) is safe to render.
 * h('div', {class:'x', onclick: fn}, 'text', child, [more])
 */
export function h(tag, attrs, ...children) {
  const el = tag === 'svg' || attrs?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false || k === 'svg') continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** SVG element shortcut */
export function s(tag, attrs = {}, ...children) {
  return h(tag, { ...attrs, svg: true }, ...children);
}

export function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayKey = () => fmtDate(new Date());
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
export const weekdayOf = key => DAYS[parseKey(key).getDay()];
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}
export function labelForKey(key) {
  const t = todayKey();
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  if (key === addDays(t, 1)) return 'Tomorrow';
  return parseKey(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const round = (n, d = 0) => { const m = 10 ** d; return Math.round((+n || 0) * m) / m; };
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const fmtNum = n => Math.round(n || 0).toLocaleString('en-IN');

export function timeToMin(t) {
  const [hh, mm] = String(t || '0:0').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}
export function minToTime(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
export function prettyTime(t) {
  const m = timeToMin(t);
  const hh = Math.floor(m / 60), mm = m % 60;
  return ((hh % 12) || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + (hh < 12 ? ' am' : ' pm');
}
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function haptic(ms = 8) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not supported */ }
}

export function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Up late';
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

export function download(filename, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota / private mode */ }
}
export function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
