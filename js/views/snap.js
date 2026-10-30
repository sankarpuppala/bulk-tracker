// =============================================================
// SNAP RESULT — what happens after the photo (spec §5.6).
//   meal   editable plate → nutrient table → live verdict → log
//   label  nutrition panel → prefilled "create a food" form
//   menu   mess chart → the paste-a-week review, prefilled
// Photos are resized on the device, analysed by the gateway on the
// user's own key, and discarded. Non-food or unsure photos get a
// retake prompt, never a made-up table.
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
import { confidenceBadge, portionChips, nutrientTable, verdictCard, dietDot } from '../components/bits.js';
import { openAiKey } from '../aikey.js';
import { openMenuEditor } from './mess.js';
import { blockReasons, rulesOf, blockText } from '../engine/diet.js';
import { fastingFor } from '../engine/fasting.js';
import { todayKey } from '../util.js';

const ROUTE = { meal: 'vision/meal', label: 'vision/label', menu: 'vision/menu' };
const FACTORS = [0.5, 1, 1.5, 2];

/** A friendly failure with the one button that fixes it. */
export function stateCard(err, { retry, sh } = {}) {
  const act = {
    'add-key': ['Add my free key', () => { sh?.close(); openAiKey(); }],
    'sign-in': ['Sign in', () => { sh?.close(); ctx.signOut(); }],
    retry: ['Try again', retry],
    search: ['Search instead', () => { sh?.close(); ctx.openLog(); }],
  }[err.action];
  return h('div', { class: 'snap-state', role: 'status' },
    icon(err.action === 'search' ? 'search' : 'info', { size: 28 }),
    h('h4', { class: 'snap-t' }, err.title), h('p', { class: 'muted small' }, err.text),
    act && act[1] && h('button', { class: 'btn primary block', onclick: act[1] }, act[0]),
    err.action !== 'search' && h('button', { class: 'btn ghost block', onclick: () => { sh?.close(); ctx.openLog(); } }, icon('search', { size: 16 }), 'Search instead'));
}

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

  // offline: keep the photo, analyse later
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue({ mode, base64: img.base64, meal });
    return fill(body, thumb, h('div', { class: 'snap-state' }, icon('clock', { size: 28 }), h('h4', { class: 'snap-t' }, 'Saved for later'),
      h('p', { class: 'muted small' }, 'You’re offline. We’ll offer to analyse this photo when you’re back online. Meanwhile, search works.'),
      h('button', { class: 'btn primary block', onclick: () => { sh.close(); ctx.openLog({ meal }); } }, icon('search', { size: 16 }), 'Search instead')));
  }

  const gate = aiReady();
  if (gate) return fill(body, thumb, stateCard(gate, { retry: retake, sh }));

  const date = ctx.date;
  const menuPlan = planner.ready ? planner.mealFor(date, meal) : null;
  const candidates = menuPlan?.menu || [];
  const payload = mode === 'meal' ? { image: img.base64, context: { meal, diet: store.profile.diet, menuCandidates: candidates.map(c => c.n) } }
    : mode === 'menu' ? { image: img.base64, mess: store.profile.mess || '' } : { image: img.base64 };
  const res = await aiCall(ROUTE[mode], payload);
  if (!res.ok) return fill(body, thumb, stateCard(res.error, { retry: () => { sh.close(); runSnap(mode, img, { meal }); }, sh }));

  if (mode === 'label') return showLabel(res.data);
  if (mode === 'menu') return showMenu(res.data);
  return showMeal(res.data);

  // ---------------- label ----------------
  function showLabel(d) {
    if (!d.is_label) return fill(body, thumb, stateCard({ title: 'That doesn’t look like a nutrition label', text: 'Photograph the panel on the back of the pack, flat and in good light.', action: 'retry' }, { retry: retake, sh }));
    const f = labelToFood(d);
    if (!f) return fill(body, thumb, stateCard({ title: 'Couldn’t read the numbers', text: 'Try again closer, or type them in by hand.', action: 'retry' }, { retry: retake, sh }),
      h('button', { class: 'btn ghost block', onclick: () => { sh.close(); ctx.openLog({ tab: 'create' }); } }, 'Create a food by hand'));
    fill(body, thumb,
      h('div', null, h('div', { class: 'eyebrow' }, f.brand || 'Label'), h('h3', { class: 'detail-t' }, dietDot(f.diet), f.n || 'Unnamed product')),
      nutrientTable([{ label: 'Energy', value: f.per100.cal, unit: ' kcal', color: COLORS.cal }, { label: 'Protein', value: f.per100.p, unit: ' g', color: COLORS.p }, { label: 'Carbs', value: f.per100.c, unit: ' g', color: COLORS.c }, { label: 'Fat', value: f.per100.f, unit: ' g', color: COLORS.f }], { showLeft: false }),
      h('p', { class: 'tiny muted' }, 'Per 100 g, as printed.' + (f.converted ? ' Energy was converted from kJ.' : '') + (f.unreadable.length ? ` Couldn’t read: ${f.unreadable.join(', ')}.` : '')),
      h('p', { class: 'small' }, 'Check the numbers against the pack before saving.'),
      h('button', { class: 'btn primary block lg', onclick: () => { sh.close(); ctx.openLog({ tab: 'create', createFrom: { n: f.n, brand: f.brand, serving: '100 g', g: 100, cal: f.per100.cal, p: f.per100.p, c: f.per100.c, fat: f.per100.f, diet: f.diet } }); } }, icon('check', { size: 18, sw: 2.4 }), 'Review & save as a food'));
  }

  // ---------------- menu ----------------
  function showMenu(d) {
    if (!d.is_menu) return fill(body, thumb, stateCard({ title: 'That doesn’t look like a menu chart', text: 'Try again with the whole chart in frame.', action: 'retry' }, { retry: retake, sh }));
    const text = menuToText(d.week), dishes = text.split('\n').filter(l => l.includes(':')).length;
    const mess = store.profile.mess;
    fill(body, thumb,
      h('div', { class: 'row gap wrap' }, h('span', { class: 'pill good' }, `${dishes} meals read`), d.unreadable.length > 0 && h('span', { class: 'pill warn' }, `${d.unreadable.length} unreadable`)),
      d.unreadable.length > 0 && h('p', { class: 'tiny muted' }, 'Couldn’t read: ' + d.unreadable.slice(0, 6).map(u => `${u.day} ${u.meal}`).join(', ') + '. Fill those in by hand.'),
      h('p', { class: 'small' }, 'Dish names only. Calories and protein are filled in from the food database, and you review everything before it’s saved.'),
      mess ? h('button', { class: 'btn primary block lg', onclick: () => { sh.close(); openMenuEditor(mess, { pasteText: text }); } }, icon('list', { size: 18 }), 'Review in the menu editor')
        : h('p', { class: 'small warn-t' }, 'Pick your mess in You first, then try again.'));
  }

  // ---------------- meal ----------------
  function showMeal(d) {
    const j = judge(d);
    if (!j.ok) return fill(body, thumb, stateCard({ title: 'Let’s try that again', text: j.hint, action: 'retry' }, { retry: retake, sh }));
    let items = d.items.map(rec => matchItem(rec, { candidates, search: n => searchFoods(n, { limit: 3 }) }));
    let mealId = meal, overrideDone = false;

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

      fill(body, thumb,
        h('div', { class: 'row gap wrap' },
          h('label', { class: 'tiny muted', for: 'snap-meal' }, 'Log to'),
          Object.assign(h('select', { class: 'input xs', id: 'snap-meal', onchange: e => { mealId = e.target.value; draw(); } }, MEALS.map(m => h('option', { value: m.id, selected: m.id === mealId }, m.label)))),
          d.plate_context && h('span', { class: 'tiny muted' }, d.plate_context)),
        h('div', { class: 'list snap-items' }, items.map((it, i) => itemRow(it, i))),
        h('div', { class: 'row gap wrap' }, addBox()),
        items.length > 0 && nutrientTable([
          { label: 'Energy', value: sum.cal, unit: ' kcal', left: round(left.cal - sum.cal), target: Math.max(0, left.cal), color: COLORS.cal },
          { label: 'Protein', value: sum.p, unit: ' g', left: round(left.p - sum.p), target: Math.max(0, left.p), color: COLORS.p },
          { label: 'Carbs', value: sum.c, unit: ' g', left: round(left.c - sum.c), target: Math.max(0, left.c), color: COLORS.c },
          { label: 'Fat', value: sum.f, unit: ' g', left: round(left.f - sum.f), target: Math.max(0, left.f), color: COLORS.f },
        ]),
        warns.length > 0 && h('div', { class: 'impact warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', null, warns.map(w => `${w.it.name} has ${blockText(w.r[0])}.`).join(' '))),
        guess && h('p', { class: 'tiny muted' }, icon('sparkle', { size: 13 }), ' “≈ Estimate” items use the AI’s own guess for calories. Adjust the amount, or swap for a database food.'),
        vd && verdictCard({ kind: vd.v.kind, title: vd.v.names, body: [vd.copy.body, vd.copy.tip].filter(Boolean).join(' '), ifAnyway: vd.copy.ifAnyway }),
        fix && h('div', { class: 'banner change' },
          h('div', { class: 'banner-main' }, h('div', { class: 'banner-t' }, `Update today’s ${MEALS.find(m => m.id === mealId).label.toLowerCase()} to what’s on my plate?`),
            h('div', { class: 'banner-s' }, 'The menu said something else. Your plan will be re-worked from what was actually served.')),
          h('button', { class: 'btn primary sm', onclick: () => { planner.setOverride(date, mealId, fix); overrideDone = true; toast('Menu updated for today'); draw(); } }, 'Update')),
        h('div', { class: 'row gap sticky-actions' }, actions),
        h('button', { class: 'btn ghost block', onclick: retake }, icon('snap', { size: 16 }), 'Retake photo'));
    }

    function itemRow(it, i) {
      const m = macrosOf(it);
      const nameIn = h('input', { class: 'input xs snap-name', value: it.name, 'aria-label': 'Food name' });
      nameIn.addEventListener('change', () => { const keep = it.factor; items[i] = { ...matchItem({ name: nameIn.value, grams: it.original?.grams || it.grams, confidence: 'medium', count: null }, { candidates, search: n => searchFoods(n, { limit: 3 }) }), factor: keep }; if (keep && keep !== 1) items[i] = scaleItem(items[i], keep); draw(); });
      return h('div', { class: 'snap-item' },
        h('div', { class: 'row between' },
          h('div', { class: 'grow' }, nameIn, h('div', { class: 'tiny muted num' }, `${it.source === 'menu' ? it.servings + ' serving' + (it.servings === 1 ? '' : 's') : round(it.grams) + ' g'} · ${m.cal} kcal · ${m.p} g protein`)),
          confidenceBadge(it.conf),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Remove ' + it.name, onclick: () => { items.splice(i, 1); draw(); } }, icon('trash', { size: 16 }))),
        portionChips({ value: it.factor || 1, options: FACTORS, label: 'Portion of ' + it.name, onChange: v => { items[i] = scaleItem(it, v); draw(); } }));
    }

    function addBox() {
      const input = h('input', { class: 'input xs', type: 'search', placeholder: 'Add something it missed…', 'aria-label': 'Add a food' });
      const found = h('div', { class: 'chip-row' });
      input.addEventListener('input', () => {
        const q = input.value.trim();
        fill(found, q.length < 2 ? [] : searchFoods(q, { limit: 4 }).map(f => h('button', { class: 'chip', onclick: () => {
          items.push(matchItem({ name: f.n, grams: f.sizes[0][1], confidence: 'high' }, { candidates: [], search: () => [f] })); draw();
        } }, f.n)));
      });
      return h('div', { class: 'stack-xs grow' }, input, found);
    }

    draw();
  }
}
