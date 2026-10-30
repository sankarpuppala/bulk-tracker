// =============================================================
// PLAN — "what's my plan this week?"
// Goal summary, the week at a glance, mess menus, training and
// the daily routine. Menus and training are the existing views,
// mounted here without their own page headers.
// =============================================================
import { h, todayKey, addDays, parseKey, round, fmtNum, weekdayOf, prettyTime, fill } from '../util.js';
import { segmented, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MEALS } from '../../data/messes.js';
import { planPlate, MEAL_SPLIT, weeksToGoal, GOALS } from '../nutrition.js';
import { menuFor, messById, timingsFor } from '../menus.js';
import { buildRoutine } from '../routine.js';
import { pageHead, card, cardHead } from './common.js';
import { renderMess } from './mess.js';
import { renderTrain } from './train.js';
import { icon, mealIcon } from '../components/icons.js';
import { weekGrid, weekLegend, goalChart } from '../components/bits.js';
import { artSprout, artEmptyPlate } from '../components/art.js';
import { startOnboarding } from './onboard.js';

const SECTIONS = ['week', 'menus', 'training', 'routine'];
let sec = 'week';
let pickedDay = null;

export function renderPlan(section) {
  if (SECTIONS.includes(section)) sec = section;
  const pf = store.profile;
  const g = GOALS.find(x => x.id === pf.goal);

  const seg = segmented([
    { value: 'week', label: 'Week', icon: icon('plan', { size: 16 }) },
    { value: 'menus', label: 'Menus', icon: icon('bowl', { size: 16 }) },
    { value: 'training', label: 'Training', icon: icon('dumbbell', { size: 16 }) },
    { value: 'routine', label: 'Routine', icon: icon('clock', { size: 16 }) },
  ], sec, v => { sec = v; ctx.refresh(); }, 'plan-seg');

  return h('div', { class: 'page plan' },
    pageHead(g ? g.label : 'Your plan', 'Plan'),
    goalSummary(),
    seg,
    h('div', { class: 'plan-body' }, ({ week: weekSection, menus: () => renderMess(true), training: () => renderTrain(true), routine: routineSection })[sec]()));
}

// ---------- goal summary (the Goal Planner replaces this in Phase 2) ----------
function goalSummary() {
  const pf = store.profile;
  const g = GOALS.find(x => x.id === pf.goal);
  const weeks = weeksToGoal(pf);
  const pts = ctx.history.filter(d => d.weight).slice(-60);
  const hasChart = pts.length >= 2 && pf.goalWeight;
  const base = pts.length ? parseKey(pts[0].key) : null;
  const goalLine = pf.goalWeight ? `${pf.weight} → ${pf.goalWeight} kg` : `${pf.weight} kg now`;
  return card('goal-card',
    h('div', { class: 'goal-grid' },
      h('div', { class: 'goal-info' },
        h('div', { class: 'goal-top' },
          h('div', { class: 'grow' },
            h('div', { class: 'eyebrow' }, 'Your goal'),
            h('div', { class: 'goal-t' }, g ? g.label : 'Set a goal'),
            h('div', { class: 'goal-s num' }, goalLine),
            pf.goalWeight && weeks != null && h('div', { class: 'tiny muted' }, weeks === 0 ? 'You’ve reached it.' : `About ${weeks} weeks at ${pf.pace} kg/week · around ${parseKey(addDays(todayKey(), weeks * 7)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`)),
          !hasChart && artSprout(96)),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn ghost sm', onclick: () => startOnboarding(true) }, icon('edit', { size: 16 }), 'Edit goal & body'),
          h('button', { class: 'btn ghost sm', onclick: () => ctx.go('progress') }, icon('progress', { size: 16 }), 'See progress'))),
      hasChart && goalChart({ points: pts.map(d => ({ x: (parseKey(d.key) - base) / 86400000, y: d.weight, label: d.key })), goal: pf.goalWeight })));
}

// ---------- week at a glance ----------
function proteinCoverage(messId, date, t) {
  if (!messId) return Object.fromEntries(MEALS.map(m => [m.id, null]));
  const menu = menuFor(messId, date);
  const out = {};
  for (const m of MEALS) {
    const items = menu.meals[m.id];
    if (!items.length) { out[m.id] = null; continue; }
    const budget = { cal: t.cal * MEAL_SPLIT[m.id], p: t.p * MEAL_SPLIT[m.id] };
    const plan = planPlate(items, budget, { diet: store.profile.diet, goal: store.profile.goal });
    out[m.id] = plan.picks.length ? plan.totals.p / budget.p : null;
  }
  return out;
}

