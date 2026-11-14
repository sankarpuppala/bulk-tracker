// =============================================================
// FOOD RULES — allergies, diet patterns and fasting (Phase 8).
// Hard filters: once set, no plate, top-up, alternative, verdict or
// photo result will offer a food that breaks them.
// =============================================================
import { h, todayKey, addDays } from '../util.js';
import { toast } from '../ui.js';
import { store } from '../store.js';
import { card } from './common.js';
import { ALLERGENS } from '../engine/allergens.js';
import { DIET_TAGS } from '../engine/diet.js';
import { FAST_MODES, activeFast } from '../engine/fasting.js';
import { artSpices, artMoon } from '../components/art.js';
import { glyph, setHead, touch, fresh } from './privacy.js';

const toggle = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
const MARK = { allergy: 'ban', diet: 'check', fast: 'moon' };
let gid = 0;

export function foodRulesCard() {
  const pf = store.profile;
  const fast = activeFast(pf, todayKey());
  // kind: allergy (never suggest) · diet (follow this) · fast (one at a time). The mark says which, not just the colour.
  const chip = (kind, key, label, on, fn, title) => h('button', {
    class: `chip rule ${kind}` + (on ? ' on' : '') + (on && fresh('rule:' + key) ? ' just' : ''), 'aria-pressed': String(on), title,
    onclick: () => { touch('rule:' + key); fn(); },
  }, h('span', { class: 'rule-mark', 'aria-hidden': 'true' }, glyph(MARK[kind], { size: 14, sw: 2.2 })), label);
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
  const group = (label, hint, ...kids) => {
    const id = 'rg' + ++gid;
    return h('div', { class: 'rule-group', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'rule-l' }, h('span', { id }, label), hint && h('span', { class: 'rule-hint' }, hint)), ...kids);
  };
  const al = pf.allergies || [], tags = pf.dietTags || [];

  const el = card('set rules',
    setHead('shield', 'Food rules', 'Hard filters: nothing that breaks them is ever suggested', h('div', { class: 'rules-art' }, artSpices(68))),
    group('Allergies & intolerances', 'Never suggested',
      h('div', { class: 'chip-row' }, Object.entries(ALLERGENS).map(([id, a]) => chip('allergy', 'a:' + id, a.label, al.includes(id), () => store.saveProfile({ allergies: toggle(pf.allergies || [], id) }))))),
    group('Diet pattern', 'Always followed',
      h('div', { class: 'chip-row' }, DIET_TAGS.map(t => chip('diet', 'd:' + t.id, t.label, tags.includes(t.id), () => store.saveProfile({ dietTags: toggle(pf.dietTags || [], t.id) }), t.sub)))),
    group('Fasting', 'One at a time',
      h('div', { class: 'chip-row' },
        chip('fast', 'f:none', 'Not fasting', !fast, () => setFast(null)),
        FAST_MODES.map(m => chip('fast', 'f:' + m.id, m.label, fast?.mode === m.id, () => setFast(m.id, m.id === 'navratri' ? 9 : m.id === 'ekadashi' ? 1 : m.id === 'ramadan' ? 30 : 0), m.sub))),
      fast && h('div', { class: 'fast-note' },
        h('span', { class: 'fast-art' }, artMoon(44)),
        h('div', { class: 'stack-xs' },
          h('p', { class: 'small' }, FAST_MODES.find(m => m.id === fast.mode).sub + (fast.until ? `. Until ${fast.until}.` : '.') + ' Targets stay the same: the day is fitted into the meals you’re eating.'),
          win && h('div', { class: 'fast-win' }, h('span', { class: 'tiny muted' }, 'Eat between'), time(0), h('span', { class: 'tiny muted' }, 'and'), time(1))))),
    h('p', { class: 'set-foot' }, glyph('info', { size: 15 }), h('span', null, 'Allergen and diet-pattern checks read food names and are a safety net, not a guarantee. Always check labels and ask about ingredients.')));
  el.id = 'sec-rules';
  return el;
}
