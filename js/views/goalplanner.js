// =============================================================
// GOAL PLANNER — "X kg → Y kg in Z months": live feasibility, a chart
// with phases, and Day-1 targets. One form (plannerForm) used by both
// the Plan-tab sheet and the onboarding goal step, plus the weekly
// check-in result sheet.
// =============================================================
import { h, round, fmtNum, todayKey, addDays, daysBetween, fill } from '../util.js';
import { sheet, stepper, segmented, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { PLANS } from '../../data/workouts.js';
import { assessGoal, buildGoalPlan, defaultMonths, monthsFor, EXPERIENCE, WEEKS_PER_MONTH, phaseLabel } from '../engine/goal.js';
import { startPlan, baseFrom, doCheckIn, applyCheckIn, DECISION_LABEL, kg } from '../goals.js';
import { icon } from '../components/icons.js';
import { goalChart, field } from '../components/bits.js';

const STATUS = {
  safe: { cls: 'go', icon: 'check', word: 'Realistic' },
  aggressive: { cls: 'caution', icon: 'alert', word: 'Aggressive' },
  blocked: { cls: 'stop', icon: 'x', word: 'Not offered' },
};

const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n));

/** Planner state from a profile (and its active plan), or defaults for a new one. */
export function plannerState(pf, plan = null) {
  const weight = +pf.weight || 60;
  const goalType = pf.goal === 'recomp' ? 'recomp' : pf.goal === 'maintain' ? 'maintain' : 'auto';
  let target = pf.goalWeight || plan?.target?.w;
  if (!target) {
    const min = Math.ceil(19 * (pf.height / 100) ** 2 * 2) / 2;
    target = pf.goal === 'lose' ? Math.max(round(weight - 6, 1), min) : pf.goal === 'gain' ? round(weight + 6, 1) : weight;
  }
  const experience = pf.experience || 'beginner';
  let months = plan?.input?.months;
  if (!months && plan && !plan.migrated) months = monthsFor(plan.totalWeeks - 2);
  if (!months && plan?.migrated) months = monthsFor(plan.phases[0].endWk);
  if (!months) months = defaultMonths(weight, target, experience);
  return { weight, target, months, mode: 'months', endDate: addDays(todayKey(), Math.round(months * WEEKS_PER_MONTH * 7)), experience, goalType, miniCut: !!plan?.miniCut };
}

/** The planner, read from state. */
function evaluate(state, base) {
  const input = {
    ...base, weight: state.weight, target: state.goalType === 'auto' ? state.target : state.weight,
    experience: state.experience, goalType: state.goalType, miniCut: state.miniCut,
    ...(state.mode === 'date' ? { endDate: state.endDate } : { months: state.months }),
  };
  const assessment = assessGoal(input);
  const plan = assessment.feasibility === 'blocked' ? null : buildGoalPlan(input);
  return { input, assessment, plan };
}

/**
 * @param state     mutable planner state (see plannerState)
 * @param getBase   () => { sex, age, height, activity }
 * @param onChange  (result) => void, called on build and after every edit
 * @returns { el, result() }
 */
