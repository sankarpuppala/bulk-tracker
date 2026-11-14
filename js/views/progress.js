// =============================================================
// STATS — trends, consistency, spending, badges, leaderboard
// One hero (this week's report), then three calm sections: how the
// body is moving, the last N days, and habits & rewards. On a wide
// screen it becomes a bento with the report as the large tile.
// =============================================================
import { h, todayKey, addDays, parseKey, round, fmtNum, labelForKey, clamp } from '../util.js';
import { segmented, lineChart, barChart, donut, miniRing, emptyState, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { totals, COLORS } from '../nutrition.js';
import { CATEGORIES } from '../../data/foods.js';
import { levelName } from '../gamify.js';
import { messLabel } from '../menus.js';
import { pageHead, card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { artTrend, artSprout, artScale, artTrophy } from '../components/art.js';
import { goalChart } from '../components/bits.js';
import { phaseLabel } from '../engine/goal.js';
import { currentPhase, checkInIsDue, DECISION_LABEL, kg } from '../goals.js';
import { openCheckIn } from './goalplanner.js';
import { reportCard } from './report.js';
import { coachEnabled, aiCheckinSummary } from '../coach.js';
import { microWatch, suggestionsFor, noteFor, worthWatching } from '../engine/micro.js';
import { FOOD_X, hasX } from '../../data/foods-x.js';
import { FOODS } from '../../data/foods.js';
import { extraById } from '../fooddb.js';
import { searchFoods } from '../search.js';
import { nameScore } from '../engine/match.js';
import { rulesOf } from '../engine/diet.js';
import { CHALLENGES, sortBoard, cleanGroup } from '../engine/community.js';

const flameIcon = () => h('span', { class: 'flame-live', style: { display: 'inline-flex' }, 'aria-hidden': 'true' }, icon('flame', { size: 13 }));

let range = 30;
let board = null, boardLoading = false, metric = 'xp';
let rangeMoved = false;
let lastMotion = 'still', motionT0 = 0;
const ENTRANCE_MS = 2600;                  // how long an arrival's animations take to settle

/** A thin meter; decorative, the number beside it says the same thing. */
const meter = (ratio, color, cls = '') => h('div', { class: 'pg-meter ' + cls, 'aria-hidden': 'true' },
  h('i', { style: { width: (clamp(ratio || 0, 0, 1) * 100).toFixed(1) + '%', background: color } }));

const shortDate = key => parseKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function renderProgress() {
  // Arriving animates everything; changing the range redraws only what the range changes;
  // any other re-render (a sync, the leaderboard arriving) holds still. A re-render that lands
  // while an entrance is still playing carries on from where it was (--pg-t is a negative delay).
  const prev = typeof document !== 'undefined' && document.querySelector('.page.stats');
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const continuing = !!prev && !rangeMoved && lastMotion !== 'still' && now - motionT0 < ENTRANCE_MS;
  const motion = !prev ? 'fresh' : rangeMoved ? 'ranged' : continuing ? lastMotion : 'still';
  if (!continuing) motionT0 = now;
  const elapsed = Math.round(now - motionT0);
  lastMotion = motion;
  rangeMoved = false;

  const t = ctx.targets(), st = ctx.stats;
  const from = addDays(todayKey(), -(range - 1));
  const days = ctx.history.filter(d => d.key >= from);
  const food = days.filter(d => d.items.length);
  const avg = k => food.length ? food.reduce((a, d) => a + totals(d.items)[k], 0) / food.length : 0;
  const spent = days.reduce((a, d) => a + totals(d.items).price, 0);
  const adherence = food.length ? Math.round(food.reduce((a, d) => a + (st?.scores[d.key]?.score || 0), 0) / food.length) : 0;

  const side = [weightCard(), planCard(), checkinCard()].filter(Boolean);

  return h('div', { class: `page stats ${motion}`, style: elapsed ? `--pg-t: -${elapsed}ms` : null },
    pageHead('Is it working?', 'Progress', null, { scene: 'summit' }),
    h('div', { class: `pg-grid side-${side.length}` },
      reportCard({ animate: motion === 'fresh', elapsed }),
      side,
      microCard(),
      section('Trends', `The last ${range} days`,
        segmented([{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], range, v => { range = v; rangeMoved = true; ctx.refresh(); }, 'pg-range')),
      h('div', { class: 'tiles pg-tiles' },
        tile({ label: 'Avg kcal', value: fmtNum(avg('cal')), sub: `target ${fmtNum(t.cal)}`, ic: 'flame', hue: 'var(--c-cal)', ratio: avg('cal') / t.cal }),
        tile({ label: 'Avg protein', value: round(avg('p')), unit: 'g', sub: `target ${t.p} g`, ic: 'egg', hue: COLORS.p, ratio: avg('p') / t.p }),
        tile({ label: 'Days logged', value: `${food.length}/${range}`, sub: `best streak ${st?.best || 0}`, ic: 'plan', hue: 'var(--hue-dinner)', ratio: food.length / range }),
        tile({ label: 'Day score', value: adherence + '%', sub: 'avg adherence', ic: 'target', hue: COLORS.c, ratio: adherence / 100 }),
        tile({ label: 'Outside food', value: '₹' + fmtNum(spent), sub: `₹${fmtNum(spent / Math.max(1, range / 7))}/week`, ic: 'wallet', hue: COLORS.f })),
      calCard(days, t, from),
      macroCard(food, t),
      spendCard(days),
      topFoodsCard(days),
      section('Habits', 'Streaks, levels & badges'),
      heatCard(st),
      st && levelCard(st),
      badgeCard(st),
      boardCard()));
}

function section(eyebrow, title, right) {
  return h('div', { class: 'pg-sec' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h2', { class: 'pg-sec-t' }, title)),
    right);
}

// ---------- plan vs. you ----------
function planCard() {
  const plan = store.activeGoal;
  if (!plan) return null;
  const cp = currentPhase();
  const weights = ctx.history.filter(d => d.weight);
  return card('span2 plan-vs pg-plan steady',
    cardHead('You vs. the plan', cp && h('span', { class: 'pill' }, `Week ${Math.min(cp.week, plan.totalWeeks)} · ${phaseLabel(cp.phase.kind)}`), plan.label),
    goalChart({ plan, weights, height: 190 }),
    weights.length < 2 && h('p', { class: 'tiny muted' }, 'Log your weight a few mornings a week and your line appears next to the plan.'));
}

// ---------- weekly check-ins ----------
const TONE = { 'on-track': 'good', adjust: '', watch: 'warn', 'at-limit': 'warn', 'log-more': 'warn', insufficient: '' };
function checkinCard() {
  if (!store.activeGoal) return null;
  const list = [...store.checkins].reverse().slice(0, 8);
  return card('span2 checkins pg-checkins steady',
    cardHead('Weekly check-ins', checkInIsDue() && h('button', { class: 'btn primary sm', onclick: () => openCheckIn() }, 'Check in now'), 'Your weight trend against what the plan expects'),
    list.length === 0
      ? emptyState(artSprout(88), 'No check-ins yet', 'Your first one is ready a week after you start. Log meals and weigh in a few times a week to make it count.')
      : h('div', { class: 'ci-list' }, list.map(c => h('details', { class: 'ci-row ' + (TONE[c.decision] || 'plain') },
        h('summary', null,
          h('span', { class: 'ci-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'ci-date num' }, labelForKey(c.date)),
          h('span', { class: 'pill ' + (TONE[c.decision] || '') }, DECISION_LABEL[c.decision] || c.decision),
          c.observedRate != null && h('span', { class: 'tiny muted num ci-rate' }, `${kg(c.observedRate)} vs ${kg(c.expectedRate)} kg/wk`),
          h('span', { class: 'ci-chev', 'aria-hidden': 'true' }, icon('down', { size: 16 }))),
        h('p', { class: 'small' }, c.message), coachEnabled() && h('button', { class: 'btn ghost sm', onclick: async e => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Writing…';
          const r = await aiCheckinSummary(c, { streak: ctx.stats?.streak });
          if (!r) { b.disabled = false; b.textContent = 'Summarise with AI'; return toast('AI isn’t available right now', 'warn'); }
          b.replaceWith(h('div', { class: 'ai-summary' }, h('b', null, r.headline), h('p', { class: 'small' }, r.text)));
        } }, icon('sparkle', { size: 14 }), 'Summarise with AI'), c.applied && h('p', { class: 'tiny muted' }, `Applied ${c.newTargets.step > 0 ? '+' : '−'}${Math.abs(c.newTargets.step)} kcal.`)))));
}

// ---------- micronutrient watch ----------
const byId = new Map(FOODS.map(f => [f.id, f]));
const lookup = {
  x: id => (hasX(id) ? FOOD_X[id] : extraById(id)?.x || null),
  byName: name => { const f = searchFoods(name, { limit: 3 }).find(x => (hasX(x.id) || x.x) && nameScore(name, x.n) >= 0.6); return f ? f.id : null; },
  grams: id => (byId.get(id) || extraById(id))?.sizes?.[0]?.[1] || 0,
};
const MSTATUS = { ok: ['good', 'On track', 'check'], low: ['warn', 'A bit low', 'alert'], 'very-low': ['bad', 'Low', 'alert'], unknown: ['', 'Not enough data', 'info'] };
const TONE_COLOR = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', '': 'var(--line-strong)' };
function microCard() {
  const pf = store.profile;
  if (!worthWatching(pf)) return null;
  const from = addDays(todayKey(), -6);
  const w = microWatch(ctx.history.filter(d => d.key >= from), { sex: pf.sex, lookup });
  const rules = rulesOf(pf);
  const low = w.rows.filter(r => r.status === 'low' || r.status === 'very-low');
  return card('span2 micro pg-micro steady',
    cardHead('Iron, B12, calcium, vitamin D', null, 'Last 7 days, from the foods that have nutrient data'),
    h('div', { class: 'micro-grid' }, w.rows.map(r => {
      const [tone, label, ic] = MSTATUS[r.status];
      const known = r.status !== 'unknown';
      return h('div', { class: 'micro-cell ' + (tone || 'plain') },
        h('div', { class: 'mc-top' },
          h('div', null,
            h('div', { class: 'mc-l' }, r.label),
            h('div', { class: 'mc-v num' }, h('b', null, known ? Math.round(r.est * 100) + '%' : '–'), h('span', { class: 'tiny muted' }, ' of daily need'))),
          miniRing(known ? Math.min(1, r.est) : 0, 1, TONE_COLOR[tone], 44, 5)),
        h('span', { class: 'pill ' + tone }, icon(ic, { size: 13, sw: 2.2 }), label));
    })),
    !w.enough && h('p', { class: 'tiny muted' }, `Log at least 3 days to see this. So far ${Math.round(w.coverage * 100)}% of what you ate has nutrient data.`),
    w.enough && h('p', { class: 'tiny muted' }, `Based on foods covering about ${Math.round(w.coverage * 100)}% of what you ate. Treat it as a trend, not a measurement.`),
    low.length > 0 && h('div', { class: 'micro-tips' }, low.map(r => h('div', { class: 'mt' },
      h('div', { class: 'eyebrow' }, `For ${r.label.toLowerCase()}`),
      h('ul', { class: 'small' }, suggestionsFor(r.key, rules, name => FOODS.find(f => f.n === name)).map(s => h('li', null, s))),
      noteFor(r.key) && h('p', { class: 'tiny muted' }, noteFor(r.key))))));
}

function tile({ label, value, unit, sub, ic, hue, ratio }) {
  return h('div', { class: 'tile', style: `--hue:${hue}` },
    h('div', { class: 'tile-h' }, h('span', { class: 'tile-l' }, label), h('span', { class: 'tile-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16, sw: 2 }))),
    h('div', { class: 'tile-v num' }, String(value), unit && h('small', null, unit)),
    ratio != null && meter(ratio, 'var(--hue)', 'tile-m'),
    h('div', { class: 'tiny muted' }, sub));
}

// ---------- level ----------
const XP_WAYS = [['Log a day', 10], ['Hit protein', 10], ['Nail calories', 10], ['Water', 5], ['Workout', 15], ['Weigh-in', 3]];
function levelCard(st) {
  const pct = clamp((st.xp - st.lvlFloor) / (st.lvlCeil - st.lvlFloor), 0, 1);
  return card('level pg-level steady',
    h('div', { class: 'lvl' },
      h('div', { class: 'lvl-badge', role: 'img', 'aria-label': `Level ${st.level}` }, h('span', { class: 'lvl-k' }, 'LVL'), h('b', null, st.level)),
      h('div', { class: 'grow lvl-main' },
        h('div', { class: 'eyebrow' }, 'Your level'),
        h('div', { class: 'lvl-name' }, levelName(st.level)),
        h('div', { class: 'xp', role: 'progressbar', 'aria-label': `XP towards level ${st.level + 1}`, 'aria-valuemin': st.lvlFloor, 'aria-valuemax': st.lvlCeil, 'aria-valuenow': st.xp },
          h('i', { style: { width: (pct * 100).toFixed(1) + '%' } })),
        h('div', { class: 'lvl-meta' }, h('span', { class: 'mono num' }, `${st.xp} XP`), h('span', { class: 'muted' }, `${st.lvlCeil - st.xp} to level ${st.level + 1}`)))),
    h('div', { class: 'xp-ways' },
      h('span', { class: 'tiny muted' }, 'Earn XP'),
      XP_WAYS.map(([l, n]) => h('span', { class: 'xp-way' }, h('b', { class: 'num' }, '+' + n), l))));
}

// ---------- weight ----------
function weightCard() {
  const pf = store.profile;
  const pts = ctx.history.filter(d => d.weight).slice(-90);
  if (pts.length < 2) return card('span2 pg-weight steady', cardHead('Weight trend'), emptyState(artScale(108), 'Log your weight a few times', 'Two or more weigh-ins unlock your trend line and goal projection.'));
  const base = parseKey(pts[0].key);
  const data = pts.map((d, i) => {
    const win = pts.slice(Math.max(0, i - 6), i + 1);
    return { x: (parseKey(d.key) - base) / 86400000, y: d.weight, trend: win.reduce((a, w) => a + w.weight, 0) / win.length, label: d.key };
  });
  // rate from linear regression on the last ~4 weeks
  const recent = data.filter(p => p.x >= data[data.length - 1].x - 28);
  const n = recent.length, mx = recent.reduce((a, p) => a + p.x, 0) / n, my = recent.reduce((a, p) => a + p.y, 0) / n;
  const slope = recent.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / (recent.reduce((a, p) => a + (p.x - mx) ** 2, 0) || 1);
  const perWeek = slope * 7;
  const last = data[data.length - 1].trend;
  let proj = '';
  if (pf.goalWeight && Math.abs(perWeek) > 0.02) {
    const weeks = (pf.goalWeight - last) / perWeek;
    if (weeks > 0 && weeks < 200) {
      const eta = addDays(todayKey(), Math.round(weeks * 7));
      proj = `At this pace you’ll hit ${pf.goalWeight} kg around ${parseKey(eta).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`;
    } else proj = 'You’re trending away from your goal — check calories vs target.';
  }
  const good = (perWeek > 0) === (pf.goal === 'gain');
  const first = pts[0], lastPt = pts[pts.length - 1];
  const ticks = [{ x: 0, label: shortDate(first.key) }, { x: data[data.length - 1].x, label: lastPt.key === todayKey() ? 'Today' : shortDate(lastPt.key) }];
  return card('span2 pg-weight steady',
    cardHead('Weight trend', h('span', { class: 'pill ' + (good ? 'good' : 'warn') }, icon(good ? 'check' : 'alert', { size: 13, sw: 2.2 }), `${perWeek >= 0 ? '+' : ''}${round(perWeek, 2)} kg/week`), 'Dashed line = 7-day average'),
    h('div', { class: 'wt-now' },
      h('b', { class: 'num' }, String(round(lastPt.weight, 1))), h('small', null, 'kg'),
      h('span', { class: 'tiny muted' }, lastPt.key === todayKey() ? 'this morning' : 'last weigh-in · ' + labelForKey(lastPt.key))),
    lineChart(data, { goal: pf.goalWeight || undefined, color: 'var(--accent)', fmt: v => round(v, 1), label: 'Weight over time, with your 7-day average', height: 176, ticks }),
    proj && h('p', { class: 'small proj' }, icon('sparkle', { size: 16 }), proj),
    pf.goal !== 'maintain' && h('p', { class: 'tiny muted' }, `Your plan targets ${pf.pace} kg/week. ${Math.abs(perWeek) > pf.pace * 1.6 ? 'You’re moving faster than planned — ' + (pf.goal === 'gain' ? 'expect extra fat gain.' : 'watch for muscle loss.') : ''}`));
}

// ---------- calories ----------
function calCard(days, t, from) {
  const map = new Map(days.map(d => [d.key, d]));
  const bars = [];
  const n = Math.min(range, 30);
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(todayKey(), -i);
    if (k < from) continue;
    const v = map.has(k) ? totals(map.get(k).items).cal : 0;
    const ratio = v / t.cal;
    bars.push({ v, label: labelForKey(k), short: String(parseKey(k).getDate()), color: !v ? 'var(--line)' : ratio > 1.1 ? COLORS.p : ratio >= 0.9 ? 'var(--volt)' : COLORS.c });
  }
  const any = bars.some(b => b.v > 0);
  return card('span2 pg-cal', cardHead('Calories vs target', h('span', { class: 'tiny muted' }, `last ${bars.length} days`)),
    any ? [
      barChart(bars, { target: t.cal, label: 'Calories each day against your target', today: bars.length - 1, height: 172 }),
      h('div', { class: 'pg-legend tiny muted' },
        h('span', null, h('i', { style: { background: 'var(--volt)' } }), 'On target'),
        h('span', null, h('i', { style: { background: COLORS.c } }), 'Under'),
        h('span', null, h('i', { style: { background: COLORS.p } }), 'Over'),
        h('span', null, h('i', { class: 'dash' }), 'Target')),
    ] : emptyState(artTrend(96), 'Nothing logged yet', 'Log a few days to see this — each day becomes a bar against your target.'));
}

function macroCard(food, t) {
  if (!food.length) return null;
  const sum = food.reduce((a, d) => { const x = totals(d.items); a.p += x.p; a.c += x.c; a.f += x.f; return a; }, { p: 0, c: 0, f: 0 });
  const kc = { p: sum.p * 4, c: sum.c * 4, f: sum.f * 9 };
  const tot = kc.p + kc.c + kc.f || 1;
  const tgt = { p: t.p * 4, c: t.c * 4, f: t.f * 9 }, tt = tgt.p + tgt.c + tgt.f;
  const share = k => Math.round(kc[k] / tot * 100), plan = k => Math.round(tgt[k] / tt * 100);
  const top = Math.max(...['p', 'c', 'f'].flatMap(k => [share(k), plan(k)])) * 1.15 || 1;
  return card('pg-macro', cardHead('Macro split', null, 'Share of calories — you vs your plan'),
    h('div', { class: 'mac' },
      donut([{ v: kc.p, color: COLORS.p }, { v: kc.c, color: COLORS.c }, { v: kc.f, color: COLORS.f }], 128, 16,
        { label: `Protein ${share('p')}%, carbs ${share('c')}%, fat ${share('f')}% of calories`, value: share('p') + '%', caption: 'protein' }),
      h('div', { class: 'mac-rows grow' }, [['Protein', 'p'], ['Carbs', 'c'], ['Fat', 'f']].map(([l, k]) =>
        h('div', { class: 'mac-row' },
          h('div', { class: 'row between small' }, h('span', null, h('i', { class: 'key ' + k }), l), h('span', { class: 'num' }, h('b', null, share(k) + '%'), h('span', { class: 'muted' }, ' / ' + plan(k) + '%'))),
          h('div', { class: 'mac-bar', 'aria-hidden': 'true' }, h('i', { class: k, style: { width: (share(k) / top * 100).toFixed(1) + '%' } }), h('b', { style: { left: (plan(k) / top * 100).toFixed(1) + '%' } })))))),
    h('p', { class: 'tiny muted mac-note' }, 'Bar = you · tick = your plan'));
}

// ---------- consistency ----------
const WEEKDAY = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
function heatCard(st) {
  const weeks = 15, cells = [];
  const end = todayKey();
  const monday = addDays(end, -((parseKey(end).getDay() + 6) % 7)); // Monday-first columns
  let i = 0;
  for (let k = addDays(monday, -(weeks - 1) * 7); k <= end; k = addDays(k, 1), i++) {
    const sc = st?.scores[k]?.score || 0;
    const lvl = sc === 0 ? 0 : sc < 40 ? 1 : sc < 65 ? 2 : sc < 85 ? 3 : 4;
    cells.push(h('i', { class: 'hm l' + lvl + (k === end ? ' now' : ''), title: `${k}: ${sc}/100`, style: `--c:${Math.floor(i / 7)}` }));
  }
  const logged = Object.values(st?.scores || {}).filter(x => x?.score > 0).length;
  return card('pg-heat steady', cardHead('Consistency', h('span', { class: 'pill' + (st?.streak >= 3 ? ' good' : '') }, st?.streak >= 3 ? flameIcon() : null, `${st?.streak || 0} day streak`), 'Daily score — calories, protein, water, training'),
    h('div', { class: 'hm-wrap' },
      h('div', { class: 'hm-days', 'aria-hidden': 'true' }, WEEKDAY.map(d => h('span', null, d))),
      h('div', { class: 'heatmap', role: 'img', 'aria-label': `Daily score over the last ${weeks} weeks: ${logged} days with a score, current streak ${st?.streak || 0} days` }, cells)),
    h('div', { class: 'row gap tiny muted hm-legend' }, 'less', [0, 1, 2, 3, 4].map(l => h('i', { class: 'hm l' + l })), 'more'));
}

// ---------- spending & foods ----------
function spendCard(days) {
  const byCat = {};
  days.forEach(d => d.items.forEach(i => { if (i.price) byCat[i.cat] = (byCat[i.cat] || 0) + +i.price; }));
  const list = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = list[0]?.[1] || 1;
  const cat = id => CATEGORIES.find(c => c.id === id) || { label: id === 'custom' ? 'My foods' : id, icon: '🍴' };
  return card('pg-spend', cardHead('Outside-food spending', null, 'From prices on snacks, canteen & delivery items'),
    list.length ? h('div', { class: 'sp-list' }, list.slice(0, 6).map(([c, v]) => h('div', { class: 'sp-row' },
      h('div', { class: 'row between small' }, h('span', null, h('span', { class: 'sp-ic', 'aria-hidden': 'true' }, cat(c).icon), cat(c).label), h('b', { class: 'num' }, '₹' + fmtNum(v))),
      meter(v / max, 'var(--c-f)'))))
      : h('div', { class: 'pg-quiet' }, h('span', { class: 'pg-quiet-ic', 'aria-hidden': 'true' }, icon('wallet', { size: 20 })),
        h('p', { class: 'muted small' }, 'Log chips, drinks or canteen food with a pack size (₹10, ₹20…) and spending shows up here.')));
}

function topFoodsCard(days) {
  const count = {};
  days.forEach(d => d.items.forEach(i => { const k = i.n; count[k] = count[k] || { n: 0, cal: 0 }; count[k].n++; count[k].cal += i.cal; }));
  const list = Object.entries(count).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  const most = list[0]?.[1].n || 1;
  return card('pg-top', cardHead('Most eaten'),
    list.length ? h('ol', { class: 'rank' }, list.map(([n, v]) => h('li', null,
      h('div', { class: 'row between small' }, h('span', { class: 'rank-name' }, n), h('span', { class: 'tiny muted num' }, `${v.n}× · ${fmtNum(v.cal)} kcal`)),
      meter(v.n / most, 'var(--accent)'))))
      : h('div', { class: 'pg-quiet' }, h('span', { class: 'pg-quiet-ic', 'aria-hidden': 'true' }, icon('utensils', { size: 20 })),
        h('p', { class: 'muted small' }, 'Nothing yet. Log a few days to see this.')));
}

// ---------- badges ----------
const BADGE = {
  first: ['utensils', '--hue-lunch'], s3: ['flame', '--accent'], s7: ['bolt', '--hue-breakfast'], s30: ['star', '--hue-breakfast'],
  p5: ['egg', '--c-p'], p25: ['dumbbell', '--c-p'], w7: ['drop', '--c-water'], g1: ['dumbbell', '--hue-dinner'], g20: ['trophy', '--hue-dinner'],
  wt7: ['scale', '--c-c'], clean: ['leaf', '--c-fib'], budget: ['wallet', '--c-f'], c100: ['list', '--hue-snacks'], goal: ['trophy', '--hue-breakfast'],
};
function badgeCard(st) {
  if (!st) return null;
  const got = st.badges.filter(b => b.got).length;
  return card('span2 pg-badges steady',
    h('div', { class: 'card-h bd-head' },
      h('div', { class: 'bd-art', 'aria-hidden': 'true' }, artTrophy(64)),
      h('div', { class: 'grow' }, h('h2', { class: 'card-t' }, 'Badges'), h('div', { class: 'tiny muted' }, got ? `${got} unlocked · ${st.badges.length - got} to go` : 'Your first one is one logged meal away')),
      h('span', { class: 'pill' }, `${got}/${st.badges.length}`)),
    h('ul', { class: 'badges' }, st.badges.map((b, i) => {
      const [ic, hue] = BADGE[b.id] || [];
      return h('li', { class: 'badge' + (b.got ? ' got' : ' locked'), title: b.desc, style: `--hue:var(${hue || '--accent'}); --i:${i}` },
        h('span', { class: 'badge-ic', 'aria-hidden': 'true' }, ic ? icon(ic, { size: 24, sw: 2 }) : b.icon),
        h('span', { class: 'badge-n' }, b.name),
        h('span', { class: 'badge-d tiny muted' }, b.desc),
        h('span', { class: 'vh' }, b.got ? 'Unlocked' : 'Locked'));
    })));
}

// ---------- leaderboard ----------
function boardCard() {
  const pf = store.profile;
  if (store.mode !== 'cloud') return card('span2 pg-board steady', cardHead('Campus leaderboard'), emptyState(icon('users', { size: 36 }), 'Sign in to compete', 'Create a free account to sync across devices and join the campus leaderboard.', h('button', { class: 'btn primary', onclick: () => ctx.signOut() }, 'Create account')));
  if (!pf.leaderboard) return card('span2 pg-board steady', cardHead('Campus leaderboard'), emptyState(icon('users', { size: 36 }), 'Join the leaderboard?', 'Shows your first name, mess, level and streak to other students. Nothing else.',
    h('button', { class: 'btn primary', onclick: () => { store.saveProfile({ leaderboard: true }); ctx.reloadHistory(); board = null; } }, 'Join')));
  if (!board && !boardLoading) {
    boardLoading = true;
    store.leaderboard(pf.challengeCode || '').then(b => { board = b; }).catch(e => { board = []; console.warn(e); toast('Leaderboard unavailable', 'err'); }).finally(() => { boardLoading = false; ctx.refresh(); });
  }
  const code = h('input', { class: 'input xs', value: pf.challengeCode || '', placeholder: 'Friends’ code', maxlength: 12, 'aria-label': 'Friends challenge code' });
  const sorted = board ? sortBoard(board, metric) : null;
  const field = CHALLENGES.find(c => c.id === metric).field;
  const me = store.user?.uid;
  return card('span2 pg-board steady', cardHead(pf.challengeCode ? `Challenge ${pf.challengeCode}` : 'Campus leaderboard', h('button', { class: 'chip', 'aria-label': 'Refresh', onclick: () => { board = null; ctx.refresh(); } }, icon('undo', { size: 15 })), pf.challengeCode ? 'Only people with your code' : 'Everyone on campus who joined'),
    segmented(CHALLENGES.map(c => ({ value: c.id, label: c.label })), metric, v => { metric = v; ctx.refresh(); }, 'b-seg'),
    h('div', { class: 'b-code' }, code, h('button', { class: 'btn ghost sm', onclick: () => { store.saveProfile({ challengeCode: cleanGroup(code.value) }); board = null; store.publishLeaderboard(null); ctx.reloadHistory(); } }, pf.challengeCode ? 'Change' : 'Start / join')),
    !sorted ? h('div', { class: 'b-loading', 'aria-busy': 'true' }, h('p', { class: 'muted small' }, 'Loading…'), [0, 1, 2].map(() => h('div', { class: 'loading-line' }))) :
      h('ol', { class: 'board' }, sorted.length === 0 ? h('li', { class: 'b-empty muted small' }, 'Nobody here yet — share your code and be first.') :
        sorted.map((r, i) => h('li', { class: 'board-row' + (r.id === me ? ' me' : '') + (i < 3 ? ' m' + (i + 1) : '') },
          h('span', { class: 'rank-n num' }, i + 1),
          h('span', { class: 'b-av', 'aria-hidden': 'true' }, (r.name || 'A').trim().charAt(0).toUpperCase()),
          h('span', { class: 'grow b-who' }, h('b', { class: 'small' }, r.name || 'Anon'), h('span', { class: 'tiny muted' }, ' · ' + messLabel(r.mess))),
          h('span', { class: 'tiny b-streak' }, icon('flame', { size: 13 }), metric === 'protein' ? `${r.pStreak || 0} d protein` : `${r.streak || 0} d`),
          h('span', { class: 'pill' }, metric === 'xp' ? `L${r.level || 1} · ${r.xp || 0} XP` : `${r[field] || 0} d`)))),
    h('button', { class: 'link tiny', onclick: () => { store.saveProfile({ leaderboard: false }); store.publishLeaderboard(null); } }, 'Leave leaderboard'));
}
