// =============================================================
// ASK — "should I eat this?" (spec §3.4, §5.5)
// Search one food, or type a whole plate ("2 eggs, 1 glass milk"),
// and get a go / smaller / swap / skip verdict from the offline
// engine, with a plain-language why and what changes if you eat it
// anyway. The verdict is never decided by AI; Phase 7 only phrases it.
// =============================================================
import { h, round, lsGet, lsSet, fill, uid } from '../util.js';
import { toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { totals, makeItem, makeMessItem, guessMeal, COLORS } from '../nutrition.js';
import { searchFoods, getFood, parseQuickLog } from '../search.js';
import { logItems } from '../actions.js';
import { pageHead, card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { artViewfinder } from '../components/art.js';
import { dietDot, portionChips, nutrientTable, verdictCard } from '../components/bits.js';
import { openSnap } from '../components/camera.js';
import { verdictFor, recordVerdict, recentVerdicts, edState } from '../verdicts.js';
import { stepLabel } from '../engine/verdict.js';
import { switchToMaintenance } from '../goals.js';
import { coachEnabled, aiExplanation, aiParseAsk } from '../coach.js';
import { creditFor } from '../fooddb.js';
import { openCoach } from './coach.js';
import { makeItem as mk } from '../nutrition.js';

const TRY = ['Chicken biryani', '2 samosas', 'Masala dosa', 'Whey protein', '2 boiled eggs, 1 glass milk', 'Lay’s Magic Masala'];
let q = '', food = null, sizeIdx = 0, portion = 1;
let combo = null;                         // a typed plate: [{ food, sizeIdx, qty, grams }]

const recent = () => lsGet('ff.asks', []).map(getFood).filter(Boolean);
const remember = id => lsSet('ff.asks', [id, ...lsGet('ff.asks', []).filter(x => x !== id)].slice(0, 8));

/** Scale a logged item to a portion step; keeps it honest in the log ("½ of 1 plate"). */
export function scaleItem(it, k) {
  if (k === 1) return it;
  return { ...it, id: uid(), qty: round(it.qty * k, 2), g: round((it.g || 0) * k), unit: `${stepLabel(k)} of ${it.unit}`,
    cal: round(it.cal * k), p: round(it.p * k, 1), c: round(it.c * k, 1), f: round(it.f * k, 1), price: it.price ? round(it.price * k) : null };
}

/** A suggested alternative → something loggable. */
export function altToItem(a, meal) {
  const f = a.fid && getFood(a.fid);
  if (f) return makeItem(f, { sizeIdx: a.sizeIdx ?? 0, qty: a.qty || 1, meal });
  return makeMessItem({ n: a.name || a.n, cal: a.cal, p: a.p, c: a.c, f: a.f, diet: a.diet }, a.qty || 1, meal, null);
}

/** Is the typed text a plate (several foods, or a quantity) rather than a search? */
function asPlate(text) {
  const parsed = parseQuickLog(text);
  if (!parsed.length || parsed.some(x => !x.food)) return null;
  const multi = parsed.length > 1 || parsed[0].qty !== 1 || parsed[0].grams;
  return multi ? parsed : null;
}

/** Open Ask on a food (used by hold-to-ask in the log sheet). */
export function askAbout(f) {
  q = f.n; food = f; sizeIdx = 0; portion = 1; combo = null; remember(f.id);
  ctx.go('ask');
}

export function renderAsk() {
  const body = h('div', { class: 'stack' });
  const input = h('input', { type: 'search', placeholder: 'Samosa, biryani, “2 eggs and a glass of milk”…', value: q, autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Food to check' });
  input.addEventListener('input', () => { q = input.value; food = null; combo = null; draw(); });

  function draw() {
    fill(body, food ? detail(() => [makeItem(food, { sizeIdx, qty: portion, meal: guessMeal() })], food.n, back)
      : combo ? detail(() => combo.map(x => makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, grams: x.grams, meal: guessMeal() })), q, back)
        : q.trim().length >= 2 ? results() : start());
  }
  function back() { food = null; combo = null; draw(); }

  function results() {
    const plate = asPlate(q);
    const res = searchFoods(q, { diet: null, limit: 8 });   // no diet filter: asking about a chicken roll should get a reason, not silence
    return h('div', { class: 'stack' },
      plate && card('', h('button', { class: 'btn primary block', onclick: () => { combo = plate; portion = 1; draw(); } },
        icon('sparkle', { size: 18 }), `Check this plate: ${plate.map(x => `${x.qty !== 1 ? x.qty + ' × ' : ''}${x.food.n}`).join(' + ')}`)),
      res.length
        ? card('', h('div', { class: 'list' }, res.map(f => row(f))))
        : card('', h('div', { class: 'empty' }, artViewfinder(120), h('div', { class: 'empty-t' }, 'Not in the database'), h('p', { class: 'muted small' }, 'Try fewer words, or create it from the log sheet.'),
          coachEnabled() && q.trim().split(/\s+/).length > 2 && h('button', { class: 'btn primary', onclick: readWithAi }, icon('sparkle', { size: 18 }), 'Ask AI to read it'),
          h('button', { class: 'btn ghost', onclick: () => ctx.openLog({ query: q }) }, icon('search', { size: 18 }), 'Search everywhere'))));
  }

  /** Free text the offline parser could not place: the gateway reads it, the engine still decides. */
  async function readWithAi() {
    const r = await aiParseAsk(q);
    if (!r.ok) return toast(r.error?.text || 'AI isn’t available right now', 'warn');
    const names = (r.intent.items.length ? r.intent.items : r.intent.options?.[0] || []);
    const parsed = names.map(it => parseQuickLog(`${it.qty} ${it.name}`)[0]).filter(x => x?.food);
    if (!parsed.length) return toast('Couldn’t match those foods. Try searching.', 'warn');
    if (r.intent.wellbeing_flag) q = q + ' (wellbeing)';
    combo = parsed; draw();
  }

  function row(f) {
    const g = f.sizes[0][1] / 100;
    return h('button', { class: 'li li-btn', onclick: () => { food = f; sizeIdx = 0; portion = 1; remember(f.id); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, dietDot(f.diet), f.brand ? `${f.brand} ${f.n}` : f.n),
        h('span', { class: 'li-s' }, `${f.sizes[0][0]} · ${round(f.k[0] * g)} kcal · ${round(f.k[1] * g, 1)} g protein`)),
      icon('chevron', { size: 18 }));
  }

  function start() {
    const rec = recent(), past = recentVerdicts().slice(0, 5);
    return h('div', { class: 'stack' },
      edCard(),
      card('ask-start',
        h('div', { class: 'ask-hero' },
          artViewfinder(132),
          h('div', null, h('h2', { class: 'card-t' }, 'Check it before you eat it'),
            h('p', { class: 'small muted' }, 'Search a food, or type what’s on your plate. You get go, smaller, swap or skip, worked out from what’s left of your day. It works with no internet.'))),
        h('div', { class: 'chip-row' }, TRY.map(t => h('button', { class: 'chip', onclick: () => { q = t; input.value = t; draw(); } }, t)))),
      past.length > 0 && card('', cardHead('Recent answers'), h('div', { class: 'list' }, past.map(r => h('div', { class: 'li' },
        h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, r.names), h('span', { class: 'li-s' }, `${r.cal} kcal · ${new Date(r.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)),
        h('span', { class: 'pill ' + ({ go: 'good', smaller: 'warn', swap: 'warn', skip: 'bad' })[r.kind] }, ({ go: 'Go', smaller: 'Smaller', swap: 'Swap', skip: 'Skip' })[r.kind]))))),
      rec.length > 0 && card('', cardHead('Recently checked'), h('div', { class: 'list' }, rec.map(f => row(f)))),
      notMedical());
  }

  /** The verdict screen, for a single food or a typed plate. `make()` builds the logged-item(s) at the current portion. */
  function detail(make, title, onBack) {
    const t = ctx.targets(), meal = guessMeal();
    const items = make();
    const eaten = totals(store.day(ctx.date).items);
    const { v, copy, ed } = verdictFor(items, { meal, text: q });
    const sum = items.reduce((a, i) => ({ cal: a.cal + i.cal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { cal: 0, p: 0, c: 0, f: 0 });
    const left = { cal: t.cal - eaten.cal, p: t.p - eaten.p, c: t.c - eaten.c, f: t.f - eaten.f };
    const single = items.length === 1 && food;

    const logAs = (list, how) => {
      logItems(ctx.date, list);
      recordVerdict(v, { logged: how });
      toast('Logged ' + (list.length === 1 ? list[0].n : `${list.length} items`));
      food = null; combo = null; q = ''; input.value = ''; draw();
    };
    const actions = [];
    if (v.kind === 'go') actions.push(btn('primary grow', 'check', 'Log it', () => logAs(items, 'suggested')));
    if (v.kind === 'smaller') {
      actions.push(btn('primary grow', 'check', `Log ${stepLabel(v.portion)} (${v.portionNumbers.cal} kcal)`, () => logAs(items.map(i => scaleItem(i, v.portion)), 'suggested')));
      actions.push(btn('ghost', 'plus', 'Log it all anyway', () => logAs(items, 'anyway')));
    }
    if (v.kind === 'swap') {
      actions.push(btn('primary grow', 'swap', `Log ${v.alternatives[0].n}`, () => logAs([altToItem(v.alternatives[0], meal)], 'swap')));
      actions.push(btn('ghost', 'plus', 'Log mine anyway', () => logAs(items, 'anyway')));
    }
    if (v.kind === 'skip' && !v.blocked) actions.push(btn('ghost', 'plus', 'Log it anyway', () => logAs(items, 'anyway')));
    if (v.kind === 'skip' && v.alternatives.length) actions.push(btn('primary grow', 'swap', `Log ${v.alternatives[0].n} instead`, () => logAs([altToItem(v.alternatives[0], meal)], 'swap')));
    if (v.addProtein?.length) actions.push(btn('ghost', 'plus', `Add ${v.addProtein[0].n}`, () => logAs([...items, altToItem(v.addProtein[0], meal)], 'suggested')));

    let aiBox = null;
    const out = h('div', { class: 'stack' },
      h('button', { class: 'chip', onclick: onBack }, icon('back', { size: 15 }), single ? 'Back to results' : 'Back'),
      edCard(ed),
      card('ask-detail',
        h('div', null,
          h('div', { class: 'eyebrow' }, single ? food.brand || 'Food' : 'Your plate'),
          h('h2', { class: 'detail-t' }, single && dietDot(food.diet), title),
          single && h('div', { class: 'tiny muted' }, `${food.sizes[sizeIdx][0]} · ${round(food.sizes[sizeIdx][1])} ${food.ml ? 'ml' : 'g'} per serving`, creditFor(food) ? ` · ${creditFor(food)}` : '')),
        single && food.sizes.length > 1 && h('div', { class: 'chip-row' }, food.sizes.map((s, i) => h('button', { class: 'chip' + (i === sizeIdx ? ' on' : ''), onclick: () => { sizeIdx = i; draw(); } }, s[0]))),
        single && h('div', { class: 'field' }, h('label', null, 'How much'), portionChips({ value: portion, options: [0.5, 1, 1.5, 2, 3], onChange: val => { portion = val; draw(); } })),
        aiBox = verdictCard({
          kind: v.kind, title: v.kind === 'swap' || v.kind === 'skip' ? v.names : copy.headline,
          body: [copy.body, copy.tip].filter(Boolean).join(' '), ifAnyway: copy.ifAnyway, actions,
        }),
        v.alternatives.length > 1 && h('div', { class: 'field' }, h('label', null, 'Other options'),
          h('div', { class: 'chip-row' }, v.alternatives.slice(1).map(a => h('button', { class: 'chip', onclick: () => logAs([altToItem(a, meal)], 'swap') }, `${a.n} · ${a.cal} kcal`)))),
        nutrientTable([
          { label: 'Energy', value: sum.cal, unit: ' kcal', left: round(left.cal - sum.cal), target: Math.max(0, left.cal), color: COLORS.cal },
          { label: 'Protein', value: sum.p, unit: ' g', left: round(left.p - sum.p), target: Math.max(0, left.p), color: COLORS.p },
          { label: 'Carbs', value: sum.c, unit: ' g', left: round(left.c - sum.c), target: Math.max(0, left.c), color: COLORS.c },
          { label: 'Fat', value: sum.f, unit: ' g', left: round(left.f - sum.f), target: Math.max(0, left.f), color: COLORS.f },
        ]),
        h('div', { class: 'impact ' + (left.cal - sum.cal >= 0 ? 'good' : 'warn') },
          icon(left.cal - sum.cal >= 0 ? 'check' : 'alert', { size: 18, sw: 2.2 }),
          h('span', null, left.cal > 0
            ? `This uses ${Math.round((sum.cal / left.cal) * 100)}% of the ${round(left.cal).toLocaleString('en-IN')} kcal you have left today.`
            : `You’re already past today’s target by ${round(-left.cal).toLocaleString('en-IN')} kcal.`))),
      notMedical());
    // optional upgrade: an AI-phrased explanation replaces the template text only if it passes every check
    aiExplanation(v, copy).then(t => { const el = aiBox?.querySelector('.verdict-b'); if (t && el && aiBox.isConnected) { el.textContent = t; el.classList.add('ai-text'); } }).catch(() => {});
    return out;
  }

  draw();
  return h('div', { class: 'page ask' },
    pageHead('Before you eat it', 'Ask', coachEnabled() && h('button', { class: 'btn ghost sm', onclick: () => openCoach() }, icon('sparkle', { size: 16 }), 'Coach')),
    h('div', { class: 'searchfield' }, icon('search', { size: 20 }), input,
      h('button', { class: 'icon-btn', 'aria-label': 'Snap a photo', onclick: () => openSnap() }, icon('snap', { size: 20 }))),
    body);
}

const btn = (cls, ic, label, fn) => h('button', { class: 'btn ' + cls, onclick: fn }, icon(ic, { size: 18, sw: 2.2 }), label);

const notMedical = () => h('p', { class: 'tiny muted verdict-note' }, icon('info', { size: 14 }),
  'General nutrition guidance, not medical advice. If you have a medical condition, follow your clinician’s advice.');

/** Gentle check-in when the engine sees warning signs (spec §9.1). No restriction advice while it shows. */
export function edCard(ed = edState()) {
  if (!ed.flag) return null;
  return h('section', { class: 'card ed-card', role: 'status' },
    h('div', { class: 'row gap' }, icon('info', { size: 22 }), h('h2', { class: 'card-t' }, 'A gentle check-in')),
    h('p', { class: 'small' }, 'Lately you’ve been eating well under your plan. We’ll stop suggesting that you eat less for now. If food or weight feels stressful, talking to someone helps, and it’s free and confidential.'),
    h('p', { class: 'small' }, h('b', null, `${ed.helpline.name}: call ${ed.helpline.number}`), ' (India, 24×7).'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary sm', onclick: () => { switchToMaintenance(); toast('Switched to a maintenance plan'); ctx.refresh(); } }, 'Switch to maintenance'),
      h('a', { class: 'btn ghost sm', href: 'tel:14416' }, 'Call 14416')));
}
