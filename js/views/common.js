// Shared bits for page headers
import { h } from '../util.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';

export function avatar(size = 38) {
  const name = store.profile.name || store.user?.displayName || '?';
  return h('button', { class: 'avatar', style: { width: size + 'px', height: size + 'px' }, 'aria-label': 'Profile & settings', onclick: () => ctx.go('me') },
    name.trim().charAt(0).toUpperCase() || '🙂');
}

export function syncPill() {
  const st = store.mode === 'guest' ? 'guest' : store.syncState;
  const label = { guest: 'On this device', ok: 'Synced', syncing: 'Syncing…', offline: 'Offline — will sync' }[st];
  return h('span', { class: 'sync ' + st, title: label }, h('i'), label);
}

export function pageHead(eyebrow, title, right) {
  return h('header', { class: 'page-head' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'page-t' }, title)),
    h('div', { class: 'row gap' }, right, avatar()));
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
