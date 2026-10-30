// =============================================================
// FOOD RULES — allergies, diet patterns and fasting (Phase 8).
// Hard filters: once set, no plate, top-up, alternative, verdict or
// photo result will offer a food that breaks them.
// =============================================================
import { h, todayKey, addDays } from '../util.js';
import { toast } from '../ui.js';
import { store } from '../store.js';
import { card, cardHead } from './common.js';
import { ALLERGENS } from '../engine/allergens.js';
import { DIET_TAGS } from '../engine/diet.js';
import { FAST_MODES, activeFast } from '../engine/fasting.js';

const toggle = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

export function foodRulesCard() {
  const pf = store.profile;
  const fast = activeFast(pf, todayKey());
  const chip = (label, on, fn, title) => h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), title, onclick: fn }, label);
  const setFast = (mode, days) => {
    if (!mode) return store.saveProfile({ fasting: null });
    store.saveProfile({ fasting: { mode, ...(days ? { until: addDays(todayKey(), days - 1) } : {}), ...(mode === 'if16' ? { window: pf.fasting?.window || ['12:00', '20:00'] } : {}) } });
    toast(`${FAST_MODES.find(m => m.id === mode).label} on${days ? ' for ' + days + (days === 1 ? ' day' : ' days') : ''}`);
  };
  const win = fast?.mode === 'if16' ? fast.window || ['12:00', '20:00'] : null;
  const time = i => h('input', {
    class: 'input xs', type: 'time', value: win[i], 'aria-label': i ? 'Eating window ends' : 'Eating window starts',
    onchange: e => { const w = [...win]; w[i] = e.target.value; if (w[0] < w[1]) store.saveProfile({ fasting: { ...fast, window: w } }); else toast('The window must end after it starts', 'warn'); },
  });

  return card('',
    cardHead('Food rules', null, 'Hard filters: nothing that breaks them is ever suggested'),
    h('div', { class: 'field' }, h('label', null, 'Allergies & intolerances'),
      h('div', { class: 'chip-row' }, Object.entries(ALLERGENS).map(([id, a]) => chip(a.label, (pf.allergies || []).includes(id), () => store.saveProfile({ allergies: toggle(pf.allergies || [], id) }))))),
    h('div', { class: 'field' }, h('label', null, 'Diet pattern'),
      h('div', { class: 'chip-row' }, DIET_TAGS.map(t => chip(t.label, (pf.dietTags || []).includes(t.id), () => store.saveProfile({ dietTags: toggle(pf.dietTags || [], t.id) }), t.sub)))),
    h('div', { class: 'field' }, h('label', null, 'Fasting'),
      h('div', { class: 'chip-row' },
        chip('Not fasting', !fast, () => setFast(null)),
        FAST_MODES.map(m => chip(m.label, fast?.mode === m.id, () => setFast(m.id, m.id === 'navratri' ? 9 : m.id === 'ekadashi' ? 1 : m.id === 'ramadan' ? 30 : 0), m.sub))),
      fast && h('p', { class: 'tiny muted' }, FAST_MODES.find(m => m.id === fast.mode).sub + (fast.until ? `. Until ${fast.until}.` : '.') + ' Targets stay the same: the day is fitted into the meals you’re eating.'),
      win && h('div', { class: 'row gap' }, h('span', { class: 'tiny muted' }, 'Eat between'), time(0), h('span', { class: 'tiny muted' }, 'and'), time(1))),
    h('p', { class: 'tiny muted' }, 'Allergen and diet-pattern checks read food names and are a safety net, not a guarantee. Always check labels and ask about ingredients.'));
}