export function plannerForm({ state, getBase, onChange = () => {} }) {
  const el = h('div', { class: 'gp' });
  const out = h('div', { class: 'gp-out', 'aria-live': 'polite' });
  let last = null;

  const refresh = () => { last = evaluate(state, getBase()); fill(out, renderOut(last)); onChange(last); };

  function renderOut({ assessment: a, plan }) {
    const st = STATUS[a.feasibility];
    const moves = a.type === 'gain' || a.type === 'lose';
    const notes = a.reasons.filter(r => r.code !== 'safe-rate');
    const head = h('div', { class: 'gp-status ' + st.cls },
      h('div', { class: 'gp-badge' }, icon(st.icon, { size: 18, sw: 2.4 }), st.word),
      moves
        ? h('div', null,
          h('div', { class: 'gp-rate num' }, `${round(a.rateWk * WEEKS_PER_MONTH, 2)} kg/month · ${round(a.rateWk, 2)} kg/week`),
          h('div', { class: 'tiny muted' }, `${round(a.ratePct, 2)}% of your body weight a week${a.feasibility === 'blocked' ? '' : ' · ' + a.label}`))
        : h('div', null, h('div', { class: 'gp-rate' }, a.type === 'recomp' ? 'Recomp: hold your weight, change your shape' : 'Hold your weight'),
          a.feasibility !== 'blocked' && h('div', { class: 'tiny muted' }, `Around ${round(state.weight, 1)} kg`)),
      notes.length > 0 && h('ul', { class: 'gp-reasons small' }, notes.map(r => h('li', null, r.text))));

    const chips = a.counterOffers.length > 0 && h('div', { class: 'gp-offers' },
      h('div', { class: 'eyebrow' }, 'Try one of these instead'),
      h('div', { class: 'chip-row' }, a.counterOffers.map(c => h('button', { class: 'chip on', onclick: () => applyOffer(c) }, icon('swap', { size: 14 }), c.label))));

    if (!plan) return h('div', { class: 'stack' }, head, chips, disclaimer());

    const t = plan.phases[0].macros;
    const tr = PLANS.find(p => p.id === plan.training.planId);
    return h('div', { class: 'stack' },
      head,
      goalChart({ plan, height: 150 }),
      h('ol', { class: 'gp-phases' }, plan.phases.map((p, i) => h('li', null,
        h('span', { class: 'gp-ph-k' }, `Phase ${i + 1}`), h('b', null, phaseLabel(p.kind)),
        h('span', { class: 'muted num' }, `wk ${p.startWk}–${p.endWk}`),
        h('span', { class: 'num gp-ph-d' }, p.calDelta === 0 ? 'at maintenance' : `${signed(p.calDelta)} kcal`)))),
      plan.options.miniCutOffered && h('button', { class: 'chip' + (state.miniCut ? ' on' : ''), 'aria-pressed': String(state.miniCut), onclick: () => { state.miniCut = !state.miniCut; draw(); } },
        icon('flame', { size: 14 }), 'Add a 3-week mini-cut midway (optional)'),
      h('div', { class: 'gp-day1' },
        h('div', { class: 'eyebrow' }, 'Day 1'),
        h('div', { class: 'num' }, h('b', null, fmtNum(t.cal)), ' kcal · ', h('b', null, t.p), ' g protein · ', t.c, ' g carbs · ', t.f, ' g fat')),
      tr && h('div', { class: 'small muted gp-train' }, icon('dumbbell', { size: 15 }), `Suggested training: ${tr.name} (${tr.tag})`),
      a.limits.safe > 0 && a.feasibility === 'aggressive' && h('p', { class: 'tiny muted' }, `A safer pace for you is about ${round(a.limits.safe, 2)} kg a week.`),
      disclaimer());
  }

  const disclaimer = () => h('p', { class: 'tiny muted gp-note' }, 'Estimates, not medical advice. If you have a medical condition, are pregnant or under 18, follow your doctor or coach.');

  function applyOffer(c) {
    if (c.kind === 'longer') { state.mode = 'months'; state.months = c.months; state.target = c.target; }
    else if (c.kind === 'closer') state.target = c.target;
    else if (c.kind === 'maintain') state.goalType = 'maintain';
    else if (c.kind === 'recomp') state.goalType = 'recomp';
    draw();
  }

  function draw() {
    const set = (k, v, redraw = false) => { state[k] = v; if (redraw) draw(); else refresh(); };
    const auto = state.goalType === 'auto';
    fill(el,
      segmented([{ value: 'auto', label: 'Change weight' }, { value: 'recomp', label: 'Recomp' }, { value: 'maintain', label: 'Maintain' }], state.goalType, v => set('goalType', v, true), 'gp-type'),
      h('div', { class: 'grid2' },
        field('From', stepper(state.weight, { min: 30, max: 200, step: 0.5, fmt: v => v.toFixed(1) + ' kg', onChange: v => set('weight', v) })),
        auto ? field('To', stepper(state.target, { min: 30, max: 200, step: 0.5, fmt: v => v.toFixed(1) + ' kg', onChange: v => set('target', v) })) : null),
      h('div', { class: 'stack-xs' },
        segmented([{ value: 'months', label: 'In months' }, { value: 'date', label: 'By date' }], state.mode, v => set('mode', v, true), 'gp-mode'),
        state.mode === 'months'
          ? stepper(state.months, { min: 1, max: 36, step: 1, fmt: v => `${v} month${v === 1 ? '' : 's'}`, onChange: v => set('months', v) })
          : dateField(state, () => refresh())),
      field('Training experience', segmented(EXPERIENCE.map(e => ({ value: e.id, label: e.label })), state.experience, v => set('experience', v, true), 'gp-exp')),
      out);
    refresh();
  }

  draw();
  return { el, result: () => last };
}

