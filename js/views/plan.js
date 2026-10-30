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
import { GOALS } from '../nutrition.js';
import { messById } from '../menus.js';
import { planner } from '../planner.js';
import { proteinCoverage, mealTotals } from '../engine/dayplan.js';
import { phaseLabel } from '../engine/goal.js';
import { currentPhase } from '../goals.js';
import { buildRoutine } from '../routine.js';
import { pageHead, card, cardHead } from './common.js';
import { renderMess } from './mess.js';
import { renderTrain } from './train.js';
import { icon, mealIcon } from '../components/icons.js';
import { weekGrid, weekLegend, goalChart } from '../components/bits.js';
import { artSprout, artEmptyPlate } from '../components/art.js';
import { startOnboarding } from './onboard.js';
import { openGoalPlanner } from './goalplanner.js';
import { openNotToday } from './nottoday.js';

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

// ---------- goal summary: the active plan, its phase, and plan-vs-actual ----------
function goalSummary() {
  const pf = store.profile, plan = store.activeGoal;
  if (!plan) {
    return card('goal-card', h('div', { class: 'goal-info' }, h('div', { class: 'eyebrow' }, 'Your goal'), h('div', { class: 'goal-t' }, 'Set a goal'),
      h('button', { class: 'btn primary sm', onclick: () => openGoalPlanner() }, icon('target', { size: 16 }), 'Plan my goal')));
  }
  const cp = currentPhase();
  const moves = plan.type === 'gain' || plan.type === 'lose';
  const weights = ctx.history.filter(d => d.weight);
  const ends = parseKey(plan.target.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return card('goal-card',
    h('div', { class: 'goal-grid' },
      h('div', { class: 'goal-info' },
        h('div', { class: 'goal-top' },
          h('div', { class: 'grow' },
            h('div', { class: 'eyebrow' }, 'Your goal'),
            h('div', { class: 'goal-t' }, plan.label),
            h('div', { class: 'goal-s num' }, moves ? `${plan.start.w} → ${plan.target.w} kg` : `Around ${plan.start.w} kg`),
            h('div', { class: 'tiny muted' }, moves ? `${plan.rateWk} kg/week · target around ${ends}` : plan.type === 'recomp' ? 'Hold weight, change shape' : 'Hold steady'),
            cp && h('div', { class: 'row gap wrap', style: { marginTop: '8px' } },
              h('span', { class: 'pill' }, `Week ${Math.min(cp.week, plan.totalWeeks)} of ${plan.totalWeeks}`),
              h('span', { class: 'pill ' + (['break', 'maintain', 'minicut'].includes(cp.phase.kind) ? 'good' : '') }, phaseLabel(cp.phase.kind))))),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn primary sm', onclick: () => openGoalPlanner() }, icon('target', { size: 16 }), 'Adjust plan'),
          h('button', { class: 'btn ghost sm', onclick: () => startOnboarding(true) }, icon('edit', { size: 16 }), 'Edit body & profile'),
          h('button', { class: 'btn ghost sm', onclick: () => ctx.go('progress') }, icon('progress', { size: 16 }), 'See progress'))),
      goalChart({ plan, weights, height: 170 })));
}

// ---------- week at a glance ----------
function weekSection() {
  const pf = store.profile, t = ctx.targets(), today = todayKey();
  if (!pickedDay || pickedDay < today || pickedDay > addDays(today, 6)) pickedDay = today;
  const mess = messById(pf.mess);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i), d = parseKey(key);
    return {
      key, today: key === today, short: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3), num: d.getDate(),
      long: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
      cells: Object.fromEntries(planner.planFor(key).meals.map(m => [m.id, proteinCoverage(m)])),
    };
  });
  const sel = days.find(d => d.key === pickedDay);
  if (!mess) {
    return card('', emptyState(artEmptyPlate(120), 'No mess selected', 'Pick your mess and the week fills in with a suggested plate for every meal.',
      h('button', { class: 'btn primary', onclick: () => ctx.go('you') }, 'Choose mess')));
  }
  const allEmpty = days.every(d => MEALS.every(m => d.cells[m.id] == null));
  const dayPlan = planner.planFor(pickedDay);
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
        dayPlan.special && h('div', { class: 'pill warn' }, icon('sparkle', { size: 14 }), `Special: ${dayPlan.special.title}`),
        dayPlan.notes.length > 0 && h('p', { class: 'small muted' }, dayPlan.notes[0]),
        h('div', { class: 'daymeals' }, dayPlan.meals.filter(m => !dayPlan.for.fastSkip?.includes(m.id)).map(m => dayMeal(m, pickedDay)))));
}

function dayMeal(pm, date) {
  const m = MEALS.find(x => x.id === pm.id), cov = proteinCoverage(pm), tot = mealTotals(pm);
  return h('section', { class: 'card daymeal m-' + pm.id },
    h('div', { class: 'row gap' },
      h('div', { class: 'focus-glyph sm' }, mealIcon(pm.id, { size: 20 })),
      h('div', { class: 'grow' }, h('div', { class: 'card-t' }, pm.label || m.label), h('div', { class: 'tiny muted num' }, `${pm.window[0]}–${pm.window[1]}${pm.source.kind === 'custom' ? ' · custom today' : ''}`)),
      pm.status === 'logged' || pm.status === 'partial' ? h('span', { class: 'pill good' }, icon('check', { size: 13, sw: 2.4 }), 'Logged')
        : cov != null && h('span', { class: 'pill ' + (cov >= 0.9 ? 'good' : cov >= 0.6 ? '' : 'warn') }, cov >= 0.9 ? 'Protein on track' : cov >= 0.6 ? 'A bit light' : 'Add a top-up')),
    !pm.menu.length ? h('p', { class: 'small muted' }, 'Nothing on the menu for this meal.')
      : h('ul', { class: 'daylist' }, pm.plate.map(e => h('li', null, h('span', { class: 'serv num' }, '× ' + e.servings), h('span', null, e.name))),
        pm.topUps.map(t => h('li', { class: 'topup-li' }, h('span', { class: 'serv num' }, '+ ' + t.qty), h('span', null, t.name))),
        tot.cal > 0 && h('li', { class: 'daytotal num' }, `${round(tot.cal)} kcal · ${round(tot.p)} g protein`)),
    h('button', { class: 'link tiny not-today', onclick: () => openNotToday(date, pm.id) }, icon('swap', { size: 13 }), 'Not this today'));
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
