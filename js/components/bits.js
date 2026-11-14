// =============================================================
// SMALL BUILDING BLOCKS — diet mark, confidence badge, portion
// chips, nutrient table, change banner, verdict card, week grid,
// goal chart. Each is a plain function returning a DOM node.
// =============================================================
import { h, s, round, fmtNum, parseKey } from '../util.js';
import { projectWeight } from '../engine/goal.js';
import { lineChart } from '../ui.js';
import { icon } from './icons.js';
import { glide } from './controls.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The app rebuilds a page on most changes. A card should only play its entrance
 * when it is actually new, so an element carries a signature (`data-sig`) and is
 * "fresh" when nothing with that signature is on screen while the next one is built.
 */
const onScreen = (sel, sig) => [...document.querySelectorAll(sel)].some(e => e.dataset.sig === sig);

// ---------- labelled form field ----------
let fieldN = 0;
/** Wraps a control with a visible label that is actually associated with it. */
export function field(label, el) {
  const lab = h('label', null, label);
  if (el instanceof Element && el.matches('input, select, textarea')) {
    el.id = el.id || `fld${++fieldN}`;
    lab.setAttribute('for', el.id);
  } else if (el instanceof Element) {
    el.setAttribute('role', el.getAttribute('role') || 'group');
    el.setAttribute('aria-label', label);
  }
  return h('div', { class: 'field' }, lab, el);
}

// ---------- diet marker (the FSSAI veg / non-veg marks, plus an egg mark) ----------
// Veg: a green square with a filled circle. Non-veg: a brown square with a filled
// triangle (the 2022 FSSAI mark). Egg is not an FSSAI mark of its own, so it gets a
// distinct golden square with an egg shape. Shape, colour and a label all differ.
const DIET = {
  v: ['Veg', () => s('circle', { cx: 8, cy: 8, r: 3.3, class: 'dd-mark' })],
  n: ['Non-veg', () => s('path', { d: 'M8 4.2 11.7 10.9H4.3Z', class: 'dd-mark' })],
  e: ['Contains egg', () => s('path', { d: 'M8 3.9c1.8 0 3 2.4 3 4.4a3 3 0 0 1-6 0c0-2 1.2-4.4 3-4.4z', class: 'dd-mark' })],
};
export function dietDot(d) {
  const [label, mark] = DIET[d === 'n' || d === 'e' ? d : 'v'];
  return h('span', { class: 'diet-dot ' + (d || 'v'), title: label, role: 'img', 'aria-label': label },
    s('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', focusable: 'false' },
      s('rect', { x: 1.1, y: 1.1, width: 13.8, height: 13.8, rx: 2.8, class: 'dd-box' }), mark()));
}

// ---------- confidence ----------
const CONF = {
  high: ['check', 'Sure'], matched: ['list', 'On the menu'], est: ['sparkle', 'Estimate'], low: ['alert', 'Unsure'],
};
export function confidenceBadge(level = 'est') {
  const [ic, label] = CONF[level] || CONF.est;
  return h('span', { class: 'conf ' + level, title: label }, icon(ic, { size: 13, sw: 2.2 }), label);
}

// ---------- portion chips ----------
export const PORTIONS = [0.25, 0.5, 1, 1.5, 2];
const FRAC = { 0.25: '¼', 0.5: '½', 1: '1', 1.5: '1½', 2: '2', 3: '3' };
export const fracLabel = v => FRAC[v] || String(v);

export function portionChips({ value = 1, options = PORTIONS, onChange, label = 'Portion' } = {}) {
  const wrap = h('div', { class: 'portions', role: 'radiogroup', 'aria-label': label });
  options.forEach(o => {
    const b = h('button', { class: 'portion' + (o === value ? ' on' : ''), role: 'radio', 'aria-checked': String(o === value), onclick: () => {
      wrap.querySelectorAll('.portion').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      onChange && onChange(o);
    } }, h('span', { class: 'portion-n' }, fracLabel(o)), h('span', { class: 'portion-x' }, '×'));
    wrap.appendChild(b);
  });
  return wrap;
}

