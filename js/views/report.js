// =============================================================
// WEEKLY REPORT CARD — the week in a form you would actually send
// someone, with one highlight and one thing to change. Share copies
// it as plain text (or opens the system share sheet on a phone).
// =============================================================
import { h, todayKey, addDays, labelForKey, fmtNum, round } from '../util.js';
import { toast, sheet } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { card, cardHead, bar } from './common.js';
import { icon } from '../components/icons.js';
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

export function reportCard() {
  const r = buildReport();
  const days = lastWeek();
  const weak = weakestMeal(days);
  const pct = v => Math.round(Math.min(1.3, v) * 100);

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
    days.map(d => {
      const got = r.days.find(x => x.key === d.key);
      // showing up counts: a logged day is never coloured like a failure
      const tone = !got ? 'none' : got.calFit && got.hitP ? 'good' : got.hitP || got.calFit ? 'mid' : 'done';
      const label = got ? `${got.day}: ${got.cal} kcal, ${got.p} g protein` : `${labelForKey(d.key)}: nothing logged`;
      return h('div', { class: 'wk-day ' + tone, title: label, 'aria-label': label },
        h('span', { class: 'wk-l' }, (got?.day || labelForKey(d.key).slice(0, 3)).slice(0, 2)));
    }));

  return card('span2 weekreport',
    cardHead('Your week', h('button', { class: 'btn ghost sm', onclick: share }, icon('send', { size: 15 }), 'Share'),
      r.range ? `${labelForKey(r.range.from)} – ${labelForKey(r.range.to)}` : null),
    strip,
    h('div', { class: 'wk-rows' },
      metric('Days logged', `${r.logged}/${r.of}`, r.logged / r.of, 'var(--accent)'),
      metric('Calories', `${fmtNum(r.cal.avg)} avg`, r.cal.pct, 'var(--c-cal)', `target ${fmtNum(r.cal.target)}`),
      metric('Protein', `${round(r.protein.avg)} g avg`, r.protein.pct, 'var(--c-p)', `hit on ${r.protein.hit} of ${r.logged}`),
      r.weight && h('div', { class: 'wk-row' },
        h('div', { class: 'row between' }, h('span', { class: 'tiny muted' }, 'Weight'),
          h('b', { class: 'num' }, `${r.weight.change > 0 ? '+' : r.weight.change < 0 ? '−' : ''}${Math.abs(r.weight.change)} kg`)),
        h('span', { class: 'tiny muted' }, `${r.weight.from} → ${r.weight.to} kg over ${r.weight.weighIns} weigh-ins`))),
    h('p', { class: 'wk-hi' }, icon('sparkle', { size: 15 }), h('span', null, r.highlight)),
    h('p', { class: 'wk-fix' }, h('b', null, 'Next week: '), r.fix),
    weak && h('p', { class: 'tiny muted' }, `You skipped logging ${weak.label.toLowerCase()} on ${weak.missed} days — that is usually where the missing calories hide.`));

  function metric(label, value, ratio, color, sub) {
    return h('div', { class: 'wk-row' },
      h('div', { class: 'row between' }, h('span', { class: 'tiny muted' }, label), h('b', { class: 'num' }, value)),
      bar(Math.min(1, ratio || 0), 1, color),
      sub && h('span', { class: 'tiny muted' }, sub + (ratio > 1.1 ? ` · ${pct(ratio)}% of target` : '')));
  }
}

/** Fallback when the browser blocks both sharing and the clipboard. */
function openText(text) {
  const area = h('textarea', { class: 'input textarea', rows: 12, readonly: true }, text);
  sheet({ title: 'Your week', sub: 'Select all and copy', body: h('div', { class: 'stack' }, area) });
  setTimeout(() => { area.focus(); area.select(); }, 250);
}