function weekSection() {
  const pf = store.profile, t = ctx.targets(), today = todayKey();
  if (!pickedDay || pickedDay < today || pickedDay > addDays(today, 6)) pickedDay = today;
  const mess = messById(pf.mess);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i), d = parseKey(key);
    return {
      key, today: key === today, short: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3), num: d.getDate(),
      long: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
      cells: proteinCoverage(pf.mess, key, t),
    };
  });
  const sel = days.find(d => d.key === pickedDay);
  if (!mess) {
    return card('', emptyState(artEmptyPlate(120), 'No mess selected', 'Pick your mess and the week fills in with a suggested plate for every meal.',
      h('button', { class: 'btn primary', onclick: () => ctx.go('you') }, 'Choose mess')));
  }
  const allEmpty = days.every(d => MEALS.every(m => d.cells[m.id] == null));
  const menu = menuFor(pf.mess, pickedDay), tm = timingsFor(pf);
  return h('div', { class: 'stack' },
    card('',
      cardHead('Protein across your week', h('span', { class: 'pill' }, mess.id + ' mess'), 'Each square is a meal: breakfast, lunch, snacks, dinner'),
      weekGrid({ days, meals: MEALS.map(m => m.id), selected: pickedDay, onSelect: k => { pickedDay = k; ctx.refresh(); } }),
      weekLegend()),
    allEmpty
      ? card('', emptyState(artEmptyPlate(120), `No menu for ${mess.id} yet`, 'Add this week’s menu once and every day gets a suggested plate.',
        h('button', { class: 'btn primary', onclick: () => { sec = 'menus'; ctx.refresh(); } }, icon('plus', { size: 18 }), 'Add a menu')))
      : h('div', { class: 'stack' },
        h('h3', { class: 'section-t' }, sel.long),
        menu.special && h('div', { class: 'pill warn' }, icon('sparkle', { size: 14 }), `Special: ${menu.special.title}`),
        h('div', { class: 'daymeals' }, MEALS.map(m => dayMeal(m, menu.meals[m.id], tm[m.id], t, sel.cells[m.id])))));
}

function dayMeal(m, items, win, t, cov) {
  const pf = store.profile;
  const budget = { cal: t.cal * MEAL_SPLIT[m.id], p: t.p * MEAL_SPLIT[m.id] };
  const plan = items.length ? planPlate(items, budget, { diet: pf.diet, goal: pf.goal }) : null;
  return h('section', { class: 'card daymeal m-' + m.id },
    h('div', { class: 'row gap' },
      h('div', { class: 'focus-glyph sm' }, mealIcon(m.id, { size: 20 })),
      h('div', { class: 'grow' }, h('div', { class: 'card-t' }, m.label), h('div', { class: 'tiny muted num' }, `${win[0]}–${win[1]}`)),
      cov != null && h('span', { class: 'pill ' + (cov >= 0.9 ? 'good' : cov >= 0.6 ? '' : 'warn') }, cov >= 0.9 ? 'Protein on track' : cov >= 0.6 ? 'A bit light' : 'Add a top-up')),
    !items.length ? h('p', { class: 'small muted' }, 'Nothing on the menu for this meal.')
      : h('ul', { class: 'daylist' }, plan.picks.map(pk => h('li', null, h('span', { class: 'serv num' }, '× ' + pk.servings), h('span', null, pk.item.n))),
        plan.totals.cal > 0 && h('li', { class: 'daytotal num' }, `${round(plan.totals.cal)} kcal · ${round(plan.totals.p)} g protein`)));
}

// ---------- routine ----------
const EMOJI_ICON = { '⏰': 'bell', '💧': 'drop', '🍌': 'leaf', '🥛': 'cup', '🧘': 'leaf', '🥜': 'leaf', '🚶': 'target', '📵': 'moon', '😴': 'moon' };
function routineSection() {
  const t = ctx.targets(), ev = buildRoutine(store.profile, ctx.date, t);
  const ic = e => (e.meal ? mealIcon(e.meal, { size: 18 }) : e.gym ? icon('dumbbell', { size: 18 }) : icon(EMOJI_ICON[e.icon] || 'clock', { size: 18 }));
  return card('timeline-card',
    cardHead('Your day', h('button', { class: 'chip', onclick: () => ctx.go('you', 'routine') }, icon('clock', { size: 15 }), 'Edit times'), 'Built from your mess hours, training and sleep'),
    h('ol', { class: 'timeline' }, ev.map(e => h('li', { class: 'tl' + (e.past ? ' past' : '') + (e.next ? ' now' : '') },
      h('span', { class: 'tl-time num' }, prettyTime(e.time)),
      h('span', { class: 'tl-dot' }, ic(e)),
      h('div', null, h('div', { class: 'small tl-t' }, e.title), h('div', { class: 'tiny muted' }, e.sub))))));
}
