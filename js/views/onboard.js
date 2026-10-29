// =============================================================
// ONBOARDING — a quick, playful setup that builds the whole plan
// =============================================================
import { h, round, addDays, todayKey, parseKey } from '../util.js';
import { stepper, segmented, rings, confetti, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { GOALS, ACTIVITY, DIETS, calcTargets, weeksToGoal, COLORS } from '../nutrition.js';
import { MESSES } from '../../data/messes.js';
import { PLANS, DEFAULT_PLAN_FOR_GOAL } from '../../data/workouts.js';

export function startOnboarding(edit = false) {
  const d = structuredClone(store.profile);
  if (!d.name) d.name = store.user?.displayName || '';
  let step = 0;
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
        return h('div', { class: 'stack' }, h('label', { class: 'eyebrow' }, 'What should we call you?'), el);
      },
      ok: () => d.name.trim().length > 0 || 'Enter your name',
    },
    {
      id: 'goal', title: 'What’s the mission?', sub: 'You can change this any time.',
      body: () => h('div', { class: 'opt-grid' }, GOALS.map(g => opt(d.goal === g.id, () => { pick('goal', g.id); d.plan = DEFAULT_PLAN_FOR_GOAL[g.id]; d.pace = g.id === 'lose' ? 0.5 : 0.25; },
        h('span', { class: 'opt-ic' }, g.icon), h('b', null, g.label), h('span', { class: 'tiny muted' }, g.sub)))),
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
      id: 'target', skip: () => d.goal === 'maintain', title: d.goal === 'lose' ? 'Where do you want to land?' : 'How big are we going?', sub: 'Pick a target weight and pace.',
      body: () => {
        if (!d.goalWeight) d.goalWeight = round(d.goal === 'gain' ? d.weight + 6 : d.goal === 'lose' ? d.weight - 6 : d.weight, 1);
        const paces = d.goal === 'gain' ? [[0.25, 'Lean bulk', 'Minimal fat gain'], [0.5, 'Standard bulk', 'Faster, a bit more fat']]
          : d.goal === 'lose' ? [[0.25, 'Gentle', 'Easy to sustain'], [0.5, 'Steady', 'Recommended'], [0.75, 'Aggressive', 'Hard, short-term only']]
            : [[0.25, 'Slow recomp', 'Small deficit']];
        const eta = h('p', { class: 'small eta' });
        const updEta = () => {
          const w = weeksToGoal(d);
          eta.textContent = w ? `📅 About ${w} weeks — around ${parseKey(addDays(todayKey(), w * 7)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : '';
        };
        updEta();
        return h('div', { class: 'stack' },
          numField('Goal weight', d.goalWeight, 30, 200, 0.5, ' kg', v => { d.goalWeight = v; updEta(); }),
          h('div', { class: 'opt-grid' }, paces.map(([p, l, s]) => opt(d.pace === p, () => pick('pace', p), h('b', null, l), h('span', { class: 'tiny muted' }, `${p} kg/week · ${s}`)))),
          eta);
      },
    },
    {
      id: 'activity', title: 'How active are you?', sub: 'Outside of the gym plan you’ll pick next.',
      body: () => h('div', { class: 'stack-xs' }, ACTIVITY.map(a => opt(d.activity === a.id, () => pick('activity', a.id), h('b', null, a.label), h('span', { class: 'tiny muted' }, a.sub)))),
    },
    {
      id: 'diet', title: 'What do you eat?', sub: 'We’ll only suggest food that fits.',
      body: () => h('div', { class: 'opt-grid three' }, DIETS.map(x => opt(d.diet === x.id, () => pick('diet', x.id), h('span', { class: 'opt-ic' }, x.icon), h('b', null, x.label)))),
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
        h('div', { class: 'row between' }, h('b', null, p.name), p.id === DEFAULT_PLAN_FOR_GOAL[d.goal] && h('span', { class: 'pill good' }, 'Best for you')),
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
          h('div', { class: 'ring-wrap' }, rings([{ value: 1, max: 1, color: COLORS.cal }, { value: 1, max: 1, color: COLORS.p }, { value: 1, max: 1, color: COLORS.c }, { value: 1, max: 1, color: COLORS.f }], 200, 14, 5),
            h('div', { class: 'ring-center' }, h('div', { class: 'ring-num' }, t.cal.toLocaleString('en-IN')), h('div', { class: 'tiny muted' }, 'kcal / day'))),
          h('div', { class: 'target-grid' },
            h('div', { class: 'tgt' }, h('i', { class: 'key p' }), h('b', null, t.p + 'g'), h('span', { class: 'tiny muted' }, 'protein')),
            h('div', { class: 'tgt' }, h('i', { class: 'key c' }), h('b', null, t.c + 'g'), h('span', { class: 'tiny muted' }, 'carbs')),
            h('div', { class: 'tgt' }, h('i', { class: 'key f' }), h('b', null, t.f + 'g'), h('span', { class: 'tiny muted' }, 'fat')),
            h('div', { class: 'tgt' }, h('span', null, '💧'), h('b', null, t.water / 1000 + ' L'), h('span', { class: 'tiny muted' }, 'water'))),
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
    host.replaceChildren(h('div', { class: 'ob-inner' },
      h('div', { class: 'ob-top' },
        step > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => { step--; draw(); } }, '←') : h('span'),
        h('div', { class: 'ob-progress' }, list.map((_, i) => h('i', { class: i <= step ? 'on' : '' }))),
        edit ? h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕') : h('span')),
      h('div', { class: 'ob-card', key: s.id },
        h('h2', { class: 'ob-t' }, s.title), h('p', { class: 'muted' }, s.sub),
        s.body()),
      h('button', { class: 'btn primary lg block ob-next', onclick: () => {
        const ok = s.ok ? s.ok() : true;
        if (ok !== true) { toast(ok, 'err'); return; }
        if (last) finish(); else { step++; draw(); }
      } }, last ? (edit ? 'Save changes' : 'Let’s go 🚀') : 'Continue')));
  }

  function close() {
    host.classList.add('closing');
    document.body.classList.remove('ob-open');
    setTimeout(() => host.remove(), 250);
  }

  function finish() {
    store.saveProfile({ ...d, name: d.name.trim(), onboarded: true, goalWeight: d.goal === 'maintain' ? null : d.goalWeight, customTargets: edit ? d.customTargets : null });
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
