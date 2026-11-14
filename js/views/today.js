// =============================================================
// TODAY — "what do I do next?"
// One plate gauge, one focus card for the next meal, and the log.
// Everything else (menus, training, routine) lives in Plan.
//
// The app rebuilds this whole page on every log. Animated values
// (the plate, the katoris, the water) carry on from where they were
// through tween() in plategauge.js; the little bits of visual memory
// below make sure nothing replays its entrance on a re-render.
// =============================================================
import { h, s, todayKey, addDays, parseKey, labelForKey, greeting, round, fmtNum, nowMin, fill, clamp } from '../util.js';
import { segmented, sheet, stepper, toast, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MEALS } from '../../data/messes.js';
import { totals, itemMeal, makeMessItem, makeItem, guessMeal, COLORS } from '../nutrition.js';
import { messById, weeklyMenu, useOfficialMenu } from '../menus.js';
import { planner, suggestTopUps } from '../planner.js';
import { getFood } from '../search.js';
import { currentPhase, checkInIsDue } from '../goals.js';
import { phaseLabel } from '../engine/goal.js';
import { MEAL_LABEL } from '../engine/dayplan.js';
import { openCheckIn } from './goalplanner.js';
import { openNotToday } from './nottoday.js';
import { ratingRow } from './ratings.js';
import { planDay } from '../routine.js';
import { logItems, removeItems, addWater } from '../actions.js';
import { pageHead, card, bar } from './common.js';
import { icon, mealIcon } from '../components/icons.js';
import { plateGauge, bowlGauge, tween } from '../components/plategauge.js';
import { focusCard, plateList } from '../components/focus.js';
import { changeBanner, dietDot } from '../components/bits.js';
import { artEmptyPlate, artMascot, artMeal, artWater, artDumbbell, artGarnish } from '../components/art.js';
import { openMenuEditor } from './mess.js';

let plateMeal = null;
let loggedOpen = true;
/** Servings the user nudged on the suggested plate: `${date}|${meal}` → { dishName: servings } */
const adjust = new Map();

