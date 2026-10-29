// =============================================================
// MESS — weekly menus for every campus mess, festival specials,
// menu editing (personal or published by admins), reports.
// =============================================================
import { h, todayKey, weekdayOf, labelForKey, round, parseKey, addDays } from '../util.js';
import { segmented, sheet, toast, emptyState, confirmSheet, chip } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MESSES, MEALS, WEEK } from '../../data/messes.js';
import { weeklyMenu, menuFor, upcomingSpecials, normItem, timingsFor, emptyWeek, messById } from '../menus.js';
import { totals, makeMessItem, dietOf, guessMeal } from '../nutrition.js';
import { searchFoods } from '../search.js';
import { logItems } from '../actions.js';
import { pageHead, card, cardHead } from './common.js';
import { dietDot } from './logsheet.js';

let viewMess = null, viewDay = null;

export function renderMess() {
  const pf = store.profile;
  viewMess = viewMess || pf.mess || 'CNV';
  viewDay = viewDay || weekdayOf(ctx.date);
  const { menu, source, updatedAt } = weeklyMenu(viewMess);
  const mess = messById(viewMess);
  const today = todayKey();
  // pick the actual date in the current week for the selected weekday so specials resolve
  const offset = (WEEK.indexOf(viewDay) - WEEK.indexOf(weekdayOf(today)) + 7) % 7;
  const dateForDay = addDays(today, offset);
  const resolved = menuFor(viewMess, dateForDay);
  const specials = upcomingSpecials(viewMess, today).slice(0, 6);

  const srcText = {
    shared: `Official menu${updatedAt ? ' · updated ' + new Date(updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`,
    default: 'Built-in menu', personal: 'Your personal edits', none: 'No menu yet',
  }[source];

  return h('div', { class: 'page mess' },
    pageHead('Campus food', 'Mess menus'),
    h('div', { class: 'chip-scroll mess-chips' }, MESSES.map(m => h('button', {
      class: 'mess-chip' + (m.id === viewMess ? ' on' : '') + (m.id === pf.mess ? ' mine' : ''),
      onclick: () => { viewMess = m.id; ctx.refresh(); },
    }, h('b', null, m.id), h('span', { class: 'tiny' }, m.kind), m.id === pf.mess && h('i', { class: 'tiny' }, 'yours')))),

    h('div', { class: 'row between wrap gap mess-meta' },
      h('span', { class: 'pill ' + (source === 'shared' ? 'good' : '') }, srcText),
      h('div', { class: 'row gap wrap' },
        viewMess !== pf.mess && h('button', { class: 'chip', onclick: () => { store.saveProfile({ mess: viewMess }); toast(`${viewMess} is now your mess`); } }, '★ Make this my mess'),
        h('button', { class: 'chip', onclick: () => openMenuEditor(viewMess) }, store.isAdmin ? '✏️ Edit / publish' : '✏️ Edit menu'),
        store.isAdmin && h('button', { class: 'chip on', onclick: () => openSpecialEditor({ messes: [viewMess] }) }, '✨ Add special'),
        store.mode === 'cloud' && h('button', { class: 'chip', onclick: () => reportSheet(viewMess, viewDay) }, '⚑ Report'))),

    specials.length > 0 && card('specials',
      cardHead('Upcoming specials ✨', null, 'Festival & event menus — these replace the regular meal'),
      h('div', { class: 'list' }, specials.map(sp => h('div', { class: 'li' },
        h('span', { class: 'li-ic big' }, sp.emoji || '🎉'),
        h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, sp.title), h('span', { class: 'li-s' }, `${labelForKey(sp.date)} · ${Object.keys(sp.meals || {}).join(', ')} · ${(sp.messes || []).join(', ')}`)),
        store.isAdmin && h('span', { class: 'li-end row gap' },
          h('button', { class: 'icon-btn sm', 'aria-label': 'Edit special', onclick: () => openSpecialEditor(sp) }, '✏️'),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Delete special', onclick: async () => {
            if (await confirmSheet(`Delete “${sp.title}”?`, { ok: 'Delete', danger: true })) { await store.deleteSpecial(sp.id); toast('Special deleted'); }
          } }, '🗑')))))),

    h('div', { class: 'chip-scroll' }, segmented(WEEK.map(d => ({ value: d, label: d.slice(0, 3) + (d === weekdayOf(today) ? ' •' : '') })), viewDay, v => { viewDay = v; ctx.refresh(); }, 'day-seg')),

    !menu && !resolved.hasAny ? card('', emptyState('📝', `${mess.name} (${mess.kind}) has no menu yet`,
      store.isAdmin ? 'Add the weekly menu and publish it so everyone in this mess gets meal suggestions.' : 'Add it for yourself now. Ask a mess rep / admin to publish it for everyone.',
      h('button', { class: 'btn primary', onclick: () => openMenuEditor(viewMess) }, 'Add weekly menu'))) :
      h('div', { class: 'bento' }, MEALS.map(m => mealCard(m, resolved, dateForDay))));
}

