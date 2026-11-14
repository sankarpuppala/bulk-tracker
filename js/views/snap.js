// =============================================================
// SNAP RESULT — what happens after the photo (spec §5.6).
//   meal   editable plate → nutrient table → live verdict → log
//   label  nutrition panel → prefilled "create a food" form
//   menu   mess chart → the paste-a-week review, prefilled
// Photos are resized on the device, analysed by the gateway on the
// user's own key, and discarded. Non-food or unsure photos get a
// retake prompt, never a made-up table.
//
// Also home to two presentational helpers shared with Ask and the
// coach: the verdict "stage" (Kato reacting to a verdict, with the
// stamp) and the friendly state card.
// =============================================================
import { h, fill, round, fmtNum } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { aiCall, aiReady, resizeImage } from '../ai.js';
import { friendly } from '../engine/aicore.js';
import { enqueue } from '../snapqueue.js';
import { searchFoods } from '../search.js';
import { totals, guessMeal, COLORS } from '../nutrition.js';
import { MEALS } from '../../data/messes.js';
import { planner } from '../planner.js';
import { logItems } from '../actions.js';
import { verdictFor, recordVerdict } from '../verdicts.js';
import { stepLabel } from '../engine/verdict.js';
import { matchItem, macrosOf, sumMacros, scaleItem, judge, suggestOverride, toLogged, menuToText, labelToFood } from '../engine/match.js';
import { icon } from '../components/icons.js';
import { artMascot } from '../components/art.js';
import { confidenceBadge, portionChips, nutrientTable, verdictCard, dietDot } from '../components/bits.js';
import { openAiKey } from '../aikey.js';
import { openMenuEditor } from './mess.js';
import { blockReasons, rulesOf, blockText } from '../engine/diet.js';
import { fastingFor } from '../engine/fasting.js';
import { todayKey } from '../util.js';

const ROUTE = { meal: 'vision/meal', label: 'vision/label', menu: 'vision/menu' };
const FACTORS = [0.5, 1, 1.5, 2];
const WAIT = { meal: 'Finding the food on your plate…', label: 'Reading the label…', menu: 'Reading the menu chart…' };

// ---------------- shared: the verdict as a hero ----------------
/** Kato is kind about every verdict: cheering a go, thinking about a smaller or a swap, hungry for something else on a skip. */
export const KATO_MOOD = { go: 'cheer', smaller: 'think', swap: 'think', skip: 'hungry' };

/** Wrap the verdict word so the stamp (icon) and the word can arrive separately. Harmless if the card already wraps it. */
function decorate(card) {
  const badge = card.querySelector('.verdict-badge');
  if (badge) [...badge.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.replaceWith(h('span', { class: 'vb-word' }, n.textContent)); });
  return card;
}

/**
 * The verdict card on its stage: Kato perched on the corner, reacting kindly.
 * `animate` plays the stamp; pass false when only the numbers changed so it doesn't replay.
 */
export function verdictStage(kind, card, { size = 84, animate = true } = {}) {
  return h('div', { class: `vstage vs-${kind}${animate ? ' stamp' : ''}` },
    h('div', { class: 'vstage-kato' }, artMascot({ mood: KATO_MOOD[kind] || 'happy', size })),
    decorate(card));
}

/** The primary action first, so the button the verdict recommends is the one on top. Order is otherwise kept. */
export const primaryFirst = list => list.map((b, i) => [b, i]).sort(([a, i], [b, j]) => (b.classList.contains('primary') - a.classList.contains('primary')) || i - j).map(([b]) => b);

// ---------------- shared: friendly states ----------------
const MOOD_BY_CODE = { quota: 'sleepy', offline: 'sleepy', cooldown: 'sleepy', signin: 'wave', unauthorized: 'wave', no_key: 'wave', bad_key: 'think' };
const MOOD_BY_ACTION = { 'add-key': 'wave', 'sign-in': 'wave', retry: 'think', search: 'think' };

/** The shell every state shares: Kato (or a quiet icon when Kato is already on screen), a title, a line, the buttons. */
function stateShell({ mood = 'think', ic = 'info', photo = null, compact = false, title, text }, ...buttons) {
  return h('div', { class: 'snap-state' + (compact ? ' compact' : ''), role: 'status' },
    h('div', { class: 'ss-art' + (photo ? ' with-photo' : '') },
      photo && h('span', { class: 'ss-photo' }, photo),
      compact ? h('span', { class: 'ss-ic', 'aria-hidden': 'true' }, icon(ic, { size: 22 })) : h('span', { class: 'ss-kato' }, artMascot({ mood, size: photo ? 92 : 108 }))),
    h('h4', { class: 'snap-t' }, title), text && h('p', { class: 'muted small' }, text),
    h('div', { class: 'ss-actions' }, buttons));
}

