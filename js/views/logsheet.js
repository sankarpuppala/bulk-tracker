// =============================================================
// LOG SHEET — the "+" button. Search · Type it · Scan · Create · Meals
// =============================================================
import { h, todayKey, labelForKey, round, uid, debounce, fill } from '../util.js';
import { sheet, segmented, stepper, toast, emptyState, miniRing } from '../ui.js';
import { CATEGORIES, FOODS, STARTER_IDS } from '../../data/foods.js';
import { MEALS } from '../../data/messes.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { searchFoods, parseQuickLog, offSearch, offBarcode, getFood } from '../search.js';
import { makeItem, guessMeal, totals, foodName, COLORS, itemMeal } from '../nutrition.js';
import { logItems, isFav, toggleFav, saveCustomFood } from '../actions.js';
import { verdictFor } from '../verdicts.js';
import { creditFor } from '../fooddb.js';
import { oneLine } from '../engine/verdict-copy.js';
import { askAbout } from './ask.js';
import { blockReasons, rulesOf } from '../engine/diet.js';

const catIcon = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));

export { dietDot } from '../components/bits.js';
import { dietDot } from '../components/bits.js';
import { icon, mealIcon } from '../components/icons.js';

function macroLine(m) {
  return h('span', { class: 'macro-line' },
    h('b', null, round(m.cal)), ' kcal · ',
    h('span', { class: 'mp' }, round(m.p, 1) + 'P'), ' ',
    h('span', { class: 'mc' }, round(m.c) + 'C'), ' ',
    h('span', { class: 'mf' }, round(m.f) + 'F'));
}

function per(food, sizeIdx = 0) {
  const g = food.sizes[sizeIdx][1] / 100;
  return { cal: food.k[0] * g, p: food.k[1] * g, c: food.k[2] * g, f: food.k[3] * g };
}

