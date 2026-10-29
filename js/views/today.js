// =============================================================
// TODAY — the dashboard
// =============================================================
import { h, s, todayKey, addDays, parseKey, labelForKey, greeting, round, fmtNum, prettyTime, nowMin } from '../util.js';
import { rings, segmented, sheet, stepper, toast, emptyState, countUp } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MEALS } from '../../data/messes.js';
import { totals, itemMeal, MEAL_SPLIT, planPlate, makeMessItem, topUps, makeItem, guessMeal, COLORS, dietAllows } from '../nutrition.js';
import { menuFor, messById, timingsFor } from '../menus.js';
import { buildRoutine, planDay } from '../routine.js';
import { logItems, removeItems, addWater } from '../actions.js';
import { pageHead, card, cardHead, bar, syncPill } from './common.js';
import { dietDot } from './logsheet.js';
import { openMenuEditor } from './mess.js';

let plateMeal = null;

export function renderToday() {
  const date = ctx.date, pf = store.profile, t = ctx.targets();
  store.watchDay(date);
  const day = store.day(date), tt = totals(day.items);
  const isToday = date === todayKey();

  const streak = ctx.stats?.streak || 0;
  const head = pageHead(isToday ? greeting() : 'Looking back', isToday ? `Hey ${pf.name ? pf.name.split(' ')[0] : 'there'} 👋` : labelForKey(date),
    h('button', { class: 'streak-pill', title: 'Logging streak', onclick: () => ctx.go('stats') }, '🔥 ', h('b', null, streak)));

  return h('div', { class: 'page today' },
    head,
    h('div', { class: 'row between sub-head' }, syncPill(), !isToday && h('button', { class: 'chip on', onclick: () => ctx.setDate(todayKey()) }, '↩ Back to today')),
    dateStrip(date),
    festBanner(date),
    h('div', { class: 'bento' },
      hero(day, tt, t, date),
      nextUp(date, t),
      plateCard(date, day, tt, t),
      waterCard(date, day, t),
      weightCard(date, day),
      loggedCard(date, day, tt),
      workoutCard(date, day),
      timelineCard(date, t)));
}

// ---------- date strip ----------
function dateStrip(sel) {
  const today = todayKey();
  const strip = h('div', { class: 'date-strip', role: 'tablist' });
  for (let i = -13; i <= 1; i++) {
    const k = addDays(today, i), d = parseKey(k);
    const has = (store.days.get(k)?.items.length || 0) > 0;
    strip.appendChild(h('button', { class: 'date-pill' + (k === sel ? ' on' : '') + (has ? ' has' : '') + (k === today ? ' today' : ''), onclick: () => ctx.setDate(k), 'aria-label': labelForKey(k) },
      h('span', { class: 'dp-w' }, d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)),
      h('span', { class: 'dp-d' }, d.getDate()),
      h('i')));
  }
  requestAnimationFrame(() => strip.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  return strip;
}

// ---------- festival banner ----------
function festBanner(date) {
  const m = menuFor(store.profile.mess, date);
  if (!m.special) return null;
  return h('div', { class: 'fest' },
    h('div', { class: 'fest-emoji' }, m.special.emoji),
    h('div', null,
      h('div', { class: 'eyebrow' }, 'Special at ' + store.profile.mess + ' mess'),
      h('div', { class: 'fest-t' }, m.special.title),
      h('div', { class: 'small' }, 'Special menu for ' + m.special.meals.join(', ') + (m.special.note ? ' · ' + m.special.note : ''))));
}

