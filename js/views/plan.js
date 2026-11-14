// =============================================================
// PLAN — "what's my plan this week?"
// Goal summary, the week at a glance, mess menus, training and
// the daily routine. Menus and training are the existing views,
// mounted here without their own page headers.
// =============================================================
import { h, s, todayKey, addDays, parseKey, round, fmtNum, prettyTime, minToTime, nowMin } from '../util.js';
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
import { artGoal, artMeal, artMascot } from '../components/art.js';
import { startOnboarding } from './onboard.js';
import { openGoalPlanner, phaseRail, PHASE_TONE } from './goalplanner.js';
import { openNotToday } from './nottoday.js';

const SECTIONS = ['week', 'menus', 'training', 'routine'];
let sec = 'week';
let pickedDay = null;

// The whole page re-renders on every tap, so entrance motion is driven by one-shot hints
// that are read (and cleared) by the next render only: nothing replays when you log a meal.
let tabMove = 0;        // ±1 when the section just changed, so the body slides in from that side
let dayMove = null;     // { from, dir } when a day was just picked, so the selection slides across
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderPlan(section) {
  if (SECTIONS.includes(section)) sec = section;
  const g = GOALS.find(x => x.id === store.profile.goal);
  // first paint of this page (arriving from another tab) vs. a re-render of it
  const intro = !document.querySelector('.page.plan');

  const seg = segmented([
    { value: 'week', label: 'Week', icon: icon('plan', { size: 16 }) },
    { value: 'menus', label: 'Menus', icon: icon('bowl', { size: 16 }) },
    { value: 'training', label: 'Training', icon: icon('dumbbell', { size: 16 }) },
    { value: 'routine', label: 'Routine', icon: icon('clock', { size: 16 }) },
  ], sec, v => { tabMove = SECTIONS.indexOf(v) >= SECTIONS.indexOf(sec) ? 1 : -1; sec = v; ctx.refresh(); }, 'plan-seg');
  const move = tabMove; tabMove = 0;

  return h('div', { class: 'page plan' + (intro ? ' intro' : '') },
    pageHead(g ? g.label : 'Your plan', 'Plan'),
    goalSummary(),
    h('div', { class: 'plan-tabs' }, seg),
    h('div', { class: 'plan-body plan-' + sec + (intro ? ' enter' : move ? ' enter ' + (move > 0 ? 'from-r' : 'from-l') : '') },
      ({ week: weekSection, menus: () => renderMess(true), training: () => renderTrain(true), routine: routineSection })[sec]()));
}

