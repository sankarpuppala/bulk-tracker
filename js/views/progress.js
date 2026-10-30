// =============================================================
// STATS — trends, consistency, spending, badges, leaderboard
// =============================================================
import { h, todayKey, addDays, parseKey, round, fmtNum, daysBetween, labelForKey } from '../util.js';
import { segmented, lineChart, barChart, donut, emptyState, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { totals, COLORS } from '../nutrition.js';
import { CATEGORIES } from '../../data/foods.js';
import { levelName } from '../gamify.js';
import { messLabel } from '../menus.js';
import { pageHead, card, cardHead, bar } from './common.js';
import { icon, mealIcon } from '../components/icons.js';
import { artTrend, artSprout } from '../components/art.js';
import { goalChart } from '../components/bits.js';
import { phaseLabel } from '../engine/goal.js';
import { currentPhase, checkInIsDue, DECISION_LABEL, kg } from '../goals.js';
import { openCheckIn } from './goalplanner.js';
import { coachEnabled, aiCheckinSummary } from '../coach.js';
import { microWatch, suggestionsFor, noteFor, worthWatching } from '../engine/micro.js';
import { FOOD_X, hasX } from '../../data/foods-x.js';
import { FOODS } from '../../data/foods.js';
import { extraById } from '../fooddb.js';
import { searchFoods } from '../search.js';
import { nameScore } from '../engine/match.js';
import { rulesOf } from '../engine/diet.js';
import { CHALLENGES, sortBoard, cleanGroup } from '../engine/community.js';

let range = 30;
let board = null, boardLoading = false, metric = 'xp';

export function renderProgress() {
  const t = ctx.targets(), st = ctx.stats;
  const from = addDays(todayKey(), -(range - 1));
  const days = ctx.history.filter(d => d.key >= from);
  const food = days.filter(d => d.items.length);
  const avg = k => food.length ? food.reduce((a, d) => a + totals(d.items)[k], 0) / food.length : 0;
  const spent = days.reduce((a, d) => a + totals(d.items).price, 0);
  const adherence = food.length ? Math.round(food.reduce((a, d) => a + (st?.scores[d.key]?.score || 0), 0) / food.length) : 0;

  return h('div', { class: 'page stats' },
    pageHead('Is it working?', 'Progress'),
    segmented([{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], range, v => { range = v; ctx.refresh(); }),
    weightCard(),
    planCard(),
    checkinCard(),
    microCard(),
    st && levelCard(st),
    h('div', { class: 'tiles' },
      tile('Avg kcal', fmtNum(avg('cal')), `target ${fmtNum(t.cal)}`, 'var(--accent-t)'),
      tile('Avg protein', round(avg('p')) + 'g', `target ${t.p}g`, COLORS.p),
      tile('Days logged', `${food.length}/${range}`, `best streak ${st?.best || 0}`, 'var(--ink)'),
      tile('Day score', adherence + '%', 'avg adherence', 'var(--accent-t)'),
      tile('Outside food', '₹' + fmtNum(spent), `₹${fmtNum(spent / Math.max(1, range / 7))}/week`, COLORS.f)),
    h('div', { class: 'bento' },
      calCard(days, t, from),
      macroCard(food, t),
      heatCard(st),
      spendCard(days),
      topFoodsCard(days),
      badgeCard(st),
      boardCard()));
}

// ---------- plan vs. you ----------
function planCard() {
  const plan = store.activeGoal;
  if (!plan) return null;
  const cp = currentPhase();
  const weights = ctx.history.filter(d => d.weight);
  return card('span2 plan-vs',
    cardHead('You vs. the plan', cp && h('span', { class: 'pill' }, `Week ${Math.min(cp.week, plan.totalWeeks)} · ${phaseLabel(cp.phase.kind)}`), plan.label),
    goalChart({ plan, weights, height: 190 }),
    weights.length < 2 && h('p', { class: 'tiny muted' }, 'Log your weight a few mornings a week and your line appears next to the plan.'));
}

// ---------- weekly check-ins ----------
const TONE = { 'on-track': 'good', adjust: '', watch: 'warn', 'at-limit': 'warn', 'log-more': 'warn', insufficient: '' };
function checkinCard() {
  if (!store.activeGoal) return null;
  const list = [...store.checkins].reverse().slice(0, 8);
  return card('span2 checkins',
    cardHead('Weekly check-ins', checkInIsDue() && h('button', { class: 'btn primary sm', onclick: () => openCheckIn() }, 'Check in now'), 'Your weight trend against what the plan expects'),
    list.length === 0
      ? emptyState(artSprout(96), 'No check-ins yet', 'Your first one is ready a week after you start. Log meals and weigh in a few times a week to make it count.')
      : h('div', { class: 'ci-list' }, list.map(c => h('details', { class: 'ci-row' },
        h('summary', null,
          h('span', { class: 'ci-date num' }, labelForKey(c.date)),
          h('span', { class: 'pill ' + (TONE[c.decision] || '') }, DECISION_LABEL[c.decision] || c.decision),
          c.observedRate != null && h('span', { class: 'tiny muted num' }, `${kg(c.observedRate)} vs ${kg(c.expectedRate)} kg/wk`)),
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
const MSTATUS = { ok: ['good', 'On track'], low: ['warn', 'A bit low'], 'very-low': ['bad', 'Low'], unknown: ['', 'Not enough data'] };
function microCard() {
  const pf = store.profile;
  if (!worthWatching(pf)) return null;
  const from = addDays(todayKey(), -6);
  const w = microWatch(ctx.history.filter(d => d.key >= from), { sex: pf.sex, lookup });
  const rules = rulesOf(pf);
  const low = w.rows.filter(r => r.status === 'low' || r.status === 'very-low');
  return card('span2 micro',
    cardHead('Iron, B12, calcium, vitamin D', null, 'Last 7 days, from the foods that have nutrient data'),
    h('div', { class: 'micro-grid' }, w.rows.map(r => {
      const [tone, label] = MSTATUS[r.status];
      return h('div', { class: 'micro-cell' },
        h('div', { class: 'tiny muted' }, r.label),
        h('div', { class: 'num' }, h('b', null, r.status === 'unknown' ? '\u2013' : Math.round(r.est * 100) + '%'), h('span', { class: 'tiny muted' }, ' of daily need')),
        bar(Math.min(1, r.est), 1, tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--line-strong)'),
        h('span', { class: 'pill ' + tone }, label));
    })),
    !w.enough && h('p', { class: 'tiny muted' }, `Log at least 3 days to see this. So far ${Math.round(w.coverage * 100)}% of what you ate has nutrient data.`),
    w.enough && h('p', { class: 'tiny muted' }, `Based on foods covering about ${Math.round(w.coverage * 100)}% of what you ate. Treat it as a trend, not a measurement.`),
    low.length > 0 && h('div', { class: 'stack-xs' }, low.map(r => h('div', null,
      h('div', { class: 'eyebrow' }, `For ${r.label.toLowerCase()}`),
      h('ul', { class: 'small' }, suggestionsFor(r.key, rules, name => FOODS.find(f => f.n === name)).map(s => h('li', null, s))),
      noteFor(r.key) && h('p', { class: 'tiny muted' }, noteFor(r.key))))));
}

function tile(label, value, sub, color) {
  return h('div', { class: 'tile' }, h('div', { class: 'tiny muted' }, label), h('div', { class: 'tile-v', style: { color } }, value), h('div', { class: 'tiny muted' }, sub));
}

function levelCard(st) {
  const pct = (st.xp - st.lvlFloor) / (st.lvlCeil - st.lvlFloor);
  return card('level',
    h('div', { class: 'row gap' },
      h('div', { class: 'lvl-badge' }, h('span', { class: 'tiny' }, 'LVL'), h('b', null, st.level)),
      h('div', { class: 'grow stack-xs' },
        h('div', { class: 'row between' }, h('b', null, levelName(st.level)), h('span', { class: 'tiny muted mono' }, `${st.xp} XP · ${st.lvlCeil - st.xp} to next`)),
        bar(pct, 1, 'linear-gradient(90deg, var(--volt), var(--c-c))'),
        h('div', { class: 'tiny muted' }, 'Earn XP: log a day +10 · hit protein +10 · nail calories +10 · water +5 · workout +15 · weigh-in +3'))),
  );
}

function weightCard() {
  const pf = store.profile;
  const pts = ctx.history.filter(d => d.weight).slice(-90);
  if (pts.length < 2) return card('span2', cardHead('Weight trend'), emptyState(artTrend(120), 'Log your weight a few times', 'Two or more weigh-ins unlock your trend line and goal projection.'));
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
  return card('span2',
    cardHead('Weight trend', h('span', { class: 'pill ' + ((perWeek > 0) === (pf.goal === 'gain') ? 'good' : 'warn') }, `${perWeek >= 0 ? '+' : ''}${round(perWeek, 2)} kg/week`), 'Dashed line = 7-day average'),
    lineChart(data, { goal: pf.goalWeight || undefined, color: 'var(--accent)', fmt: v => round(v, 1), label: 'Weight over time, with your 7-day average' }),
    proj && h('p', { class: 'small proj' }, icon('sparkle', { size: 16 }), proj),
    pf.goal !== 'maintain' && h('p', { class: 'tiny muted' }, `Your plan targets ${pf.pace} kg/week. ${Math.abs(perWeek) > pf.pace * 1.6 ? 'You’re moving faster than planned — ' + (pf.goal === 'gain' ? 'expect extra fat gain.' : 'watch for muscle loss.') : ''}`));
}

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
  return card('span2', cardHead('Calories vs target', h('span', { class: 'tiny muted' }, `last ${bars.length} days`), 'Ember = on target · teal = under · rose = over'),
    barChart(bars, { target: t.cal, label: 'Calories each day against your target' }));
}

function macroCard(food, t) {
  if (!food.length) return null;
  const sum = food.reduce((a, d) => { const x = totals(d.items); a.p += x.p; a.c += x.c; a.f += x.f; return a; }, { p: 0, c: 0, f: 0 });
  const kc = { p: sum.p * 4, c: sum.c * 4, f: sum.f * 9 };
  const tot = kc.p + kc.c + kc.f || 1;
  const tgt = { p: t.p * 4, c: t.c * 4, f: t.f * 9 }, tt = tgt.p + tgt.c + tgt.f;
  return card('', cardHead('Macro split', null, 'Share of calories — you vs your plan'),
    h('div', { class: 'row gap center-y' }, donut([{ v: kc.p, color: COLORS.p }, { v: kc.c, color: COLORS.c }, { v: kc.f, color: COLORS.f }]),
      h('div', { class: 'stack-xs grow' }, [['Protein', 'p'], ['Carbs', 'c'], ['Fat', 'f']].map(([l, k]) =>
        h('div', { class: 'row between small' }, h('span', null, h('i', { class: 'key ' + k }), l), h('span', { class: 'mono' }, h('b', null, Math.round(kc[k] / tot * 100) + '%'), h('span', { class: 'muted' }, ' / ' + Math.round(tgt[k] / tt * 100) + '%')))))));
}

function heatCard(st) {
  const weeks = 15, cells = [];
  const end = todayKey();
  const monday = addDays(end, -((parseKey(end).getDay() + 6) % 7)); // Monday-first columns
  for (let k = addDays(monday, -(weeks - 1) * 7); k <= end; k = addDays(k, 1)) {
    const sc = st?.scores[k]?.score || 0;
    const lvl = sc === 0 ? 0 : sc < 40 ? 1 : sc < 65 ? 2 : sc < 85 ? 3 : 4;
    cells.push(h('i', { class: 'hm l' + lvl + (k === end ? ' now' : ''), title: `${k}: ${sc}/100` }));
  }
  return card('', cardHead('Consistency', h('span', { class: 'tiny muted' }, `${st?.streak || 0} day streak`), 'Daily score — calories, protein, water, training'),
    h('div', { class: 'heatmap' }, cells),
    h('div', { class: 'row gap tiny muted hm-legend' }, 'less', [0, 1, 2, 3, 4].map(l => h('i', { class: 'hm l' + l })), 'more'));
}

function spendCard(days) {
  const byCat = {};
  days.forEach(d => d.items.forEach(i => { if (i.price) byCat[i.cat] = (byCat[i.cat] || 0) + +i.price; }));
  const list = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = list[0]?.[1] || 1;
  const cat = id => CATEGORIES.find(c => c.id === id) || { label: id === 'custom' ? 'My foods' : id, icon: '🍴' };
  return card('', cardHead('Outside-food spending', null, 'From prices on snacks, canteen & delivery items'),
    list.length ? h('div', { class: 'stack-xs' }, list.slice(0, 6).map(([c, v]) => h('div', null,
      h('div', { class: 'row between small' }, h('span', null, cat(c).icon + ' ' + cat(c).label), h('b', { class: 'mono' }, '₹' + fmtNum(v))),
      bar(v, max, COLORS.f))))
      : h('p', { class: 'muted small' }, 'Log chips, drinks or canteen food with a pack size (₹10, ₹20…) and spending shows up here.'));
}

function topFoodsCard(days) {
  const count = {};
  days.forEach(d => d.items.forEach(i => { const k = i.n; count[k] = count[k] || { n: 0, cal: 0 }; count[k].n++; count[k].cal += i.cal; }));
  const list = Object.entries(count).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  return card('', cardHead('Most eaten'),
    list.length ? h('ol', { class: 'rank' }, list.map(([n, v]) => h('li', { class: 'row between small' }, h('span', null, n), h('span', { class: 'tiny muted mono' }, `${v.n}× · ${fmtNum(v.cal)} kcal`))))
      : h('p', { class: 'muted small' }, 'Nothing yet.'));
}

function badgeCard(st) {
  if (!st) return null;
  const got = st.badges.filter(b => b.got).length;
  return card('span2', cardHead('Badges', h('span', { class: 'pill' }, `${got}/${st.badges.length}`)),
    h('div', { class: 'badges' }, st.badges.map(b => h('div', { class: 'badge' + (b.got ? '' : ' locked'), title: b.desc },
      h('div', { class: 'badge-ic' }, b.icon), h('div', { class: 'tiny badge-n' }, b.name), h('div', { class: 'tiny muted' }, b.desc)))));
}

function boardCard() {
  const pf = store.profile;
  if (store.mode !== 'cloud') return card('span2', cardHead('Campus leaderboard'), emptyState(icon('users', { size: 36 }), 'Sign in to compete', 'Create a free account to sync across devices and join the campus leaderboard.', h('button', { class: 'btn primary', onclick: () => ctx.signOut() }, 'Create account')));
  if (!pf.leaderboard) return card('span2', cardHead('Campus leaderboard'), emptyState(icon('users', { size: 36 }), 'Join the leaderboard?', 'Shows your first name, mess, level and streak to other students. Nothing else.',
    h('button', { class: 'btn primary', onclick: () => { store.saveProfile({ leaderboard: true }); ctx.reloadHistory(); board = null; } }, 'Join')));
  if (!board && !boardLoading) {
    boardLoading = true;
    store.leaderboard(pf.challengeCode || '').then(b => { board = b; }).catch(e => { board = []; console.warn(e); toast('Leaderboard unavailable', 'err'); }).finally(() => { boardLoading = false; ctx.refresh(); });
  }
  const code = h('input', { class: 'input xs', value: pf.challengeCode || '', placeholder: 'Friends’ code', maxlength: 12, 'aria-label': 'Friends challenge code' });
  const sorted = board ? sortBoard(board, metric) : null;
  const field = CHALLENGES.find(c => c.id === metric).field;
  return card('span2', cardHead(pf.challengeCode ? `Challenge ${pf.challengeCode}` : 'Campus leaderboard', h('button', { class: 'chip', 'aria-label': 'Refresh', onclick: () => { board = null; ctx.refresh(); } }, icon('undo', { size: 15 })), pf.challengeCode ? 'Only people with your code' : 'Everyone on campus who joined'),
    segmented(CHALLENGES.map(c => ({ value: c.id, label: c.label })), metric, v => { metric = v; ctx.refresh(); }),
    h('div', { class: 'row gap' }, code, h('button', { class: 'btn ghost sm', onclick: () => { store.saveProfile({ challengeCode: cleanGroup(code.value) }); board = null; store.publishLeaderboard(null); ctx.reloadHistory(); } }, pf.challengeCode ? 'Change' : 'Start / join')),
    !sorted ? h('p', { class: 'muted small' }, 'Loading…') :
      h('ol', { class: 'board' }, sorted.map((r, i) => h('li', { class: 'board-row' + (r.id === store.user?.uid ? ' me' : '') },
        h('span', { class: 'mono rank-n' }, i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1),
        h('span', { class: 'grow' }, h('b', { class: 'small' }, r.name || 'Anon'), h('span', { class: 'tiny muted' }, ' · ' + messLabel(r.mess))),
        h('span', { class: 'tiny mono' }, metric === 'protein' ? `${r.pStreak || 0} d protein` : `${r.streak || 0} d`),
        h('span', { class: 'pill' }, metric === 'xp' ? `L${r.level || 1} · ${r.xp || 0} XP` : `${r[field] || 0} d`)))),
    h('button', { class: 'link tiny', onclick: () => { store.saveProfile({ leaderboard: false }); store.publishLeaderboard(null); } }, 'Leave leaderboard'));
}
