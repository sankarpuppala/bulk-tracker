// =============================================================
// WEEKLY REPORT CARD — the week in a form you would actually send
// someone, with one highlight and one thing to change. Share copies
// it as plain text (or opens the system share sheet on a phone).
// It is the hero of Progress: the week strip, two big numbers, Kato
// with the highlight, and "Next week:" as the call to action.
// =============================================================
import { h, s, todayKey, addDays, labelForKey, parseKey, DAYS, fmtNum, round, clamp } from '../util.js';
import { toast, sheet, countUp } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { card } from './common.js';
import { icon } from '../components/icons.js';
import { artMascot } from '../components/art.js';
import { weekReport, shareText, weakestMeal } from '../engine/report.js';

export const APP_URL = 'https://sankarpuppala.github.io/bulk-tracker/';

/** The last 7 complete days plus today. */
function lastWeek() {
  const from = addDays(todayKey(), -6);
  const byKey = new Map((ctx.history || []).map(d => [d.key, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(from, i);
    return byKey.get(key) || { key, items: [], water: 0, gymDone: [], sets: {} };
  });
}

export function buildReport() {
  return weekReport({ days: lastWeek(), targets: ctx.targets(), profile: store.profile, stats: ctx.stats });
}

// how each day went; showing up counts, so a logged day is never coloured like a failure
const TONE_WORD = { none: 'nothing logged', done: 'logged', mid: 'hit one target', good: 'hit both targets' };

/** Kato is proud or cheering when the week went well, thinking otherwise. Never sad. */
function moodOf(r, goal) {
  if (!r.enough) return 'think';
  if (r.protein.hit >= 5 || (r.streak || 0) >= 7) return 'cheer';
  const rightWay = r.weight && ((goal === 'gain' && r.weight.change > 0) || (goal === 'lose' && r.weight.change < 0));
  if (rightWay || r.cal.onTarget >= 4 || r.trained >= 3) return 'proud';
  return 'think';
}

/**
 * `animate`: this render is an arrival, so numbers may count up (the CSS does the rest).
 * `elapsed`: ms since that arrival began, when a re-render lands mid-entrance.
 */
export function reportCard({ animate = false, elapsed = 0 } = {}) {
  const r = buildReport();
  const days = lastWeek();
  const weak = weakestMeal(days);
  const today = todayKey();

  const share = async () => {
    const text = shareText(r, { name: (store.profile.name || '').split(' ')[0], appUrl: APP_URL });
    try {
      if (navigator.share) { await navigator.share({ title: 'My week · Thali', text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it anywhere');
    } catch (e) {
      if (e?.name === 'AbortError') return;                       // they closed the share sheet
      openText(text);
    }
  };

  const strip = h('div', { class: 'wk-strip', role: 'group', 'aria-label': 'This week at a glance' },
    days.map((d, i) => {
      const got = r.days.find(x => x.key === d.key);
      const tone = !got ? 'none' : got.calFit && got.hitP ? 'good' : got.hitP || got.calFit ? 'mid' : 'done';
      const label = (got ? `${got.day}: ${got.cal} kcal, ${got.p} g protein` : `${labelForKey(d.key)}: nothing logged`) + (got ? ` — ${TONE_WORD[tone]}` : '');
      return h('div', { class: 'wk-day ' + tone + (d.key === today ? ' today' : ''), role: 'img', title: label, 'aria-label': label, style: `--i:${i}` },
        h('span', { class: 'wk-l' }, (got?.day || DAYS[parseKey(d.key).getDay()]).slice(0, 2)),
        h('span', { class: 'wk-g' }, tone === 'good' ? icon('check', { size: 14, sw: 2.8 }) : tone === 'none' ? null : h('i')));
    }));

  const legend = h('div', { class: 'wk-legend', 'aria-hidden': 'true' },
    ['done', 'mid', 'good'].map(t => h('span', null, h('i', { class: 'wk-key ' + t }), { done: 'Logged', mid: 'One target', good: 'Both targets' }[t])));

  const nums = [];
  const metric = (key, label, value, unit, ratio, sub) => {
    const v = h('b', { class: 'num' }, fmtNum(value));
    nums.push([v, value]);
    // the track runs to 125 % of target; the tick marks the target itself
    const fill = clamp((ratio || 0) / 1.25, 0, 1);
    return h('div', { class: 'wk-m ' + key },
      h('div', { class: 'wk-m-l' }, h('i', { class: 'wk-dot', 'aria-hidden': 'true' }), label),
      h('div', { class: 'wk-m-v' }, v, h('small', null, unit)),
      h('div', { class: 'wk-meter', 'aria-hidden': 'true' }, h('i', { style: { width: (fill * 100).toFixed(1) + '%' } }), h('b')),
      h('div', { class: 'wk-m-s' }, sub));
  };

  const pctOf = v => Math.round((v || 0) * 100);
  const mood = moodOf(r, store.profile.goal);
  const weights = days.filter(d => d.weight).map(d => d.weight);

  const body = r.logged === 0
    ? h('div', { class: 'wk-empty' },
      h('div', { class: 'wk-kato' }, artMascot({ mood: 'think', size: 96 })),
      h('div', null,
        h('b', { class: 'wk-empty-t' }, 'Log a few days to see this'),
        h('p', { class: 'small muted' }, 'Each day you log lights up a tile. By the weekend this turns into your calories, protein and one thing to try next.')))
    : [
      h('div', { class: 'wk-ms' },
        metric('cal', 'Calories', r.cal.avg, 'kcal avg', r.cal.pct, `${pctOf(r.cal.pct)}% of ${fmtNum(r.cal.target)} target`),
        metric('pro', 'Protein', round(r.protein.avg), 'g avg', r.protein.pct, `hit on ${r.protein.hit} of ${r.logged} day${r.logged === 1 ? '' : 's'}`)),
      r.weight && h('div', { class: 'wk-w' },
        h('span', { class: 'wk-w-ic' }, icon('scale', { size: 18 })),
        h('div', { class: 'grow' },
          h('div', { class: 'wk-m-l' }, 'Weight'),
          h('div', { class: 'tiny muted num' }, `${r.weight.from} → ${r.weight.to} kg over ${r.weight.weighIns} weigh-ins`)),
        weights.length >= 2 && spark(weights),
        h('b', { class: 'wk-w-v num' }, `${r.weight.change > 0 ? '+' : r.weight.change < 0 ? '−' : ''}${Math.abs(r.weight.change)} kg`)),
      h('div', { class: 'wk-hi ' + mood },
        h('div', { class: 'wk-kato' }, artMascot({ mood, size: 76 })),
        h('p', null, r.highlight)),
    ];

  const el = card('span2 weekreport' + (r.logged === 0 ? ' is-empty' : ''),
    h('div', { class: 'wk-head' },
      h('div', { class: 'wk-title' },
        h('div', { class: 'eyebrow' }, 'Weekly report'),
        h('h2', { class: 'card-t wk-t' }, 'Your week'),
        r.range && h('div', { class: 'tiny muted' }, `${labelForKey(r.range.from)} – ${labelForKey(r.range.to)}`)),
      h('button', { class: 'btn ghost sm wk-share', onclick: share }, icon('send', { size: 15 }), 'Share')),
    h('div', { class: 'wk-hero' },
      h('div', { class: 'wk-big' },
        h('b', { class: 'wk-n num' }, String(r.logged), h('span', { class: 'wk-of' }, '/' + r.of)),
        h('span', { class: 'wk-cap' }, 'days logged')),
      r.streak > 0 && h('span', { class: 'wk-streak' }, h('span', { class: 'flame-live', 'aria-hidden': 'true' }, icon('flame', { size: 15 })), `${r.streak}-day streak`)),
    strip,
    legend,
    body,
    h('div', { class: 'wk-fix' },
      h('span', { class: 'wk-fix-ic', 'aria-hidden': 'true' }, icon('target', { size: 20 })),
      h('p', null, h('b', { class: 'wk-fix-t' }, 'Next week: '), r.fix)),
    weak && h('p', { class: 'wk-note tiny muted' }, `You skipped logging ${weak.label.toLowerCase()} on ${weak.missed} days — that is usually where the missing calories hide.`));

  // count up over 900 ms; a re-render part-way through picks the count up where it was
  const COUNT = 900;
  if (animate && elapsed < COUNT) nums.forEach(([v, to]) => { v.dataset.v = String(to * (1 - (1 - elapsed / COUNT) ** 3)); countUp(v, to, COUNT - elapsed); });
  return el;
}

/** A tiny weight sparkline for the report's weight row. Decorative: the numbers sit beside it. */
function spark(ws) {
  const W = 64, H = 26, lo = Math.min(...ws), hi = Math.max(...ws), span = hi - lo || 1;
  const pts = ws.map((w, i) => [3 + (i / (ws.length - 1)) * (W - 6), 4 + (1 - (w - lo) / span) * (H - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const [ex, ey] = pts[pts.length - 1];
  return s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'wk-spark', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 }),
    s('circle', { cx: ex.toFixed(1), cy: ey.toFixed(1), r: 3 }));
}

/** Fallback when the browser blocks both sharing and the clipboard. */
function openText(text) {
  const area = h('textarea', { class: 'input textarea', rows: 12, readonly: true }, text);
  sheet({ title: 'Your week', sub: 'Select all and copy', body: h('div', { class: 'stack' }, area) });
  setTimeout(() => { area.focus(); area.select(); }, 250);
}
