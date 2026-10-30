// =============================================================
// ONBOARDING — a quick, playful setup that builds the whole plan
// =============================================================
import { h, fill } from '../util.js';
import { stepper, segmented, confetti, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { GOALS, ACTIVITY, DIETS, calcTargets, COLORS } from '../nutrition.js';
import { MESSES } from '../../data/messes.js';
import { PLANS } from '../../data/workouts.js';
import { buildGoalPlan, suggestTraining } from '../engine/goal.js';
import { startPlan, baseFrom } from '../goals.js';
import { ensureHealthConsent } from './privacy.js';
import { plannerForm, plannerState } from './goalplanner.js';
import { icon } from '../components/icons.js';
import { plateGauge, bowlGauge } from '../components/plategauge.js';
import { thaliArt } from '../components/art.js';

// goal and diet choices get drawn glyphs instead of emoji
const GOAL_GLYPH = { gain: ['progress', '#FF7A2E'], lose: ['flame', '#FF5C93'], maintain: ['scale', '#34C77B'], recomp: ['swap', '#7C8BFF'] };
const DIET_GLYPH = { veg: ['leaf', 'v'], egg: ['egg', 'e'], nonveg: ['utensils', 'n'] };
const glyph = (name, hue) => h('span', { class: 'opt-glyph', style: { '--hue': hue } }, icon(name, { size: 26 }));

export function startOnboarding(edit = false) {
  const d = structuredClone(store.profile);
  if (!d.name) d.name = store.user?.displayName || '';
  let step = 0;
  d._mission = d.goal;                       // what was picked on the mission step; the planner may refine d.goal
  let gp = null;                             // planner state, kept across redraws of the target step
  let gpResult = null;                       // latest { assessment, plan }
  const host = h('div', { class: 'ob' });
  document.body.appendChild(host);
  document.body.classList.add('ob-open');

  const opt = (on, onclick, ...kids) => h('button', { class: 'opt-card' + (on ? ' on' : ''), onclick }, ...kids);
  const pick = (k, v) => { d[k] = v; draw(); };

  const steps = [
    {
      id: 'name', title: edit ? 'Edit your plan' : 'Welcome to Fuel & Forge', sub: 'Your campus nutrition + training co-pilot. Takes 60 seconds.',
      body: () => {
        const el = h('input', { class: 'input lg', value: d.name, placeholder: 'Your first name', maxlength: 30, autocomplete: 'given-name' });
        el.addEventListener('input', () => { d.name = el.value; });
        setTimeout(() => el.focus(), 200);
        return h('div', { class: 'stack' }, !edit && h('div', { class: 'ob-art art-float' }, thaliArt({ size: 220 })), h('label', { class: 'eyebrow' }, 'What should we call you?'), el);
      },
      ok: () => d.name.trim().length > 0 || 'Enter your name',
    },
    {
      id: 'goal', title: 'What’s the mission?', sub: 'You can change this any time.',
      body: () => h('div', { class: 'opt-grid' }, GOALS.map(g => opt(d._mission === g.id, () => { d._mission = g.id; gp = null; gpResult = null; pick('goal', g.id); d.plan = suggestTraining(g.id, d.experience); },
        glyph(...GOAL_GLYPH[g.id]), h('b', null, g.label), h('span', { class: 'tiny muted' }, g.sub)))),
    },
    {
      id: 'body', title: 'About your body', sub: 'Used to estimate how much energy you burn.',
      body: () => h('div', { class: 'stack' },
        segmented([{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], d.sex, v => { d.sex = v; }),
        h('div', { class: 'grid2' },
          numField('Age', d.age, 14, 80, 1, ' yrs', v => { d.age = v; }),
          numField('Height', d.height, 120, 220, 1, ' cm', v => { d.height = v; })),
        numField('Weight', d.weight, 30, 200, 0.5, ' kg', v => { d.weight = v; })),
    },
    {
      id: 'target', skip: () => d._mission === 'maintain', title: 'Set your target', sub: 'A target weight and a date. We check it is safe and build the plan.',
      body: () => {
        if (!gp) gp = plannerState({ ...d, goal: d._mission }, null);
        const form = plannerForm({
          state: gp, getBase: () => baseFrom(d),
          onChange: r => {
            gpResult = r;
            if (!r.plan) return;
            const moves = r.plan.type === 'gain' || r.plan.type === 'lose';
            d.goal = r.plan.type; d.weight = r.input.weight; d.experience = r.input.experience;
            d.goalWeight = moves ? r.plan.target.w : null;
            if (moves) d.pace = r.plan.rateWk;
            d.plan = r.plan.training.planId;
          },
        });
        return form.el;
      },
      ok: () => (gpResult?.plan ? true : 'Pick a target and timeline we can plan safely, or choose one of the suggestions'),
    },
    {
      id: 'activity', title: 'How active are you?', sub: 'Outside of the gym plan you’ll pick next.',
      body: () => h('div', { class: 'stack-xs' }, ACTIVITY.map(a => opt(d.activity === a.id, () => pick('activity', a.id), h('b', null, a.label), h('span', { class: 'tiny muted' }, a.sub)))),
    },
    {
      id: 'diet', title: 'What do you eat?', sub: 'We’ll only suggest food that fits.',
      body: () => h('div', { class: 'opt-grid three' }, DIETS.map(x => opt(d.diet === x.id, () => pick('diet', x.id), h('span', { class: 'opt-glyph diet-' + DIET_GLYPH[x.id][1] }, icon(DIET_GLYPH[x.id][0], { size: 26 })), h('b', null, x.label)))),
    },
    {
      id: 'mess', title: 'Which mess are you in?', sub: 'We read its menu and build your plate for every meal.',
      body: () => h('div', { class: 'stack' },
        h('div', { class: 'opt-grid mess-grid' }, MESSES.map(m => opt(d.mess === m.id, () => pick('mess', m.id), h('b', { class: 'mess-code' }, m.id), h('span', { class: 'tiny muted' }, m.name + ' · ' + m.kind)))),
        opt(!d.mess, () => pick('mess', null), h('b', null, 'I don’t eat at a mess'), h('span', { class: 'tiny muted' }, 'Day scholar / cook my own food'))),
    },
    {
      id: 'train', title: 'Pick a training plan', sub: 'Shows up in Train and your daily routine.',
      body: () => h('div', { class: 'stack-xs' }, PLANS.map(p => opt(d.plan === p.id, () => pick('plan', p.id),
        h('div', { class: 'row between' }, h('b', null, p.name), p.id === suggestTraining(d.goal, d.experience) && h('span', { class: 'pill good' }, 'Best for you')),
        h('span', { class: 'tiny muted' }, p.tag)))),
    },
    {
      id: 'routine', title: 'Your daily rhythm', sub: 'We’ll build a day plan around mess hours.',
      body: () => h('div', { class: 'grid3' },
        timeField('Wake up', d.routine.wake, v => { d.routine.wake = v; }),
        timeField('Workout', d.routine.gym, v => { d.routine.gym = v; }),
        timeField('Sleep', d.routine.sleep, v => { d.routine.sleep = v; })),
    },
    {
      id: 'done', title: 'Your plan is ready', sub: 'Personalised daily targets',
      body: () => {
        const t = calcTargets(d);
        return h('div', { class: 'stack center result' },
          plateGauge({ eaten: t.cal, target: t.cal, size: 220, show: 'target' }),
          h('div', { class: 'bowls', style: { width: '100%' } },
            bowlGauge({ label: 'Protein', value: t.p, max: t.p, color: COLORS.p, show: 'target' }),
            bowlGauge({ label: 'Carbs', value: t.c, max: t.c, color: COLORS.c, show: 'target' }),
            bowlGauge({ label: 'Fat', value: t.f, max: t.f, color: COLORS.f, show: 'target' })),
          h('div', { class: 'pill' }, icon('drop', { size: 14 }), `${t.water / 1000} L of water a day`),
          h('p', { class: 'tiny muted' }, `You burn ≈ ${t.tdee} kcal/day. ${d.goal === 'gain' ? `+${t.cal - t.tdee} surplus` : d.goal === 'maintain' ? 'Eating at maintenance' : `${t.cal - t.tdee} deficit`} to ${GOALS.find(g => g.id === d.goal).label.toLowerCase()}.`));
      },
    },
  ];

  const active = () => steps.filter(s => !s.skip || !s.skip());

  function draw() {
    const list = active();
    step = Math.min(step, list.length - 1);
    const s = list[step];
    const last = step === list.length - 1;
    fill(host, h('div', { class: 'ob-inner' },
      h('div', { class: 'ob-top' },
        step > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => { step--; draw(); } }, icon('back', { size: 18 })) : h('span'),
        h('div', { class: 'ob-progress' }, list.map((_, i) => h('i', { class: i <= step ? 'on' : '' }))),
        edit ? h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', { size: 18 })) : h('span')),
      h('div', { class: 'ob-card', key: s.id },
        h('h2', { class: 'ob-t' }, s.title), h('p', { class: 'muted' }, s.sub),
        s.body()),
      h('button', { class: 'btn primary lg block ob-next', onclick: () => {
        const ok = s.ok ? s.ok() : true;
        if (ok !== true) { toast(ok, 'err'); return; }
        if (last) finish(); else { step++; draw(); }
      } }, last ? (edit ? 'Save changes' : 'Let’s go') : 'Continue')));
  }

  function close() {
    host.classList.add('closing');
    document.body.classList.remove('ob-open');
    setTimeout(() => host.remove(), 250);
  }

  function finish() {
    // explicit consent before anything is stored (DPDP Act 2023)
    if (!store.profile.consents?.health) { ensureHealthConsent().then(ok => { if (ok) finish(); }); return; }
    const { _mission, ...rest } = d;
    const patch = { ...rest, consents: store.profile.consents, name: d.name.trim(), onboarded: true, customTargets: edit ? d.customTargets : null };
    // the planner built a plan on the target step; "maintain" skips that step, so build the hold plan here
    const plan = _mission !== 'maintain' && gpResult?.plan
      ? gpResult.plan
      : buildGoalPlan({ ...baseFrom(d), weight: d.weight, target: d.weight, months: 3, goalType: 'maintain', experience: d.experience });
    store.saveProfile(patch);
    startPlan(plan);
    close();
    confetti();
    ctx.refresh();
    if (!edit) ctx.go('today');
  }

  draw();
}

function numField(label, val, min, max, step, unit, onChange) {
  return h('div', { class: 'field' }, h('label', null, label), stepper(val, { min, max, step, onChange, fmt: v => (step < 1 ? (+v).toFixed(1) : v) + unit }));
}

function timeField(label, val, onChange) {
  const el = h('input', { class: 'input', type: 'time', value: val, 'aria-label': label });
  el.addEventListener('change', () => el.value && onChange(el.value));
  return h('div', { class: 'field' }, h('label', null, label), el);
}