/** Visual memory between renders. None of this is data; it only decides what moves. */
const view = {
  page: null,             // the .page.today element on screen
  date: null,             // the day it showed
  sel: null,              // selected date pill, so it springs only when it changes
  stripX: null,           // the date strip's scroll position
  meal: null, mealIdx: null,   // meal switcher, so the pill slides and the plate cross-fades
  items: null,            // ids of logged items already shown, so only new ones slide in
  pHit: null,             // was protein at target last render
  cheer: new Set(),       // days Kato has cheered this session (at most once each)
  splash: 0,              // when +250 ml was tapped
  banners: new Set(),     // banners already on screen
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderToday() {
  const date = ctx.date, pf = store.profile, t = ctx.targets();
  store.watchDay(date);
  const day = store.day(date), tt = totals(day.items);
  const isToday = date === todayKey();
  const streak = ctx.stats?.streak || 0;
  const first = pf.name ? pf.name.split(' ')[0] : '';
  const inPlace = !!view.page?.isConnected;
  const sameDay = inPlace && view.date === date;

  // the hero first: when it already has Kato (an empty day, protein hit) the scene leaves him out
  const heroCard = hero(day, tt, t, date, sameDay);
  const hr = new Date().getHours();
  const sceneKato = heroCard.querySelector('.kato-note') ? null : hr >= 22 || hr < 5 ? 'sleepy' : hr < 9 ? 'wave' : 'happy';
  const head = pageHead(
    parseKey(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
    isToday ? (first ? `${greeting()}, ${first}` : greeting()) : labelForKey(date),
    streakChip(streak),
    { scene: { motif: 'mess', kato: sceneKato } });
  head.classList.add('today-head');

  const notes = [checkInBanner(isToday), officialMenuBanner(), banner(date), changeBannerFor(isToday)].filter(Boolean);
  steadyBanners(notes, inPlace);

  const page = h('div', { class: 'page today' },
    head,
    !isToday && h('div', { class: 'row between sub-head' }, h('span'), h('button', { class: 'chip on', onclick: () => ctx.setDate(todayKey()) }, icon('back', { size: 16 }), 'Back to today')),
    dateStrip(date, inPlace),
    h('div', { class: 'today-grid' },
      heroCard,
      h('div', { class: 'today-side' },
        notes.length > 0 && h('div', { class: 'today-notes' }, notes),
        plateCard(date, day, t, sameDay)),
      quickRow(date, day, t, sameDay),
      loggedCard(date, day, tt, sameDay)));
  view.page = page; view.date = date;
  return page;
}

// ---------- greeting ----------
const toMin = hhmm => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };


function streakChip(streak) {
  const id = 'fl' + Math.random().toString(36).slice(2, 7);
  const flame = s('svg', { viewBox: '0 0 24 24', class: 'flame', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, s('linearGradient', { id, x1: 0, y1: 1, x2: 0, y2: 0 },
      s('stop', { offset: '0', style: 'stop-color:var(--hue-lunch)' }),
      s('stop', { offset: '1', style: 'stop-color:var(--hue-breakfast)' }))),
    s('path', { class: 'fl-out', fill: `url(#${id})`, d: 'M12 2.6c.9 3.6 5.6 5.7 5.6 10.8a5.6 5.6 0 0 1-11.2 0c0-2.4 1.1-3.7 2.4-5 .2 1.5.9 2.4 1.7 2.8C10 8.4 10.7 5.2 12 2.6z' }),
    s('path', { class: 'fl-in', d: 'M12 10.6c1.3 1.7 3.1 3 3.1 5.3a3.1 3.1 0 0 1-6.2 0c0-1.5 1-2.6 1.7-3.3.2.9.5 1.3 1 1.5.1-1.3.2-2.4.4-3.5z' }));
  return h('button', { class: 'streak-pill' + (streak > 0 ? ' lit' : ''), title: 'Logging streak', 'aria-label': `${streak} day logging streak`, onclick: () => ctx.go('progress') },
    h('span', { class: 'flame-wrap' }, flame), h('b', { class: 'num' }, streak));
}

// ---------- date strip ----------
function dateStrip(sel, inPlace) {
  const today = todayKey();
  const moved = inPlace && view.sel != null && view.sel !== sel;
  const strip = h('div', { class: 'date-strip', role: 'group', 'aria-label': 'Choose a day' });
  for (let i = -13; i <= 1; i++) {
    const k = addDays(today, i), d = parseKey(k);
    const has = (store.days.get(k)?.items.length || 0) > 0;
    strip.appendChild(h('button', {
      class: 'date-pill' + (k === sel ? ' on' : '') + (has ? ' has' : '') + (k === today ? ' today' : '') + (k === sel && moved ? ' pop' : '') + (k > today ? ' ahead' : ''),
      onclick: () => ctx.setDate(k), 'aria-label': labelForKey(k), 'aria-pressed': String(k === sel),
    },
      h('span', { class: 'dp-w' }, d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)),
      h('span', { class: 'dp-d' }, d.getDate()),
      h('i')));
  }
  // keep the strip where the person left it; glide only when the selection moves
  const keep = inPlace ? view.stripX : null;
  strip.addEventListener('scroll', () => { view.stripX = strip.scrollLeft; }, { passive: true });
  requestAnimationFrame(() => {
    const on = strip.querySelector('.on');
    if (!on || !strip.isConnected) return;
    const target = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    if (keep == null) strip.scrollLeft = target;
    else {
      strip.scrollLeft = keep;
      if (moved) strip.scrollTo({ left: target, behavior: reduced() ? 'auto' : 'smooth' });
    }
    view.stripX = strip.scrollLeft;
  });
  view.sel = sel;
  return strip;
}

// ---------- festival / change / check-in banners ----------
/** Banners that were already showing keep still; only a new one pops in. */
function steadyBanners(list, inPlace) {
  const seen = new Set();
  for (const b of list) {
    const k = b.className + '|' + (b.querySelector('.banner-t')?.textContent || '');
    seen.add(k);
    if (inPlace && view.banners.has(k)) b.classList.add('steady');
  }
  view.banners = seen;
}