function mealCard(m, resolved, dateKey) {
  const items = resolved.meals[m.id];
  const tm = timingsFor(store.profile)[m.id];
  const isSpecial = resolved.special?.meals.includes(m.id);
  const tt = totals(items);
  return card('meal' + (isSpecial ? ' is-special' : ''),
    cardHead(`${m.icon} ${m.label}`, h('span', { class: 'tiny muted mono' }, `${tm[0]}–${tm[1]}`), isSpecial ? `✨ ${resolved.special.title}` : `${items.length} items · ${round(tt.cal)} kcal if you eat everything`),
    items.length ? h('div', { class: 'plate' }, items.map(it => h('div', { class: 'plate-row' },
      dietDot(it.diet),
      h('div', { class: 'grow' }, h('div', { class: 'small' }, it.n), h('div', { class: 'tiny muted mono' }, `${round(it.cal)} kcal · ${round(it.p)}P ${round(it.c)}C ${round(it.f)}F`)),
      h('button', { class: 'icon-btn sm add', 'aria-label': 'Log ' + it.n, onclick: () => logItems(ctx.date, [makeMessItem(it, 1, m.id, viewMess)]) }, '+'))))
      : h('p', { class: 'muted small' }, 'Nothing listed'));
}

// ---------------- items editor (shared by menu & special editors) ----------------
function itemsEditor(list) {
  const wrap = h('div', { class: 'stack-xs' });
  const draw = () => {
    wrap.replaceChildren(
      ...list.map((it, i) => {
        const num = (k, ph) => {
          const el = h('input', { class: 'input xs', type: 'number', inputmode: 'decimal', value: it[k] ?? '', placeholder: ph, 'aria-label': ph });
          el.addEventListener('input', () => { it[k] = el.value === '' ? '' : +el.value; });
          return el;
        };
        const name = h('input', { class: 'input xs name', value: it.n, placeholder: 'Dish name', 'aria-label': 'Dish name' });
        name.addEventListener('input', () => { it.n = name.value; });
        return h('div', { class: 'edit-row' }, name, num('cal', 'kcal'), num('p', 'P'), num('c', 'C'), num('f', 'F'),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Remove dish', onclick: () => { list.splice(i, 1); draw(); } }, '✕'));
      }),
      foodPicker(item => { list.push(item); draw(); }));
  };
  draw();
  return wrap;
}

function foodPicker(onPick) {
  const input = h('input', { class: 'input xs', placeholder: '+ Add dish — search the food database or type a name', 'aria-label': 'Add dish' });
  const res = h('div', { class: 'picker-res' });
  const draw = () => {
    const q = input.value.trim();
    if (!q) { res.replaceChildren(); return; }
    const found = searchFoods(q, { limit: 6 });
    res.replaceChildren(
      ...found.flatMap(f => f.sizes.slice(0, 2).map(sz => {
        const x = sz[1] / 100;
        return h('button', { class: 'picker-opt', onclick: () => {
          onPick({ n: f.n + (f.sizes.length > 1 || sz[0] !== '1 serving' ? ` (${sz[0]})` : ''), cal: round(f.k[0] * x), p: round(f.k[1] * x, 1), c: round(f.k[2] * x, 1), f: round(f.k[3] * x, 1), diet: f.diet });
          input.value = ''; draw();
        } }, `${f.n} · ${sz[0]}`, h('span', { class: 'tiny muted' }, ` ${round(f.k[0] * x)} kcal`));
      })),
      h('button', { class: 'picker-opt', onclick: () => { onPick({ n: q, cal: '', p: '', c: '', f: '' }); input.value = ''; draw(); } }, `✍️ Add “${q}” and type macros`));
  };
  input.addEventListener('input', draw);
  return h('div', { class: 'picker' }, input, res);
}

function cleanList(list) {
  return list.filter(it => String(it.n || '').trim()).map(it => {
    const n = normItem(it);
    return { n: n.n, cal: n.cal, p: n.p, c: n.c, f: n.f, diet: dietOf(n.n) };
  });
}

// ---------------- weekly menu editor ----------------
export function openMenuEditor(messId) {
  const { menu, source } = weeklyMenu(messId);
  const work = structuredClone(menu || emptyWeek());
  WEEK.forEach(d => { work[d] = work[d] || {}; MEALS.forEach(m => { work[d][m.id] = (work[d][m.id] || []).map(x => ({ ...x })); }); });
  let day = weekdayOf(ctx.date);
  const area = h('div', { class: 'stack' });
  const draw = () => area.replaceChildren(...MEALS.map(m => h('div', { class: 'stack-xs' },
    h('div', { class: 'eyebrow' }, `${m.icon} ${m.label}`),
    h('div', { class: 'tiny muted edit-legend' }, 'Dish · kcal · protein · carbs · fat (per serving)'),
    itemsEditor(work[day][m.id]))));
  const copyFrom = h('select', { class: 'input xs', 'aria-label': 'Copy from' },
    h('option', { value: '' }, 'Copy this day from…'),
    WEEK.filter(d => d !== day).map(d => h('option', { value: 'day:' + d }, d + ' (this mess)')),
    MESSES.filter(m => m.id !== messId && weeklyMenu(m.id).menu).map(m => h('option', { value: 'mess:' + m.id }, m.id + ' mess — whole week')));
  copyFrom.addEventListener('change', () => {
    const [kind, v] = copyFrom.value.split(':');
    if (kind === 'day') work[day] = structuredClone(work[v]);
    if (kind === 'mess') Object.assign(work, structuredClone(weeklyMenu(v).menu));
    copyFrom.value = ''; draw();
  });
  const save = async publish => {
    const out = {};
    WEEK.forEach(d => { out[d] = {}; MEALS.forEach(m => { out[d][m.id] = cleanList(work[d][m.id]); }); });
    try {
      if (publish) { await store.publishMenu(messId, out); toast(`Published ${messId} menu for everyone ✅`); }
      else { store.saveProfile({ menuOverrides: { ...store.profile.menuOverrides, [messId]: out } }); toast('Menu saved for you'); }
      sh.close();
    } catch (e) { toast('Could not save: ' + (e.message || e), 'err'); }
  };
  const sh = sheet({
    title: `Edit ${messId} menu`, sub: store.isAdmin ? 'Publish to update it for everyone in this mess' : 'Saved to your account only', wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'row gap wrap' }, segmented(WEEK.map(d => ({ value: d, label: d.slice(0, 3) })), day, v => { day = v; draw(); }, 'day-seg'), copyFrom),
      area,
      h('div', { class: 'row gap wrap sticky-actions' },
        source === 'personal' && h('button', { class: 'btn ghost', onclick: () => {
          const o = { ...store.profile.menuOverrides }; delete o[messId];
          store.saveProfile({ menuOverrides: o }); toast('Personal edits removed'); sh.close();
        } }, 'Reset my edits'),
        h('button', { class: 'btn grow ' + (store.isAdmin ? 'ghost' : 'primary'), onclick: () => save(false) }, 'Save for me'),
        store.isAdmin && h('button', { class: 'btn primary grow', onclick: () => save(true) }, 'Publish for everyone'))),
  });
  draw();
}