// ---------- nutrient table ----------
// Each row's bar is the share of today's target this food uses. Bars remember
// their last share per nutrient, so changing the portion or the food morphs them.
const barMemory = new Map();
let barQueue = [];
function growBar(el, key, share) {
  const from = barMemory.has(key) && !calm() ? barMemory.get(key) : share;
  barMemory.set(key, share);
  el.style.setProperty('--share', String(from / 100));
  if (from === share) return;
  if (!barQueue.length) requestAnimationFrame(() => {
    const q = barQueue; barQueue = [];
    q.forEach(([e]) => void e.offsetWidth);
    q.forEach(([e, v]) => e.style.setProperty('--share', String(v)));
  });
  barQueue.push([el, share / 100]);
}

/** rows: [{ label, value, unit, left?, target?, color }] — `left` is what remains today. */
export function nutrientTable(rows, { showLeft = true } = {}) {
  return h('table', { class: 'ntable' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Nutrient'), h('th', { scope: 'col', class: 'r' }, 'This'), showLeft && h('th', { scope: 'col', class: 'r' }, 'Left today'))),
    h('tbody', null, rows.map(r => {
      const share = r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0;
      const over = r.left != null && Math.round(r.left) < 0;
      const fillEl = r.target > 0 && h('i', { style: { background: r.color || 'var(--accent)' } });
      if (fillEl) growBar(fillEl, r.label, share);
      return h('tr', { class: over ? 'is-over' : null },
        h('th', { scope: 'row' },
          h('span', { class: 'nt-l' }, h('i', { class: 'key', style: { background: r.color || 'var(--muted)' } }), r.label),
          fillEl && h('span', { class: 'nbar', 'aria-hidden': 'true' }, fillEl)),
        h('td', { class: 'r num' }, h('b', null, fmtNum(r.value)), h('small', null, r.unit)),
        showLeft && h('td', { class: 'r num nt-left' + (over ? ' neg' : ''), title: over ? `${fmtNum(-r.left)}${r.unit} over` : null },
          r.left == null ? '—' : [over ? '−' + fmtNum(-r.left) : fmtNum(r.left), h('small', null, r.unit)]));
    })));
}

// ---------- change banner ----------
/** tone: special (festival) · change (menu/plan changed) · info */
export function changeBanner({ tone = 'info', emoji, iconName = 'info', eyebrow, title, text, action }) {
  const sig = tone + '|' + title;
  return h('div', { class: 'banner ' + tone + (onScreen('.banner', sig) ? '' : ' is-new'), role: 'status', 'data-sig': sig },
    h('div', { class: 'banner-ic', 'aria-hidden': 'true' }, emoji ? h('span', { class: 'banner-emoji' }, emoji) : icon(iconName, { size: 22, sw: 2 })),
    h('div', { class: 'banner-main' },
      eyebrow && h('div', { class: 'eyebrow' }, eyebrow),
      h('div', { class: 'banner-t' }, title),
      text && h('div', { class: 'banner-s' }, text)),
    action && h('div', { class: 'banner-act' }, action));
}

// ---------- verdict card (static states; the engine arrives in Phase 4) ----------
export const VERDICTS = {
  go: { icon: 'check', word: 'Go', tone: 'go' },
  smaller: { icon: 'minus', word: 'Go smaller', tone: 'caution' },
  swap: { icon: 'swap', word: 'Swap', tone: 'swap' },
  skip: { icon: 'x', word: 'Skip today', tone: 'stop' },
};
export function verdictCard({ kind = 'go', title, body, ifAnyway, actions, preview = false }) {
  const v = VERDICTS[kind];
  const sig = kind + '|' + (title || '');
  return h('article', { class: 'verdict ' + v.tone + (preview || onScreen('.verdict', sig) ? '' : ' is-new'), 'data-sig': sig },
    h('div', { class: 'verdict-h' },
      h('span', { class: 'verdict-badge' }, h('span', { class: 'verdict-ic' }, icon(v.icon, { size: 15, sw: 2.8 })), v.word),
      preview && h('span', { class: 'pill' }, 'Preview')),
    title && h('div', { class: 'verdict-t' }, title),
    body && h('p', { class: 'verdict-b' }, body),
    ifAnyway && h('div', { class: 'verdict-any' }, icon('info', { size: 18, cls: 'verdict-any-ic' }), h('div', null, h('b', null, 'If you eat it anyway: '), ifAnyway)),
    actions && h('div', { class: 'verdict-act row gap wrap' }, actions));
}

// ---------- week grid ----------
/**
 * days: [{ key, short, num, today, cells: { breakfast, lunch, snacks, dinner } }]
 * cell = null (no menu) or a 0..1+ ratio of the meal's protein target.
 */
export function weekGrid({ days, meals, selected, onSelect }) {
  const tone = r => (r == null ? 'none' : r >= 0.9 ? 'good' : r >= 0.6 ? 'mid' : 'low');
  let remember = () => {};
  const wrap = h('div', { class: 'weekgrid', role: 'group', 'aria-label': 'Week at a glance' },
    days.map((d, i) => h('button', { class: 'wg-day' + (d.key === selected ? ' on' : '') + (d.today ? ' today' : ''), onclick: () => { remember(i); onSelect(d.key); },
      'aria-label': `${d.long}${d.today ? ', today' : ''}`, 'aria-pressed': String(d.key === selected) },
      h('span', { class: 'wg-w' }, d.short),
      h('span', { class: 'wg-n' }, d.num),
      h('span', { class: 'wg-cells' }, meals.map(m => h('i', { class: 'wg-cell ' + tone(d.cells[m]), title: `${m}: ${d.cells[m] == null ? 'no menu' : Math.round(d.cells[m] * 100) + '% of protein target'}` }))))));
  // the selected day's plate glides to the next one (onSelect re-renders the page)
  const move = glide(wrap, { key: 'weekgrid', itemSel: '.wg-day', activeSel: '.wg-day.on', thumbCls: 'wg-thumb' });
  remember = i => move(i, false);
  return wrap;
}
export function weekLegend() {
  return h('div', { class: 'wg-legend tiny muted' },
    h('span', null, h('i', { class: 'wg-cell good' }), 'Protein on track'), h('span', null, h('i', { class: 'wg-cell mid' }), 'A bit light'),
    h('span', null, h('i', { class: 'wg-cell low' }), 'Add a top-up'), h('span', null, h('i', { class: 'wg-cell none' }), 'No menu'));
}

// ---------- goal chart ----------
const BAND = { gain: 'push', cut: 'push', recomp: 'push', break: 'rest', maintain: 'rest', minicut: 'warn' };

/**
 * Weight over time against the plan. With a `plan`, the x axis is days since the
 * plan started and the chart gets the plan line plus shaded phase bands.
 * `weights` are [{ key, weight }] (actual weigh-ins), optional.
 */
export function goalChart({ points, goal, plan, weights = [], fmt = v => round(v, 1), height = 170 }) {
  if (!plan) return h('div', { class: 'goalchart' }, lineChart(points, { goal, color: 'var(--accent)', fmt, height, label: 'Weight trend towards your goal' }));
  const base = parseKey(plan.start.date);
  const day = key => Math.round((parseKey(key) - base) / 86400000);
  const line = [{ x: 0, y: plan.start.w }, ...plan.phases.map(p => ({ x: p.endWk * 7, y: projectWeight(plan, p.endWk) }))];
  const actual = weights.filter(d => d.weight).map(d => ({ x: day(d.key), y: d.weight, label: d.key }));
  const last = plan.phases[plan.phases.length - 1].endWk * 7;
  const ticks = [{ x: 0, label: 'start' }, { x: Math.round(last / 2), label: `wk ${Math.round(last / 14)}` }, { x: last, label: `wk ${last / 7}` }];
  return h('div', { class: 'goalchart' },
    lineChart(actual, {
      goal: plan.type === 'gain' || plan.type === 'lose' ? plan.target.w : null, color: 'var(--accent)', fmt, height, yPad: 0.6, ticks,
      lines: [{ points: line, color: 'var(--ink-2)', dashed: true, label: 'Plan' }],
      bands: plan.phases.map(p => ({ x0: (p.startWk - 1) * 7, x1: p.endWk * 7, kind: BAND[p.kind] || 'push' })),
      label: `Weight against the plan: ${plan.label}`,
    }),
    h('div', { class: 'tiny muted gc-legend' },
      h('span', null, h('i', { class: 'lg-line' }), 'Plan'),
      actual.length > 0 && h('span', null, h('i', { class: 'lg-dot' }), 'You'),
      plan.phases.some(p => BAND[p.kind] === 'rest') && h('span', null, h('i', { class: 'lg-band rest' }), 'Maintain / break'),
      plan.phases.some(p => p.kind === 'minicut') && h('span', null, h('i', { class: 'lg-band warn' }), 'Mini-cut')));
}