// ---------- goal summary: the active plan, its phase and plan-vs-actual ----------
function goalSummary() {
  const plan = store.activeGoal;
  if (!plan) {
    return card('goal-card is-empty',
      h('div', { class: 'goal-empty' },
        h('div', { class: 'goal-art' }, artGoal(104)),
        h('div', { class: 'goal-info' },
          h('div', { class: 'eyebrow' }, 'Your goal'),
          h('div', { class: 'goal-t' }, 'Set a goal'),
          h('p', { class: 'small goal-lede' }, 'Tell us where you want to be. We check the pace is safe and build a plan with phases and daily targets.'),
          h('div', { class: 'goal-actions' }, h('button', { class: 'btn primary', onclick: () => openGoalPlanner() }, icon('target', { size: 18 }), 'Plan my goal')))));
  }
  const cp = currentPhase();
  const moves = plan.type === 'gain' || plan.type === 'lose';
  const weights = ctx.history.filter(d => d.weight);
  const latest = weights.length ? weights[weights.length - 1].weight : null;
  const ends = parseKey(plan.target.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const week = cp ? Math.min(cp.week, plan.totalWeeks) : null;
  const rest = cp && ['break', 'maintain', 'minicut'].includes(cp.phase.kind);
  const fact = (k, v, unit) => h('div', { class: 'gm' }, h('span', { class: 'gm-k' }, k), h('b', { class: 'gm-v num' }, v, unit && h('small', null, unit)));

  return card('goal-card',
    h('div', { class: 'goal-grid' },
      h('div', { class: 'goal-info' },
        h('div', { class: 'goal-top' },
          h('div', { class: 'grow' },
            h('div', { class: 'eyebrow' }, 'Your goal'),
            h('div', { class: 'goal-t' }, plan.label)),
          h('div', { class: 'goal-art' }, artGoal(92))),
        moves
          ? h('div', { class: 'goal-s num' },
            h('span', { class: 'gs-from' }, fmtW(plan.start.w)),
            h('span', { class: 'gs-arrow', 'aria-hidden': 'true' }, arrow()),
            h('span', { class: 'plan-sr' }, ' to '),
            h('span', { class: 'gs-to' }, fmtW(plan.target.w)),
            h('span', { class: 'gs-unit' }, 'kg'))
          : h('div', { class: 'goal-s num' }, h('span', { class: 'gs-hold' }, 'Around '), h('span', { class: 'gs-to' }, fmtW(plan.start.w)), h('span', { class: 'gs-unit' }, 'kg')),
        h('div', { class: 'goal-meta' },
          moves ? fact('Pace', `${round(Math.abs(plan.rateWk), 2)}`, ' kg/wk') : fact('Focus', plan.type === 'recomp' ? 'Shape' : 'Steady'),
          moves ? fact('Target', ends) : fact('Plan', `${plan.totalWeeks}`, ' weeks'),
          latest != null && fact('Latest', fmtW(latest), ' kg')),
        !moves && h('div', { class: 'tiny muted' }, plan.type === 'recomp' ? 'Hold weight, change shape' : 'Hold steady'),
        cp && h('div', { class: 'goal-phase' },
          phaseRail(plan, week),
          h('div', { class: 'row gap wrap goal-pills' },
            h('span', { class: 'pill' }, `Week ${week} of ${plan.totalWeeks}`),
            h('span', { class: 'pill phase ' + (rest ? 'good ' : '') + (PHASE_TONE[cp.phase.kind] || 'push') }, h('i', { class: 'ph-dot', 'aria-hidden': 'true' }), phaseLabel(cp.phase.kind))))),
      h('div', { class: 'goal-chart' }, goalChart({ plan, weights, height: 170 })),
      h('div', { class: 'goal-actions' },
        h('button', { class: 'btn primary', onclick: () => openGoalPlanner() }, icon('target', { size: 17 }), 'Adjust plan'),
        h('button', { class: 'btn ghost sm', onclick: () => startOnboarding(true) }, icon('edit', { size: 16 }), 'Body & profile'),
        h('button', { class: 'btn ghost sm', onclick: () => ctx.go('progress') }, icon('progress', { size: 16 }), 'See progress'))));
}

const fmtW = w => String(round(w, 1));
/** A long, soft arrow for "from → to". Decorative; the words are read as "to". */
function arrow() {
  return s('svg', { viewBox: '0 0 40 16', width: 34, height: 14, class: 'gs-arrow-svg', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M2 8h33', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', class: 'gs-shaft' }),
    s('path', { d: 'M29 2.5L36 8l-7 5.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
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
    return card('plan-empty', emptyState(artMascot({ mood: 'think', size: 120 }), 'No mess selected', 'Pick your mess and the week fills in with a suggested plate for every meal.',
      h('button', { class: 'btn primary', onclick: () => ctx.go('you') }, 'Choose mess')));
  }
  const allEmpty = days.every(d => MEALS.every(m => d.cells[m.id] == null));
  const dayPlan = planner.planFor(pickedDay);

  const grid = weekGrid({ days, meals: MEALS.map(m => m.id), selected: pickedDay, onSelect: pickDay });
  const move = dayMove; dayMove = null;
  if (move) {
    const on = grid.querySelector('.wg-day.on');
    on?.classList.add('just-picked');
    if (move.from != null && !reduced()) queueMicrotask(() => slideSelection(on, move.from));
  }

  const shown = dayPlan.meals.filter(m => !dayPlan.for.fastSkip?.includes(m.id));
  const sum = shown.reduce((a, m) => { const x = mealTotals(m); return { cal: a.cal + x.cal, p: a.p + x.p }; }, { cal: 0, p: 0 });
  const offset = Math.round((parseKey(pickedDay) - parseKey(today)) / 86400000);
  const rel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : `In ${offset} days`;

  return h('div', { class: 'stack week-stack' },
    card('week-card',
      cardHead('Protein across your week', h('span', { class: 'pill mess-tag' }, icon('bowl', { size: 13 }), mess.id + ' mess'), 'Each little plate is a day: breakfast, lunch, snacks, dinner'),
      grid,
      weekLegend()),
    allEmpty
      ? card('plan-empty', emptyState(artMascot({ mood: 'hungry', size: 120 }), `No menu for ${mess.id} yet`, 'Add this week’s menu once and every day gets a suggested plate.',
        h('button', { class: 'btn primary', onclick: () => { tabMove = 1; sec = 'menus'; ctx.refresh(); } }, icon('plus', { size: 18 }), 'Add a menu')))
      : h('div', { class: 'stack day-stack' + (move ? ' swap ' + (move.dir > 0 ? 'from-r' : 'from-l') : '') },
        h('div', { class: 'day-head' },
          h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, rel), h('h3', { class: 'section-t' }, sel.long)),
          sum.cal > 0 && h('div', { class: 'day-sum num' },
            h('span', null, h('b', null, fmtNum(sum.cal)), ' kcal'),
            h('span', { class: 'ds-p' + (sum.p >= t.p * 0.95 ? ' ok' : '') }, h('b', null, round(sum.p)), ` / ${round(t.p)} g protein`))),
        dayPlan.special && h('div', { class: 'pill warn day-special' }, icon('sparkle', { size: 14 }), `Special: ${dayPlan.special.title}`),
        dayPlan.notes.length > 0 && h('p', { class: 'small day-note' }, icon('info', { size: 16 }), h('span', null, dayPlan.notes[0])),
        h('div', { class: 'daymeals' }, shown.map(m => dayMeal(m, pickedDay)))));
}