// ---------- hero rings ----------
function hero(day, tt, t, date) {
  const left = t.cal - tt.cal;
  const num = h('div', { class: 'ring-num' }, '0');
  requestAnimationFrame(() => countUp(num, Math.abs(left)));
  const ins = insights(tt, t, day, date);
  return card('hero span2',
    h('div', { class: 'hero-grid' },
      h('div', { class: 'ring-wrap' },
        rings([
          { value: tt.cal, max: t.cal, color: COLORS.cal },
          { value: tt.p, max: t.p, color: COLORS.p },
          { value: tt.c, max: t.c, color: COLORS.c },
          { value: tt.f, max: t.f, color: COLORS.f },
        ], 210, 15, 5),
        h('div', { class: 'ring-center' }, num, h('div', { class: 'tiny muted' }, left >= 0 ? 'kcal left' : 'kcal over'))),
      h('div', { class: 'hero-side' },
        h('div', { class: 'eyebrow' }, goalLabel()),
        h('div', { class: 'hero-big' }, h('b', null, fmtNum(tt.cal)), h('span', { class: 'muted' }, ' / ' + fmtNum(t.cal) + ' kcal')),
        [['Protein', tt.p, t.p, COLORS.p, 'p'], ['Carbs', tt.c, t.c, COLORS.c, 'c'], ['Fat', tt.f, t.f, COLORS.f, 'f']].map(([l, v, mx, col, k]) =>
          h('div', { class: 'macro-row' },
            h('div', { class: 'row between' }, h('span', { class: 'small' }, h('i', { class: 'key ' + k }), l), h('span', { class: 'mono small' }, h('b', null, round(v)), ' / ' + mx + 'g')),
            bar(v, mx, col))),
        tt.price > 0 && h('div', { class: 'tiny muted' }, `💸 ₹${round(tt.price)} spent on outside food`))),
    ins.length > 0 && h('div', { class: 'insights' }, ins.map(i => h('div', { class: 'insight ' + (i.tone || '') }, h('span', null, i.icon), h('span', null, i.text), i.action))));
}

function goalLabel() {
  const pf = store.profile;
  const g = { gain: 'Bulking', lose: 'Cutting', maintain: 'Maintaining', recomp: 'Recomp' }[pf.goal];
  return pf.goalWeight ? `${g} · ${pf.weight} → ${pf.goalWeight} kg` : g;
}

