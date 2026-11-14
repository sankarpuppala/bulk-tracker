// =============================================================
// ASK — "should I eat this?" (spec §3.4, §5.5)
// Search one food, or type a whole plate ("2 eggs, 1 glass milk"),
// and get a go / smaller / swap / skip verdict from the offline
// engine, with a plain-language why and what changes if you eat it
// anyway. The verdict is never decided by AI; Phase 7 only phrases it.
// =============================================================
import { h, s, round, lsGet, lsSet, fill, uid } from '../util.js';
import { toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { totals, makeItem, makeMessItem, guessMeal, COLORS } from '../nutrition.js';
import { searchFoods, getFood, parseQuickLog } from '../search.js';
import { logItems } from '../actions.js';
import { pageHead, card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { artMascot, artSearch } from '../components/art.js';
import { dietDot, portionChips, nutrientTable, verdictCard } from '../components/bits.js';
import { openSnap } from '../components/camera.js';
import { verdictFor, recordVerdict, recentVerdicts, edState } from '../verdicts.js';
import { stepLabel } from '../engine/verdict.js';
import { switchToMaintenance } from '../goals.js';
import { coachEnabled, aiExplanation, aiParseAsk } from '../coach.js';
import { creditFor, foodDbReady, onFoodDbReady } from '../fooddb.js';
import { openCoach } from './coach.js';
import { verdictStage, primaryFirst } from './snap.js';

const TRY = ['Chicken biryani', '2 samosas', 'Masala dosa', 'Whey protein', '2 boiled eggs, 1 glass milk', 'Lay’s Magic Masala'];
let q = '', food = null, sizeIdx = 0, portion = 1;
let combo = null;                         // a typed plate: [{ food, sizeIdx, qty, grams }]
// presentation only: which view was on screen, and which verdict was last stamped,
// so entrances play when something new arrives and not on every re-render
let lastView = null, lastStamp = '';

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

const VERDICT_ROW = { go: ['check', 'Go'], smaller: ['minus', 'Smaller'], swap: ['swap', 'Swap'], skip: ['x', 'Skip'] };

export function renderAsk() {
  // arriving from another screen (not a re-render of this one): let the entrances play again
  if (!document.querySelector('.page.ask')) { lastView = null; lastStamp = ''; }
  const body = h('div', { class: 'stack ask-body' });
  const input = h('input', { type: 'search', placeholder: 'Samosa, biryani, “2 eggs and a glass of milk”…', value: q, autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Food to check' });
  input.addEventListener('input', () => { q = input.value; food = null; combo = null; draw(); });
  const field = h('div', { class: 'searchfield' }, icon('search', { size: 20 }), input,
    h('button', { class: 'icon-btn sf-clear', type: 'button', 'aria-label': 'Clear the search', onclick: () => { q = ''; input.value = ''; food = null; combo = null; draw(); input.focus(); } }, icon('x', { size: 16, sw: 2.2 })),
    h('button', { class: 'icon-btn sf-snap', 'aria-label': 'Snap a photo', onclick: () => openSnap() }, icon('snap', { size: 20 })));

  function draw() {
    const view = food || combo ? 'detail' : q.trim().length >= 2 ? 'results' : 'start';
    const node = food ? detail(() => [makeItem(food, { sizeIdx, qty: portion, meal: guessMeal() })], food.n, back)
      : combo ? detail(() => combo.map(x => makeItem(x.food, { sizeIdx: x.sizeIdx, qty: x.qty, grams: x.grams, meal: guessMeal() })), q, back)
        : view === 'results' ? results() : start();
    if (view !== lastView) node.classList.add('ask-enter');
    lastView = view;
    field.classList.toggle('has-q', q.length > 0);
    fill(body, node);
  }
  function back() { food = null; combo = null; draw(); }

  // the big datasets arrive a moment after boot; redraw once they do
  onFoodDbReady(() => { if (body.isConnected) draw(); });

  function results() {
    const plate = asPlate(q);
    const res = searchFoods(q, { diet: null, limit: 8 });   // no diet filter: asking about a chicken roll should get a reason, not silence
    return h('div', { class: 'stack ask-results-view' },
      plate && h('button', { class: 'ask-plate', onclick: () => { combo = plate; portion = 1; draw(); } },
        h('span', { class: 'ask-plate-ic', 'aria-hidden': 'true' }, icon('bowl', { size: 24, sw: 2 })),
        h('span', { class: 'ask-plate-main' },
          h('span', { class: 'ask-plate-t' }, 'Check this plate'),
          h('span', { class: 'ask-plate-items' }, plate.map(x => h('span', { class: 'ask-plate-item' }, `${x.qty !== 1 ? x.qty + ' × ' : ''}${x.food.n}`)))),
        h('span', { class: 'ask-plate-go', 'aria-hidden': 'true' }, icon('chevron', { size: 18, sw: 2.2 }))),
      res.length
        ? card('ask-results', h('div', { class: 'ask-list-h' }, h('span', { class: 'eyebrow' }, plate ? 'Or check one food' : 'Tap one to check it'), h('span', { class: 'tiny muted' }, res.length === 1 ? '1 match' : `${res.length} matches`)),
          h('div', { class: 'list' }, res.map(f => row(f))))
        : !foodDbReady() ? card('ask-loading',
          h('p', { class: 'small muted ask-loading-t', role: 'status' }, h('span', { class: 'ask-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'Loading the rest of the food database…'),
          [0, 1, 2].map(() => h('div', { class: 'ask-sk', 'aria-hidden': 'true' }, h('i', { class: 'sk-dot' }), h('span', { class: 'sk-lines' }, h('i'), h('i')), h('i', { class: 'sk-end' }))))
          : card('ask-none', h('div', { class: 'empty' }, artSearch(120), h('div', { class: 'empty-t' }, 'Not in the database'), h('p', { class: 'muted small' }, 'Try fewer words, or create it from the log sheet.'),
            h('div', { class: 'ask-none-actions' },
              coachEnabled() && q.trim().split(/\s+/).length > 2 && h('button', { class: 'btn primary', onclick: readWithAi }, icon('sparkle', { size: 18 }), 'Ask AI to read it'),
              h('button', { class: 'btn ghost', onclick: () => ctx.openLog({ query: q }) }, icon('search', { size: 18 }), 'Search everywhere')))));
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

  /** One food: name and serving on the left, its calories and protein at a glance on the right. */
  function row(f) {
    const g = f.sizes[0][1] / 100, kcal = round(f.k[0] * g), prot = round(f.k[1] * g, 1);
    return h('button', { class: 'li li-btn ask-row', onclick: () => { food = f; sizeIdx = 0; portion = 1; remember(f.id); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      h('span', { class: 'li-main' },
        h('span', { class: 'li-t' }, dietDot(f.diet), h('span', { class: 'ask-row-n' }, f.brand ? `${f.brand} ${f.n}` : f.n)),
        h('span', { class: 'li-s' }, f.sizes[0][0])),
      h('span', { class: 'ask-row-m num' },
        h('span', { class: 'ask-kcal' }, h('b', null, kcal.toLocaleString('en-IN')), ' kcal'),
        h('span', { class: 'ask-prot' }, h('i', { 'aria-hidden': 'true' }), `${prot} g protein`)),
      h('span', { class: 'ask-row-go', 'aria-hidden': 'true' }, icon('chevron', { size: 16, sw: 2.2 })));
  }

  function start() {
    const rec = recent(), past = recentVerdicts().slice(0, 5);
    const first = String(store.profile.name || '').trim().split(/\s+/)[0];
    return h('div', { class: 'stack ask-start-view' },
      edCard(),
      card('ask-start',
        h('div', { class: 'ask-hero' },
          h('div', { class: 'ask-kato' }, artMascot({ mood: 'think', size: 112 })),
          h('div', { class: 'ask-bubble' },
            first && h('div', { class: 'eyebrow' }, `Hi ${first}`),
            h('h2', { class: 'ask-q' }, 'What are you about to eat?'))),
        h('p', { class: 'ask-lede' }, 'Search one food or type your whole plate. You get go, smaller, swap or skip, worked out from what’s left of your day. It works with no internet.'),
        h('div', { class: 'ask-try' },
          h('div', { class: 'ask-try-l' }, 'Try one'),
          h('div', { class: 'chip-row' }, TRY.map(t => h('button', { class: 'chip', onclick: () => { q = t; input.value = t; draw(); } }, icon('search', { size: 14, sw: 2.2 }), t))))),
      past.length > 0 && card('ask-past', cardHead('Recent answers'), h('div', { class: 'list' }, past.map(r => {
        const [ic, word] = VERDICT_ROW[r.kind] || ['info', String(r.kind || '')];
        return h('div', { class: 'li ask-ra ra-' + r.kind },
          h('span', { class: 'ask-ra-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16, sw: 2.4 })),
          h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, r.names), h('span', { class: 'li-s' }, `${r.cal} kcal · ${new Date(r.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)),
          h('span', { class: 'pill ask-ra-pill' }, word));
      }))),
      rec.length > 0 && card('ask-recent', cardHead('Recently checked'), h('div', { class: 'list' }, rec.map(f => row(f)))),
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

    // the verdict title repeats the food's name for a single food; the header already says it
    const vTitle = v.kind === 'swap' || v.kind === 'skip' ? v.names : copy.headline;
    const aiBox = verdictCard({
      kind: v.kind, title: single && String(vTitle).trim().toLowerCase() === String(title).trim().toLowerCase() ? null : vTitle,
      body: [copy.body, copy.tip].filter(Boolean).join(' '), ifAnyway: copy.ifAnyway, actions: primaryFirst(actions),
    });
    const stampKey = `${title}|${v.kind}`, fresh = stampKey !== lastStamp;
    lastStamp = stampKey;

    const after = left.cal - sum.cal;
    const share = left.cal > 0 ? Math.min(100, (sum.cal / left.cal) * 100) : 100;
    const credit = single && creditFor(food);
    const out = h('div', { class: 'stack ask-detail-view' + (fresh ? ' fresh' : '') },
      h('button', { class: 'chip ask-back', onclick: onBack }, icon('back', { size: 15 }), single ? 'Back to results' : 'Back'),
      edCard(ed),
      card('ask-detail v-' + v.kind,
        h('header', { class: 'ask-food' },
          h('div', { class: 'eyebrow' }, single ? food.brand || 'Food' : 'Your plate'),
          h('h2', { class: 'detail-t' }, single && dietDot(food.diet), h('span', null, title)),
          single && h('div', { class: 'ask-meta' }, h('span', null, `${food.sizes[sizeIdx][0]} · ${round(food.sizes[sizeIdx][1])} ${food.ml ? 'ml' : 'g'} per serving`), credit ? h('span', { class: 'ask-credit' }, credit) : null)),
        verdictStage(v.kind, aiBox, { animate: fresh }),
        single && h('div', { class: 'ask-amount' },
          food.sizes.length > 1 && h('div', { class: 'field' }, h('label', null, 'Serving'), h('div', { class: 'chip-row' }, food.sizes.map((sz, i) => h('button', { class: 'chip' + (i === sizeIdx ? ' on' : ''), 'aria-pressed': String(i === sizeIdx), onclick: () => { sizeIdx = i; draw(); } }, sz[0])))),
          h('div', { class: 'field' }, h('label', null, 'How much'), portionChips({ value: portion, options: [0.5, 1, 1.5, 2, 3], onChange: val => { portion = val; draw(); } })))),
      v.alternatives.length > 1 && card('ask-alts', cardHead('Other options', null, 'Tap one to log it instead'),
        h('div', { class: 'ask-alt-list' }, v.alternatives.slice(1).map(a => h('button', { class: 'ask-alt', onclick: () => logAs([altToItem(a, meal)], 'swap') },
          h('span', { class: 'ask-alt-ic', 'aria-hidden': 'true' }, icon('swap', { size: 18, sw: 2.2 })),
          h('span', { class: 'ask-alt-main' }, h('span', { class: 'ask-alt-n' }, a.n), h('span', { class: 'ask-alt-k num' }, `${a.cal} kcal`)),
          h('span', { class: 'ask-alt-go' }, icon('plus', { size: 16, sw: 2.4 }), 'Log'))))),
      card('ask-numbers', cardHead('The numbers', null, 'Against what’s left of your day'),
        h('div', { class: 'impact ' + (after >= 0 ? 'good' : 'warn') },
          icon(after >= 0 ? 'check' : 'alert', { size: 18, sw: 2.2 }),
          h('div', { class: 'impact-main' },
            h('span', null, left.cal > 0
              ? `This uses ${Math.round((sum.cal / left.cal) * 100)}% of the ${round(left.cal).toLocaleString('en-IN')} kcal you have left today.`
              : `You’re already past today’s target by ${round(-left.cal).toLocaleString('en-IN')} kcal.`),
            h('span', { class: 'impact-meter', 'aria-hidden': 'true' }, h('i', { style: { width: share + '%' } })))),
        nutrientTable([
          { label: 'Energy', value: sum.cal, unit: ' kcal', left: round(left.cal - sum.cal), target: Math.max(0, left.cal), color: COLORS.cal },
          { label: 'Protein', value: sum.p, unit: ' g', left: round(left.p - sum.p), target: Math.max(0, left.p), color: COLORS.p },
          { label: 'Carbs', value: sum.c, unit: ' g', left: round(left.c - sum.c), target: Math.max(0, left.c), color: COLORS.c },
          { label: 'Fat', value: sum.f, unit: ' g', left: round(left.f - sum.f), target: Math.max(0, left.f), color: COLORS.f },
        ])),
      notMedical());
    // optional upgrade: an AI-phrased explanation replaces the template text only if it passes every check
    aiExplanation(v, copy).then(t => { const el = aiBox?.querySelector('.verdict-b'); if (t && el && aiBox.isConnected) { el.textContent = t; el.classList.add('ai-text'); } }).catch(() => {});
    return out;
  }

  draw();
  return h('div', { class: 'page ask' },
    pageHead('Before you eat it', 'Ask', coachEnabled() && h('button', { class: 'btn ghost sm ask-coach-btn', onclick: () => openCoach() }, icon('sparkle', { size: 16 }), 'Coach'), { scene: 'market' }),
    field,
    body);
}

const btn = (cls, ic, label, fn) => h('button', { class: 'btn ' + cls, onclick: fn }, icon(ic, { size: 18, sw: 2.2 }), label);

const notMedical = () => h('p', { class: 'tiny muted verdict-note' }, icon('info', { size: 14 }),
  'General nutrition guidance, not medical advice. If you have a medical condition, follow your clinician’s advice.');

// small line glyphs for the check-in (not in the shared icon set)
const glyph = (d, size = 22) => s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ico', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d }));
const HEART = 'M12 20.2s-7.5-4.4-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.7-7.5 10.1-7.5 10.1z';
const PHONE = 'M6.6 3.5h2.6l1.4 4.1-2 1.4a12 12 0 0 0 6.4 6.4l1.4-2 4.1 1.4v2.6a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z';

/** Gentle check-in when the engine sees warning signs (spec §9.1). No restriction advice while it shows. */
export function edCard(ed = edState()) {
  if (!ed.flag) return null;
  return h('section', { class: 'card ed-card', role: 'status' },
    h('div', { class: 'ed-head' }, h('span', { class: 'ed-ic' }, glyph(HEART, 24)), h('h2', { class: 'card-t' }, 'A gentle check-in')),
    h('p', { class: 'small' }, 'Lately you’ve been eating well under your plan. We’ll stop suggesting that you eat less for now. If food or weight feels stressful, talking to someone helps, and it’s free and confidential.'),
    h('a', { class: 'ed-call', href: 'tel:14416' },
      h('span', { class: 'ed-call-ic' }, glyph(PHONE, 22)),
      h('span', { class: 'ed-call-main' },
        h('span', { class: 'ed-call-l' }, `${ed.helpline.name} · India · 24×7`),
        h('span', { class: 'ed-call-n num' }, ed.helpline.number)),
      h('span', { class: 'ed-call-go' }, 'Call')),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary sm', onclick: () => { switchToMaintenance(); toast('Switched to a maintenance plan'); ctx.refresh(); } }, 'Switch to maintenance')));
}