function pickDay(k) {
  const old = document.querySelector('.page.plan .wg-day.on');
  if (k !== pickedDay) dayMove = { from: old ? old.getBoundingClientRect().left : null, dir: k > pickedDay ? 1 : -1 };
  pickedDay = k;
  ctx.refresh();
}

/** FLIP: the selection pill (the day's ::before) glides from the old day to the new one on a spring. */
function slideSelection(el, fromX) {
  if (!el || !el.isConnected) return;
  const dx = fromX - el.getBoundingClientRect().left;
  if (Math.abs(dx) < 1) return;
  const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-spring').trim() || 'ease-out';
  try {
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 620, easing: ease, pseudoElement: '::before' });
  } catch { /* no pseudo-element animation: the pill just appears */ }
}

const STATUS = {
  logged: ['good', 'check', 'Logged'],
  ok: ['good', 'check', 'Protein on track'],
  light: ['', 'info', 'A bit light'],
  low: ['warn', 'plus', 'Add a top-up'],
};

function dayMeal(pm, date) {
  const m = MEALS.find(x => x.id === pm.id), cov = proteinCoverage(pm), tot = mealTotals(pm);
  const logged = pm.status === 'logged' || pm.status === 'partial';
  const st = logged ? STATUS.logged : cov == null ? null : cov >= 0.9 ? STATUS.ok : cov >= 0.6 ? STATUS.light : STATUS.low;
  return h('section', { class: 'card daymeal m-' + pm.id + (logged ? ' is-logged' : '') },
    h('div', { class: 'dm-head' },
      h('div', { class: 'dm-art' }, artMeal(pm.id, 58)),
      h('div', { class: 'grow' },
        h('h4', { class: 'dm-t' }, pm.label || m.label),
        h('div', { class: 'dm-time num' }, mealIcon(pm.id, { size: 14 }), `${pm.window[0]}–${pm.window[1]}`, pm.source.kind === 'custom' && h('span', { class: 'dm-custom' }, 'custom today'))),
      st && h('span', { class: 'pill dm-status ' + st[0] }, icon(st[1], { size: 13, sw: 2.4 }), st[2])),
    !pm.menu.length ? h('p', { class: 'small muted dm-none' }, 'Nothing on the menu for this meal.')
      : h('div', { class: 'dm-plate' },
        h('ul', { class: 'daylist' }, pm.plate.map(e => h('li', null, h('span', { class: 'serv num' }, '× ' + e.servings), h('span', { class: 'dl-n' }, e.name)))),
        pm.topUps.length > 0 && h('div', { class: 'dm-topups' },
          h('div', { class: 'dm-sub' }, icon('plus', { size: 12, sw: 2.6 }), 'Top-ups for protein'),
          h('ul', { class: 'daylist' }, pm.topUps.map(t => h('li', { class: 'topup-li' }, h('span', { class: 'serv num' }, '+ ' + t.qty), h('span', { class: 'dl-n' }, t.name)))))),
    h('div', { class: 'dm-foot' },
      tot.cal > 0 ? h('div', { class: 'dm-tot num' }, h('span', null, h('b', null, fmtNum(tot.cal)), ' kcal'), h('span', null, h('b', null, round(tot.p)), ' g protein')) : h('span'),
      h('button', { class: 'link tiny not-today', onclick: () => openNotToday(date, pm.id) }, icon('swap', { size: 14 }), 'Not this today')));
}