function insights(tt, t, day, date) {
  const out = [];
  const pf = store.profile;
  const isToday = date === todayKey();
  const hr = new Date().getHours();
  const gapP = t.p - tt.p, gapCal = t.cal - tt.cal;
  if (!day.items.length) {
    out.push({ icon: '👋', text: isToday ? 'Nothing logged yet. Start with breakfast — or tap + to log anything.' : 'Nothing logged for this day.' });
    return out;
  }
  if (tt.p >= t.p && Math.abs(gapCal) < t.cal * 0.1) out.push({ icon: '🎯', text: 'Targets locked in. Perfect day.', tone: 'good' });
  if (gapP > 20 && (!isToday || hr >= 15)) {
    const tops = topUps({ p: gapP, cal: gapCal }, { diet: pf.diet, goal: pf.goal, limit: 2 });
    if (tops.length) out.push({
      icon: '🥚', text: `${round(gapP)}g protein to go — try ${tops.map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${x.food.n.toLowerCase()}`).join(' + ')}`,
      action: h('button', { class: 'link small', onclick: () => logItems(date, tops.map(x => makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, meal: guessMeal() }))) }, 'Log it'),
    });
  }
  if (pf.goal === 'lose' && gapCal < -100) out.push({ icon: '🚶', text: `${round(-gapCal)} kcal over. A 30-min brisk walk burns ~150 — no stress, tomorrow’s a new day.`, tone: 'warn' });
  if (pf.goal === 'gain' && gapCal > 700 && isToday && hr >= 18) out.push({ icon: '🥤', text: `Still ${round(gapCal)} kcal short. Banana shake + peanut butter toast ≈ 600 kcal.`, tone: 'warn' });
  if (isToday && hr >= 14 && day.water < t.water * 0.4) out.push({ icon: '💧', text: 'You’re behind on water — grab a bottle.' });
  const junk = day.items.filter(i => ['chips', 'choc', 'drinks', 'fastfood'].includes(i.cat));
  if (junk.length >= 3) out.push({ icon: '🍟', text: `${junk.length} junk items today (${round(totals(junk).cal)} kcal). Swap one for fruit or makhana tomorrow?` });
  return out.slice(0, 3);
}

// ---------- next up ----------
function nextUp(date, t) {
  if (date !== todayKey()) return null;
  const ev = buildRoutine(store.profile, date, t).find(e => e.next);
  if (!ev) return card('next', cardHead('Day done 🌙'), h('p', { class: 'muted small' }, 'Rest well — sleep is when you grow.'));
  const mins = ev.m - nowMin();
  const when = mins > 0 ? (mins >= 60 ? `in ${Math.floor(mins / 60)}h ${mins % 60}m` : `in ${mins} min`) : 'now';
  return card('next',
    h('div', { class: 'eyebrow' }, 'Next up · ' + when),
    h('div', { class: 'next-row' }, h('div', { class: 'next-ic' }, ev.icon), h('div', null, h('div', { class: 'next-t' }, ev.title), h('div', { class: 'tiny muted' }, prettyTime(ev.time) + ' · ' + ev.sub))),
    ev.meal ? h('button', { class: 'btn ghost sm', onclick: () => { plateMeal = ev.meal; ctx.refresh(); document.getElementById('plate-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'See my plate →')
      : ev.gym ? h('button', { class: 'btn ghost sm', onclick: () => ctx.go('train') }, 'Open workout →') : null);
}

// ---------- mess plate ----------
function mealBudget(meal, day, t) {
  const eatenOther = totals(day.items.filter(i => itemMeal(i) !== meal));
  const done = new Set(day.items.map(itemMeal));
  const open = MEALS.map(m => m.id).filter(m => m === meal || !done.has(m));
  const share = MEAL_SPLIT[meal] / open.reduce((a, m) => a + MEAL_SPLIT[m], 0);
  return { cal: Math.max(150, (t.cal - eatenOther.cal) * share), p: Math.max(5, (t.p - eatenOther.p) * share) };
}

function plateCard(date, day, tt, t) {
  const pf = store.profile;
  const mess = messById(pf.mess);
  if (!mess) return card('span2 plate', cardHead('Your plate'), emptyState('🍽️', 'No mess selected', 'Pick your mess in Profile to get a suggested plate for every meal.', h('button', { class: 'btn primary', onclick: () => ctx.go('me') }, 'Choose mess')));
  const m = menuFor(pf.mess, date);
  if (!plateMeal) {
    const tm = timingsFor(pf);
    const now = nowMin();
    plateMeal = date !== todayKey() ? 'lunch' : (MEALS.find(x => (+tm[x.id][1].split(':')[0] * 60 + +tm[x.id][1].split(':')[1]) > now)?.id || 'dinner');
  }
  const meal = plateMeal;
  const items = m.meals[meal];
  const budget = mealBudget(meal, day, t);
  const tm = timingsFor(pf)[meal];
  const seg = segmented(MEALS.map(x => ({ value: x.id, label: x.label, icon: m.special?.meals.includes(x.id) ? '✨' : x.icon })), meal, v => { plateMeal = v; ctx.refresh(); }, 'meal-seg');

  let body;
  if (!m.hasAny) {
    body = emptyState('📝', `No menu for ${mess.id} yet`, 'Add this week’s menu once — the app will suggest your plate every meal. Admins can publish it for everyone.',
      h('button', { class: 'btn primary', onclick: () => openMenuEditor(pf.mess) }, 'Add menu'));
  } else if (!items.length) {
    body = emptyState('🍽️', 'Nothing listed for this meal', null);
  } else {
    const plan = planPlate(items, budget, { diet: pf.diet, goal: pf.goal });
    const already = day.items.filter(i => itemMeal(i) === meal && i.cat === 'mess').length > 0;
    const skipped = plan.skipped.filter(x => dietAllows(pf.diet, x.diet));
    body = h('div', { class: 'stack' },
      h('div', { class: 'tiny muted' }, `${tm[0]}–${tm[1]} · budget ≈ ${round(budget.cal)} kcal, ${round(budget.p)}g protein for your goal`),
      h('div', { class: 'plate' }, plan.picks.map(pk => plateRow(date, pk.item, pk.servings, meal, true))),
      h('div', { class: 'total-bar' },
        h('span', null, h('b', null, round(plan.totals.cal)), ' kcal · ', h('b', null, round(plan.totals.p)), 'g protein'),
        h('button', { class: 'btn primary sm', onclick: () => logItems(date, plan.picks.map(pk => makeMessItem(pk.item, pk.servings, meal, pf.mess))) }, already ? '+ Log plate again' : '✓ Ate this plate')),
      skipped.length > 0 && h('details', { class: 'more' }, h('summary', null, `Also on the menu (${skipped.length})`),
        h('div', { class: 'plate' }, skipped.map(it => plateRow(date, it, 1, meal, false)))),
      plan.totals.p < budget.p - 10 && topUpRow(date, budget.p - plan.totals.p, meal));
  }
  const el = card('span2 plate',
    cardHead(m.special?.meals.includes(meal) ? `✨ ${m.special.title}` : 'Your plate', h('button', { class: 'chip', onclick: () => ctx.go('mess') }, mess.id + ' mess →'), 'Suggested servings to hit your targets'),
    seg, body);
  el.id = 'plate-card';
  return el;
}

function plateRow(date, it, servings, meal, suggested) {
  let n = servings;
  const sv = h('span', { class: 'serv' }, '× ' + n);
  return h('div', { class: 'plate-row' + (suggested ? '' : ' dim') },
    dietDot(it.diet),
    h('div', { class: 'grow' }, h('div', { class: 'small' }, it.n), h('div', { class: 'tiny muted mono' }, `${round(it.cal * n)} kcal · ${round(it.p * n)}g P`)),
    suggested && sv,
    h('button', { class: 'icon-btn sm add', 'aria-label': 'Log ' + it.n, onclick: () => logItems(date, [makeMessItem(it, n, meal, store.profile.mess)]) }, '+'));
}

function topUpRow(date, gapP, meal) {
  const pf = store.profile;
  const tops = topUps({ p: gapP, cal: 0 }, { diet: pf.diet, goal: pf.goal, limit: 3 });
  if (!tops.length) return null;
  return h('div', { class: 'topups' },
    h('div', { class: 'tiny muted' }, `Mess plate is ${round(gapP)}g light on protein — add one:`),
    h('div', { class: 'chip-row' }, tops.map(x => h('button', { class: 'chip', onclick: () => logItems(date, [makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, meal })]) },
      `+ ${x.qty > 1 ? x.qty + '× ' : ''}${x.food.n} (${round(x.p)}g)`))));
}

// ---------- water ----------
function waterCard(date, day, t) {
  const pct = Math.min(1, day.water / t.water);
  const glass = s('svg', { viewBox: '0 0 60 80', class: 'glass', 'aria-hidden': 'true' },
    s('defs', {}, s('clipPath', { id: 'gclip' }, s('path', { d: 'M8 4 H52 L46 76 H14 Z' }))),
    s('g', { 'clip-path': 'url(#gclip)' },
      s('rect', { x: 0, y: 0, width: 60, height: 80, fill: 'var(--c-water)', opacity: '0.1' }),
      s('path', { class: 'wave', d: `M-60 ${80 - 72 * pct} q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 V80 H-60 Z`, fill: 'var(--c-water)', opacity: '0.85' })),
    s('path', { d: 'M8 4 H52 L46 76 H14 Z', fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  return card('water',
    cardHead('Water', h('span', { class: 'tiny muted mono' }, Math.round(pct * 100) + '%')),
    h('div', { class: 'water-row' }, glass,
      h('div', null, h('div', { class: 'big-num' }, round(day.water / 1000, 2), h('small', null, ' L')), h('div', { class: 'tiny muted' }, 'of ' + t.water / 1000 + ' L'))),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost sm', 'aria-label': 'Remove 250 ml', onclick: () => addWater(date, -250) }, '−'),
      h('button', { class: 'btn sm grow water-btn', onclick: () => addWater(date, 250) }, '+ 250 ml'),
      h('button', { class: 'btn sm grow water-btn', onclick: () => addWater(date, 500) }, '+ 500')));
}

// ---------- weight ----------
function weightCard(date, day) {
  const hist = ctx.history.filter(d => d.weight);
  const last = day.weight || hist[hist.length - 1]?.weight || store.profile.weight;
  const prev = hist.length > 1 ? hist[hist.length - 2].weight : null;
  const delta = day.weight && prev ? round(day.weight - prev, 1) : null;
  return card('weight',
    cardHead('Weight', delta != null && h('span', { class: 'pill ' + (delta === 0 ? '' : (delta > 0) === (store.profile.goal === 'gain') ? 'good' : 'warn') }, (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + Math.abs(delta) + ' kg')),
    h('div', { class: 'big-num' }, last, h('small', null, ' kg')),
    h('div', { class: 'tiny muted' }, day.weight ? 'Logged for ' + labelForKey(date).toLowerCase() : 'Weigh in — mornings, after the loo'),
    h('button', { class: 'btn ghost sm block', onclick: () => weightSheet(date, last) }, day.weight ? 'Edit' : 'Log weight'));
}

export function weightSheet(date, start) {
  let v = +start || 60;
  const sh = sheet({
    title: 'Log weight', sub: labelForKey(date),
    body: h('div', { class: 'stack center' },
      stepper(v, { min: 25, max: 250, step: 0.1, onChange: x => { v = x; }, fmt: x => x.toFixed(1) + ' kg' }),
      h('p', { class: 'tiny muted' }, 'Tip: daily weight bounces ±1 kg with water & food. The 7-day trend in Stats is what matters.'),
      h('button', { class: 'btn primary block lg', onclick: () => {
        store.updateDay(date, d => { d.weight = round(v, 1); });
        if (date === todayKey()) store.saveProfile({ weight: round(v, 1) });
        toast('Weight saved ⚖️'); sh.close(); ctx.reloadHistory();
      } }, 'Save')),
  });
}

// ---------- logged list ----------
function loggedCard(date, day, tt) {
  const groups = MEALS.map(m => ({ ...m, items: day.items.filter(i => itemMeal(i) === m.id) }));
  const yKey = addDays(date, -1);
  return card('span2 logged',
    cardHead('Logged', h('div', { class: 'row gap' },
      h('button', { class: 'chip', onclick: async () => {
        const y = await store.loadDay(yKey);
        if (!y.items.length) { toast('Nothing logged yesterday', 'warn'); return; }
        logItems(date, y.items.map(i => ({ ...i, id: Math.random().toString(36).slice(2), ts: Date.now() })));
      } }, '⟲ Copy yesterday'),
      h('button', { class: 'chip on', onclick: () => ctx.openLog() }, '+ Add')), `${day.items.length} items · ${fmtNum(tt.cal)} kcal`),
    day.items.length === 0 ? emptyState('🍽️', 'Your plate is empty', 'Log mess meals from “Your plate” above, or tap + for snacks, canteen food and drinks.') :
      groups.filter(g => g.items.length).map(g => {
        const gt = totals(g.items);
        return h('div', { class: 'log-group' },
          h('div', { class: 'log-gh' }, h('span', null, g.icon + ' ' + g.label), h('span', { class: 'tiny muted mono' }, `${round(gt.cal)} kcal · ${round(gt.p)}g P`),
            h('button', { class: 'link tiny', onclick: () => ctx.openLog({ meal: g.id }) }, '+ add')),
          g.items.map(i => h('div', { class: 'log-item' },
            dietDot(i.diet),
            h('div', { class: 'grow' },
              h('div', { class: 'small' }, i.n),
              h('div', { class: 'tiny muted mono' }, [(i.qty && i.qty !== 1 ? i.qty + ' × ' : '') + (i.unit || ''), `${round(i.p, 1)}P ${round(i.c)}C ${round(i.f ?? 0)}F`].filter(Boolean).join(' · '))),
            i.price ? h('span', { class: 'pill' }, '₹' + round(i.price)) : null,
            h('b', { class: 'mono small' }, round(i.cal)),
            h('button', { class: 'icon-btn sm del', 'aria-label': 'Remove ' + i.n, onclick: () => removeItems(date, [i.id]) }, '✕'))));
      }));
}

// ---------- workout summary ----------
function workoutCard(date, day) {
  const { plan, day: pd } = planDay(store.profile, date);
  if (!pd) return null;
  const done = day.gymDone.length;
  return card('workout',
    cardHead(pd.rest ? 'Rest day' : 'Workout', h('span', { class: 'tiny muted' }, plan.name)),
    h('div', { class: 'small' }, pd.t),
    !pd.rest && h('div', { class: 'stack-xs' }, bar(done, pd.x.length, 'var(--volt)'), h('div', { class: 'tiny muted' }, `${done}/${pd.x.length} exercises done`)),
    h('button', { class: 'btn sm block ' + (done ? 'ghost' : 'primary'), onclick: () => ctx.go('train') }, pd.rest ? 'View recovery plan' : done ? 'Continue workout' : 'Start workout'));
}

// ---------- routine timeline ----------
function timelineCard(date, t) {
  const ev = buildRoutine(store.profile, date, t);
  return card('span2 timeline-card',
    cardHead('Your day plan', h('button', { class: 'chip', onclick: () => ctx.go('me', 'routine') }, 'Edit times'), 'Built from your mess hours, training & sleep'),
    h('ol', { class: 'timeline' }, ev.map(e => h('li', { class: 'tl' + (e.past ? ' past' : '') + (e.next ? ' now' : '') },
      h('span', { class: 'tl-time mono' }, prettyTime(e.time)),
      h('span', { class: 'tl-dot' }, e.icon),
      h('div', null, h('div', { class: 'small tl-t' }, e.title), h('div', { class: 'tiny muted' }, e.sub))))));
}
