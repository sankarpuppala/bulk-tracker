// =============================================================
// ONBOARDING — a quick, playful setup that builds the whole plan
// The frame (back, progress, Continue) is built once; each step is
// painted into the stage straight away, and the step leaving slides
// out of a throwaway ghost layer while the new one springs in (no
// slide at all under reduced motion). Kato reacts to every step.
// =============================================================
import { h, fill, timeToMin } from '../util.js';
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
import { artWelcome, artMascot, artKolam } from '../components/art.js';

// goal and diet choices get drawn glyphs instead of emoji; hues are tokens so both themes work
const GOAL_GLYPH = { gain: ['progress', 'var(--hue-lunch)'], lose: ['flame', 'var(--hue-snacks)'], maintain: ['scale', 'var(--c-fib)'], recomp: ['swap', 'var(--hue-dinner)'] };
const DIET_GLYPH = { veg: ['leaf', 'v'], egg: ['egg', 'e'], nonveg: ['utensils', 'n'] };
const glyph = (name, hue) => h('span', { class: 'opt-glyph', style: `--hue:${hue}` }, icon(name, { size: 26 }));
// how Kato feels about each step (design/DESIGN.md §6)
const KATO = { name: 'wave', goal: 'happy', body: 'think', target: 'proud', activity: 'cool', diet: 'hungry', mess: 'happy', train: 'proud', routine: 'sleepy', done: 'cheer' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startOnboarding(edit = false) {
  const d = structuredClone(store.profile);
  if (!d.name) d.name = store.user?.displayName || '';
  let step = 0;
  d._mission = d.goal;                       // what was picked on the mission step; the planner may refine d.goal
  let gp = null;                             // planner state, kept across redraws of the target step
  let gpResult = null;                       // latest { assessment, plan }
  const host = h('div', { class: 'ob', role: 'dialog', 'aria-modal': 'true', 'aria-label': edit ? 'Edit your plan' : 'Set up Thali' });
  document.body.appendChild(host);
  document.body.classList.add('ob-open');
  // a full-screen dialog: the app underneath can't be tabbed into or read out while it's open
  const app = document.getElementById('root');
  const appWasInert = !!app?.inert;
  if (app) app.inert = true;

  // option cards: `on` is the current choice. --i staggers them in when a step arrives.
  let optN = 0;
  let pressed = -1;                          // which card was just tapped, so the redraw can spring it and keep focus
  const press = (onclick, e) => { pressed = [...(current()?.querySelectorAll('.opt-card') || [])].indexOf(e.currentTarget); onclick(); };
  const check = () => h('span', { class: 'opt-check', 'aria-hidden': 'true' }, icon('check', { size: 14, sw: 2.6 }));
  const opt = (on, onclick, ...kids) => h('button', { class: 'opt-card' + (on ? ' on' : ''), 'aria-pressed': String(on), style: `--i:${optN++}`, onclick: e => press(onclick, e) }, ...kids, check());
  /** A full-width row: something to look at, a title, a line of detail, the tick. */
  const row = (on, onclick, lead, title, sub) => h('button', { class: 'opt-card opt-row' + (on ? ' on' : ''), 'aria-pressed': String(on), style: `--i:${optN++}`, onclick: e => press(onclick, e) },
    lead && h('span', { class: 'opt-lead', 'aria-hidden': 'true' }, lead), h('span', { class: 'opt-txt' }, title, sub), check());
  const pick = (k, v) => { d[k] = v; draw(); };

  const steps = [
    {
      id: 'name', title: edit ? 'Edit your plan' : 'Welcome to Thali', sub: 'Your campus nutrition + training co-pilot. Takes 60 seconds.',
      hero: () => !edit && h('div', { class: 'ob-hero ob-welcome', 'aria-hidden': 'true' },
        h('div', { class: 'ob-glow' }),
        h('div', { class: 'ob-hero-art' }, h('div', { class: 'ob-float' }, artWelcome(236))),
        h('div', { class: 'ob-hero-kato' }, h('div', { class: 'ob-bob' }, artMascot({ mood: 'wave', size: 104 }))),
        h('div', { class: 'ob-bubble' }, 'Hi! I’m Kato.')),
      body: () => {
        const el = h('input', { class: 'input lg ob-name-in', id: 'ob-name', value: d.name, placeholder: 'Your first name', maxlength: 30, autocomplete: 'given-name', enterkeyhint: 'next' });
        el.addEventListener('input', () => { d.name = el.value; });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } });
        setTimeout(() => el.isConnected && el.focus({ preventScroll: true }), 200);
        return h('div', { class: 'stack ob-ask' }, h('label', { class: 'ob-label', for: 'ob-name' }, 'What should we call you?'), el);
      },
      ok: () => d.name.trim().length > 0 || 'Enter your name',
    },
    {
      id: 'goal', title: 'What’s the mission?', sub: 'You can change this any time.',
      body: () => h('div', { class: 'opt-grid ob-goals' }, GOALS.map(g => opt(d._mission === g.id, () => { d._mission = g.id; gp = null; gpResult = null; pick('goal', g.id); d.plan = suggestTraining(g.id, d.experience); },
        glyph(...GOAL_GLYPH[g.id]), h('b', null, g.label), h('span', { class: 'tiny muted' }, g.sub)))),
    },
    {
      id: 'body', title: 'About your body', sub: 'Used to estimate how much energy you burn.',
      body: () => h('div', { class: 'stack ob-bodystats' },
        segmented([{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], d.sex, v => { d.sex = v; }, 'ob-sex'),
        h('div', { class: 'grid2' },
          numField('Age', d.age, 14, 80, 1, 'yrs', v => { d.age = v; }),
          numField('Height', d.height, 120, 220, 1, 'cm', v => { d.height = v; })),
        numField('Weight', d.weight, 30, 200, 0.5, 'kg', v => { d.weight = v; }, 'ob-num-hero')),
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
        return h('div', { class: 'ob-gp' }, form.el);
      },
      ok: () => (gpResult?.plan ? true : 'Pick a target and timeline we can plan safely, or choose one of the suggestions'),
    },
    {
      id: 'activity', title: 'How active are you?', sub: 'Outside of the gym plan you’ll pick next.',
      body: () => h('div', { class: 'stack-xs ob-list' }, ACTIVITY.map((a, i) => row(d.activity === a.id, () => pick('activity', a.id),
        h('span', { class: 'opt-meter' }, ACTIVITY.map((_, j) => h('i', { class: j <= i ? 'on' : '' }))),
        h('b', null, a.label), h('span', { class: 'tiny muted' }, a.sub)))),
    },
    {
      id: 'diet', title: 'What do you eat?', sub: 'We’ll only suggest food that fits.',
      body: () => h('div', { class: 'opt-grid three' }, DIETS.map(x => opt(d.diet === x.id, () => pick('diet', x.id), h('span', { class: 'opt-glyph diet-' + DIET_GLYPH[x.id][1] }, icon(DIET_GLYPH[x.id][0], { size: 26 })), h('b', null, x.label)))),
    },
    {
      id: 'mess', title: 'Which mess are you in?', sub: 'We read its menu and build your plate for every meal.',
      body: () => h('div', { class: 'stack' },
        h('div', { class: 'opt-grid mess-grid' }, MESSES.map(m => opt(d.mess === m.id, () => pick('mess', m.id), h('b', { class: 'mess-code' }, m.id),
          h('span', { class: 'tiny muted' }, h('span', { class: 'diet-dot' + (m.kind === 'Veg' ? '' : ' n'), 'aria-hidden': 'true' }), m.name + ' · ' + m.kind)))),
        row(!d.mess, () => pick('mess', null), icon('utensils', { size: 20 }), h('b', null, 'I don’t eat at a mess'), h('span', { class: 'tiny muted' }, 'Day scholar / cook my own food'))),
    },
    {
      id: 'train', title: 'Pick a training plan', sub: 'Shows up in Train and your daily routine.',
      body: () => h('div', { class: 'stack-xs ob-list' }, PLANS.map(p => row(d.plan === p.id, () => pick('plan', p.id),
        icon(p.id === 'home4' ? 'today' : 'dumbbell', { size: 20 }),
        h('span', { class: 'row between opt-title' }, h('b', null, p.name), p.id === suggestTraining(d.goal, d.experience) && h('span', { class: 'pill good' }, icon('star', { size: 12 }), 'Best for you')),
        h('span', { class: 'tiny muted' }, p.tag)))),
    },
    {
      id: 'routine', title: 'Your daily rhythm', sub: 'We’ll build a day plan around mess hours.',
      body: () => {
        const ribbon = dayRibbon(d.routine);
        const redraw = () => ribbon.update(d.routine);
        return h('div', { class: 'stack ob-routine' }, ribbon.el,
          h('div', { class: 'grid3' },
            timeField('Wake up', 'sunrise', d.routine.wake, v => { d.routine.wake = v; redraw(); }),
            timeField('Workout', 'dumbbell', d.routine.gym, v => { d.routine.gym = v; redraw(); }),
            timeField('Sleep', 'moon', d.routine.sleep, v => { d.routine.sleep = v; redraw(); })));
      },
    },
    {
      id: 'done', title: 'Your plan is ready', sub: 'Personalised daily targets',
      hero: () => h('div', { class: 'ob-hero ob-cheer', 'aria-hidden': 'true' },
        h('div', { class: 'ob-glow' }),
        h('div', { class: 'ob-burst' }, Array.from({ length: 12 }, (_, i) => h('i', { style: `--i:${i}` }))),
        h('div', { class: 'ob-sparks' }, Array.from({ length: 5 }, (_, i) => h('i', { style: `--i:${i}` }, icon('sparkle', { size: 18 })))),
        h('div', { class: 'ob-hero-kato' }, h('div', { class: 'ob-bob' }, artMascot({ mood: 'cheer', size: 132 })))),
      body: () => {
        const t = calcTargets(d);
        return h('div', { class: 'stack center result ob-plan' },
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

  // ---------- the frame ----------
  const back = h('button', { class: 'icon-btn ob-back', 'aria-label': 'Back', onclick: () => turn(-1) }, icon('back', { size: 18 }));
  const bar = h('div', { class: 'ob-progress', role: 'progressbar', 'aria-label': 'Setup progress', 'aria-valuemin': '1' },
    h('span', { class: 'ob-track' }, h('span', { class: 'ob-fill' })));
  const stage = h('div', { class: 'ob-stage' });
  const next = h('button', { class: 'btn primary lg block ob-next', onclick: () => {
    const list = active(), s = list[step], last = step === list.length - 1;
    const ok = s.ok ? s.ok() : true;
    if (ok !== true) { toast(ok, 'err'); nudge(); return; }
    if (last) finish(); else turn(1);
  } });
  host.appendChild(h('div', { class: 'ob-kolam', 'aria-hidden': 'true' }, artKolam({ size: 420 })));
  host.appendChild(h('div', { class: 'ob-inner' },
    h('div', { class: 'ob-top' }, back, bar, edit ? h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', { size: 18 })) : h('span')),
    stage,
    h('div', { class: 'ob-foot' }, next)));

  /** The step on screen (a step on its way out lives in a ghost layer beside it). */
  const current = () => stage.querySelector(':scope > .ob-card');

  /** Paint the current step into the stage. `enter` is 'open' | 'fwd' | 'back' when a step arrives. */
  function paint(enter = null) {
    const list = active();
    step = Math.min(step, list.length - 1);
    const s = list[step];
    const last = step === list.length - 1;
    optN = 0;
    back.hidden = step === 0;
    bar.setAttribute('aria-valuemax', String(list.length));
    bar.setAttribute('aria-valuenow', String(step + 1));
    bar.setAttribute('aria-valuetext', `Step ${step + 1} of ${list.length}`);
    bar.style.setProperty('--p', ((step + 1) / list.length).toFixed(4));
    bar.style.setProperty('--n', String(list.length));
    host.dataset.step = s.id;
    const hero = s.hero && s.hero();
    const first = (d.name || '').trim().split(/\s+/)[0];
    fill(stage, h('section', { class: 'ob-card ob-s-' + s.id, 'data-step': s.id, 'aria-labelledby': 'ob-t' },
      hero,
      h('header', { class: 'ob-head' },
        h('div', { class: 'ob-head-t' },
          h('p', { class: 'eyebrow ob-count' }, s.id === 'done' ? (first ? `All set, ${first}` : 'All set') : `Step ${step + 1} of ${list.length}`),
          h('h2', { class: 'ob-t', id: 'ob-t', tabindex: '-1' }, s.title),
          h('p', { class: 'muted ob-sub' }, s.sub)),
        !hero && h('div', { class: 'ob-kato', 'aria-hidden': 'true' }, h('div', { class: 'ob-bob' }, artMascot({ mood: KATO[s.id] || 'happy', size: 76 })))),
      h('div', { class: 'ob-body' }, s.body())));
    if (enter) stage.dataset.enter = enter; else delete stage.dataset.enter;
    delete stage.dataset.slide;
    fill(next, h('span', null, last ? (edit ? 'Save changes' : 'Let’s go') : 'Continue'), icon(last ? 'sparkle' : 'chevron', { size: 18, sw: 2.2 }));
    next.classList.toggle('ob-final', last);
  }

  /** Same step, new choice: repaint, spring the card that was tapped, settle the one that was on. */
  function draw() {
    const was = [...(current()?.querySelectorAll('.opt-card') || [])].map(c => c.classList.contains('on'));
    const hadFocus = stage.contains(document.activeElement);
    const top = host.scrollTop;
    paint();
    host.scrollTop = top;
    const cards = [...current().querySelectorAll('.opt-card')];
    cards.forEach((c, i) => { if (was[i] && !c.classList.contains('on')) c.classList.add('unpop'); });
    const hit = cards[pressed];
    if (hit) { if (hit.classList.contains('on')) hit.classList.add('pop'); if (hadFocus) hit.focus({ preventScroll: true }); }
    pressed = -1;
  }

  /**
   * Move one step forward or back. The new step is painted at once (so nothing waits on an
   * animation); the old one is lifted into an inert, hidden "ghost" layer that slides out the
   * way you're going while the new one springs in from the other side, then it's thrown away.
   * Focus goes to the new step's heading (or the name field).
   */
  function turn(delta) {
    const dir = delta > 0 ? 'fwd' : 'back';
    const old = current();
    const oldTop = host.scrollTop;
    step += delta;
    paint(dir);
    host.scrollTop = 0;
    const field = stage.querySelector('#ob-name');
    (field || current()?.querySelector('.ob-t'))?.focus({ preventScroll: true });
    if (reduced() || !old) return;
    stage.dataset.slide = dir;
    old.removeAttribute('aria-labelledby');
    old.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const ghost = h('div', { class: 'ob-ghost', 'data-dir': dir, inert: '', 'aria-hidden': 'true', style: `top:${-oldTop}px` }, old);
    stage.prepend(ghost);
    setTimeout(() => ghost.remove(), 420);
  }

  /** A small head-shake when Continue can't go on yet (the toast says why). */
  function nudge() {
    if (reduced()) return;
    const card = current();
    card?.classList.remove('nope'); void card?.offsetWidth; card?.classList.add('nope');
  }

  function close() {
    host.classList.add('closing');
    document.body.classList.remove('ob-open');
    if (app) app.inert = appWasInert;
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

  paint('open');
}

/** A big-number stepper in its own tile; the unit sits beside the number, never wrapping. */
function numField(label, val, min, max, step, unit, onChange, cls = '') {
  const id = 'ob-l-' + label.toLowerCase();
  const st = stepper(val, { min, max, step, onChange, fmt: v => (step < 1 ? (+v).toFixed(1) : v) });
  const out = st.querySelector('.stepper-val');
  if (out) { out.dataset.unit = unit; out.setAttribute('aria-live', 'polite'); }
  return h('div', { class: 'field ob-num ' + cls, role: 'group', 'aria-labelledby': id }, h('label', { id }, label), st);
}

function timeField(label, ic, val, onChange) {
  const el = h('input', { class: 'input', type: 'time', value: val, 'aria-label': label });
  el.addEventListener('change', () => el.value && onChange(el.value));
  return h('div', { class: 'field ob-time' }, h('label', null, h('span', { class: 'ob-time-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16 })), label), el);
}

/** A 24-hour ribbon, night → dawn → day → dusk → night, with your wake, workout and sleep marked on it. */
function dayRibbon(r) {
  const mark = (cls, ic) => h('span', { class: 'ob-mark ' + cls }, h('span', { class: 'ob-dot' }, icon(ic, { size: 14, sw: 2 })));
  const wake = mark('m-wake', 'sunrise'), gym = mark('m-gym', 'dumbbell'), sleep = mark('m-sleep', 'moon');
  const el = h('div', { class: 'ob-ribbon', 'aria-hidden': 'true' },
    h('div', { class: 'ob-ribbon-track' }, wake, gym, sleep),
    h('div', { class: 'ob-ribbon-axis' }, ['12 am', '6 am', '12 pm', '6 pm', '12 am'].map(t => h('span', null, t))));
  const at = (m, t) => m.style.setProperty('--at', (timeToMin(t) / 1440).toFixed(4));
  const update = rt => { at(wake, rt.wake); at(gym, rt.gym); at(sleep, rt.sleep); };
  update(r);
  return { el, update };
}
