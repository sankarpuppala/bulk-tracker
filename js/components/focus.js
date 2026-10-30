// =============================================================
// FOCUS CARD + PLATE LIST — the one card Today is built around,
// and the list of servings inside it.
// =============================================================
import { h, round } from '../util.js';
import { icon, mealIcon } from './icons.js';
import { dietDot } from './bits.js';

/** hue: a meal id ('breakfast'…) or null. Everything is optional except body. */
export function focusCard({ hue, glyph, eyebrow, title, meta, right, body, footer, id, cls = '' }) {
  return h('section', { class: `focus ${hue ? 'm-' + hue : ''} ${cls}`.trim(), id },
    h('div', { class: 'focus-h' },
      glyph && h('div', { class: 'focus-glyph' }, glyph),
      h('div', { class: 'grow' },
        eyebrow && h('div', { class: 'eyebrow' }, eyebrow),
        h('h2', { class: 'focus-t' }, title),
        meta && h('div', { class: 'focus-m' }, meta)),
      right),
    body,
    footer && h('div', { class: 'focus-f' }, footer));
}

export const mealGlyph = id => mealIcon(id, { size: 26, sw: 1.7 });

/**
 * rows: [{ name, cal, p, diet, servings, suggested }]
 * onStep(index, delta) / onAdd(index) are optional.
 */
export function plateList(rows, { onStep, onAdd } = {}) {
  return h('ul', { class: 'plist' }, rows.map((r, i) => h('li', { class: 'prow' + (r.suggested === false ? ' dim' : '') },
    dietDot(r.diet),
    h('div', { class: 'prow-main' },
      h('div', { class: 'prow-n' }, r.name),
      h('div', { class: 'prow-s num' }, `${round(r.cal * r.servings)} kcal · ${round(r.p * r.servings)} g protein`)),
    onStep && r.suggested !== false && h('div', { class: 'mini-step', role: 'group', 'aria-label': 'Servings of ' + r.name },
      h('button', { class: 'ms-btn', 'aria-label': 'Fewer ' + r.name, onclick: () => onStep(i, -0.5) }, icon('minus', { size: 16, sw: 2.2 })),
      h('span', { class: 'ms-v num' }, '×' + r.servings),
      h('button', { class: 'ms-btn', 'aria-label': 'More ' + r.name, onclick: () => onStep(i, 0.5) }, icon('plus', { size: 16, sw: 2.2 }))),
    onAdd && h('button', { class: 'icon-btn sm add', 'aria-label': 'Log ' + r.name, onclick: () => onAdd(i) }, icon('plus', { size: 16, sw: 2.4 })))));
}
