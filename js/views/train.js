// =============================================================
// TRAIN — plan, today's session with set logging, rest timer, PRs
// =============================================================
import { h, weekdayOf, labelForKey, round, haptic, fill } from '../util.js';
import { sheet, toast, confetti, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { PLANS, DEFAULT_PLAN_FOR_GOAL } from '../../data/workouts.js';
import { WEEK } from '../../data/messes.js';
import { planDay } from '../routine.js';
import { pageHead, card, cardHead, bar } from './common.js';
import { icon, mealIcon } from '../components/icons.js';

const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

let openEx = null;

export function renderTrain(embedded = false) {
  const date = ctx.date;
  const day = store.day(date);
  const { plan, day: pd } = planDay(store.profile, date);
  const today = weekdayOf(date);

  return h('div', { class: 'page train' + (embedded ? ' embedded' : '') },
    embedded
      ? h('div', { class: 'row between embed-head' }, h('h2', { class: 'card-t' }, plan.name), h('button', { class: 'chip', onclick: planPicker }, 'Change plan'))
      : pageHead('Training', plan.name, h('button', { class: 'chip', onclick: planPicker }, 'Change plan')),
    h('div', { class: 'week-split' }, WEEK.map(d => {
      const x = plan.days[d];
      return h('div', { class: 'ws-day' + (d === today ? ' on' : '') + (x?.rest ? ' rest' : '') },
        h('span', { class: 'tiny' }, d.slice(0, 3)), h('b', { class: 'tiny' }, x?.rest ? 'Rest' : (x?.t || '').split(/[—+(]/)[0].trim()));
    })),
    h('div', { class: 'bento' },
      sessionCard(date, day, pd),
      prCard(),
      volumeCard()));
}

function lastSets(name, beforeKey) {
  for (let i = ctx.history.length - 1; i >= 0; i--) {
    const d = ctx.history[i];
    if (d.key >= beforeKey) continue;
    const sets = d.sets?.[name];
    if (sets && sets.some(s => s.w || s.r)) return { key: d.key, sets };
  }
  return null;
}

function sessionCard(date, day, pd) {
  if (!pd) return card('span2', emptyState(icon('leaf', { size: 36 }), 'No plan for today', null));
  const done = day.gymDone.length;
  return card('span2 session',
    cardHead(pd.t, h('span', { class: 'pill' + (done === pd.x.length ? ' good' : '') }, `${done}/${pd.x.length}`), labelForKey(date) + (pd.rest ? ' · recovery' : ' · tap an exercise to log sets')),
    !pd.rest && bar(done, pd.x.length, 'var(--volt)'),
    h('div', { class: 'ex-list' }, pd.x.map(([name, sets, reps], idx) => exerciseRow(date, day, name, sets, reps, idx))));
}

function exerciseRow(date, day, name, sets, reps, idx) {
  const isDone = day.gymDone.includes(idx);
  const logged = day.sets?.[name] || [];
  const prev = lastSets(name, date);
  const open = openEx === name;
  const toggleDone = () => {
    store.updateDay(date, d => {
      const p = d.gymDone.indexOf(idx);
      p >= 0 ? d.gymDone.splice(p, 1) : d.gymDone.push(idx);
    });
    haptic(15);
    const { day: pd } = planDay(store.profile, date);
    if (!isDone && store.day(date).gymDone.length === pd.x.length) { confetti(); toast('Workout complete!'); }
  };
  const row = h('div', { class: 'ex' + (isDone ? ' done' : '') + (open ? ' open' : '') },
    h('div', { class: 'ex-head' },
      h('button', { class: 'check' + (isDone ? ' on' : ''), 'aria-label': (isDone ? 'Undo ' : 'Mark done ') + name, onclick: toggleDone }, isDone ? icon('check', { size: 16, sw: 3 }) : null),
      h('button', { class: 'ex-main', onclick: () => { openEx = open ? null : name; ctx.refresh(); } },
        h('span', { class: 'small ex-name' }, name),
        h('span', { class: 'tiny muted' }, `${sets} × ${reps}` + (prev ? ` · last: ${prev.sets.filter(s => s.w || s.r).map(s => `${s.w || 0}×${s.r || 0}`).join(', ')}` : ''))),
      h('span', { class: 'tiny muted' }, logged.length ? `${logged.filter(s => s.r).length} sets` : '›')));
  if (open) row.appendChild(setLogger(date, name, sets, reps, prev, () => { if (!isDone) toggleDone(); }));
  return row;
}

function setLogger(date, name, nSets, reps, prev, onAllDone) {
  const cur = structuredClone(store.day(date).sets?.[name] || []);
  while (cur.length < nSets) cur.push({ w: prev?.sets[cur.length]?.w || '', r: '' });
  const wrap = h('div', { class: 'sets' });
  const commit = () => store.updateDay(date, d => { d.sets = { ...(d.sets || {}), [name]: cur.map(s => ({ w: +s.w || 0, r: +s.r || 0 })) }; });
  const draw = () => {
    fill(wrap, 
      h('div', { class: 'set-row head tiny muted' }, h('span', null, 'Set'), h('span', null, 'kg'), h('span', null, 'reps'), h('span', null, '')),
      ...cur.map((st, i) => {
        const w = h('input', { class: 'input xs', type: 'number', inputmode: 'decimal', value: st.w, placeholder: prev?.sets[i]?.w || '0', 'aria-label': `Set ${i + 1} weight` });
        const r = h('input', { class: 'input xs', type: 'number', inputmode: 'numeric', value: st.r, placeholder: String(reps).split('–')[0].replace(/\D/g, '') || '0', 'aria-label': `Set ${i + 1} reps` });
        w.addEventListener('change', () => { st.w = w.value; commit(); });
        r.addEventListener('change', () => { st.r = r.value; commit(); });
        return h('div', { class: 'set-row' }, h('span', { class: 'mono small' }, i + 1), w, r,
          h('button', { class: 'btn sm ghost', onclick: () => {
            st.w = w.value || w.placeholder; st.r = r.value || r.placeholder; commit(); draw();
            if (cur.every(s => +s.r > 0)) onAllDone();
            restTimer(90);
          } }, [icon('check', { size: 15, sw: 2.6 }), 'Rest']));
      }),
      h('div', { class: 'row gap' },
        h('button', { class: 'link small', onclick: () => { cur.push({ w: cur[cur.length - 1]?.w || '', r: '' }); draw(); } }, '+ Add set'),
        cur.length > 1 && h('button', { class: 'link small', onclick: () => { cur.pop(); commit(); draw(); } }, '− Remove set')));
  };
  draw();
  return wrap;
}

// ---------- floating rest timer ----------
let timerEl = null, timerInt = null;
export function restTimer(sec) {
  clearInterval(timerInt);
  timerEl?.remove();
  let left = sec;
  const label = h('b', { class: 'mono' }, '');
  const upd = () => { label.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
  timerEl = h('div', { class: 'rest-timer', role: 'timer' },
    h('span', { class: 'tiny' }, 'Rest'), label,
    h('button', { class: 'link tiny', onclick: () => { left += 30; upd(); } }, '+30s'),
    h('button', { class: 'icon-btn sm', 'aria-label': 'Stop timer', onclick: () => { clearInterval(timerInt); timerEl.remove(); } }, icon('x', { size: 16 })));
  document.body.appendChild(timerEl);
  upd();
  timerInt = setInterval(() => {
    left--; upd();
    if (left <= 0) {
      clearInterval(timerInt); haptic([200, 100, 200]);
      timerEl.classList.add('ding'); label.textContent = 'Go!';
      setTimeout(() => timerEl?.remove(), 2500);
    }
  }, 1000);
}

function prCard() {
  const best = {};
  ctx.history.forEach(d => Object.entries(d.sets || {}).forEach(([name, sets]) => sets.forEach(s => {
    const v = e1rm(+s.w, +s.r);
    if (v && (!best[name] || v > best[name].v)) best[name] = { v, w: +s.w, r: +s.r, key: d.key };
  })));
  const list = Object.entries(best).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
  return card('prs', cardHead('Personal records', null, 'Estimated 1-rep max (Epley)'),
    list.length ? h('div', { class: 'list' }, list.map(([n, b]) => h('div', { class: 'li' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, n), h('span', { class: 'li-s' }, `${b.w} kg × ${b.r} · ${labelForKey(b.key)}`)),
      h('b', { class: 'mono' }, round(b.v) + ' kg'))))
      : h('p', { class: 'muted small' }, 'Log weights and reps on any exercise and your PRs show up here.'));
}

function volumeCard() {
  const since = ctx.history.slice(-7);
  let vol = 0, sets = 0, sessions = 0;
  since.forEach(d => {
    const e = Object.values(d.sets || {});
    if (e.length || d.gymDone.length) sessions++;
    e.forEach(ss => ss.forEach(s => { if (+s.r) { sets++; vol += (+s.w || 0) * +s.r; } }));
  });
  return card('volume', cardHead('Last 7 days'),
    h('div', { class: 'stat-grid' },
      h('div', null, h('div', { class: 'big-num' }, sessions), h('div', { class: 'tiny muted' }, 'sessions')),
      h('div', null, h('div', { class: 'big-num' }, sets), h('div', { class: 'tiny muted' }, 'working sets')),
      h('div', null, h('div', { class: 'big-num' }, round(vol / 1000, 1), h('small', null, ' t')), h('div', { class: 'tiny muted' }, 'volume lifted'))));
}

function planPicker() {
  const rec = DEFAULT_PLAN_FOR_GOAL[store.profile.goal];
  const sh = sheet({
    title: 'Choose a training plan', sub: 'Your daily routine and workout card follow this plan', wide: true,
    body: h('div', { class: 'stack' }, PLANS.map(p => h('button', { class: 'opt-card' + (p.id === store.profile.plan ? ' on' : ''), onclick: () => { store.saveProfile({ plan: p.id }); toast(p.name + ' selected'); sh.close(); } },
      h('div', { class: 'row between' }, h('b', null, p.name), p.id === rec && h('span', { class: 'pill good' }, 'Recommended')),
      h('div', { class: 'tiny muted' }, p.tag + ' · ' + p.level),
      h('div', { class: 'small' }, p.blurb)))),
  });
}
