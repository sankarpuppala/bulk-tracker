// =============================================================
// TRAIN — plan, today's session with set logging, rest timer, PRs
// =============================================================
import { h, s, weekdayOf, labelForKey, round, haptic, fill } from '../util.js';
import { sheet, toast, confetti, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { PLANS, DEFAULT_PLAN_FOR_GOAL } from '../../data/workouts.js';
import { WEEK } from '../../data/messes.js';
import { planDay } from '../routine.js';
import { pageHead, card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { artDumbbell, artTrophy } from '../components/art.js';

const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

let openEx = null;
// one-shot motion hints, read by the next render only (the view re-renders on every log)
let justToggled = null;   // the exercise index just ticked, so its check springs
let ringWas = null;       // { key, pct } the ring showed last, so it advances from there

export function renderTrain(embedded = false) {
  const date = ctx.date;
  const day = store.day(date);
  const { plan, day: pd } = planDay(store.profile, date);
  const today = weekdayOf(date);

  return h('div', { class: 'page train' + (embedded ? ' embedded' : '') },
    embedded
      ? h('div', { class: 'row between embed-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Training plan'), h('h2', { class: 'card-t' }, plan.name)),
        h('button', { class: 'chip', onclick: planPicker }, icon('swap', { size: 15 }), 'Change plan'))
      : pageHead('Training', plan.name, h('button', { class: 'chip', onclick: planPicker }, 'Change plan'), { scene: 'gym' }),
    h('div', { class: 'week-split' }, WEEK.map(d => {
      const x = plan.days[d];
      return h('div', { class: 'ws-day' + (d === today ? ' on' : '') + (x?.rest ? ' rest' : '') },
        h('span', { class: 'tiny' }, d.slice(0, 3)),
        x?.rest ? h('span', { class: 'ws-ic' }, icon('moon', { size: 14 })) : h('span', { class: 'ws-ic' }, icon('dumbbell', { size: 14 })),
        h('b', { class: 'tiny' }, x?.rest ? 'Rest' : (x?.t || '').split(/[—+(]/)[0].trim()));
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

/** A small progress ring: done of total, drawn with a dash offset. */
function progressRing(done, total, key) {
  const R = 22, C = 2 * Math.PI * R, pct = total ? Math.min(1, done / total) : 0;
  const was = ringWas && ringWas.key === key && ringWas.pct !== pct ? ringWas.pct : null;
  ringWas = { key, pct };
  return h('div', { class: 'ss-ring' + (total && done >= total ? ' full' : '') + (was != null ? ' moved' : '') },
    s('svg', { viewBox: '0 0 56 56', width: 56, height: 56, 'aria-hidden': 'true', focusable: 'false' },
      s('circle', { cx: 28, cy: 28, r: R, class: 'ss-track' }),
      s('circle', { cx: 28, cy: 28, r: R, class: 'ss-arc', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': (C * (1 - pct)).toFixed(2), transform: 'rotate(-90 28 28)', style: `--c:${C.toFixed(2)};--from:${(C * (1 - (was ?? 0))).toFixed(2)}` })),
    h('b', { class: 'ss-ring-n num' }, done, h('small', null, '/' + total)));
}

function sessionCard(date, day, pd) {
  if (!pd) return card('span2 session', emptyState(artDumbbell(96), 'No plan for today', null));
  const done = day.gymDone.length, total = pd.x.length, all = done >= total;
  const rows = pd.x.map(([name, sets, reps], idx) => exerciseRow(date, day, name, sets, reps, idx));
  justToggled = null;
  return card('span2 session' + (pd.rest ? ' is-rest' : '') + (all ? ' is-done' : ''),
    h('div', { class: 'ss-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'eyebrow' }, labelForKey(date) + (pd.rest ? ' · recovery' : ' · session')),
        h('h2', { class: 'card-t ss-t' }, pd.t),
        h('div', { class: 'tiny ss-sub' }, pd.rest ? 'Easy movement and good sleep are how muscle is built.' : 'Tap an exercise to log sets')),
      h('div', { class: 'ss-art' }, artDumbbell(92))),
    h('div', { class: 'ss-progress' },
      progressRing(done, total, date + pd.t),
      h('div', { class: 'grow' },
        h('div', { class: 'small ss-p-t' }, all ? (pd.rest ? 'Recovery done' : 'Workout complete') : `${done} of ${total} ${pd.rest ? 'done' : 'exercises done'}`),
        h('div', { class: 'tiny muted' }, all ? 'Nice. Eat well and sleep early tonight.' : pd.rest ? 'Nothing heavy today' : `${pd.x.reduce((a, x) => a + (+x[1] || 0), 0)} working sets planned`)),
      all && h('span', { class: 'pill good' }, icon('check', { size: 13, sw: 2.4 }), 'Done')),
    h('div', { class: 'ex-list' }, rows));
}

function exerciseRow(date, day, name, sets, reps, idx) {
  const isDone = day.gymDone.includes(idx);
  const logged = day.sets?.[name] || [];
  const prev = lastSets(name, date);
  const open = openEx === name;
  const toggleDone = () => {
    justToggled = idx;
    store.updateDay(date, d => {
      const p = d.gymDone.indexOf(idx);
      p >= 0 ? d.gymDone.splice(p, 1) : d.gymDone.push(idx);
    });
    haptic(15);
    const { day: pd } = planDay(store.profile, date);
    if (!isDone && store.day(date).gymDone.length === pd.x.length) { confetti(); toast('Workout complete!'); }
  };
  const nLogged = logged.filter(s => s.r).length;
  const row = h('div', { class: 'ex' + (isDone ? ' done' : '') + (open ? ' open' : '') + (justToggled === idx ? ' pop' : '') },
    h('div', { class: 'ex-head' },
      h('button', { class: 'check' + (isDone ? ' on' : ''), 'aria-label': (isDone ? 'Undo ' : 'Mark done ') + name, 'aria-pressed': String(isDone), onclick: toggleDone }, isDone ? icon('check', { size: 16, sw: 3 }) : null),
      h('button', { class: 'ex-main', 'aria-expanded': String(open), onclick: () => { openEx = open ? null : name; ctx.refresh(); } },
        h('span', { class: 'small ex-name' }, name),
        h('span', { class: 'tiny ex-meta' }, h('span', { class: 'ex-sr num' }, `${sets} × ${reps}`), prev && h('span', { class: 'ex-last num' }, 'last ' + prev.sets.filter(s => s.w || s.r).map(s => `${s.w || 0}×${s.r || 0}`).join(', ')))),
      h('span', { class: 'ex-end' }, nLogged ? h('span', { class: 'ex-count num' }, `${nLogged} set${nLogged === 1 ? '' : 's'}`) : null, h('span', { class: 'ex-chev' }, icon('chevron', { size: 16 })))));
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
        const done = +st.r > 0;
        return h('div', { class: 'set-row' + (done ? ' set-done' : '') }, h('span', { class: 'set-n num' }, done ? icon('check', { size: 13, sw: 3 }) : i + 1), w, r,
          h('button', { class: 'btn sm ghost set-rest', onclick: () => {
            st.w = w.value || w.placeholder; st.r = r.value || r.placeholder; commit(); draw();
            if (cur.every(s => +s.r > 0)) onAllDone();
            restTimer(90);
          } }, [icon('check', { size: 15, sw: 2.6 }), 'Rest']));
      }),
      h('div', { class: 'row gap set-more' },
        h('button', { class: 'link small', onclick: () => { cur.push({ w: cur[cur.length - 1]?.w || '', r: '' }); draw(); } }, '+ Add set'),
        cur.length > 1 && h('button', { class: 'link small', onclick: () => { cur.pop(); commit(); draw(); } }, '− Remove set')));
  };
  draw();
  return wrap;
}

// ---------- floating rest timer: a countdown ring that empties as you rest ----------
let timerEl = null, timerInt = null;
export function restTimer(sec) {
  clearInterval(timerInt);
  timerEl?.remove();
  let left = sec, total = sec;
  const R = 25, C = 2 * Math.PI * R;
  const arc = s('circle', { cx: 32, cy: 32, r: R, class: 'rt-arc', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': 0, transform: 'rotate(-90 32 32)' });
  const label = h('b', { class: 'rt-time num' }, '');
  const upd = () => {
    label.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    arc.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, left) / total)).toFixed(2));
  };
  timerEl = h('div', { class: 'rest-timer', role: 'timer', 'aria-label': 'Rest timer' },
    h('div', { class: 'rt-dial' },
      s('svg', { viewBox: '0 0 64 64', width: 64, height: 64, class: 'rt-ring', 'aria-hidden': 'true', focusable: 'false' },
        s('circle', { cx: 32, cy: 32, r: R, class: 'rt-track' }), arc),
      label),
    h('div', { class: 'rt-text' }, h('span', { class: 'rt-k' }, 'Rest'), h('span', { class: 'rt-s' }, 'Breathe. Next set soon')),
    h('button', { class: 'rt-more', onclick: () => { left += 30; total = Math.max(total, left); upd(); } }, '+30s'),
    h('button', { class: 'icon-btn sm rt-x', 'aria-label': 'Stop timer', onclick: () => { clearInterval(timerInt); timerEl.remove(); } }, icon('x', { size: 16 })));
  document.body.appendChild(timerEl);
  upd();
  timerInt = setInterval(() => {
    left--; upd();
    if (left <= 0) {
      clearInterval(timerInt); haptic([200, 100, 200]);
      timerEl.classList.add('ding'); label.textContent = 'Go!';
      timerEl.querySelector('.rt-s').textContent = 'Time for your next set';
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
  return card('prs', cardHead([icon('trophy', { size: 19 }), 'Personal records'], null, 'Estimated 1-rep max (Epley)'),
    list.length ? h('div', { class: 'list' }, list.map(([n, b], i) => h('div', { class: 'li pr-li' + (i === 0 ? ' top' : '') },
      h('span', { class: 'pr-rank num', 'aria-hidden': 'true' }, i + 1),
      h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, n), h('span', { class: 'li-s' }, `${b.w} kg × ${b.r} · ${labelForKey(b.key)}`)),
      h('b', { class: 'pr-v num' }, round(b.v), h('small', null, ' kg')))))
      : h('div', { class: 'pr-empty' }, artTrophy(64), h('p', { class: 'muted small' }, 'Log weights and reps on any exercise and your PRs show up here.')));
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
      h('div', { class: 'vol-stat' }, h('div', { class: 'big-num' }, sessions), h('div', { class: 'tiny muted' }, 'sessions')),
      h('div', { class: 'vol-stat' }, h('div', { class: 'big-num' }, sets), h('div', { class: 'tiny muted' }, 'working sets')),
      h('div', { class: 'vol-stat' }, h('div', { class: 'big-num' }, round(vol / 1000, 1), h('small', null, ' t')), h('div', { class: 'tiny muted' }, 'volume lifted'))));
}

function planPicker() {
  const rec = DEFAULT_PLAN_FOR_GOAL[store.profile.goal];
  const sh = sheet({
    title: 'Choose a training plan', sub: 'Your daily routine and workout card follow this plan', wide: true,
    body: h('div', { class: 'stack plan-pick' }, PLANS.map(p => {
      const on = p.id === store.profile.plan;
      const nDays = Object.values(p.days).filter(d => !d.rest).length;
      return h('button', { class: 'opt-card' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { store.saveProfile({ plan: p.id }); toast(p.name + ' selected'); sh.close(); } },
        h('div', { class: 'row between gap' }, h('b', { class: 'pp-name' }, p.name), h('span', { class: 'row gap' }, on && h('span', { class: 'pill' }, icon('check', { size: 12, sw: 2.6 }), 'Current'), p.id === rec && h('span', { class: 'pill good' }, 'Recommended'))),
        h('div', { class: 'tiny muted' }, p.tag + ' · ' + p.level),
        h('div', { class: 'small pp-blurb' }, p.blurb),
        h('div', { class: 'pp-week', 'aria-hidden': 'true' }, WEEK.map(d => h('i', { class: p.days[d]?.rest ? 'rest' : '' }))),
        h('span', { class: 'plan-sr' }, `${nDays} training days a week`));
    })),
  });
}