function banner(date) {
  const sp = planner.planFor(date).special;
  if (!sp) return null;
  return changeBanner({
    tone: 'special', emoji: sp.emoji, eyebrow: 'Special at ' + store.profile.mess + ' mess', title: sp.title,
    text: 'Special menu for ' + sp.meals.join(', ') + (sp.note ? ' · ' + sp.note : ''),
  });
}

/** "Dinner changed: paneer → aloo. Protein −14 g, so we added 2 eggs at snacks." with a diff sheet. */
function changeBannerFor(isToday) {
  const pending = isToday ? planner.pendingChange() : null;
  if (!pending) return null;
  const { date, change } = pending;
  const when = date === todayKey() ? 'Today' : 'Tomorrow';
  return changeBanner({
    tone: 'change', iconName: 'swap', eyebrow: `Plan updated · ${when}`, title: change.text,
    action: h('div', { class: 'row gap' },
      h('button', { class: 'btn sm', onclick: () => changeSheet(pending) }, 'See why'),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Dismiss', onclick: () => { planner.ackAll(); ctx.refresh(); } }, icon('x', { size: 16 }))),
  });
}

function changeSheet({ date, change }) {
  const sgn = n => (n > 0 ? '+' : '−') + Math.abs(round(n));
  const why = change.reason === 'menu-change' ? 'the menu changed' : change.reason === 'override' ? 'you changed a meal' : 'your targets changed';
  const sh = sheet({
    title: 'Why your plan changed', sub: `${labelForKey(date)} · ${why}`,
    body: h('div', { class: 'stack' },
      change.diffs.map(d => h('section', { class: 'card diffrow' },
        h('div', { class: 'row between' }, h('b', null, MEAL_LABEL[d.meal]), h('span', { class: 'tiny muted num' }, `${sgn(d.dP)} g protein · ${sgn(d.dCal)} kcal`)),
        d.removed.length > 0 && h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Gone: '), d.removed.join(', ')),
        d.added.length > 0 && h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Now: '), d.added.join(', ')),
        d.topAdded.length > 0 && h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Added to cover protein: '), d.topAdded.join(', ')),
        d.topRemoved.length > 0 && h('div', { class: 'small' }, h('span', { class: 'muted' }, 'No longer needed: '), d.topRemoved.join(', ')))),
      h('button', { class: 'btn primary block', onclick: () => { planner.ackAll(); sh.close(); ctx.refresh(); } }, 'Got it')),
  });
}

/** The committee published a new menu, but this person is still on their own edited copy. */
function officialMenuBanner() {
  const mess = store.profile.mess;
  if (!mess || !weeklyMenu(mess).officialNewer) return null;
  return changeBanner({
    tone: 'change', iconName: 'bowl', eyebrow: `${mess} mess`, title: 'The mess committee updated the menu',
    text: 'You are still seeing your own edited copy, so your plan is built from it.',
    action: h('button', { class: 'btn primary sm', onclick: () => { useOfficialMenu(mess); toast('Switched to the committee’s menu'); } }, 'Use their menu'),
  });
}

/** Weekly check-in prompt, when one is due. */
function checkInBanner(isToday) {
  if (!isToday || !checkInIsDue()) return null;
  return changeBanner({
    tone: 'info', iconName: 'progress', eyebrow: 'Weekly check-in', title: 'See if your numbers match the plan',
    text: 'Compares your weight trend with what the plan expects and adjusts calories if needed.',
    action: h('button', { class: 'btn primary sm', onclick: () => openCheckIn() }, 'Check in'),
  });
}

// ---------- hero: the plate and three katoris ----------
function hero(day, tt, t, date, sameDay) {
  const left = t.cal - tt.cal, pLeft = t.p - tt.p;
  const empty = !day.items.length;
  const line = empty
    ? ['A clean plate. Fill it one meal at a time.']
    : left >= 0
      ? [h('b', { class: 'num' }, `${fmtNum(left)} kcal`), ' and ', h('b', { class: 'num' }, `${fmtNum(Math.max(0, pLeft))} g`), ' of protein still to go.']
      : [h('b', { class: 'num' }, `${fmtNum(-left)} kcal`), ' over target. Tomorrow’s a fresh plate.'];

  // protein: celebrate the moment it crosses the target, once
  const pHit = !empty && t.p > 0 && tt.p >= t.p;
  const crossed = sameDay && view.pHit === false && pHit;
  if (crossed) view.cheer.add(date);
  view.pHit = pHit;

  const protein = bowlGauge({ label: 'Protein', value: tt.p, max: t.p, color: COLORS.p, key: 'today:p' });
  if (crossed) protein.querySelector('.bowl-art').classList.add('hit-target', 'celebrate');

  let kato = null;
  if (empty) {
    kato = date === todayKey()
      ? katoNote('hungry', 'Your plate is waiting', 'Nothing logged yet. Start with your next meal below, or tap Snap to log anything.')
      : katoNote('sleepy', 'A quiet day', 'Nothing logged for this day.');
  } else if (pHit && view.cheer.has(date)) {
    kato = katoNote('cheer', 'Protein target hit', 'That’s the hard one done for today. Everything else is a bonus.', crossed);
  }
  const ins = empty ? [] : insights(tt, t, day, date);

  return card('hero' + (empty ? ' is-empty' : ''),
    // garnish at the four corners frames the steel thali like food on a table
    h('div', { class: 'hero-garnish', 'aria-hidden': 'true' }, ['tl', 'tr', 'bl', 'br'].map(corner => artGarnish({ corner, size: 132 }))),
    h('div', { class: 'hero-plate' },
      h('div', { class: 'hero-stage' }, plateGauge({ eaten: tt.cal, target: t.cal, size: 'var(--hero-gauge)', key: 'today:kcal' })),
      h('div', { class: 'hero-line' },
        h('span', { class: 'hero-goal' }, icon('target', { size: 14, sw: 2 }), goalLabel()),
        h('p', { class: 'hero-sum' }, line))),
    h('div', { class: 'hero-side' },
      h('div', { class: 'bowls' },
        protein,
        bowlGauge({ label: 'Carbs', value: tt.c, max: t.c, color: COLORS.c, key: 'today:c' }),
        bowlGauge({ label: 'Fat', value: tt.f, max: t.f, color: COLORS.f, key: 'today:f' })),
      tt.price > 0 && h('div', { class: 'tiny muted hero-meta' }, h('span', null, icon('wallet', { size: 14 }), `₹${round(tt.price)} spent on outside food`)),
      kato,
      ins.length > 0 && h('ul', { class: 'insights' }, ins.map(i => h('li', { class: 'insight ' + (i.tone || '') },
        h('span', { class: 'ins-ic' }, icon(i.icon, { size: 16, sw: 2 })), h('span', { class: 'ins-t' }, i.text), i.action)))));
}

/** Kato with a word for the moment. At most one on the page. */
function katoNote(mood, title, text, fresh = false) {
  return h('div', { class: `kato-note mood-${mood}${fresh ? ' fresh' : ''}` },
    h('div', { class: 'kato' }, artMascot({ mood, size: 76 })),
    h('div', { class: 'kato-bubble' }, h('b', null, title), h('p', null, text)));
}

function goalLabel() {
  const pf = store.profile;
  const cp = currentPhase();
  if (cp && ['break', 'minicut', 'maintain'].includes(cp.phase.kind)) return `${phaseLabel(cp.phase.kind)} · week ${cp.week}`;
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
    const tops = suggestTopUps({ p: gapP, cal: gapCal }, { diet: pf.diet, goal: pf.goal, limit: 2 });
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
/** A plan entry as the menu-item shape that makeMessItem expects. */
const asMi = e => ({ n: e.name, cal: e.cal, p: e.p, c: e.c, f: e.f, diet: e.diet });

function plateCard(date, day, t, sameDay) {
  const pf = store.profile;
  const mess = messById(pf.mess);
  if (!mess) {
    return focusCard({ glyph: icon('bowl', { size: 26 }), eyebrow: 'Your plate', title: 'Pick your mess',
      body: emptyState(artEmptyPlate(112), 'No mess selected', 'Choose your mess and every meal gets a suggested plate for your goal.', h('button', { class: 'btn primary', onclick: () => ctx.go('you') }, 'Choose mess')) });
  }
  // the planner owns budgets, plates and top-ups; this card only shows them
  const plan = planner.planFor(date);
  const now = nowMin();
  const upcoming = date !== todayKey() ? 'lunch' : (plan.meals.find(m => toMin(m.window[1]) > now)?.id || 'dinner');
  if (!plateMeal) plateMeal = upcoming;
  const meal = plateMeal;
  const info = MEALS.find(x => x.id === meal);
  const pm = plan.meals.find(m => m.id === meal);
  const budget = pm.budget, win = pm.window;
  const custom = pm.source.kind === 'custom';
  const loggedMeals = new Set(day.items.filter(i => i.cat === 'mess').map(itemMeal));

  // the selected pill slides from where it was; the plate below cross-fades
  const idx = Math.max(0, MEALS.findIndex(x => x.id === meal));
  const fromIdx = sameDay && view.mealIdx != null ? view.mealIdx : idx;
  const swapped = sameDay && view.meal != null && view.meal !== meal;
  view.meal = meal; view.mealIdx = idx;

  const switcher = h('div', { class: 'meal-switch m-' + meal, role: 'tablist', 'aria-label': 'Meal', style: `--i:${fromIdx}` }, MEALS.map(x => h('button', {
    class: `ms${x.id === meal ? ' on' : ''}${loggedMeals.has(x.id) ? ' done' : ''}`, role: 'tab', 'aria-selected': String(x.id === meal),
    onclick: () => { plateMeal = x.id; ctx.refresh(); },
  }, mealIcon(x.id, { size: 20 }), x.label)));
  if (fromIdx !== idx) {
    requestAnimationFrame(() => {
      getComputedStyle(switcher, '::before').transform;     // settle the old position first, so it transitions
      switcher.style.setProperty('--i', idx);
    });
  }

  const until = meal === upcoming && date === todayKey() ? untilLabel(win) : null;
  let eyebrow = until || (custom ? 'Custom today' : plan.special?.meals.includes(meal) ? 'Special menu' : 'Suggested plate');
  if (custom && eyebrow !== 'Custom today') eyebrow += ' · custom today';
  const title = info.label;
  const meta = [h('span', null, `${mess.id} mess · ${win[0]}–${win[1]}`), h('br'),
    h('span', { class: 'focus-budget num', title: 'Your budget for this meal' }, icon('target', { size: 13, sw: 2.2 }), `${round(budget.cal)} kcal · ${round(budget.p)} g P`)];
  const right = h('button', { class: 'icon-btn', 'aria-label': 'Open the full menu', onclick: () => ctx.go('plan', 'menus') }, icon('chevron', { size: 18 }));

  let body, footer = null;
  if (!plan.hasMenu && !custom) {
    body = emptyState(artEmptyPlate(112), `No menu for ${mess.id} yet`, 'Add this week’s menu once and every meal gets a suggested plate. Paste it from WhatsApp or start from a sample week.',
      h('button', { class: 'btn primary', onclick: () => openMenuEditor(pf.mess) }, icon('plus', { size: 18 }), 'Add menu'));
  } else if (!pm.menu.length) {
    body = h('div', { class: 'stack' }, emptyState(artEmptyPlate(96), 'Nothing listed for this meal', null), notThisToday(date, meal));
  } else {
    const key = `${date}|${meal}`;
    const adj = adjust.get(key) || {};
    const picks = pm.plate.map(e => ({ item: asMi(e), diet: e.diet, servings: adj[e.name] ?? e.servings }));
    const sum = picks.reduce((a, x) => { a.cal += x.item.cal * x.servings; a.p += x.item.p * x.servings; return a; }, { cal: 0, p: 0 });
    const already = day.items.some(i => itemMeal(i) === meal && i.cat === 'mess');
    const rows = picks.map(x => ({ name: x.item.n, cal: x.item.cal, p: x.item.p, diet: x.diet, servings: x.servings }));
    const fit = Math.abs(sum.cal - budget.cal) / budget.cal <= 0.15;
    const ratio = budget.cal > 0 ? sum.cal / budget.cal : 0;
    const meter = h('span', { class: 'budget-meter', 'aria-hidden': 'true' }, h('i'));
    tween('today:meter', meter, [clamp(ratio, 0, 1.25) / 1.25], ([f]) => meter.style.setProperty('--fill', f.toFixed(4)), { start: [0], delay: 200 });

    body = h('div', { class: 'stack' },
      plateList(rows, {
        onStep: (i, d) => {
          const name = picks[i].item.n, next = Math.max(0.5, Math.min(4, picks[i].servings + d));
          adjust.set(key, { ...adj, [name]: next }); ctx.refresh();
        },
        onAdd: i => logItems(date, [makeMessItem(picks[i].item, picks[i].servings, meal, pf.mess)]),
      }),
      pm.others.length > 0 && h('details', { class: 'more' }, h('summary', null, `Also on the menu (${pm.others.length})`),
        plateList(pm.others.map(it => ({ name: it.name, cal: it.cal, p: it.p, diet: it.diet, servings: 1, suggested: false })), {
          onAdd: i => logItems(date, [makeMessItem(asMi(pm.others[i]), 1, meal, pf.mess)]),
        })),
      topUpRow(date, plan, pm),
      already && ratingRow(date, meal, day.items.filter(i => i.cat === 'mess' && itemMeal(i) === meal)),
      notThisToday(date, meal));

    footer = [
      h('div', { class: 'total-bar' + (fit ? ' fit' : '') },
        h('span', { class: 'num' }, h('b', null, round(sum.cal)), ' kcal · ', h('b', null, round(sum.p)), ' g protein'),
        fit ? h('span', { class: 'fits' }, icon('check', { size: 14, sw: 2.6 }), 'Fits your budget') : h('span', { class: 'tiny muted' }, sum.cal > budget.cal ? 'A little over budget' : 'A little under budget'),
        // the plate against the meal's budget; the words above say the same thing
        meter),
      h('button', { class: 'btn primary lg block log-plate', onclick: () => { adjust.delete(key); logItems(date, picks.map(x => makeMessItem(x.item, x.servings, meal, pf.mess))); } },
        icon('check', { size: 20, sw: 2.4 }), already ? 'Log this plate again' : 'Log this plate'),
    ];
  }
  body.classList.add('plate-body');
  if (swapped && !reduced()) body.classList.add('swap-in');
  return focusCard({
    id: 'plate-card', hue: meal, glyph: artMeal(meal, 72), eyebrow, live: until === 'Serving now', title, meta, right,
    body: h('div', { class: 'stack' }, switcher, body), footer,
  });
}

const notThisToday = (date, meal) => h('button', { class: 'link small not-today', onclick: () => openNotToday(date, meal) }, icon('swap', { size: 14 }), 'Not this today');

function untilLabel(win) {
  const mins = toMin(win[0]) - nowMin();
  if (nowMin() >= toMin(win[0]) && nowMin() <= toMin(win[1])) return 'Serving now';
  if (mins <= 0) return 'Up next';
  return mins >= 60 ? `Next · in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Next · in ${mins} min`;
}

/** Protein top-ups the planner chose for this meal (or a note when they moved to snacks). */
function topUpRow(date, plan, pm) {
  if (pm.shifted) return h('p', { class: 'tiny muted topup-note' }, 'This plate is a little light on protein. We moved the top-up to snacks, where an egg or a glass of milk does the job.');
  const chips = pm.topUps.map(t => ({ ...t, food: getFood(t.fid) })).filter(t => t.food);
  if (!chips.length) return null;
  const why = pm.id === 'snacks' && plan.meals.find(m => m.id === 'dinner')?.shifted
    ? 'Dinner will be light on protein. Add one of these now:'
    : `The mess plate is light on protein. Add one:`;
  return h('div', { class: 'topups' },
    h('div', { class: 'tiny muted' }, why),
    h('div', { class: 'chip-row' }, chips.map(x => h('button', { class: 'chip', onclick: () => logItems(date, [makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, meal: pm.id })]) },
      icon('plus', { size: 14, sw: 2.4 }), `${x.qty > 1 ? x.qty + '× ' : ''}${x.name} (${round(x.p)} g)`))));
}