/** A friendly failure with the one button that fixes it. `photo` shows the picture it was about; `compact` drops Kato (the coach already shows him). */
export function stateCard(err, { retry, sh, photo, compact } = {}) {
  const act = {
    'add-key': ['Add my free key', () => { sh?.close(); openAiKey(); }],
    'sign-in': ['Sign in', () => { sh?.close(); ctx.signOut(); }],
    retry: ['Try again', retry],
    search: ['Search instead', () => { sh?.close(); ctx.openLog(); }],
  }[err.action];
  return stateShell({ mood: MOOD_BY_CODE[err.code] || MOOD_BY_ACTION[err.action] || 'think', ic: err.action === 'search' ? 'search' : 'info', photo, compact, title: err.title, text: err.text },
    act && act[1] && h('button', { class: 'btn primary block', onclick: act[1] }, act[0]),
    err.action !== 'search' && h('button', { class: 'btn ghost block', onclick: () => { sh?.close(); ctx.openLog(); } }, icon('search', { size: 16 }), 'Search instead'));
}

/** Three dots that breathe while something is working. */
export const dots = () => h('span', { class: 'ask-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));

/**
 * @param mode   'meal' | 'label' | 'menu'
 * @param source a File, or an already-resized { base64, preview } (from the offline queue)
 */
export async function runSnap(mode, source, { meal = guessMeal() } = {}) {
  const body = h('div', { class: 'stack snap-result' });
  const sh = sheet({ title: { meal: 'Your plate', label: 'Nutrition label', menu: 'Menu chart' }[mode], sub: 'Analysed on your own free AI key. The photo isn’t kept.', body, wide: true });
  const retake = () => { sh.close(); import('../components/camera.js').then(m => m.openSnap(mode)); };

  fill(body, h('div', { class: 'snap-wait' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, 'Reading the photo…')));
  let img;
  try { img = source.base64 ? source : await resizeImage(source); }
  catch { return fill(body, stateCard({ ...friendly('invalid_output'), title: 'Couldn’t open that photo' }, { retry: retake, sh })); }
  const thumb = h('img', { class: 'snap-thumb', src: img.preview || 'data:image/jpeg;base64,' + img.base64, alt: 'Your photo' });
  /** The photo as the top of the result, with an optional caption over it. */
  const photo = (caption, cls = '') => h('figure', { class: 'snap-photo ' + cls }, thumb, caption && h('figcaption', { class: 'snap-photo-cap' }, caption));

  // offline: keep the photo, analyse later
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue({ mode, base64: img.base64, meal });
    return fill(body, stateShell({ mood: 'sleepy', ic: 'clock', photo: thumb, title: 'Saved for later', text: 'You’re offline. We’ll offer to analyse this photo when you’re back online. Meanwhile, search works.' },
      h('button', { class: 'btn primary block', onclick: () => { sh.close(); ctx.openLog({ meal }); } }, icon('search', { size: 16 }), 'Search instead')));
  }

  const gate = aiReady();
  if (gate) return fill(body, stateCard(gate, { retry: retake, sh, photo: thumb }));

  // while the gateway reads it: the photo under a scanning light, and the shape of what's coming
  fill(body, h('div', { class: 'snap-scan' },
    photo(null, 'scanning'),
    h('p', { class: 'snap-scan-t', role: 'status' }, dots(), WAIT[mode]),
    h('div', { class: 'snap-sk', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('div', { class: 'snap-sk-row' }, h('i'), h('span', null, h('i'), h('i')), h('i'))))));

  const date = ctx.date;
  const menuPlan = planner.ready ? planner.mealFor(date, meal) : null;
  const candidates = menuPlan?.menu || [];
  const payload = mode === 'meal' ? { image: img.base64, context: { meal, diet: store.profile.diet, menuCandidates: candidates.map(c => c.n) } }
    : mode === 'menu' ? { image: img.base64, mess: store.profile.mess || '' } : { image: img.base64 };
  const res = await aiCall(ROUTE[mode], payload);
  if (!res.ok) return fill(body, stateCard(res.error, { retry: () => { sh.close(); runSnap(mode, img, { meal }); }, sh, photo: thumb }));

  if (mode === 'label') return showLabel(res.data);
  if (mode === 'menu') return showMenu(res.data);
  return showMeal(res.data);

  // ---------------- label ----------------
  function showLabel(d) {
    if (!d.is_label) return fill(body, stateCard({ title: 'That doesn’t look like a nutrition label', text: 'Photograph the panel on the back of the pack, flat and in good light.', action: 'retry' }, { retry: retake, sh, photo: thumb }));
    const f = labelToFood(d);
    if (!f) return fill(body, stateCard({ title: 'Couldn’t read the numbers', text: 'Try again closer, or type them in by hand.', action: 'retry' }, { retry: retake, sh, photo: thumb }),
      h('button', { class: 'btn ghost block', onclick: () => { sh.close(); ctx.openLog({ tab: 'create' }); } }, 'Create a food by hand'));
    fill(body, photo(null, 'short reveal'),
      h('section', { class: 'snap-label' },
        h('div', null, h('div', { class: 'eyebrow' }, f.brand || 'Label'), h('h3', { class: 'detail-t' }, dietDot(f.diet), f.n || 'Unnamed product')),
        h('div', { class: 'snap-label-kcal' }, h('span', { class: 'snap-label-l' }, 'Energy'), h('span', { class: 'snap-label-v num' }, h('b', null, fmtNum(f.per100.cal)), h('small', null, ' kcal / 100 g'))),
        nutrientTable([{ label: 'Energy', value: f.per100.cal, unit: ' kcal', color: COLORS.cal }, { label: 'Protein', value: f.per100.p, unit: ' g', color: COLORS.p }, { label: 'Carbs', value: f.per100.c, unit: ' g', color: COLORS.c }, { label: 'Fat', value: f.per100.f, unit: ' g', color: COLORS.f }], { showLeft: false }),
        h('p', { class: 'tiny muted' }, 'Per 100 g, as printed.' + (f.converted ? ' Energy was converted from kJ.' : '') + (f.unreadable.length ? ` Couldn’t read: ${f.unreadable.join(', ')}.` : ''))),
      h('p', { class: 'small snap-hint' }, icon('info', { size: 16 }), h('span', null, 'Check the numbers against the pack before saving.')),
      h('button', { class: 'btn primary block lg', onclick: () => { sh.close(); ctx.openLog({ tab: 'create', createFrom: { n: f.n, brand: f.brand, serving: '100 g', g: 100, cal: f.per100.cal, p: f.per100.p, c: f.per100.c, fat: f.per100.f, diet: f.diet } }); } }, icon('check', { size: 18, sw: 2.4 }), 'Review & save as a food'));
  }

  // ---------------- menu ----------------
  function showMenu(d) {
    if (!d.is_menu) return fill(body, stateCard({ title: 'That doesn’t look like a menu chart', text: 'Try again with the whole chart in frame.', action: 'retry' }, { retry: retake, sh, photo: thumb }));
    const text = menuToText(d.week), dishes = text.split('\n').filter(l => l.includes(':')).length;
    const mess = store.profile.mess;
    const days = Object.entries(d.week || {}).map(([day, meals]) => [day, Object.values(meals || {}).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0)]);
    fill(body, photo(null, 'short reveal'),
      h('div', { class: 'snap-menu-sum' },
        h('span', { class: 'snap-menu-ic', 'aria-hidden': 'true' }, icon('check', { size: 24, sw: 2.6 })),
        h('div', { class: 'grow' }, h('div', { class: 'snap-menu-n' }, `${dishes} meals read`),
          h('div', { class: 'row gap wrap' }, h('span', { class: 'pill good' }, icon('list', { size: 13 }), `${days.length} days`), d.unreadable.length > 0 && h('span', { class: 'pill warn' }, `${d.unreadable.length} unreadable`)))),
      days.length > 0 && h('div', { class: 'snap-week', 'aria-hidden': 'true' }, days.map(([day, n]) => h('span', { class: 'snap-week-d' + (n ? '' : ' none') }, h('b', null, day.slice(0, 3)), h('i', null, n ? String(n) : '–')))),
      d.unreadable.length > 0 && h('p', { class: 'tiny muted' }, 'Couldn’t read: ' + d.unreadable.slice(0, 6).map(u => `${u.day} ${u.meal}`).join(', ') + '. Fill those in by hand.'),
      h('p', { class: 'small snap-hint' }, icon('info', { size: 16 }), h('span', null, 'Dish names only. Calories and protein are filled in from the food database, and you review everything before it’s saved.')),
      mess ? h('button', { class: 'btn primary block lg', onclick: () => { sh.close(); openMenuEditor(mess, { pasteText: text }); } }, icon('list', { size: 18 }), 'Review in the menu editor')
        : h('p', { class: 'small warn-t' }, 'Pick your mess in You first, then try again.'));
  }

  // ---------------- meal ----------------
  function showMeal(d) {
    const j = judge(d);
    if (!j.ok) return fill(body, stateCard({ title: 'Let’s try that again', text: j.hint, action: 'retry' }, { retry: retake, sh, photo: thumb }));
    let items = d.items.map(rec => matchItem(rec, { candidates, search: n => searchFoods(n, { limit: 3 }) }));
    let mealId = meal, overrideDone = false;
    let first = true, lastKind = null;       // the reveal and the stamp play once, not on every portion tap

    function draw() {
      const logged = items.map(it => toLogged(it, mealId));
      const sum = sumMacros(items), t = ctx.targets(), eaten = totals(store.day(date).items);
      const left = { cal: t.cal - eaten.cal, p: t.p - eaten.p, c: t.c - eaten.c, f: t.f - eaten.f };
      const guess = items.some(i => i.est);
      let vd = null;
      if (items.length) { try { vd = verdictFor(logged, { meal: mealId }); } catch { vd = null; } }
      const fix = !overrideDone && suggestOverride(items, candidates);
      const rules = rulesOf(store.profile, fastingFor(store.profile, todayKey()));
      const warns = items.map(it => ({ it, r: blockReasons({ n: it.name, diet: it.diet }, rules) })).filter(x => x.r.length);

      const done = list => { logItems(date, list); if (vd) recordVerdict(vd.v, { logged: 'snap', source: 'photo' }); toast(`Logged ${list.length} item${list.length === 1 ? '' : 's'}`); sh.close(); };
      const actions = [];
      if (vd && vd.v.kind === 'smaller') actions.push(h('button', { class: 'btn primary grow', onclick: () => done(items.map(it => toLogged(scaleItem(it, (it.factor || 1) * vd.v.portion), mealId))) }, icon('check', { size: 18, sw: 2.2 }), `Log ${stepLabel(vd.v.portion)}`));
      actions.push(h('button', { class: 'btn ' + (vd && vd.v.kind === 'smaller' ? 'ghost' : 'primary') + ' grow', disabled: !items.length, onclick: () => done(logged) }, icon('check', { size: 18, sw: 2.2 }), 'Log all'));

      const stamp = !!vd && vd.v.kind !== lastKind;
      lastKind = vd ? vd.v.kind : null;
      const n = items.length;
      fill(body,
        photo(h('span', null, h('b', null, n ? `${n} ${n === 1 ? 'food' : 'foods'} found` : 'Nothing left on the plate'), d.plate_context && h('span', null, ' · ' + d.plate_context)), first ? 'reveal' : ''),
        h('div', { class: 'row gap wrap snap-mealrow' },
          h('label', { class: 'tiny muted', for: 'snap-meal' }, 'Log to'),
          Object.assign(h('select', { class: 'input xs', id: 'snap-meal', onchange: e => { mealId = e.target.value; draw(); } }, MEALS.map(m => h('option', { value: m.id, selected: m.id === mealId }, m.label))))),
        h('div', { class: 'snap-sec-h' }, h('span', { class: 'eyebrow' }, 'On your plate'), h('span', { class: 'tiny muted' }, 'Tap a name to correct it')),
        h('div', { class: 'list snap-items' + (first ? ' enter' : '') }, items.map((it, i) => itemRow(it, i))),
        h('div', { class: 'row gap wrap' }, addBox()),
        items.length > 0 && h('section', { class: 'snap-totals' }, h('div', { class: 'snap-sec-h' }, h('span', { class: 'eyebrow' }, 'Totals'), h('span', { class: 'tiny muted' }, 'Against what’s left today')), nutrientTable([
          { label: 'Energy', value: sum.cal, unit: ' kcal', left: round(left.cal - sum.cal), target: Math.max(0, left.cal), color: COLORS.cal },
          { label: 'Protein', value: sum.p, unit: ' g', left: round(left.p - sum.p), target: Math.max(0, left.p), color: COLORS.p },
          { label: 'Carbs', value: sum.c, unit: ' g', left: round(left.c - sum.c), target: Math.max(0, left.c), color: COLORS.c },
          { label: 'Fat', value: sum.f, unit: ' g', left: round(left.f - sum.f), target: Math.max(0, left.f), color: COLORS.f },
        ])),
        warns.length > 0 && h('div', { class: 'impact warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', null, warns.map(w => `${w.it.name} has ${blockText(w.r[0])}.`).join(' '))),
        guess && h('p', { class: 'tiny muted snap-guess' }, icon('sparkle', { size: 13 }), ' “≈ Estimate” items use the AI’s own guess for calories. Adjust the amount, or swap for a database food.'),
        vd && verdictStage(vd.v.kind, verdictCard({ kind: vd.v.kind, title: vd.v.names, body: [vd.copy.body, vd.copy.tip].filter(Boolean).join(' '), ifAnyway: vd.copy.ifAnyway }), { size: 72, animate: stamp }),
        fix && h('div', { class: 'banner change' },
          h('div', { class: 'banner-ic', 'aria-hidden': 'true' }, icon('list', { size: 22 })),
          h('div', { class: 'banner-main' }, h('div', { class: 'banner-t' }, `Update today’s ${MEALS.find(m => m.id === mealId).label.toLowerCase()} to what’s on my plate?`),
            h('div', { class: 'banner-s' }, 'The menu said something else. Your plan will be re-worked from what was actually served.')),
          h('button', { class: 'btn primary sm', onclick: () => { planner.setOverride(date, mealId, fix); overrideDone = true; toast('Menu updated for today'); draw(); } }, 'Update')),
        h('div', { class: 'row gap sticky-actions' }, actions),
        h('button', { class: 'btn ghost block', onclick: retake }, icon('snap', { size: 16 }), 'Retake photo'));
      first = false;
    }

    function itemRow(it, i) {
      const m = macrosOf(it);
      const nameIn = h('input', { class: 'input xs snap-name', value: it.name, 'aria-label': 'Food name' });
      nameIn.addEventListener('change', () => { const keep = it.factor; items[i] = { ...matchItem({ name: nameIn.value, grams: it.original?.grams || it.grams, confidence: 'medium', count: null }, { candidates, search: n => searchFoods(n, { limit: 3 }) }), factor: keep }; if (keep && keep !== 1) items[i] = scaleItem(items[i], keep); draw(); });
      const row = h('div', { class: 'snap-item' },
        h('div', { class: 'row between snap-item-top' },
          h('div', { class: 'grow' }, nameIn, h('div', { class: 'tiny muted num snap-item-s' },
            `${it.source === 'menu' ? it.servings + ' serving' + (it.servings === 1 ? '' : 's') : round(it.grams) + ' g'} · `, h('b', null, `${m.cal} kcal`), ` · ${m.p} g protein`)),
          confidenceBadge(it.conf),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Remove ' + it.name, onclick: () => { items.splice(i, 1); draw(); } }, icon('trash', { size: 16 }))),
        portionChips({ value: it.factor || 1, options: FACTORS, label: 'Portion of ' + it.name, onChange: v => { items[i] = scaleItem(it, v); draw(); } }));
      row.style.setProperty('--i', i);
      return row;
    }

    function addBox() {
      const input = h('input', { class: 'input xs', type: 'search', placeholder: 'Add something it missed…', 'aria-label': 'Add a food' });
      const found = h('div', { class: 'chip-row' });
      input.addEventListener('input', () => {
        const q = input.value.trim();
        fill(found, q.length < 2 ? [] : searchFoods(q, { limit: 4 }).map(f => h('button', { class: 'chip', onclick: () => {
          items.push(matchItem({ name: f.n, grams: f.sizes[0][1], confidence: 'high' }, { candidates: [], search: () => [f] })); draw();
        } }, icon('plus', { size: 14 }), f.n)));
      });
      return h('div', { class: 'stack-xs grow snap-add' }, h('div', { class: 'snap-add-f' }, icon('plus', { size: 18 }), input), found);
    }

    draw();
  }
}
