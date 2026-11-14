// =============================================================
// LOG SHEET — the "+" button. Search · Type it · Scan · Create · Meals
// =============================================================
import { h, s, todayKey, labelForKey, round, uid, debounce, fill, addDays } from '../util.js';
import { sheet, segmented, stepper, toast, glide } from '../ui.js';
import { CATEGORIES, FOODS, STARTER_IDS } from '../../data/foods.js';
import { MEALS } from '../../data/messes.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { searchFoods, parseQuickLog, offSearch, offBarcode, getFood } from '../search.js';
import { makeItem, guessMeal, totals, foodName, COLORS, itemMeal } from '../nutrition.js';
import { logItems, isFav, toggleFav, saveCustomFood } from '../actions.js';
import { verdictFor } from '../verdicts.js';
import { creditFor, foodByBarcode, barcodeCount, foodDbReady, onFoodDbReady } from '../fooddb.js';
import { oneLine } from '../engine/verdict-copy.js';
import { askAbout } from './ask.js';
import { blockReasons, rulesOf } from '../engine/diet.js';

const catIcon = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));

export { dietDot } from '../components/bits.js';
import { dietDot } from '../components/bits.js';
import { icon, mealIcon } from '../components/icons.js';
import { artTiffin, artSearch } from '../components/art.js';

const TABS = ['search', 'type', 'scan', 'create', 'meals'];

/** A food's category glyph served in a little steel katori: the closest thing to a photo. */
const katori = (f, big = false) => h('span', { class: 'li-ic ls-katori' + (big ? ' big' : ''), 'aria-hidden': 'true' },
  (f && catIcon[f.cat]) || icon('utensils', { size: big ? 26 : 20 }));

/** Small uppercase section label with its icon. */
const secHead = (text, ic) => h('div', { class: 'eyebrow ls-sec-h' }, icon(ic, { size: 14, sw: 2 }), h('span', null, text));

function macroLine(m) {
  return h('span', { class: 'macro-line' },
    h('span', { class: 'ml-cal' }, h('b', { class: 'num' }, round(m.cal)), ' kcal'),
    h('span', { class: 'ml mp' }, h('i', { 'aria-hidden': 'true' }), round(m.p, 1) + 'P'),
    h('span', { class: 'ml mc' }, h('i', { 'aria-hidden': 'true' }), round(m.c) + 'C'),
    h('span', { class: 'ml mf' }, h('i', { 'aria-hidden': 'true' }), round(m.f) + 'F'));
}