// ---------- quick row: water · weight · workout ----------
function quickRow(date, day, t, sameDay) {
  return h('div', { class: 'quick' }, waterTile(date, day, t, sameDay), weightTile(date, day), workoutTile(date, day));
}

/** A wave as wide as two tiles, so sliding it by half loops without a seam. */
const waveSvg = cls => s('svg', { class: 'wv ' + cls, viewBox: '0 0 240 16', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
  s('path', { d: 'M0 8Q15 2 30 8T60 8T90 8T120 8T150 8T180 8T210 8T240 8V16H0Z' }));

function waterTile(date, day, t, sameDay) {
  const goal = t.water;
  const splash = !!(sameDay && view.splash && performance.now() - view.splash < 1200);
  view.splash = 0;
  const num = h('span', { class: 'wt-n' }, round(day.water / 1000, 2));
  const tile = h('section', { class: 'qtile water' + (day.water >= goal ? ' full' : '') },
    h('div', { class: 'wfill', 'aria-hidden': 'true' },
      waveSvg('back'), waveSvg('front'),
      splash && !reduced() && h('span', { class: 'splash' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i'))),
    h('div', { class: 'qtile-h' }, h('span', null, 'Water'), h('span', { class: 'qtile-art' }, artWater(46))),
    h('div', { class: 'wt-read' }, h('div', { class: 'big-num num' }, num, h('small', null, ' L')), h('div', { class: 'tiny muted num' }, 'of ' + goal / 1000 + ' L')),
    h('div', { class: 'row gap water-acts' },
      h('button', { class: 'btn ghost sm', 'aria-label': 'Remove 250 ml', onclick: () => addWater(date, -250) }, icon('minus', { size: 16 })),
      h('button', { class: 'btn sm grow water-btn', onclick: () => { view.splash = performance.now(); addWater(date, 250); } }, '+ 250 ml')));
  tween('today:water', tile, [day.water, goal], ([w, g], [wn]) => {
    tile.style.setProperty('--lv', (g > 0 ? clamp(w / g, 0, 1) : 0).toFixed(4));
    num.textContent = round(wn / 1000, 2);
  }, { start: [0, goal], delay: 320 });
  return tile;
}

/** The last few weigh-ins as a quiet line; the number above is what to read. */
function spark(vals) {
  // at least a 1 kg window, so a normal day-to-day wobble never looks like a cliff
  const W = 132, H = 34, mid = (Math.min(...vals) + Math.max(...vals)) / 2, span = Math.max(1, Math.max(...vals) - Math.min(...vals)), lo = mid - span / 2;
  const pts = vals.map((v, i) => [5 + (i / (vals.length - 1)) * (W - 10), 5 + (1 - (v - lo) / span) * (H - 10)]);
  const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  const [ex, ey] = pts[pts.length - 1];
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: `${d}L${ex.toFixed(1)} ${H}L5 ${H}Z`, class: 'sp-area' }),
    s('path', { d, class: 'sp-line' }),
    s('circle', { cx: ex.toFixed(1), cy: ey.toFixed(1), r: 4, class: 'sp-dot' }));
}

function weightTile(date, day) {
  const hist = ctx.history.filter(d => d.weight);
  const last = day.weight || hist[hist.length - 1]?.weight || store.profile.weight;
  const prev = hist.length > 1 ? hist[hist.length - 2].weight : null;
  const delta = day.weight && prev ? round(day.weight - prev, 1) : null;
  const trail = hist.slice(-10).map(d => d.weight);
  return h('section', { class: 'qtile weight' },
    h('div', { class: 'qtile-h' }, h('span', null, 'Weight'), icon('scale', { size: 18 })),
    h('div', { class: 'wt-read' }, h('div', { class: 'big-num num' }, last, h('small', null, ' kg')),
      delta != null ? h('span', { class: 'pill ' + (delta === 0 ? '' : (delta > 0) === (store.profile.goal === 'gain') ? 'good' : 'warn') }, (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + Math.abs(delta) + ' kg')
        : h('div', { class: 'tiny muted' }, day.weight ? 'Logged ' + labelForKey(date).toLowerCase() : 'Mornings, after the loo')),
    trail.length > 2 && spark(trail),
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
  return h('section', { class: 'qtile workout' + (pd.rest ? ' rest' : '') },
    h('div', { class: 'qtile-h' }, h('span', null, pd.rest ? 'Rest day' : 'Workout'), h('span', { class: 'qtile-art' }, artDumbbell(46))),
    h('div', { class: 'wo-main' }, h('div', { class: 'wo-t' }, pd.t), h('div', { class: 'tiny muted' }, plan.name)),
    !pd.rest && h('div', { class: 'stack-xs wo-prog' }, bar(done, pd.x.length, 'var(--c-p)'), h('div', { class: 'tiny muted num' }, `${done}/${pd.x.length} exercises`)),
    h('button', { class: 'btn sm block ' + (done ? 'ghost' : 'primary'), onclick: () => ctx.go('plan', 'training') }, pd.rest ? 'Recovery plan' : done ? 'Continue' : 'Start workout'));
}

// ---------- logged list ----------
function loggedCard(date, day, tt, sameDay) {
  const groups = MEALS.map(m => ({ ...m, items: day.items.filter(i => itemMeal(i) === m.id) }));
  const yKey = addDays(date, -1);
  const bodyId = 'logged-body';
  // only food that arrived since the last render slides in
  const seen = sameDay ? view.items : null;
  view.items = new Set(day.items.map(i => i.id));
  const body = h('div', { id: bodyId, class: 'logged-body' + (loggedOpen ? '' : ' hide') },
    day.items.length === 0
      ? emptyState(artEmptyPlate(120), 'Your plate is empty', 'Log a mess meal from the card above, or tap Snap for snacks, canteen food and drinks.')
      : groups.filter(g => g.items.length).map(g => {
        const gt = totals(g.items);
        return h('div', { class: 'log-group m-' + g.id },
          h('div', { class: 'log-gh' },
            h('span', null, h('span', { class: 'lg-glyph' }, mealIcon(g.id, { size: 17, sw: 1.9 })), g.label),
            h('span', { class: 'tiny muted num' }, `${round(gt.cal)} kcal · ${round(gt.p)} g P`),
            h('button', { class: 'link tiny', onclick: () => ctx.openLog({ meal: g.id }) }, '+ add')),
          g.items.map(i => h('div', { class: 'log-item' + (seen && !seen.has(i.id) && !reduced() ? ' fresh' : '') },
            dietDot(i.diet),
            h('button', { class: 'grow log-edit', 'aria-label': 'Edit ' + i.n, onclick: () => editItemSheet(date, i) },
              h('div', { class: 'small li-n' }, i.n),
              h('div', { class: 'tiny muted num li-m' }, [(i.qty && i.qty !== 1 ? i.qty + ' × ' : '') + (i.unit || ''), `${round(i.p, 1)}P ${round(i.c)}C ${round(i.f ?? 0)}F`].filter(Boolean).join(' · '))),
            i.price ? h('span', { class: 'pill' }, '₹' + round(i.price)) : null,
            h('span', { class: 'li-kcal num' }, h('b', null, round(i.cal)), h('small', null, 'kcal')),
            h('button', { class: 'icon-btn sm del', 'aria-label': 'Remove ' + i.n, onclick: () => removeItems(date, [i.id]) }, icon('x', { size: 16 })))));
      }));
  const toggle = h('button', { class: 'icon-btn sm chev' + (loggedOpen ? ' open' : ''), 'aria-expanded': String(loggedOpen), 'aria-controls': bodyId, 'aria-label': 'Show or hide the log', onclick: () => {
    loggedOpen = !loggedOpen;
    body.classList.toggle('hide', !loggedOpen);
    toggle.classList.toggle('open', loggedOpen);
    toggle.setAttribute('aria-expanded', String(loggedOpen));
    toggle.closest('.logged')?.classList.toggle('open', loggedOpen);
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