// ---------------- festival special editor (admins) ----------------
export function openSpecialEditor(existing = {}) {
  const sp = {
    id: existing.id, date: existing.date || todayKey(), title: existing.title || '', emoji: existing.emoji || '🪔', note: existing.note || '',
    messes: [...(existing.messes || [store.profile.mess])], meals: structuredClone(existing.meals || { dinner: [] }),
  };
  const mealArea = h('div', { class: 'stack' });
  const drawMeals = () => mealArea.replaceChildren(...MEALS.filter(m => sp.meals[m.id]).map(m => h('div', { class: 'stack-xs' },
    h('div', { class: 'eyebrow' }, `${m.icon} ${m.label} (replaces the usual menu)`), itemsEditor(sp.meals[m.id]))));
  const field = (label, el) => h('div', { class: 'field' }, h('label', null, label), el);
  const inp = (k, attrs = {}) => { const el = h('input', { class: 'input', value: sp[k], ...attrs }); el.addEventListener('input', () => { sp[k] = el.value; }); return el; };
  const messChips = h('div', { class: 'chip-row' }, ['ALL', ...MESSES.map(m => m.id)].map(id => chip(id === 'ALL' ? 'All messes' : id, {
    on: sp.messes.includes(id), onclick: e => {
      const i = sp.messes.indexOf(id);
      i >= 0 ? sp.messes.splice(i, 1) : sp.messes.push(id);
      e.currentTarget.classList.toggle('on');
    },
  })));
  const mealChips = h('div', { class: 'chip-row' }, MEALS.map(m => chip(m.icon + ' ' + m.label, {
    on: !!sp.meals[m.id], onclick: e => {
      if (sp.meals[m.id]) delete sp.meals[m.id]; else sp.meals[m.id] = [];
      e.currentTarget.classList.toggle('on'); drawMeals();
    },
  })));
  const sh = sheet({
    title: existing.id ? 'Edit special' : 'New festival special', sub: 'Shows a banner and replaces those meals on that date', wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid2' }, field('Date', inp('date', { type: 'date' })), field('Emoji', inp('emoji', { maxlength: 4 }))),
      field('Title', inp('title', { placeholder: 'Diwali Feast, Ugadi Special, Onam Sadhya…', maxlength: 60 })),
      field('Note (optional)', inp('note', { placeholder: 'e.g. Extra counter till 10 pm', maxlength: 100 })),
      field('Messes', messChips), field('Meals', mealChips), mealArea,
      h('button', { class: 'btn primary block lg', onclick: async () => {
        if (!sp.title.trim() || !sp.messes.length || !Object.keys(sp.meals).length) { toast('Add a title, at least one mess and one meal', 'err'); return; }
        const meals = {}; Object.entries(sp.meals).forEach(([k, v]) => { meals[k] = cleanList(v); });
        try {
          await store.saveSpecial({ id: sp.id, date: sp.date, title: sp.title.trim(), emoji: sp.emoji, note: sp.note.trim(), messes: sp.messes, meals });
          toast('Special published ✨'); sh.close();
        } catch (e) { toast('Could not publish: ' + (e.message || e), 'err'); }
      } }, 'Publish special')),
  });
  drawMeals();
}

// ---------------- report a mistake ----------------
function reportSheet(messId, dayName) {
  const ta = h('textarea', { class: 'input textarea', rows: 4, maxlength: 500, placeholder: `e.g. ${dayName} dinner at ${messId} is now paneer biryani, not veg pulao` });
  const sh = sheet({
    title: 'Report a menu change', sub: 'Admins see these and update the official menu',
    body: h('div', { class: 'stack' }, ta, h('button', { class: 'btn primary block', onclick: async () => {
      if (!ta.value.trim()) return;
      try { await store.report({ mess: messId, day: dayName, text: ta.value.trim().slice(0, 500) }); toast('Thanks! Sent to admins 🙌'); sh.close(); }
      catch (e) { toast('Could not send: ' + (e.message || e), 'err'); }
    } }, 'Send')),
  });
}
