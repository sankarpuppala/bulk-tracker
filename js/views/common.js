// Shared bits for page headers
import { h } from '../util.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';

const SYNC_LABEL = { guest: 'On this device', ok: 'Synced', syncing: 'Syncing…', offline: 'Offline — will sync' };
const syncState = () => (store.mode === 'guest' ? 'guest' : store.syncState);

/** The steel avatar with its accent ring; a small dot on the ring says how syncing is going (none for guests). */
export function avatar(size = 44) {
  const name = store.profile.name || store.user?.displayName || '?';
  const st = syncState();
  return h('button', { class: 'avatar', style: { width: size + 'px', height: size + 'px' }, 'aria-label': 'You: profile and settings', title: SYNC_LABEL[st], onclick: () => ctx.go('you') },
    name.trim().charAt(0).toUpperCase() || '?',
    st !== 'guest' && h('i', { class: 'av-dot ' + st, 'aria-hidden': 'true' }));
}

export function syncPill() {
  const st = syncState();
  const label = SYNC_LABEL[st];
  return h('span', { class: 'sync ' + st, title: label }, h('i'), label);
}

/** The page header: eyebrow, title, then whatever goes before the avatar. `embedded` pages (menus, training inside Plan) skip it. */
export function pageHead(eyebrow, title, right) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'ph-main' }, h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'page-t' }, title)),
    h('div', { class: 'row gap ph-side' }, right, avatar()));
}

export function card(cls, ...children) {
  return h('section', { class: 'card ' + (cls || '') }, ...children);
}

export function cardHead(title, right, sub) {
  return h('div', { class: 'card-h' }, h('div', null, h('h2', { class: 'card-t' }, title), sub && h('div', { class: 'tiny muted' }, sub)), right);
}

export function bar(value, max, color) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return h('div', { class: 'bar' + (value > max * 1.05 ? ' over' : '') }, h('i', { style: { width: pct + '%', background: color } }));
}