// ---------- routine ----------
const EMOJI_ICON = { '⏰': 'sunrise', '💧': 'drop', '🍌': 'bolt', '🥛': 'cup', '🧘': 'leaf', '🥜': 'cup', '🚶': 'leaf', '📵': 'moon', '😴': 'moon' };
function routineSection() {
  const t = ctx.targets(), ev = buildRoutine(store.profile, ctx.date, t);
  const isToday = ctx.date === todayKey();
  const ic = e => (e.meal ? mealIcon(e.meal, { size: 18 }) : e.gym ? icon('dumbbell', { size: 18 }) : icon(EMOJI_ICON[e.icon] || 'clock', { size: 18 }));
  const kind = e => (e.meal ? ' is-meal m-' + e.meal : e.gym ? ' is-gym' : e.icon === '⏰' ? ' is-wake' : e.icon === '😴' ? ' is-sleep' : '');
  const items = [];
  ev.forEach((e, i) => {
    if (isToday && e.next) {
      items.push(h('li', { class: 'tl-nowmark' },
        h('span', { class: 'tl-time num' }, prettyTime(minToTime(nowMin()))),
        h('span', { class: 'tl-pulse', 'aria-hidden': 'true' }),
        h('span', { class: 'tl-now-l' }, 'Now')));
    }
    items.push(h('li', { class: 'tl' + kind(e) + (e.past ? ' past' : '') + (e.next ? ' now' : ''), ref: el => el.style.setProperty('--i', i) },
      h('span', { class: 'tl-time num' }, prettyTime(e.time)),
      h('span', { class: 'tl-dot' }, ic(e)),
      h('div', { class: 'tl-body' },
        h('div', { class: 'small tl-t' }, e.title, e.next && h('span', { class: 'tl-next' }, 'Up next')),
        h('div', { class: 'tiny tl-s' }, e.sub))));
  });
  return card('timeline-card',
    cardHead('Your day', h('button', { class: 'chip', onclick: () => ctx.go('you', 'routine') }, icon('clock', { size: 15 }), 'Edit times'), 'Built from your mess hours, training and sleep'),
    h('ol', { class: 'timeline' }, items));
}
