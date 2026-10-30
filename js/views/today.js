// =============================================================
// TODAY — "what do I do next?"
// One plate gauge, one focus card for the next meal, and the log.
// Everything else (menus, training, routine) lives in Plan.
// =============================================================
import { h, s, todayKey, addDays, parseKey, labelForKey, greeting, round, fmtNum, prettyTime, nowMin, fill } from '../util.js';
import { segmented, sheet, stepper, toast, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MEALS } from '../../data/messes.js';
import { totals, itemMeal, MEAL_SPLIT, planPlate, makeMessItem, topUps, makeItem, guessMeal, COLORS, dietAllows } from '../nutrition.js';
import { menuFor, messById, timingsFor } from '../menus.js';
import { buildRoutine, planDay } from '../routine.js';
import { logItems, removeItems, addWater } from '../actions.js';
import { pageHead, card, cardHead, bar } from './common.js';
import { icon, mealIcon } from '../components/icons.js';
import { plateGauge, bowlGauge } from '../components/plategauge.js';
import { focusCard, plateList, mealGlyph } from '../components/focus.js';
import { changeBanner, dietDot } from '../components/bits.js';
import { artEmptyPlate } from '../components/art.js';
import { openMenuEditor } from './mess.js';

let plateMeal = null;
let loggedOpen = true;
/** Servings the user nudged on the suggested plate: `${date}|${meal}` → { dishName: servings } */
const adjust = new Map();

