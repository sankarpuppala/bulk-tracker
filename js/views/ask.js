// =============================================================
// ASK — "should I eat this?"
// Phase 1 shows the honest part of the answer: what a food and
// portion cost against what's left today. The go / smaller / swap
// / skip verdict engine lands in Phase 4; its four states are
// previewed at the bottom so the design is settled now.
// =============================================================
import { h, round, fmtNum, lsGet, lsSet, fill } from '../util.js';
import { toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { totals, makeItem, guessMeal, COLORS } from '../nutrition.js';
import { searchFoods, getFood } from '../search.js';
import { logItems } from '../actions.js';
import { pageHead, card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { artViewfinder } from '../components/art.js';
import { dietDot, portionChips, nutrientTable, verdictCard } from '../components/bits.js';
import { openSnap } from '../components/camera.js';

const TRY = ['Chicken biryani', 'Samosa', 'Masala dosa', 'Whey protein', 'Lay’s Magic Masala', 'Boiled egg'];
let q = '', food = null, sizeIdx = 0, portion = 1;

const recent = () => lsGet('ff.asks', []).map(getFood).filter(Boolean);
const remember = id => lsSet('ff.asks', [id, ...lsGet('ff.asks', []).filter(x => x !== id)].slice(0, 8));

export function renderAsk() {
  const body = h('div', { class: 'stack' });
  const input = h('input', { type: 'search', placeholder: 'Samosa, biryani, a pack of Lay’s…', value: q, autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Food to check' });
  input.addEventListener('input', () => { q = input.value; food = null; draw(); });

  function draw() {
    fill(body, food ? detail() : q.trim().length >= 2 ? results() : start());
  }

  function results() {
    const res = searchFoods(q, { diet: store.profile.diet, limit: 8 });
    return res.length
      ? card('', h('div', { class: 'list' }, res.map(f => row(f))))
      : card('', h('div', { class: 'empty' }, artViewfinder(120), h('div', { class: 'empty-t' }, 'Not in the database'), h('p', { class: 'muted small' }, 'Try fewer words, or create it from the log sheet.'),
        h('button', { class: 'btn ghost', onclick: () => ctx.openLog({ query: q }) }, icon('search', { size: 18 }), 'Search everywhere')));
  }

  function row(f) {
    const g = f.sizes[0][1] / 100;
    return h('button', { class: 'li li-btn', onclick: () => { food = f; sizeIdx = 0; portion = 1; remember(f.id); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, dietDot(f.diet), f.brand ? `${f.brand} ${f.n}` : f.n),
        h('span', { class: 'li-s' }, `${f.sizes[0][0]} · ${round(f.k[0] * g)} kcal · ${round(f.k[1] * g, 1)} g protein`)),
      icon('chevron', { size: 18 }));
  }

  function start() {
    const rec = recent();
    return h('div', { class: 'stack' },
      card('ask-start',
        h('div', { class: 'ask-hero' },
          artViewfinder(132),
          h('div', null, h('h2', { class: 'card-t' }, 'Check it before you eat it'),
            h('p', { class: 'small muted' }, 'Search a food and see what it costs against what’s left of today. A photo does the same, once the camera update lands.'))),
        h('div', { class: 'chip-row' }, TRY.map(t => h('button', { class: 'chip', onclick: () => { q = t; input.value = t; draw(); } }, t)))),
      rec.length > 0 && card('', cardHead('Recently checked'), h('div', { class: 'list' }, rec.map(f => row(f)))),
      previews());
  }

  function detail() {
    const f = food, t = ctx.targets();
    const eaten = totals(store.day(ctx.date).items);
    const meal = guessMeal();
    const it = makeItem(f, { sizeIdx, qty: portion, meal });
    const left = { cal: t.cal - eaten.cal, p: t.p - eaten.p, c: t.c - eaten.c, f: t.f - eaten.f };
    const share = left.cal > 0 ? it.cal / left.cal : 1.5;
    const pct = Math.round(share * 100);
    const tone = share <= 0.6 ? 'good' : share <= 1 ? 'warn' : 'bad';
    return h('div', { class: 'stack' },
      h('button', { class: 'chip', onclick: () => { food = null; draw(); } }, icon('back', { size: 15 }), 'Back to results'),
      card('ask-detail',
        h('div', null,
          h('div', { class: 'eyebrow' }, f.brand || 'Food'),
          h('h2', { class: 'detail-t' }, dietDot(f.diet), f.n),
          h('div', { class: 'tiny muted' }, `${f.sizes[sizeIdx][0]} · ${round(f.sizes[sizeIdx][1])} ${f.ml ? 'ml' : 'g'} per serving`)),
        f.sizes.length > 1 && h('div', { class: 'chip-row' }, f.sizes.map((s, i) => h('button', { class: 'chip' + (i === sizeIdx ? ' on' : ''), onclick: () => { sizeIdx = i; draw(); } }, s[0]))),
        h('div', { class: 'field' }, h('label', null, 'How much'),
          portionChips({ value: portion, options: [0.5, 1, 1.5, 2, 3], onChange: v => { portion = v; draw(); } })),
        nutrientTable([
          { label: 'Energy', value: it.cal, unit: ' kcal', left: round(left.cal - it.cal), target: Math.max(0, left.cal), color: COLORS.cal },
          { label: 'Protein', value: it.p, unit: ' g', left: round(left.p - it.p), target: Math.max(0, left.p), color: COLORS.p },
          { label: 'Carbs', value: it.c, unit: ' g', left: round(left.c - it.c), target: Math.max(0, left.c), color: COLORS.c },
          { label: 'Fat', value: it.f, unit: ' g', left: round(left.f - it.f), target: Math.max(0, left.f), color: COLORS.f },
        ]),
        h('div', { class: 'impact ' + tone },
          icon(tone === 'good' ? 'check' : 'alert', { size: 18, sw: 2.2 }),
          h('span', null, left.cal > 0
            ? `This uses ${pct}% of the ${fmtNum(left.cal)} kcal you have left today.`
            : `You’re already past today’s target by ${fmtNum(-left.cal)} kcal.`)),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn primary grow', onclick: () => { logItems(ctx.date, [it]); toast('Logged ' + f.n); food = null; q = ''; input.value = ''; draw(); } }, icon('check', { size: 18, sw: 2.4 }), 'Log it'),
          h('button', { class: 'btn ghost', onclick: () => ctx.go('today') }, 'Back to Today'))),
      h('p', { class: 'tiny muted verdict-note' }, icon('sparkle', { size: 14 }), 'A full verdict (go, smaller, swap or skip, with what to change if you eat it anyway) arrives with the next update.'));
  }

  draw();
  return h('div', { class: 'page ask' },
    pageHead('Before you eat it', 'Ask'),
    h('div', { class: 'searchfield' }, icon('search', { size: 20 }), input,
      h('button', { class: 'icon-btn', 'aria-label': 'Snap a photo', onclick: () => openSnap() }, icon('snap', { size: 20 }))),
    body);
}

// ---------- the four verdicts, previewed ----------
function previews() {
  return h('section', { class: 'previews' },
    h('div', { class: 'row between' }, h('h3', { class: 'section-t' }, 'How answers will look'), h('span', { class: 'pill' }, 'Preview')),
    h('div', { class: 'preview-grid' },
      verdictCard({ kind: 'go', title: 'Two boiled eggs', body: 'Protein-dense and well inside what’s left today.', preview: true }),
      verdictCard({ kind: 'smaller', title: 'Chicken biryani', body: 'A full plate uses most of your spare calories. Have half, keep the raita.', ifAnyway: 'skip the rice at dinner.', preview: true }),
      verdictCard({ kind: 'swap', title: 'Two samosas', body: 'Lots of oil, little protein. One samosa and a glass of milk fits better.', preview: true }),
      verdictCard({ kind: 'skip', title: 'Peanut chikki', body: 'You’ve marked peanuts as an allergy.', preview: true })));
}