function dateField(state, onPick) {
  const min = addDays(todayKey(), 7), max = addDays(todayKey(), 365 * 3);
  const inp = h('input', { class: 'input', type: 'date', value: state.endDate, min, max, 'aria-label': 'Target date' });
  inp.addEventListener('change', () => { if (inp.value) { state.endDate = inp.value; state.months = Math.max(1, Math.round(daysBetween(todayKey(), inp.value) / 7 / WEEKS_PER_MONTH)); onPick(); } });
  return inp;
}

// ---------- the sheet ----------
export function openGoalPlanner() {
  const pf = store.profile, active = store.activeGoal;
  const state = plannerState(pf, active);
  let useTraining = false, form = null;
  const footer = h('div', { class: 'stack-xs' });

  function paintFooter() {
    const r = form && form.result();
    const ok = !!r?.plan;
    const tr = ok && PLANS.find(p => p.id === r.plan.training.planId);
    fill(footer,
      ok && tr && tr.id !== pf.plan && h('button', { class: 'chip' + (useTraining ? ' on' : ''), 'aria-pressed': String(useTraining), onclick: () => { useTraining = !useTraining; paintFooter(); } },
        icon('dumbbell', { size: 14 }), `Also switch my training to ${tr.name}`),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => sh.close() }, 'Cancel'),
        h('button', { class: 'btn primary grow', disabled: !ok, onclick: () => {
          startPlan(r.plan, { applyTraining: useTraining });
          sh.close(); toast('Plan started'); ctx.refresh(); ctx.reloadHistory();
        } }, 'Start this plan')));
  }

  form = plannerForm({ state, getBase: () => baseFrom(store.profile), onChange: () => paintFooter() });
  const sh = sheet({ title: 'Goal planner', sub: 'Set a target and a timeline. We check it’s safe and build the plan.', wide: true, body: h('div', { class: 'stack' }, form.el, footer) });
  paintFooter();
  return sh;
}

// ---------- weekly check-in ----------
export function openCheckIn() {
  const ci = doCheckIn();
  const tone = { 'on-track': 'go', watch: 'caution', adjust: 'swap', 'at-limit': 'caution', 'log-more': 'caution', insufficient: 'caution' }[ci.decision];
  const custom = !!store.profile.customTargets;
  const body = h('div', { class: 'stack' },
    h('div', { class: 'verdict ' + tone },
      h('div', { class: 'verdict-h' }, h('span', { class: 'verdict-badge' }, icon(ci.decision === 'on-track' ? 'check' : ci.decision === 'adjust' ? 'swap' : 'info', { size: 18, sw: 2.4 }), DECISION_LABEL[ci.decision])),
      h('p', { class: 'verdict-b' }, ci.message)),
    ci.observedRate != null && h('div', { class: 'ci-stats' },
      stat(`${kg(ci.observedRate)} kg/wk`, 'Your trend'), stat(`${kg(ci.expectedRate)} kg/wk`, 'Plan'),
      stat(ci.trendW != null ? ci.trendW + ' kg' : '—', 'Trend weight'), stat(ci.adaptTDEE ? fmtNum(ci.adaptTDEE) : '—', 'Burn (kcal/day)')),
    ci.decision === 'adjust' && custom && h('p', { class: 'small muted' }, `You use custom targets, so we won’t change them. Suggested: ${fmtNum(ci.newTargets.cal)} kcal.`),
    ci.flags.includes('rapid-loss') && h('p', { class: 'small muted' }, 'If you are skipping meals on purpose or feel unwell, please talk to someone you trust. In India, Tele-MANAS is free on 14416.'),
    ci.decision === 'adjust' && !custom
      ? h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => sh.close() }, 'Keep current'),
        h('button', { class: 'btn primary grow', onclick: () => { applyCheckIn(ci); sh.close(); toast('Targets updated'); ctx.refresh(); } }, `Apply ${ci.newTargets.step > 0 ? '+' : '−'}${Math.abs(ci.newTargets.step)} kcal`))
      : h('button', { class: 'btn primary block', onclick: () => sh.close() }, 'Got it'),
    h('p', { class: 'tiny muted gp-note' }, 'Estimates, not medical advice.'));
  const sh = sheet({ title: 'Weekly check-in', sub: `${ci.week} · ${ci.loggedDays} days logged, ${ci.weighIns} weigh-ins`, body });
  ctx.refresh();
  return sh;
}

const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'stat-v num' }, v), h('div', { class: 'tiny muted' }, l));