export function renderToday() {
  const date = ctx.date, pf = store.profile, t = ctx.targets();
  store.watchDay(date);
  const day = store.day(date), tt = totals(day.items);
  const isToday = date === todayKey();
  const streak = ctx.stats?.streak || 0;
  const first = pf.name ? pf.name.split(' ')[0] : '';

  const head = pageHead(
    parseKey(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
    isToday ? (first ? `${greeting()}, ${first}` : greeting()) : labelForKey(date),
    h('button', { class: 'streak-pill', title: 'Logging streak', 'aria-label': `${streak} day logging streak`, onclick: () => ctx.go('progress') },
      icon('flame', { size: 18, sw: 2 }), h('b', { class: 'num' }, streak)));

  return h('div', { class: 'page today' },
    head,
    !isToday && h('div', { class: 'row between sub-head' }, h('span'), h('button', { class: 'chip on', onclick: () => ctx.setDate(todayKey()) }, icon('back', { size: 16 }), 'Back to today')),
    dateStrip(date),
    h('div', { class: 'today-grid' },
      h('div', { class: 'col' }, hero(day, tt, t, date), banner(date), plateCard(date, day, t)),
      h('div', { class: 'col' }, quickRow(date, day, t), loggedCard(date, day, tt))));
}

// ---------- date strip ----------
function dateStrip(sel) {
  const today = todayKey();
  const strip = h('div', { class: 'date-strip', role: 'group', 'aria-label': 'Choose a day' });
  for (let i = -13; i <= 1; i++) {
    const k = addDays(today, i), d = parseKey(k);
    const has = (store.days.get(k)?.items.length || 0) > 0;
    strip.appendChild(h('button', { class: 'date-pill' + (k === sel ? ' on' : '') + (has ? ' has' : '') + (k === today ? ' today' : ''), onclick: () => ctx.setDate(k), 'aria-label': labelForKey(k), 'aria-pressed': String(k === sel) },
      h('span', { class: 'dp-w' }, d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)),
      h('span', { class: 'dp-d' }, d.getDate()),
      h('i')));
  }
  requestAnimationFrame(() => strip.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  return strip;
}

// ---------- festival / change banner ----------
function banner(date) {
  const m = menuFor(store.profile.mess, date);
  if (!m.special) return null;
  return changeBanner({
    tone: 'special', emoji: m.special.emoji, eyebrow: 'Special at ' + store.profile.mess + ' mess', title: m.special.title,
    text: 'Special menu for ' + m.special.meals.join(', ') + (m.special.note ? ' · ' + m.special.note : ''),
  });
}

// ---------- hero: the plate and three katoris ----------
function hero(day, tt, t, date) {
  const left = t.cal - tt.cal, pLeft = t.p - tt.p;
  const ins = insights(tt, t, day, date);
  const line = !day.items.length
    ? 'A clean plate. Fill it one meal at a time.'
    : left >= 0
      ? `${fmtNum(left)} kcal and ${fmtNum(Math.max(0, pLeft))} g of protein still to go.`
      : `${fmtNum(-left)} kcal over target. Tomorrow’s a fresh plate.`;
  return card('hero',
    h('div', { class: 'hero-plate' },
      plateGauge({ eaten: tt.cal, target: t.cal }),
      h('div', { class: 'hero-line' }, h('span', { class: 'hero-goal' }, icon('target', { size: 14, sw: 2 }), goalLabel()), h('p', { class: 'small', style: { marginTop: '8px' } }, line))),
    h('div', { class: 'hero-side stack' },
      h('div', { class: 'bowls' },
        bowlGauge({ label: 'Protein', value: tt.p, max: t.p, color: COLORS.p }),
        bowlGauge({ label: 'Carbs', value: tt.c, max: t.c, color: COLORS.c }),
        bowlGauge({ label: 'Fat', value: tt.f, max: t.f, color: COLORS.f })),
      tt.price > 0 && h('div', { class: 'tiny muted hero-meta' }, h('span', null, icon('wallet', { size: 14 }), `₹${round(tt.price)} spent on outside food`)),
      ins.length > 0 && h('div', { class: 'insights' }, ins.map(i => h('div', { class: 'insight ' + (i.tone || '') }, icon(i.icon, { size: 18 }), h('span', null, i.text), i.action)))));
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
    out.push({ icon: 'sparkle', text: isToday ? 'Nothing logged yet. Start with your next meal below, or tap Snap to log anything.' : 'Nothing logged for this day.' });
    return out;
  }
  if (tt.p >= t.p && Math.abs(gapCal) < t.cal * 0.1) out.push({ icon: 'target', text: 'Targets locked in. Perfect day.', tone: 'good' });
  if (gapP > 20 && (!isToday || hr >= 15)) {
    const tops = topUps({ p: gapP, cal: gapCal }, { diet: pf.diet, goal: pf.goal, limit: 2 });
    if (tops.length) out.push({
      icon: 'egg', text: `${round(gapP)} g protein to go. Try ${tops.map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${x.food.n.toLowerCase()}`).join(' + ')}.`,
      action: h('button', { class: 'link small', onclick: () => logItems(date, tops.map(x => makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, meal: guessMeal() }))) }, 'Log it'),
    });
  }
  if (pf.goal === 'lose' && gapCal < -100) out.push({ icon: 'target', text: `${round(-gapCal)} kcal over. A 30-minute brisk walk burns about 150. No stress, tomorrow’s a new day.`, tone: 'warn' });
  if (pf.goal === 'gain' && gapCal > 700 && isToday && hr >= 18) out.push({ icon: 'cup', text: `Still ${round(gapCal)} kcal short. A banana shake and peanut-butter toast is about 600 kcal.`, tone: 'warn' });
  if (isToday && hr >= 14 && day.water < t.water * 0.4) out.push({ icon: 'drop', text: 'You’re behind on water. Grab a bottle.' });
  const junk = day.items.filter(i => ['chips', 'choc', 'drinks', 'fastfood'].includes(i.cat));
  if (junk.length >= 3) out.push({ icon: 'alert', text: `${junk.length} snack-aisle items today (${round(totals(junk).cal)} kcal). Swap one for fruit or makhana tomorrow?` });
  return out.slice(0, 3);
}

// ---------- focus card: the next meal ----------
function mealBudget(meal, day, t) {
  const eatenOther = totals(day.items.filter(i => itemMeal(i) !== meal));
  const done = new Set(day.items.map(itemMeal));
  const open = MEALS.map(m => m.id).filter(m => m === meal || !done.has(m));
  const share = MEAL_SPLIT[meal] / open.reduce((a, m) => a + MEAL_SPLIT[m], 0);
  return { cal: Math.max(150, (t.cal - eatenOther.cal) * share), p: Math.max(5, (t.p - eatenOther.p) * share) };
}

const toMin = hhmm => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };

function plateCard(date, day, t) {
  const pf = store.profile;
  const mess = messById(pf.mess);
  if (!mess) {
    return focusCard({ glyph: icon('bowl', { size: 26 }), eyebrow: 'Your plate', title: 'Pick your mess',
      body: emptyState(artEmptyPlate(112), 'No mess selected', 'Choose your mess and every meal gets a suggested plate for your goal.', h('button', { class: 'btn primary', onclick: () => ctx.go('you') }, 'Choose mess')) });
  }
  const m = menuFor(pf.mess, date);
  const tm = timingsFor(pf);
  const now = nowMin();
  const upcoming = date !== todayKey() ? 'lunch' : (MEALS.find(x => toMin(tm[x.id][1]) > now)?.id || 'dinner');
  if (!plateMeal) plateMeal = upcoming;
  const meal = plateMeal;
  const info = MEALS.find(x => x.id === meal);
  const items = m.meals[meal];
  const budget = mealBudget(meal, day, t);
  const win = tm[meal];
  const loggedMeals = new Set(day.items.filter(i => i.cat === 'mess').map(itemMeal));

  const switcher = h('div', { class: 'meal-switch m-' + meal, role: 'tablist', 'aria-label': 'Meal' }, MEALS.map(x => h('button', {
    class: `ms${x.id === meal ? ' on' : ''}${loggedMeals.has(x.id) ? ' done' : ''}`, role: 'tab', 'aria-selected': String(x.id === meal),
    onclick: () => { plateMeal = x.id; ctx.refresh(); },
  }, mealIcon(x.id, { size: 20 }), x.label)));

  let eyebrow = meal === upcoming && date === todayKey() ? untilLabel(win) : (m.special?.meals.includes(meal) ? 'Special menu' : 'Suggested plate');
  const title = info.label;
  const meta = [h('span', null, `${mess.id} mess · ${win[0]}–${win[1]}`), h('br'),
    h('span', { class: 'focus-budget num', title: 'Your budget for this meal' }, icon('target', { size: 13, sw: 2.2 }), `${round(budget.cal)} kcal · ${round(budget.p)} g P`)];
  const right = h('button', { class: 'icon-btn', 'aria-label': 'Open the full menu', onclick: () => ctx.go('plan', 'menus') }, icon('chevron', { size: 18 }));

  let body, footer = null;
  if (!m.hasAny) {
    body = emptyState(artEmptyPlate(112), `No menu for ${mess.id} yet`, 'Add this week’s menu once and every meal gets a suggested plate. Paste it from WhatsApp or start from a sample week.',
      h('button', { class: 'btn primary', onclick: () => openMenuEditor(pf.mess) }, icon('plus', { size: 18 }), 'Add menu'));
  } else if (!items.length) {
    body = emptyState(artEmptyPlate(96), 'Nothing listed for this meal', null);
  } else {
    const key = `${date}|${meal}`;
    const adj = adjust.get(key) || {};
    const plan = planPlate(items, budget, { diet: pf.diet, goal: pf.goal });
    const picks = plan.picks.map(pk => ({ item: pk.item, diet: pk.diet, servings: adj[pk.item.n] ?? pk.servings }));
    const sum = picks.reduce((a, x) => { a.cal += x.item.cal * x.servings; a.p += x.item.p * x.servings; return a; }, { cal: 0, p: 0 });
    const already = day.items.some(i => itemMeal(i) === meal && i.cat === 'mess');
    const skipped = plan.skipped.filter(x => dietAllows(pf.diet, x.diet));
    const rows = picks.map(x => ({ name: x.item.n, cal: x.item.cal, p: x.item.p, diet: x.diet, servings: x.servings }));
    const fit = Math.abs(sum.cal - budget.cal) / budget.cal <= 0.15;

    body = h('div', { class: 'stack' },
      plateList(rows, {
        onStep: (i, d) => {
          const name = picks[i].item.n, next = Math.max(0.5, Math.min(4, picks[i].servings + d));
          adjust.set(key, { ...adj, [name]: next }); ctx.refresh();
        },
        onAdd: i => logItems(date, [makeMessItem(picks[i].item, picks[i].servings, meal, pf.mess)]),
      }),
      skipped.length > 0 && h('details', { class: 'more' }, h('summary', null, `Also on the menu (${skipped.length})`),
        plateList(skipped.map(it => ({ name: it.n, cal: it.cal, p: it.p, diet: it.diet, servings: 1, suggested: false })), {
          onAdd: i => logItems(date, [makeMessItem(skipped[i], 1, meal, pf.mess)]),
        })),
      plan.totals.p < budget.p - 10 && topUpRow(date, budget.p - plan.totals.p, meal));

    footer = [
      h('div', { class: 'total-bar' },
        h('span', { class: 'num' }, h('b', null, round(sum.cal)), ' kcal · ', h('b', null, round(sum.p)), ' g protein'),
        fit ? h('span', { class: 'fits' }, icon('check', { size: 14, sw: 2.6 }), 'Fits your budget') : h('span', { class: 'tiny muted' }, sum.cal > budget.cal ? 'A little over budget' : 'A little under budget')),
      h('button', { class: 'btn primary lg block', onclick: () => { adjust.delete(key); logItems(date, picks.map(x => makeMessItem(x.item, x.servings, meal, pf.mess))); } },
        icon('check', { size: 20, sw: 2.4 }), already ? 'Log this plate again' : 'Log this plate'),
    ];
  }
  return focusCard({ id: 'plate-card', hue: meal, glyph: mealGlyph(meal), eyebrow, title, meta, right, body: h('div', { class: 'stack' }, switcher, body), footer });
}

function untilLabel(win) {
  const mins = toMin(win[0]) - nowMin();
  if (nowMin() >= toMin(win[0]) && nowMin() <= toMin(win[1])) return 'Serving now';
  if (mins <= 0) return 'Up next';
  return mins >= 60 ? `Next · in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Next · in ${mins} min`;
}

function topUpRow(date, gapP, meal) {
  const pf = store.profile;
  const tops = topUps({ p: gapP, cal: 0 }, { diet: pf.diet, goal: pf.goal, limit: 3 });
  if (!tops.length) return null;
  return h('div', { class: 'topups' },
    h('div', { class: 'tiny muted' }, `The mess plate is ${round(gapP)} g light on protein. Add one:`),
    h('div', { class: 'chip-row' }, tops.map(x => h('button', { class: 'chip', onclick: () => logItems(date, [makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, meal })]) },
      icon('plus', { size: 14, sw: 2.4 }), `${x.qty > 1 ? x.qty + '× ' : ''}${x.food.n} (${round(x.p)} g)`))));
}

// ---------- quick row: water · weight · workout ----------
function quickRow(date, day, t) {
  return h('div', { class: 'quick' }, waterTile(date, day, t), weightTile(date, day), workoutTile(date, day));
}

function waterTile(date, day, t) {
  const pct = Math.min(1, day.water / t.water);
  const glass = s('svg', { viewBox: '0 0 60 80', class: 'glass', 'aria-hidden': 'true' },
    s('defs', {}, s('clipPath', { id: 'gclip' }, s('path', { d: 'M8 4 H52 L46 76 H14 Z' }))),
    s('g', { 'clip-path': 'url(#gclip)' },
      s('rect', { x: 0, y: 0, width: 60, height: 80, fill: 'var(--c-water)', opacity: '0.1' }),
      s('path', { class: 'wave', d: `M-60 ${80 - 72 * pct} q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 V80 H-60 Z`, fill: 'var(--c-water)', opacity: '0.85' })),
    s('path', { d: 'M8 4 H52 L46 76 H14 Z', fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  return h('section', { class: 'qtile water' },
    h('div', { class: 'qtile-h' }, h('span', null, 'Water'), icon('drop', { size: 18 })),
    h('div', { class: 'water-row' }, glass, h('div', null, h('div', { class: 'big-num' }, round(day.water / 1000, 2), h('small', null, ' L')), h('div', { class: 'tiny muted num' }, 'of ' + t.water / 1000 + ' L'))),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost sm', 'aria-label': 'Remove 250 ml', onclick: () => addWater(date, -250) }, icon('minus', { size: 16 })),
      h('button', { class: 'btn sm grow water-btn', onclick: () => addWater(date, 250) }, '+ 250 ml')));
}

function weightTile(date, day) {
  const hist = ctx.history.filter(d => d.weight);
  const last = day.weight || hist[hist.length - 1]?.weight || store.profile.weight;
  const prev = hist.length > 1 ? hist[hist.length - 2].weight : null;
  const delta = day.weight && prev ? round(day.weight - prev, 1) : null;
  return h('section', { class: 'qtile weight' },
    h('div', { class: 'qtile-h' }, h('span', null, 'Weight'), icon('scale', { size: 18 })),
    h('div', null, h('div', { class: 'big-num' }, last, h('small', null, ' kg')),
      delta != null ? h('span', { class: 'pill ' + (delta === 0 ? '' : (delta > 0) === (store.profile.goal === 'gain') ? 'good' : 'warn') }, (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + Math.abs(delta) + ' kg')
        : h('div', { class: 'tiny muted' }, day.weight ? 'Logged ' + labelForKey(date).toLowerCase() : 'Mornings, after the loo')),
    h('button', { class: 'btn ghost sm block', onclick: () => weightSheet(date, last) }, day.weight ? 'Edit' : 'Log weight'));
}

export function weightSheet(date, start) {
  let v = +start || 60;
  const sh = sheet({
    title: 'Log weight', sub: labelForKey(date),
    body: h('div', { class: 'stack center' },
      stepper(v, { min: 25, max: 250, step: 0.1, onChange: x => { v = x; }, fmt: x => x.toFixed(1) + ' kg' }),
      h('p', { class: 'tiny muted' }, 'Daily weight bounces ±1 kg with water and food. The 7-day trend in Progress is what matters.'),
      h('button', { class: 'btn primary block lg', onclick: () => {
        store.updateDay(date, d => { d.weight = round(v, 1); });
        if (date === todayKey()) store.saveProfile({ weight: round(v, 1) });
        toast('Weight saved'); sh.close(); ctx.reloadHistory();
      } }, 'Save')),
  });
}

function workoutTile(date, day) {
  const { plan, day: pd } = planDay(store.profile, date);
  if (!pd) return null;
  const done = day.gymDone.length;
  return h('section', { class: 'qtile workout' },
    h('div', { class: 'qtile-h' }, h('span', null, pd.rest ? 'Rest day' : 'Workout'), icon('dumbbell', { size: 18 })),
    h('div', null, h('div', { class: 'small', style: { fontWeight: 600 } }, pd.t), h('div', { class: 'tiny muted' }, plan.name)),
    !pd.rest && h('div', { class: 'stack-xs' }, bar(done, pd.x.length, 'var(--c-p)'), h('div', { class: 'tiny muted num' }, `${done}/${pd.x.length} exercises`)),
    h('button', { class: 'btn sm block ' + (done ? 'ghost' : 'primary'), onclick: () => ctx.go('plan', 'training') }, pd.rest ? 'Recovery plan' : done ? 'Continue' : 'Start workout'));
}

// ---------- logged list ----------
function loggedCard(date, day, tt) {
  const groups = MEALS.map(m => ({ ...m, items: day.items.filter(i => itemMeal(i) === m.id) }));
  const yKey = addDays(date, -1);
  const bodyId = 'logged-body';
  const body = h('div', { id: bodyId, class: 'logged-body' + (loggedOpen ? '' : ' hide') },
    day.items.length === 0
      ? emptyState(artEmptyPlate(120), 'Your plate is empty', 'Log a mess meal from the card above, or tap Snap for snacks, canteen food and drinks.')
      : groups.filter(g => g.items.length).map(g => {
        const gt = totals(g.items);
        return h('div', { class: 'log-group' },
          h('div', { class: 'log-gh' }, h('span', null, mealIcon(g.id, { size: 18 }), g.label), h('span', { class: 'tiny muted num' }, `${round(gt.cal)} kcal · ${round(gt.p)} g P`),
            h('button', { class: 'link tiny', onclick: () => ctx.openLog({ meal: g.id }) }, '+ add')),
          g.items.map(i => h('div', { class: 'log-item' },
            dietDot(i.diet),
            h('button', { class: 'grow log-edit', 'aria-label': 'Edit ' + i.n, onclick: () => editItemSheet(date, i) },
              h('div', { class: 'small' }, i.n),
              h('div', { class: 'tiny muted mono' }, [(i.qty && i.qty !== 1 ? i.qty + ' × ' : '') + (i.unit || ''), `${round(i.p, 1)}P ${round(i.c)}C ${round(i.f ?? 0)}F`].filter(Boolean).join(' · '))),
            i.price ? h('span', { class: 'pill' }, '₹' + round(i.price)) : null,
            h('b', { class: 'mono small' }, round(i.cal)),
            h('button', { class: 'icon-btn sm del', 'aria-label': 'Remove ' + i.n, onclick: () => removeItems(date, [i.id]) }, icon('x', { size: 16 })))));
      }));
  const toggle = h('button', { class: 'icon-btn sm chev' + (loggedOpen ? ' open' : ''), 'aria-expanded': String(loggedOpen), 'aria-controls': bodyId, 'aria-label': 'Show or hide the log', onclick: () => {
    loggedOpen = !loggedOpen;
    body.classList.toggle('hide', !loggedOpen);
    toggle.classList.toggle('open', loggedOpen);
    toggle.setAttribute('aria-expanded', String(loggedOpen));
  } }, icon('down', { size: 18 }));
  return h('section', { class: 'card logged' + (loggedOpen ? ' open' : '') },
    h('div', { class: 'logged-sum' },
      h('div', { class: 'grow' }, h('h2', { class: 'card-t' }, 'Logged'), h('div', { class: 'tiny muted num' }, `${day.items.length} item${day.items.length === 1 ? '' : 's'} · ${fmtNum(tt.cal)} kcal`)),
      h('span', { class: 'row gap' },
        h('button', { class: 'chip', onclick: async () => {
          const y = await store.loadDay(yKey);
          if (!y.items.length) { toast('Nothing logged yesterday', 'warn'); return; }
          logItems(date, y.items.map(i => ({ ...i, id: Math.random().toString(36).slice(2), ts: Date.now() })));
        } }, icon('undo', { size: 15 }), 'Copy yesterday'),
        h('button', { class: 'chip on', onclick: () => ctx.openLog() }, icon('plus', { size: 15, sw: 2.2 }), 'Add'),
        toggle)),
    body);
}

// ---------- edit a logged item ----------
function editItemSheet(date, item) {
  const gramMode = /^[\d.]+\s*(g|ml)$/.test(item.unit || '');
  const base = (gramMode ? +item.g : +item.qty) || 1;
  const unitLabel = gramMode ? (/ml/.test(item.unit) ? 'ml' : 'g') : (item.unit || 'serving');
  let v = base, meal = itemMeal(item);
  const scaled = () => {
    const k = v / base;
    const out = { ...item, cal: round(item.cal * k), p: round(item.p * k, 1), c: round(item.c * k, 1), f: round((item.f ?? 0) * k, 1), meal };
    if (item.price) out.price = round(item.price * k);
    if (gramMode) { out.g = round(v); out.unit = `${round(v)} ${unitLabel}`; } else { out.qty = v; out.g = item.g ? round(item.g * k) : item.g; }
    return out;
  };
  const preview = h('div', { class: 'total-bar' });
  const update = () => { const x = scaled(); fill(preview, h('span', { class: 'macro-line' }, h('b', null, x.cal), ' kcal · ', h('span', { class: 'mp' }, round(x.p, 1) + 'P'), ' ', h('span', { class: 'mc' }, round(x.c) + 'C'), ' ', h('span', { class: 'mf' }, round(x.f) + 'F')), x.price ? h('span', { class: 'pill' }, '₹' + x.price) : null); };
  update();
  const apply = () => {
    const x = scaled();
    store.updateDay(date, d => { const idx = d.items.findIndex(y => y.id === item.id); if (idx >= 0) d.items[idx] = x; });
    toast('Updated'); sh.close();
  };
  const sh = sheet({
    title: item.n, sub: 'Logged to ' + MEALS.find(m => m.id === itemMeal(item)).label,
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', null, gramMode ? 'Amount' : 'How many'),
        stepper(v, { min: gramMode ? 5 : 0.5, max: gramMode ? 3000 : 30, step: gramMode ? 10 : 0.5, onChange: x => { v = x; update(); }, fmt: x => gramMode ? `${x} ${unitLabel}` : `${x} × ${unitLabel}` })),
      h('div', { class: 'field' }, h('label', null, 'Meal'),
        segmented(MEALS.map(m => ({ value: m.id, label: m.label, icon: mealIcon(m.id, { size: 16 }) })), meal, x => { meal = x; }, 'meal-seg')),
      preview,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn danger grow', onclick: () => { removeItems(date, [item.id]); sh.close(); } }, 'Remove'),
        h('button', { class: 'btn primary grow', onclick: apply }, 'Save'))),
  });
}