/** A ring that eases between values instead of redrawing (the food detail re-computes on every tap). */
function macroRing(color) {
  const arc = s('circle', { class: 'mr-arc', cx: 26, cy: 26, r: 21, pathLength: 100, fill: 'none', stroke: color, 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-dasharray': '100 100', transform: 'rotate(-90 26 26)' });
  const svg = s('svg', { viewBox: '0 0 52 52', width: 52, height: 52, class: 'mr', 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: 26, cy: 26, r: 21, fill: 'none', stroke: color, 'stroke-opacity': '0.18', 'stroke-width': 5.5 }), arc);
  const pct = h('span', { class: 'mr-pct num' });
  const el = h('span', { class: 'mr-wrap' }, svg, pct);
  return {
    el,
    set(p) {
      const v = Math.max(0, p || 0);
      arc.style.strokeDashoffset = String(100 - Math.min(100, v));
      pct.textContent = (v > 0 && v < 1 ? '<1' : Math.round(v)) + '%';
      el.classList.toggle('over', v > 100);
    },
  };
}

/** Faint barcode drawn behind the scanner frame before the camera starts. */
function barcodeArt() {
  const bars = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2];
  let x = 0;
  const g = s('g', { fill: 'currentColor' });
  bars.forEach((w, i) => { if (i % 2 === 0) g.appendChild(s('rect', { x, y: 0, width: w * 2.2, height: 56, rx: 0.8 })); x += w * 2.2 + 1.6; });
  return s('svg', { viewBox: `0 0 ${x} 64`, class: 'scan-art', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' }, g);
}

function per(food, sizeIdx = 0) {
  const g = food.sizes[sizeIdx][1] / 100;
  return { cal: food.k[0] * g, p: food.k[1] * g, c: food.k[2] * g, f: food.k[3] * g };
}

export function openLog(opts = {}) {
  const date = opts.date || ctx.date;
  const state = {
    meal: opts.meal || (date === todayKey() ? guessMeal() : 'lunch'),
    tab: opts.tab || 'search', q: opts.query || '', cat: null, prefillFood: opts.createFrom || null, typed: opts.typed || '',
  };
  let onMeal = null;              // the current view's hook for "the meal changed"
  let shownTab = state.tab;
  const root = h('div', { class: 'log-sheet' });
  const sh = sheet({ title: 'Add food', sub: labelForKey(date) + ' · tap a meal to log into it', wide: true, body: root, onClose: () => stopScan() });
  const body = h('div', { class: 'log-body' });

  const mealSeg = segmented(MEALS.map(m => ({ value: m.id, label: m.label, icon: mealIcon(m.id, { size: 16 }) })), state.meal, v => {
    state.meal = v; mealSeg.dataset.meal = v; onMeal && onMeal();
  }, 'meal-seg');
  mealSeg.setAttribute('aria-label', 'Meal');
  mealSeg.dataset.meal = state.meal;
  mealSeg.querySelectorAll('.seg-btn').forEach((b, i) => b.classList.add('m-' + MEALS[i].id));
  glide(mealSeg);
  const tabs = segmented([
    { value: 'search', label: 'Search', icon: icon('search', { size: 18 }) }, { value: 'type', label: 'Type it', icon: icon('edit', { size: 18 }) },
    { value: 'scan', label: 'Scan', icon: icon('barcode', { size: 18 }) }, { value: 'create', label: 'Create', icon: icon('plus', { size: 18 }) },
    { value: 'meals', label: 'Meals', icon: icon('bowl', { size: 18 }) },
  ], state.tab, v => { state.tab = v; render(); }, 'tabs-seg');
  tabs.setAttribute('aria-label', 'How to add');
  const placeTabs = glide(tabs);
  root.append(mealSeg, tabs, body);

  const done = items => { logItems(date, items); if (!opts.keepOpen) sh.close(); };

  /** Keep the tab bar honest when a view switches tabs itself (e.g. "Create …" from search). */
  function syncTabs() {
    tabs.querySelectorAll('.seg-btn').forEach((b, i) => { const on = TABS[i] === state.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    placeTabs();
  }

  /** Content slides in from the side its tab sits on; a drill-in comes from the right. */
  function enter(dir) { body.dataset.enter = dir; }

  function render(dir) {
    stopScan();
    onMeal = null;
    const from = TABS.indexOf(shownTab), to = TABS.indexOf(state.tab);
    enter(dir || (to > from ? 'fwd' : to < from ? 'back' : 'fade'));
    shownTab = state.tab;
    syncTabs();
    fill(body, ({ search: searchTab, type: typeTab, scan: scanTab, create: createTab, meals: mealsTab })[state.tab]());
  }

  // ---------------- SEARCH ----------------
  function searchTab() {
    const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search 10,000+ foods — “dahi”, “dosa”, “sajje”, “whey”…', value: state.q, autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Search foods' });
    const clear = h('button', { class: 'ls-clear', type: 'button', 'aria-label': 'Clear search', hidden: !state.q, onclick: () => { input.value = ''; draw(); input.focus(); } }, icon('x', { size: 14, sw: 2.6 }));
    const field = h('div', { class: 'ls-search', onclick: e => { if (!e.target.closest('button, input')) input.focus(); } }, icon('search', { size: 20, sw: 2 }), input, clear);
    const list = h('div', { class: 'results', 'aria-live': 'polite' });
    const cats = h('div', { class: 'chip-scroll ls-cats', role: 'group', 'aria-label': 'Categories' },
      CATEGORIES.map(c => h('button', { class: 'chip' + (state.cat === c.id ? ' on' : ''), 'aria-pressed': String(state.cat === c.id), onclick: e => {
        state.cat = state.cat === c.id ? null : c.id;
        cats.querySelectorAll('.chip').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        if (state.cat) { e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); }
        draw();
      } }, c.label)));
    const draw = () => {
      state.q = input.value;
      clear.hidden = !input.value;
      const q = state.q.trim();
      if (!q && !state.cat) { fill(list, home()); return; }
      const res = searchFoods(q, { cat: state.cat, limit: 60 });
      if (!res.length && !foodDbReady()) {
        // the 10,000-food database is still arriving; redraw once it does rather than say "nothing"
        fill(list, h('div', { class: 'ls-loading', role: 'status' },
          h('p', { class: 'small muted' }, 'Loading the rest of the food database…'),
          [0, 1, 2].map(i => h('div', { class: 'ls-skel', style: `--i:${i}`, 'aria-hidden': 'true' },
            h('span', { class: 'sk-tile loading-line' }),
            h('span', { class: 'sk-lines' }, h('span', { class: 'loading-line' }), h('span', { class: 'loading-line', style: `width:${58 - i * 9}%` })),
            h('span', { class: 'sk-end loading-line' })))));
        onFoodDbReady(() => { if (list.isConnected) draw(); });
        return;
      }
      fill(list,
        res.length ? h('div', { class: 'list ls-list' }, res.map(foodRow))
          : h('div', { class: 'empty ls-empty' }, artSearch(128), h('div', { class: 'empty-t' }, 'Nothing in the local database'), h('p', { class: 'muted small' }, 'Try fewer words, search online, or create it.')),
        q ? h('div', { class: 'ls-more' },
          q.length >= 3 && onlineRow(q),
          h('button', { class: 'ls-action', onclick: () => { state.tab = 'create'; state.prefill = q; render(); } },
            h('span', { class: 'ls-action-ic' }, icon('plus', { size: 16, sw: 2.2 })), h('span', { class: 'ls-action-t' }, `Create “${q}”`), icon('chevron', { size: 16 }))) : null);
    };
    input.addEventListener('input', debounce(draw, 120));
    draw();
    setTimeout(() => input.focus(), 250);
    onMeal = () => { if (!state.q.trim() && !state.cat) draw(); };       // "Same as yesterday" follows the meal
    return h('div', { class: 'stack ls-search-tab' }, field, cats, list);
  }

  /** Most people eat the same breakfast. One tap to log it again. */
  function repeatYesterday() {
    const prev = store.day(addDays(date, -1)).items.filter(i => itemMeal(i) === state.meal);
    if (!prev.length) return null;
    const tt = totals(prev);
    return h('section', { class: 'ls-sec' },
      secHead('Same as yesterday', 'undo'),
      h('button', { class: 'li li-btn repeat-row m-' + state.meal, onclick: () => done(prev.map(i => ({ ...i, id: uid(), meal: state.meal, ts: Date.now() }))) },
        h('span', { class: 'li-ic ls-meal-ic', 'aria-hidden': 'true' }, mealIcon(state.meal, { size: 22 })),
        h('span', { class: 'li-main' },
          h('span', { class: 'li-t' }, prev.map(i => i.n).slice(0, 3).join(', ') + (prev.length > 3 ? ` +${prev.length - 3}` : '')),
          h('span', { class: 'li-s' }, `${prev.length} item${prev.length > 1 ? 's' : ''} · ${round(tt.cal)} kcal · ${round(tt.p, 1)} g protein`)),
        h('span', { class: 'pill good ls-again' }, icon('plus', { size: 13, sw: 2.6 }), 'Log again')));
  }

  function home() {
    const pf = store.profile;
    const favs = pf.favorites.map(getFood).filter(Boolean);
    const rec = pf.recents.map(getFood).filter(f => f && !pf.favorites.includes(f.id)).slice(0, 8);
    const starters = STARTER_IDS.map(id => FOODS.find(f => f.id === id)).filter(Boolean);
    const section = (title, ic, foods) => h('section', { class: 'ls-sec' }, secHead(title, ic), h('div', { class: 'list ls-list' }, foods.map(foodRow)));
    return h('div', { class: 'ls-home' },
      repeatYesterday(),
      favs.length > 0 && section('Favourites', 'star', favs),
      rec.length > 0 && section('Recent', 'clock', rec),
      section('Popular on campus', 'bolt', starters));
  }

  function foodRow(f) {
    const m = per(f);
    let held = null, fired = false, sx = 0, sy = 0;
    const hold = () => { fired = true; sh.close(); askAbout(f); };
    const cancel = () => clearTimeout(held);
    const blocked = blockReasons(f, rulesOf(store.profile)).length > 0;
    return h('button', { class: 'li li-btn ls-row', title: 'Tap to add · hold to ask “should I eat this?”',
      onpointerdown: e => { fired = false; sx = e.clientX; sy = e.clientY; held = setTimeout(hold, 650); },
      onpointermove: e => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) cancel(); },   // a scroll or a drag is not a hold
      onpointerup: cancel, onpointerleave: cancel, onpointercancel: cancel,
      oncontextmenu: e => { e.preventDefault(); clearTimeout(held); if (!fired) hold(); },
      onclick: e => { if (fired) { e.preventDefault(); return; } detail(f); } },
      katori(f),
      h('span', { class: 'li-main' },
        h('span', { class: 'li-t' }, dietDot(f.diet), h('span', { class: 'li-name' }, f.n),
          isFav(f.id) && h('span', { class: 'star' }, icon('star', { size: 13, sw: 2 }), h('span', { class: 'vh' }, ' favourite')),
          blocked && h('span', { class: 'pill warn', title: 'Breaks one of your food rules' }, icon('alert', { size: 12, sw: 2.4 }), 'Not for you')),
        h('span', { class: 'li-s' }, [f.brand, f.sizes[0][0]].filter(Boolean).join(' · '))),
      h('span', { class: 'li-end' }, h('b', { class: 'num' }, round(m.cal), h('small', null, ' kcal')), h('span', { class: 'li-p num' }, round(m.p, 1) + ' g P')));
  }

  /** Off-plan items get a small verdict before confirming; items that simply fit stay quiet. */
  function verdictChip(it) {
    if (date !== ctx.date && date !== todayKey()) return null;
    let res;
    try { res = verdictFor([it], { meal: state.meal }); } catch { return null; }
    const { v } = res;
    if (v.kind === 'go' && !v.reasons.includes('ADD_PROTEIN')) return null;
    const word = { go: 'Go', smaller: 'Go smaller', swap: 'Swap', skip: 'Skip today' }[v.kind];
    return h('div', { class: 'verdict-chip ' + v.kind, role: 'status' }, h('span', { class: 'vc-ic' }, icon(v.kind === 'go' ? 'check' : v.kind === 'swap' ? 'swap' : 'alert', { size: 16, sw: 2.2 })),
      h('span', null, h('b', null, word + '. '), oneLine(v)));
  }

  function onlineRow(q) {
    const box = h('div', { class: 'online' });
    const label = h('span', { class: 'ls-action-t' }, `Search millions of packaged foods online for “${q}”`);
    const btn = h('button', { class: 'ls-action', onclick: async () => {
      btn.disabled = true; btn.classList.add('busy'); label.textContent = 'Searching Open Food Facts…';
      try {
        const res = await offSearch(q);
        fill(box, secHead(`Open Food Facts · ${res.length} results`, 'search'),
          res.length ? h('div', { class: 'list ls-list' }, res.map(foodRow)) : h('p', { class: 'muted small' }, 'No packaged products found online.'));
      } catch (e) {
        btn.disabled = false; btn.classList.remove('busy'); label.textContent = 'Retry online search';
        toast('Online search failed — check your connection', 'err');
      }
    } }, h('span', { class: 'ls-action-ic' }, icon('search', { size: 16, sw: 2.2 })), label, icon('chevron', { size: 16 }));
    box.appendChild(btn);
    return box;
  }

  // ---------------- FOOD DETAIL ----------------
  function detail(food, back = () => render('pop')) {
    let sizeIdx = 0, qty = 1, grams = null;
    const t = ctx.targets();
    const eaten = totals(store.day(date).items);
    const unit = food.ml ? 'ml' : 'g';
    const cells = [['cal', 'Energy', t.cal, COLORS.cal], ['p', 'Protein', t.p, COLORS.p], ['c', 'Carbs', t.c, COLORS.c], ['f', 'Fat', t.f, COLORS.f]].map(([k, label, max, col]) => {
      const ring = macroRing(col), val = h('b', { class: 'num' });
      return { k, max, ring, val, el: h('div', { class: 'mp-cell mp-' + k }, ring.el, h('div', { class: 'mp-v' }, val, h('span', { class: 'mp-u' }, k === 'cal' ? ' kcal' : ' g')), h('div', { class: 'mp-l' }, label)) };
    });
    const fit = h('p', { class: 'ls-fit small' });
    const verdictSlot = h('div', { class: 'ls-verdict' });
    const preview = h('div', { class: 'macro-preview' }, h('div', { class: 'mp-grid' }, cells.map(c => c.el)), fit, verdictSlot);
    const ctaLabel = h('span');
    const ctaIcon = h('span', { class: 'ls-cta-ic', 'aria-hidden': 'true' });
    const update = () => {
      const it = makeItem(food, { sizeIdx, qty, grams, meal: state.meal });
      const left = { cal: t.cal - eaten.cal, p: t.p - eaten.p };
      const fits = it.cal <= Math.max(0, left.cal);
      cells.forEach(c => { c.val.textContent = round(it[c.k], c.k === 'cal' ? 0 : 1); c.ring.set(c.max > 0 ? (it[c.k] / c.max) * 100 : 0); });
      fit.className = 'ls-fit small ' + (fits ? 'ok ok-t' : 'over warn-t');
      fill(fit, icon(fits ? 'check' : 'alert', { size: 16, sw: 2.4 }), h('span', null,
        fits ? `Fits: ${round(left.cal - it.cal)} kcal left after this` : `Puts you ${round(it.cal - Math.max(0, left.cal))} kcal over today’s target`,
        it.price ? ` · ₹${it.price}` : ''));
      fill(verdictSlot, verdictChip(it));
      ctaLabel.textContent = `Log to ${MEALS.find(m => m.id === state.meal).label}`;
      fill(ctaIcon, mealIcon(state.meal, { size: 18 }));
    };
    const gId = 'ls-g-' + uid();
    const sizeChips = h('div', { class: 'chip-row ls-sizes' }, food.sizes.map((sz, i) =>
      h('button', { class: 'chip size' + (i === 0 ? ' on' : ''), 'aria-pressed': String(i === 0), onclick: e => {
        sizeIdx = i; grams = null; gIn.value = '';
        sizeChips.querySelectorAll('.chip').forEach(c => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
        e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); update();
      } }, sz[0], h('span', { class: 'chip-g' }, ` ${round(sz[1])}${unit}`))));
    const gIn = h('input', { class: 'input sm', id: gId, type: 'number', inputmode: 'decimal', placeholder: food.ml ? 'ml' : 'grams', min: 0 });
    gIn.addEventListener('input', () => { grams = gIn.value ? +gIn.value : null; update(); });
    const favBtn = h('button', { class: 'icon-btn ls-fav' + (isFav(food.id) ? ' on' : ''), 'aria-label': 'Favourite', 'aria-pressed': String(isFav(food.id)), onclick: () => {
      if (!getFood(food.id)) saveCustomFood(food);
      const on = toggleFav(food.id);
      favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', String(on));
    } }, icon('star', { size: 18, sw: 2 }));
    update();
    onMeal = update;
    enter('push');
    fill(body, h('div', { class: 'stack detail' },
      h('div', { class: 'row between ls-detail-top' }, h('button', { class: 'btn ghost sm ls-back', onclick: () => { onMeal = null; back(); } }, icon('back', { size: 16, sw: 2.2 }), 'Back'), favBtn),
      h('div', { class: 'ls-food' },
        katori(food, true),
        h('div', { class: 'ls-food-t' },
          h('div', { class: 'eyebrow' }, food.brand || CATEGORIES.find(c => c.id === food.cat)?.label || 'My food'),
          h('h3', { class: 'detail-t' }, dietDot(food.diet), food.n),
          h('p', { class: 'tiny muted' }, `Per 100 ${unit}: ${food.k[0]} kcal · ${food.k[1]}g P · ${food.k[2]}g C · ${food.k[3]}g F`, food.src === 'off' ? ' · via Open Food Facts' : creditFor(food) ? ` · ${creditFor(food)}` : ' · approx. values'))),
      h('div', { class: 'field' }, h('label', null, 'Size'), sizeChips),
      h('div', { class: 'ls-amount' },
        h('div', { class: 'field' }, h('label', null, 'Quantity'), stepper(qty, { min: 0.5, max: 20, step: 0.5, onChange: v => { qty = v; grams = null; gIn.value = ''; update(); }, fmt: v => '× ' + v })),
        h('div', { class: 'field grow' }, h('label', { for: gId }, 'or exact amount'), gIn)),
      preview,
      h('div', { class: 'ls-cta' }, h('button', { class: 'btn primary block lg', onclick: () => {
        if (food.src === 'off' && !getFood(food.id)) saveCustomFood(food);
        done([makeItem(food, { sizeIdx, qty, grams, meal: state.meal })]);
      } }, ctaIcon, ctaLabel))));
  }

  // ---------------- TYPE IT (natural language + voice) ----------------
  function typeTab() {
    const ta = h('textarea', { class: 'input textarea ls-note', rows: 3, placeholder: '2 boiled eggs, bingo chilli ₹20, 1 glass milk, 150g chicken breast, chai', 'aria-label': 'What did you eat?' });
    ta.value = state.typed || '';
    const out = h('div', { class: 'stack ls-parsed' });
    let parsed = [];
    const draw = () => {
      state.typed = ta.value;
      parsed = parseQuickLog(ta.value);
      if (!parsed.length) { fill(out, h('p', { class: 'ls-hint small' }, icon('info', { size: 16 }), h('span', null, 'Separate items with commas or “and”. Quantities, grams (150g) and prices (₹20, 20rs) are understood.'))); return; }
      const items = parsed.filter(p => p.food).map(p => makeItem(p.food, { sizeIdx: p.sizeIdx, qty: p.qty, grams: p.grams, meal: state.meal }));
      const tt = totals(items);
      fill(out,
        h('div', { class: 'list ls-list' }, parsed.map(p => p.food
          ? h('div', { class: 'li' },
              katori(p.food),
              h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, dietDot(p.food.diet), foodName(p.food)),
                h('span', { class: 'li-s' }, `“${p.raw}” → ${p.grams ? p.grams + 'g' : (p.qty !== 1 ? p.qty + ' × ' : '') + p.food.sizes[p.sizeIdx][0]}`)),
              h('span', { class: 'li-end' }, h('b', { class: 'num' }, round(makeItem(p.food, p).cal), h('small', null, ' kcal')),
                h('button', { class: 'link tiny', onclick: () => { state.q = p.raw; state.tab = 'search'; render(); } }, 'change')))
          : h('div', { class: 'li miss' }, h('span', { class: 'li-ic ls-miss-ic', 'aria-hidden': 'true' }, icon('search', { size: 18 })),
              h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, `“${p.raw}”`), h('span', { class: 'li-s' }, 'Not found — will be skipped')),
              h('button', { class: 'btn ghost sm', onclick: () => { state.prefill = p.raw; state.tab = 'create'; render(); } }, 'Create')))),
        items.length > 0 && h('div', { class: 'total-bar' }, macroLine(tt), tt.price ? h('span', { class: 'pill' }, '₹' + round(tt.price)) : null),
        items.length > 0 && h('div', { class: 'ls-cta' }, h('button', { class: 'btn primary block lg', onclick: () => done(items) }, `Log ${items.length} item${items.length > 1 ? 's' : ''}`)));
    };
    ta.addEventListener('input', debounce(draw, 200));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micLabel = h('span', null, 'Speak');
    const mic = SR && h('button', { class: 'btn ghost sm ls-mic', onclick: () => {
      const rec = new SR();
      rec.lang = 'en-IN'; rec.interimResults = false;
      micLabel.textContent = 'Listening…'; mic.classList.add('rec');
      rec.onresult = e => { ta.value = (ta.value ? ta.value + ', ' : '') + e.results[0][0].transcript; draw(); };
      rec.onend = () => { micLabel.textContent = 'Speak'; mic.classList.remove('rec'); };
      rec.onerror = () => toast('Voice input unavailable', 'err');
      rec.start();
    } }, h('span', { class: 'ls-mic-ic' }, icon('mic', { size: 16, sw: 2 })), micLabel);
    draw();
    setTimeout(() => ta.focus(), 250);
    return h('div', { class: 'stack' },
      h('div', { class: 'row between ls-type-head' }, h('div', { class: 'eyebrow' }, 'Just type what you ate'), mic),
      h('div', { class: 'ls-pad' }, ta), out);
  }

  // ---------------- SCAN (barcode) ----------------
  let stream = null, scanning = false;
  function stopScan() {
    scanning = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
  function scanTab() {
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, 'aria-label': 'Camera preview' });
    const status = h('p', { class: 'small muted ls-scan-status', role: 'status' }, `Point the camera at a barcode on any packaged snack. ${barcodeCount().toLocaleString('en-IN')} Indian packs work with no internet.`);
    const code = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'or type the barcode number, e.g. 8901491101837', 'aria-label': 'Barcode number', autocomplete: 'off', enterkeyhint: 'search' });
    const box = h('div', { class: 'scan-box' });
    const lookup = async c => {
      const local = foodByBarcode(c);           // thousands of Indian packs ship with the app
      if (local) { stopScan(); detail(local); return; }
      if (navigator.onLine === false) { status.textContent = `${c} isn’t in the offline pack list. Search by name, or try again online.`; return; }
      status.textContent = `Looking up ${c}…`;
      try {
        const food = await offBarcode(c);
        if (food) { stopScan(); detail(food); }
        else status.textContent = 'Not in Open Food Facts yet — use Create to add it (it’ll be saved to My Foods).';
      } catch { status.textContent = 'Lookup failed — check your internet connection.'; }
    };
    const start = async () => {
      if (!('BarcodeDetector' in window)) { status.textContent = 'Live scanning isn’t supported in this browser (works in Chrome on Android). Type the number below instead.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; await video.play();
        box.classList.add('live', 'scanning');
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        scanning = true; status.textContent = 'Scanning…';
        const loop = async () => {
          if (!scanning) { box.classList.remove('scanning'); return; }
          try {
            const codes = await det.detect(video);
            if (codes.length) { scanning = false; box.classList.remove('scanning'); lookup(codes[0].rawValue); return; }
          } catch { /* frame not ready */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch { status.textContent = 'Camera permission denied — type the barcode instead.'; }
    };
    const go = () => code.value.trim() && lookup(code.value.trim());
    code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    fill(box, video, barcodeArt(),
      h('div', { class: 'scan-frame', 'aria-hidden': 'true' }, h('i', { class: 'sf-c tl' }), h('i', { class: 'sf-c tr' }), h('i', { class: 'sf-c bl' }), h('i', { class: 'sf-c br' })),
      h('button', { class: 'btn primary scan-start', onclick: e => { e.currentTarget.remove(); start(); } }, icon('snap', { size: 18, sw: 2 }), 'Start camera'));
    return h('div', { class: 'stack ls-scan' },
      box,
      status,
      h('div', { class: 'row gap ls-code' }, h('span', { class: 'ls-code-ic', 'aria-hidden': 'true' }, icon('barcode', { size: 18 })), code, h('button', { class: 'btn', onclick: go }, 'Look up')));
  }

  // ---------------- CREATE ----------------
  function createTab() {
    const f = { n: state.prefill || '', brand: '', serving: '1 serving', g: 100, cal: '', p: '', c: '', fat: '', price: '', diet: 'v', ...(state.prefillFood || {}) };
    state.prefill = ''; state.prefillFood = null;
    const inp = (key, label, type = 'number', ph = '', dot = null) => {
      const id = 'ls-' + key + '-' + uid();
      const el = h('input', { class: 'input', id, type, inputmode: type === 'number' ? 'decimal' : null, value: f[key], placeholder: ph });
      el.addEventListener('input', () => { f[key] = el.value; });
      return h('div', { class: 'field' }, h('label', { for: id }, dot && h('i', { class: 'ls-dot ' + dot, 'aria-hidden': 'true' }), label), el);
    };
    let dietSel = f.diet || 'v';
    const build = () => {
      if (!f.n.trim()) { toast('Give it a name', 'err'); return null; }
      const g = +f.g || 100, x = 100 / g;
      return {
        id: 'my-' + uid(), n: f.n.trim(), brand: f.brand.trim(), cat: 'custom', src: 'custom', diet: dietSel,
        k: [round((+f.cal || 0) * x), round((+f.p || 0) * x, 1), round((+f.c || 0) * x, 1), round((+f.fat || 0) * x, 1)],
        sizes: [[f.serving || '1 serving', g, f.price ? +f.price : undefined], ...(g !== 100 ? [['100 g', 100]] : [])],
      };
    };
    const card = (title, ic, ...kids) => h('section', { class: 'ls-card' }, secHead(title, ic), ...kids);
    return h('div', { class: 'stack ls-create' },
      h('p', { class: 'small muted' }, 'Copy the numbers from the pack (per serving). It’s saved to My Foods so you can find it next time.'),
      card('The food', 'edit',
        h('div', { class: 'grid2' }, inp('n', 'Name', 'text', 'e.g. Canteen egg fried rice'), inp('brand', 'Brand / shop', 'text', 'optional')),
        h('div', { class: 'grid2' }, inp('serving', 'Serving label', 'text', '1 plate'), inp('g', 'Serving size (g/ml)'))),
      card('Per serving', 'target',
        h('div', { class: 'grid4' }, inp('cal', 'kcal', 'number', '', 'mcal'), inp('p', 'Protein g', 'number', '', 'mp'), inp('c', 'Carbs g', 'number', '', 'mc'), inp('fat', 'Fat g', 'number', '', 'mf'))),
      h('div', { class: 'grid2' }, inp('price', 'Price ₹', 'number', 'optional'),
        h('div', { class: 'field' }, h('label', null, 'Type'), segmented([{ value: 'v', label: 'Veg' }, { value: 'e', label: 'Egg' }, { value: 'n', label: 'Non-veg' }], dietSel, v => { dietSel = v; }, 'ls-diet'))),
      h('div', { class: 'row gap ls-cta' },
        h('button', { class: 'btn ghost grow', onclick: () => { const food = build(); if (food) { saveCustomFood(food); toast('Saved to My Foods'); } } }, 'Save only'),
        h('button', { class: 'btn primary grow', onclick: () => { const food = build(); if (food) { saveCustomFood(food); done([makeItem(food, { meal: state.meal })]); } } }, icon('check', { size: 16, sw: 2.4 }), 'Save & log')));
  }

  // ---------------- SAVED MEALS (templates) ----------------
  function mealsTab() {
    const tpls = store.profile.templates || [];
    const dayItems = store.day(date).items;
    const mealItems = dayItems.filter(i => itemMeal(i) === state.meal);
    const saveBtn = mealItems.length > 0 && h('button', { class: 'ls-action', onclick: () => {
      const name = prompt('Name this meal', `My ${state.meal}`);
      if (!name) return;
      const items = mealItems.map(({ id, ts, meal, ...rest }) => rest);
      store.saveProfile({ templates: [{ id: uid(), name: name.slice(0, 40), items }, ...tpls].slice(0, 40) });
      toast('Meal saved'); render();
    } }, h('span', { class: 'ls-action-ic' }, icon('download', { size: 16, sw: 2.2 })), h('span', { class: 'ls-action-t' }, `Save this ${state.meal} (${mealItems.length} items) as a meal`), icon('chevron', { size: 16 }));
    onMeal = () => { state.tab = 'meals'; render(); };      // "Save this lunch" follows the meal
    return h('div', { class: 'stack ls-meals' },
      saveBtn,
      tpls.length ? h('section', { class: 'ls-sec' }, secHead('Saved meals', 'bowl'), h('div', { class: 'list ls-list' }, tpls.map(tp => {
        const tt = totals(tp.items);
        return h('div', { class: 'li' },
          h('span', { class: 'li-ic ls-katori', 'aria-hidden': 'true' }, icon('bowl', { size: 20 })),
          h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, tp.name), h('span', { class: 'li-s' }, tp.items.map(i => i.n).join(', '))),
          h('span', { class: 'li-end row gap' }, h('b', { class: 'num' }, round(tt.cal), h('small', null, ' kcal')),
            h('button', { class: 'btn primary sm', onclick: () => done(tp.items.map(i => ({ ...i, id: uid(), meal: state.meal, ts: Date.now() }))) }, 'Log'),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Delete meal', onclick: () => { store.saveProfile({ templates: tpls.filter(x => x.id !== tp.id) }); render(); } }, icon('trash', { size: 16 }))));
      })))
        : h('div', { class: 'empty ls-empty' }, artTiffin(128), h('div', { class: 'empty-t' }, 'No saved meals yet'), h('p', { class: 'muted small' }, 'Log your usual breakfast once, then save it here to log it in one tap next time.')));
  }

  if (opts.food) detail(opts.food); else render();
  return sh;
}