export function openLog(opts = {}) {
  const date = opts.date || ctx.date;
  const state = {
    meal: opts.meal || (date === todayKey() ? guessMeal() : 'lunch'),
    tab: opts.tab || 'search', q: opts.query || '', cat: null, prefillFood: opts.createFrom || null,
  };
  const root = h('div', { class: 'log-sheet' });
  const sh = sheet({ title: 'Add food', sub: labelForKey(date) + ' · tap a meal to log into it', wide: true, body: root, onClose: () => stopScan() });
  const body = h('div', { class: 'log-body' });

  const mealSeg = segmented(MEALS.map(m => ({ value: m.id, label: m.label, icon: mealIcon(m.id, { size: 16 }) })), state.meal, v => { state.meal = v; }, 'meal-seg');
  const tabs = segmented([
    { value: 'search', label: 'Search', icon: icon('search', { size: 16 }) }, { value: 'type', label: 'Type it', icon: icon('edit', { size: 16 }) },
    { value: 'scan', label: 'Scan', icon: icon('barcode', { size: 16 }) }, { value: 'create', label: 'Create', icon: icon('plus', { size: 16 }) },
    { value: 'meals', label: 'Meals', icon: icon('bowl', { size: 16 }) },
  ], state.tab, v => { state.tab = v; render(); }, 'tabs-seg');
  root.append(mealSeg, tabs, body);

  const done = items => { logItems(date, items); if (!opts.keepOpen) sh.close(); };

  function render() {
    stopScan();
    fill(body, ({ search: searchTab, type: typeTab, scan: scanTab, create: createTab, meals: mealsTab })[state.tab]());
  }

  // ---------------- SEARCH ----------------
  function searchTab() {
    const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search 8,000+ foods — “bingo”, “dosa”, “whey”…', value: state.q, autocomplete: 'off', enterkeyhint: 'search' });
    const list = h('div', { class: 'results' });
    const cats = h('div', { class: 'chip-scroll' },
      CATEGORIES.map(c => h('button', { class: 'chip' + (state.cat === c.id ? ' on' : ''), onclick: e => {
        state.cat = state.cat === c.id ? null : c.id;
        cats.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
        if (state.cat) e.currentTarget.classList.add('on');
        draw();
      } }, c.icon + ' ' + c.label)));
    const draw = () => {
      state.q = input.value;
      const q = state.q.trim();
      if (!q && !state.cat) { fill(list, home()); return; }
      const res = searchFoods(q, { cat: state.cat, limit: 60 });
      fill(list, 
        res.length ? h('div', { class: 'list' }, res.map(foodRow)) : emptyState(icon('search', { size: 36 }), 'Nothing in the local database', 'Try fewer words, search online, or create it.'),
        q.length >= 3 && onlineRow(q),
        q && h('button', { class: 'btn ghost block', onclick: () => { state.tab = 'create'; state.prefill = q; render(); } }, [icon('plus', { size: 16 }), `Create “${q}”`]));
    };
    input.addEventListener('input', debounce(draw, 120));
    draw();
    setTimeout(() => input.focus(), 250);
    return h('div', { class: 'stack' }, input, cats, list);
  }

  function home() {
    const pf = store.profile;
    const favs = pf.favorites.map(getFood).filter(Boolean);
    const rec = pf.recents.map(getFood).filter(f => f && !pf.favorites.includes(f.id)).slice(0, 8);
    const starters = STARTER_IDS.map(id => FOODS.find(f => f.id === id)).filter(Boolean);
    return h('div', { class: 'stack' },
      favs.length > 0 && h('div', null, h('div', { class: 'eyebrow' }, [icon('star', { size: 14 }), ' Favourites']), h('div', { class: 'list' }, favs.map(foodRow))),
      rec.length > 0 && h('div', null, h('div', { class: 'eyebrow' }, [icon('clock', { size: 14 }), ' Recent']), h('div', { class: 'list' }, rec.map(foodRow))),
      h('div', null, h('div', { class: 'eyebrow' }, [icon('bolt', { size: 14 }), ' Popular on campus']), h('div', { class: 'list' }, starters.map(foodRow))));
  }

  function foodRow(f) {
    const m = per(f);
    let held = null, fired = false;
    const hold = () => { fired = true; sh.close(); askAbout(f); };
    return h('button', { class: 'li li-btn', title: 'Tap to add · hold to ask “should I eat this?”',
      onpointerdown: () => { fired = false; held = setTimeout(hold, 650); },
      onpointerup: () => clearTimeout(held), onpointerleave: () => clearTimeout(held), onpointercancel: () => clearTimeout(held),
      oncontextmenu: e => { e.preventDefault(); clearTimeout(held); if (!fired) hold(); },
      onclick: e => { if (fired) { e.preventDefault(); return; } detail(f); } },
      h('span', { class: 'li-ic' }, catIcon[f.cat] || '🍴'),
      h('span', { class: 'li-main' },
        h('span', { class: 'li-t' }, dietDot(f.diet), f.n, isFav(f.id) && h('span', { class: 'star' }, ' ★'), blockReasons(f, rulesOf(store.profile)).length > 0 && h('span', { class: 'pill warn', title: 'Breaks one of your food rules' }, 'Not for you')),
        h('span', { class: 'li-s' }, [f.brand, f.sizes[0][0] + (f.sizes[0][2] ? '' : '')].filter(Boolean).join(' · '))),
      h('span', { class: 'li-end' }, h('b', null, round(m.cal)), h('span', { class: 'tiny muted' }, round(m.p, 1) + 'g P')));
  }

  /** Off-plan items get a small verdict before confirming; items that simply fit stay quiet. */
  function verdictChip(it) {
    if (date !== ctx.date && date !== todayKey()) return null;
    let res;
    try { res = verdictFor([it], { meal: state.meal }); } catch { return null; }
    const { v } = res;
    if (v.kind === 'go' && !v.reasons.includes('ADD_PROTEIN')) return null;
    const word = { go: 'Go', smaller: 'Go smaller', swap: 'Swap', skip: 'Skip today' }[v.kind];
    return h('div', { class: 'verdict-chip ' + v.kind, role: 'status' }, icon(v.kind === 'go' ? 'check' : 'alert', { size: 16, sw: 2.2 }),
      h('span', null, h('b', null, word + '. '), oneLine(v)));
  }

  function onlineRow(q) {
    const box = h('div', { class: 'online' });
    const btn = h('button', { class: 'btn ghost block', onclick: async () => {
      btn.disabled = true; btn.textContent = 'Searching Open Food Facts…';
      try {
        const res = await offSearch(q);
        fill(box, h('div', { class: 'eyebrow' }, `Open Food Facts · ${res.length} results`),
          res.length ? h('div', { class: 'list' }, res.map(foodRow)) : h('p', { class: 'muted small' }, 'No packaged products found online.'));
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Retry online search';
        toast('Online search failed — check your connection', 'err');
      }
    } }, `Search millions of packaged foods online for “${q}”`);
    box.appendChild(btn);
    return box;
  }

  // ---------------- FOOD DETAIL ----------------
  function detail(food, back = render) {
    let sizeIdx = 0, qty = 1, grams = null;
    const t = ctx.targets();
    const eaten = totals(store.day(date).items);
    const preview = h('div', { class: 'macro-preview' });
    const update = () => {
      const it = makeItem(food, { sizeIdx, qty, grams, meal: state.meal });
      const left = { cal: t.cal - eaten.cal, p: t.p - eaten.p };
      const fits = it.cal <= Math.max(0, left.cal);
      fill(preview, 
        h('div', { class: 'mp-grid' },
          [['kcal', it.cal, t.cal, COLORS.cal], ['Protein', it.p, t.p, COLORS.p], ['Carbs', it.c, t.c, COLORS.c], ['Fat', it.f, t.f, COLORS.f]].map(([l, v, mx, col]) =>
            h('div', { class: 'mp-cell' }, miniRing(v, mx, col, 46, 5), h('div', null, h('b', null, round(v, l === 'kcal' ? 0 : 1)), h('span', { class: 'tiny muted' }, l === 'kcal' ? ' kcal' : 'g ' + l))))),
        h('p', { class: 'small ' + (fits ? 'ok-t' : 'warn-t') },
          fits ? `Fits: ${round(left.cal - it.cal)} kcal left after this` : `Puts you ${round(it.cal - Math.max(0, left.cal))} kcal over today’s target`,
          it.price ? ` · ₹${it.price}` : ''),
        verdictChip(it));
    };
    const sizeChips = h('div', { class: 'chip-row' }, food.sizes.map((sz, i) =>
      h('button', { class: 'chip size' + (i === 0 ? ' on' : ''), onclick: e => {
        sizeIdx = i; grams = null; gIn.value = '';
        sizeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
        e.currentTarget.classList.add('on'); update();
      } }, sz[0], h('span', { class: 'tiny muted' }, ` ${round(sz[1])}${food.ml ? 'ml' : 'g'}`))));
    const gIn = h('input', { class: 'input sm', type: 'number', inputmode: 'decimal', placeholder: food.ml ? 'ml' : 'grams', min: 0 });
    gIn.addEventListener('input', () => { grams = gIn.value ? +gIn.value : null; update(); });
    const favBtn = h('button', { class: 'icon-btn' + (isFav(food.id) ? ' on' : ''), 'aria-label': 'Favourite', onclick: () => {
      if (!getFood(food.id)) saveCustomFood(food);
      favBtn.classList.toggle('on', toggleFav(food.id));
    } }, '★');
    update();
    fill(body, h('div', { class: 'stack detail' },
      h('div', { class: 'row between' }, h('button', { class: 'btn ghost sm', onclick: back }, '← Back'), favBtn),
      h('div', null,
        h('div', { class: 'eyebrow' }, (catIcon[food.cat] || '🍴') + ' ' + (food.brand || CATEGORIES.find(c => c.id === food.cat)?.label || 'My food')),
        h('h3', { class: 'detail-t' }, dietDot(food.diet), food.n),
        h('p', { class: 'tiny muted' }, `Per 100 ${food.ml ? 'ml' : 'g'}: ${food.k[0]} kcal · ${food.k[1]}g P · ${food.k[2]}g C · ${food.k[3]}g F`, food.src === 'off' ? ' · via Open Food Facts' : creditFor(food) ? ` · ${creditFor(food)}` : ' · approx. values')),
      h('div', { class: 'field' }, h('label', null, 'Size'), sizeChips),
      h('div', { class: 'row gap wrap' },
        h('div', { class: 'field' }, h('label', null, 'Quantity'), stepper(qty, { min: 0.5, max: 20, step: 0.5, onChange: v => { qty = v; grams = null; gIn.value = ''; update(); }, fmt: v => '× ' + v })),
        h('div', { class: 'field grow' }, h('label', null, 'or exact amount'), gIn)),
      preview,
      h('button', { class: 'btn primary block lg', onclick: () => {
        if (food.src === 'off' && !getFood(food.id)) saveCustomFood(food);
        done([makeItem(food, { sizeIdx, qty, grams, meal: state.meal })]);
      } }, `Log to ${MEALS.find(m => m.id === state.meal).label}`)));
  }

  // ---------------- TYPE IT (natural language + voice) ----------------
  function typeTab() {
    const ta = h('textarea', { class: 'input textarea', rows: 3, placeholder: '2 boiled eggs, bingo chilli ₹20, 1 glass milk, 150g chicken breast, chai' });
    ta.value = state.typed || '';
    const out = h('div', { class: 'stack' });
    let parsed = [];
    const draw = () => {
      state.typed = ta.value;
      parsed = parseQuickLog(ta.value);
      if (!parsed.length) { fill(out, h('p', { class: 'muted small' }, 'Separate items with commas or “and”. Quantities, grams (150g) and prices (₹20, 20rs) are understood.')); return; }
      const items = parsed.filter(p => p.food).map(p => makeItem(p.food, { sizeIdx: p.sizeIdx, qty: p.qty, grams: p.grams, meal: state.meal }));
      const tt = totals(items);
      fill(out, 
        h('div', { class: 'list' }, parsed.map((p, idx) => p.food
          ? h('div', { class: 'li' },
              h('span', { class: 'li-ic' }, catIcon[p.food.cat] || '🍴'),
              h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, dietDot(p.food.diet), foodName(p.food)),
                h('span', { class: 'li-s' }, `“${p.raw}” → ${p.grams ? p.grams + 'g' : (p.qty !== 1 ? p.qty + ' × ' : '') + p.food.sizes[p.sizeIdx][0]}`)),
              h('span', { class: 'li-end' }, h('b', null, round(makeItem(p.food, p).cal)), h('button', { class: 'link tiny', onclick: () => { state.q = p.raw; state.tab = 'search'; render(); } }, 'change')))
          : h('div', { class: 'li miss' }, h('span', { class: 'li-ic' }, '❓'),
              h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, `“${p.raw}”`), h('span', { class: 'li-s' }, 'Not found — will be skipped')),
              h('button', { class: 'btn ghost sm', onclick: () => { state.prefill = p.raw; state.tab = 'create'; render(); } }, 'Create')))),
        items.length > 0 && h('div', { class: 'total-bar' }, macroLine(tt), tt.price ? h('span', { class: 'pill' }, '₹' + round(tt.price)) : null),
        items.length > 0 && h('button', { class: 'btn primary block lg', onclick: () => done(items) }, `Log ${items.length} item${items.length > 1 ? 's' : ''}`));
    };
    ta.addEventListener('input', debounce(draw, 200));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = SR && h('button', { class: 'btn ghost', onclick: () => {
      const rec = new SR();
      rec.lang = 'en-IN'; rec.interimResults = false;
      mic.textContent = 'Listening…'; mic.classList.add('rec');
      rec.onresult = e => { ta.value = (ta.value ? ta.value + ', ' : '') + e.results[0][0].transcript; draw(); };
      rec.onend = () => { mic.textContent = 'Speak'; mic.classList.remove('rec'); };
      rec.onerror = () => toast('Voice input unavailable', 'err');
      rec.start();
    } }, [icon('mic', { size: 16 }), 'Speak']);
    draw();
    setTimeout(() => ta.focus(), 250);
    return h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, 'Just type what you ate'), mic), ta, out);
  }

  // ---------------- SCAN (barcode) ----------------
  let stream = null, scanning = false;
  function stopScan() {
    scanning = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
  function scanTab() {
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true });
    const status = h('p', { class: 'small muted' }, 'Point the camera at a barcode on any packaged snack.');
    const code = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'or type the barcode number, e.g. 8901491101837' });
    const lookup = async c => {
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
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        scanning = true; status.textContent = 'Scanning…';
        const loop = async () => {
          if (!scanning) return;
          try {
            const codes = await det.detect(video);
            if (codes.length) { scanning = false; lookup(codes[0].rawValue); return; }
          } catch { /* frame not ready */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch { status.textContent = 'Camera permission denied — type the barcode instead.'; }
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame' }), h('button', { class: 'btn primary scan-start', onclick: e => { e.currentTarget.remove(); start(); } }, '📷 Start camera')),
      status,
      h('div', { class: 'row gap' }, code, h('button', { class: 'btn', onclick: () => code.value.trim() && lookup(code.value.trim()) }, 'Look up')));
  }

  // ---------------- CREATE ----------------
  function createTab() {
    const f = { n: state.prefill || '', brand: '', serving: '1 serving', g: 100, cal: '', p: '', c: '', fat: '', price: '', diet: 'v', ...(state.prefillFood || {}) };
    state.prefill = ''; state.prefillFood = null;
    const inp = (key, label, type = 'number', ph = '') => {
      const el = h('input', { class: 'input', type, inputmode: type === 'number' ? 'decimal' : null, value: f[key], placeholder: ph });
      el.addEventListener('input', () => { f[key] = el.value; });
      return h('div', { class: 'field' }, h('label', null, label), el);
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
    return h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, 'Copy the numbers from the pack (per serving). It’s saved to My Foods so you can find it next time.'),
      h('div', { class: 'grid2' }, inp('n', 'Name', 'text', 'e.g. Canteen egg fried rice'), inp('brand', 'Brand / shop', 'text', 'optional')),
      h('div', { class: 'grid2' }, inp('serving', 'Serving label', 'text', '1 plate'), inp('g', 'Serving size (g/ml)')),
      h('div', { class: 'grid4' }, inp('cal', 'kcal'), inp('p', 'Protein g'), inp('c', 'Carbs g'), inp('fat', 'Fat g')),
      h('div', { class: 'grid2' }, inp('price', 'Price ₹', 'number', 'optional'),
        h('div', { class: 'field' }, h('label', null, 'Type'), segmented([{ value: 'v', label: 'Veg' }, { value: 'e', label: 'Egg' }, { value: 'n', label: 'Non-veg' }], dietSel, v => { dietSel = v; }))),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => { const food = build(); if (food) { saveCustomFood(food); toast('Saved to My Foods'); } } }, 'Save only'),
        h('button', { class: 'btn primary grow', onclick: () => { const food = build(); if (food) { saveCustomFood(food); done([makeItem(food, { meal: state.meal })]); } } }, 'Save & log')));
  }

  // ---------------- SAVED MEALS (templates) ----------------
  function mealsTab() {
    const tpls = store.profile.templates || [];
    const dayItems = store.day(date).items;
    const mealItems = dayItems.filter(i => itemMeal(i) === state.meal);
    const saveBtn = mealItems.length > 0 && h('button', { class: 'btn ghost block', onclick: () => {
      const name = prompt('Name this meal', `My ${state.meal}`);
      if (!name) return;
      const items = mealItems.map(({ id, ts, meal, ...rest }) => rest);
      store.saveProfile({ templates: [{ id: uid(), name: name.slice(0, 40), items }, ...tpls].slice(0, 40) });
      toast('Meal saved'); render();
    } }, [icon('download', { size: 16 }), `Save this ${state.meal} (${mealItems.length} items) as a meal`]);
    return h('div', { class: 'stack' },
      saveBtn,
      tpls.length ? h('div', { class: 'list' }, tpls.map(tp => {
        const tt = totals(tp.items);
        return h('div', { class: 'li' },
          h('span', { class: 'li-ic' }, icon('bowl', { size: 20 })),
          h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, tp.name), h('span', { class: 'li-s' }, tp.items.map(i => i.n).join(', '))),
          h('span', { class: 'li-end row gap' }, h('b', null, round(tt.cal)),
            h('button', { class: 'btn primary sm', onclick: () => done(tp.items.map(i => ({ ...i, id: uid(), meal: state.meal, ts: Date.now() }))) }, 'Log'),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Delete meal', onclick: () => { store.saveProfile({ templates: tpls.filter(x => x.id !== tp.id) }); render(); } }, icon('trash', { size: 16 }))));
      })) : emptyState(icon('bowl', { size: 36 }), 'No saved meals yet', 'Log your usual breakfast once, then save it here to log it in one tap next time.'));
  }

  if (opts.food) detail(opts.food); else render();
  return sh;
}
