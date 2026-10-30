// =============================================================
// MESS — weekly menus for every campus mess, festival specials,
// menu editing (personal or published by admins), reports.
// =============================================================
import { h, todayKey, weekdayOf, labelForKey, round, parseKey, addDays, fill, debounce } from '../util.js';
import { segmented, sheet, toast, emptyState, confirmSheet, chip } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MESSES, MEALS, WEEK, SAMPLE_WEEKS } from '../../data/messes.js';
import { weeklyMenu, menuFor, upcomingSpecials, normItem, timingsFor, emptyWeek, messById } from '../menus.js';
import { totals, makeMessItem, dietOf, guessMeal } from '../nutrition.js';
import { searchFoods } from '../search.js';
import { parseWeekText, SAMPLE_PASTE } from '../menuparse.js';
import { logItems } from '../actions.js';
import { pageHead, card, cardHead } from './common.js';
import { dietDot, field } from '../components/bits.js';
import { icon, mealIcon } from '../components/icons.js';

let viewMess = null, viewDay = null;

export function renderMess(embedded = false) {
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

  return h('div', { class: 'page mess' + (embedded ? ' embedded' : '') },
    !embedded && pageHead('Campus food', 'Mess menus'),
    h('div', { class: 'chip-scroll mess-chips' }, MESSES.map(m => h('button', {
      class: 'mess-chip' + (m.id === viewMess ? ' on' : '') + (m.id === pf.mess ? ' mine' : ''),
      onclick: () => { viewMess = m.id; ctx.refresh(); },
    }, h('b', null, m.id), h('span', { class: 'tiny' }, m.kind), m.id === pf.mess && h('i', { class: 'tiny' }, 'yours')))),

    h('div', { class: 'row between wrap gap mess-meta' },
      h('span', { class: 'pill ' + (source === 'shared' ? 'good' : '') }, srcText),
      h('div', { class: 'row gap wrap' },
        viewMess !== pf.mess && h('button', { class: 'chip', onclick: () => { store.saveProfile({ mess: viewMess }); toast(`${viewMess} is now your mess`); } }, [icon('target', { size: 15 }), 'Make this my mess']),
        h('button', { class: 'chip', onclick: () => openMenuEditor(viewMess) }, [icon('edit', { size: 15 }), store.canEditMess(viewMess) ? 'Edit / publish' : 'Edit menu']),
        store.canEditMess(viewMess) && h('button', { class: 'chip on', onclick: () => openSpecialEditor({ messes: [viewMess] }) }, [icon('sparkle', { size: 15 }), 'Add special']),
        store.mode === 'cloud' && h('button', { class: 'chip', onclick: () => reportSheet(viewMess, viewDay) }, [icon('flag', { size: 15 }), 'Report']))),

    specials.length > 0 && card('specials',
      cardHead('Upcoming specials', null, 'Festival & event menus — these replace the regular meal'),
      h('div', { class: 'list' }, specials.map(sp => h('div', { class: 'li' },
        h('span', { class: 'li-ic big' }, sp.emoji || '🎉'),
        h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, sp.title), h('span', { class: 'li-s' }, `${labelForKey(sp.date)} · ${Object.keys(sp.meals || {}).join(', ')} · ${(sp.messes || []).join(', ')}`)),
        (sp.messes || []).some(m => m === 'ALL' ? store.isSuper : store.canEditMess(m)) && h('span', { class: 'li-end row gap' },
          h('button', { class: 'icon-btn sm', 'aria-label': 'Edit special', onclick: () => openSpecialEditor(sp) }, icon('edit', { size: 16 })),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Delete special', onclick: async () => {
            if (await confirmSheet(`Delete “${sp.title}”?`, { ok: 'Delete', danger: true })) { await store.deleteSpecial(sp.id); toast('Special deleted'); }
          } }, icon('trash', { size: 16 }))))))),

    h('div', { class: 'chip-scroll' }, segmented(WEEK.map(d => ({ value: d, label: d.slice(0, 3) + (d === weekdayOf(today) ? ' •' : '') })), viewDay, v => { viewDay = v; ctx.refresh(); }, 'day-seg')),

    !menu && !resolved.hasAny ? card('', emptyState(icon('list', { size: 36 }), `${mess.name} (${mess.kind}) has no menu yet`,
      (store.canEditMess(viewMess) ? 'Add the weekly menu and publish it so everyone in this mess gets meal suggestions. ' : 'Add it for yourself now, and ask a mess rep / admin to publish it for everyone. ')
        + 'Tip: start from a sample week in the editor and edit the dishes — much faster than typing all 28 meals.',
      h('button', { class: 'btn primary', onclick: () => openMenuEditor(viewMess) }, 'Add weekly menu'))) :
      h('div', { class: 'bento' }, MEALS.map(m => mealCard(m, resolved, dateForDay))));
}

function mealCard(m, resolved, dateKey) {
  const items = resolved.meals[m.id];
  const tm = timingsFor(store.profile)[m.id];
  const isSpecial = resolved.special?.meals.includes(m.id);
  const tt = totals(items);
  return card('meal' + (isSpecial ? ' is-special' : ''),
    cardHead([mealIcon(m.id, { size: 20 }), m.label], h('span', { class: 'tiny muted mono' }, `${tm[0]}–${tm[1]}`), isSpecial ? `Special · ${resolved.special.title}` : `${items.length} items · ${round(tt.cal)} kcal if you eat everything`),
    items.length ? h('div', { class: 'plate' }, items.map(it => h('div', { class: 'plate-row' },
      dietDot(it.diet),
      h('div', { class: 'grow' }, h('div', { class: 'small' }, it.n), h('div', { class: 'tiny muted mono' }, `${round(it.cal)} kcal · ${round(it.p)}P ${round(it.c)}C ${round(it.f)}F`)),
      h('button', { class: 'icon-btn sm add', 'aria-label': 'Log ' + it.n, onclick: () => logItems(ctx.date, [makeMessItem(it, 1, m.id, viewMess)]) }, icon('plus', { size: 16, sw: 2.4 })))))
      : h('p', { class: 'muted small' }, 'Nothing listed'));
}

// ---------------- items editor (shared by menu & special editors) ----------------
function itemsEditor(list) {
  const wrap = h('div', { class: 'stack-xs' });
  const draw = () => {
    fill(wrap, 
      ...list.map((it, i) => {
        const num = (k, ph) => {
          const el = h('input', { class: 'input xs', type: 'number', inputmode: 'decimal', value: it[k] ?? '', placeholder: ph, 'aria-label': ph });
          el.addEventListener('input', () => { it[k] = el.value === '' ? '' : +el.value; });
          return el;
        };
        const name = h('input', { class: 'input xs name', value: it.n, placeholder: 'Dish name', 'aria-label': 'Dish name' });
        name.addEventListener('input', () => { it.n = name.value; });
        return h('div', { class: 'edit-row' }, name, num('cal', 'kcal'), num('p', 'P'), num('c', 'C'), num('f', 'F'),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Remove dish', onclick: () => { list.splice(i, 1); draw(); } }, icon('x', { size: 16 })));
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
    if (!q) { fill(res); return; }
    const found = searchFoods(q, { limit: 6 });
    fill(res, 
      ...found.flatMap(f => f.sizes.slice(0, 2).map(sz => {
        const x = sz[1] / 100;
        return h('button', { class: 'picker-opt', onclick: () => {
          onPick({ n: f.n + (f.sizes.length > 1 || sz[0] !== '1 serving' ? ` (${sz[0]})` : ''), cal: round(f.k[0] * x), p: round(f.k[1] * x, 1), c: round(f.k[2] * x, 1), f: round(f.k[3] * x, 1), diet: f.diet });
          input.value = ''; draw();
        } }, `${f.n} · ${sz[0]}`, h('span', { class: 'tiny muted' }, ` ${round(f.k[0] * x)} kcal`));
      })),
      h('button', { class: 'picker-opt', onclick: () => { onPick({ n: q, cal: '', p: '', c: '', f: '' }); input.value = ''; draw(); } }, [icon('edit', { size: 15 }), `Add “${q}” and type macros`]));
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
  const canPublish = store.canEditMess(messId);
  const { menu, source } = weeklyMenu(messId);
  const work = structuredClone(menu || emptyWeek());
  WEEK.forEach(d => { work[d] = work[d] || {}; MEALS.forEach(m => { work[d][m.id] = (work[d][m.id] || []).map(x => ({ ...x })); }); });
  let day = weekdayOf(ctx.date);
  const area = h('div', { class: 'stack' });
  const draw = () => fill(area, ...MEALS.map(m => h('div', { class: 'stack-xs' },
    h('div', { class: 'eyebrow' }, m.label),
    h('div', { class: 'tiny muted edit-legend' }, 'Dish · kcal · protein · carbs · fat (per serving)'),
    itemsEditor(work[day][m.id]))));
  const copyFrom = h('select', { class: 'input xs', 'aria-label': 'Copy from' },
    h('option', { value: '' }, 'Copy this day from…'),
    WEEK.filter(d => d !== day).map(d => h('option', { value: 'day:' + d }, d + ' (this mess)')),
    MESSES.filter(m => m.id !== messId && weeklyMenu(m.id).menu).map(m => h('option', { value: 'mess:' + m.id }, m.id + ' mess — whole week')),
    SAMPLE_WEEKS.map(s => h('option', { value: 'sample:' + s.id }, s.label + ' — whole week')));
  copyFrom.addEventListener('change', async () => {
    const [kind, v] = copyFrom.value.split(':');
    copyFrom.value = '';
    if (kind === 'day') work[day] = structuredClone(work[v]);
    if (kind === 'mess') Object.assign(work, structuredClone(weeklyMenu(v).menu));
    if (kind === 'sample') {
      const filled = WEEK.some(d => MEALS.some(m => work[d][m.id].length));
      if (filled && !(await confirmSheet('Replace the whole week?', { ok: 'Replace', danger: true, detail: 'The sample week overwrites every day currently in this editor. Nothing is saved until you press Save or Publish.' }))) return;
      Object.assign(work, structuredClone(SAMPLE_WEEKS.find(s => s.id === v).week));
      toast('Sample week loaded — edit it to match your mess, then save');
    }
    draw();
  });
  const pasteBtn = h('button', { class: 'btn ghost sm', onclick: () => openPasteSheet(async parsed => {
    const filled = WEEK.some(d => MEALS.some(m => work[d][m.id].length));
    if (filled && !(await confirmSheet('Replace the whole week?', { ok: 'Replace', danger: true, detail: 'The pasted menu overwrites every day in this editor. Nothing is saved until you press Save or Publish.' }))) return false;
    Object.assign(work, structuredClone(parsed.week));
    day = parsed.stats.days[0] || day;
    draw();
    return true;
  }) }, [icon('list', { size: 16 }), 'Paste a week']);

  const save = async publish => {
    const out = {};
    WEEK.forEach(d => { out[d] = {}; MEALS.forEach(m => { out[d][m.id] = cleanList(work[d][m.id]); }); });
    const blank = WEEK.flatMap(d => MEALS.flatMap(m => out[d][m.id].filter(i => !i.cal)));
    if (blank.length && !(await confirmSheet(`${blank.length} dish${blank.length > 1 ? 'es have' : ' has'} no calories`, {
      ok: 'Save anyway',
      detail: `The plate suggester ignores dishes with 0 kcal, so they won't be counted: ${blank.slice(0, 6).map(i => i.n).join(', ')}${blank.length > 6 ? '…' : ''}`,
    }))) return;
    try {
      if (publish) { await store.publishMenu(messId, out); toast(`Published ${messId} menu for everyone`); }
      else { store.saveProfile({ menuOverrides: { ...store.profile.menuOverrides, [messId]: out } }); toast('Menu saved for you'); }
      sh.close();
    } catch (e) { toast('Could not save: ' + (e.message || e), 'err'); }
  };
  const sh = sheet({
    title: `Edit ${messId} menu`, sub: canPublish ? 'Publish to update it for everyone in this mess' : 'Saved to your account only', wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'row gap wrap' }, segmented(WEEK.map(d => ({ value: d, label: d.slice(0, 3) })), day, v => { day = v; draw(); }, 'day-seg'), copyFrom, pasteBtn),
      area,
      h('div', { class: 'row gap wrap sticky-actions' },
        source === 'personal' && h('button', { class: 'btn ghost', onclick: () => {
          const o = { ...store.profile.menuOverrides }; delete o[messId];
          store.saveProfile({ menuOverrides: o }); toast('Personal edits removed'); sh.close();
        } }, 'Reset my edits'),
        h('button', { class: 'btn grow ' + (canPublish ? 'ghost' : 'primary'), onclick: () => save(false) }, 'Save for me'),
        canPublish && h('button', { class: 'btn primary grow', onclick: () => save(true) }, 'Publish for everyone'))),
  });
  draw();
}

// ---------------- paste a whole week ----------------
/** onApply(parsed) should return true if it accepted the week. */
function openPasteSheet(onApply) {
  const ta = h('textarea', { class: 'input textarea paste-area', rows: 9, spellcheck: 'false', placeholder: SAMPLE_PASTE });
  const out = h('div', { class: 'stack' });
  let parsed = null;

  const review = () => {
    parsed = parseWeekText(ta.value);
    const st = parsed.stats;
    if (!st.items) {
      fill(out, h('p', { class: 'small warn-t' }, '⚠ Couldn’t find anything. Each day needs a line with its name (Monday, Tue…), and meals labelled Breakfast / Lunch / Snacks / Dinner.'));
      return;
    }
    fill(out,
      h('div', { class: 'row gap wrap' },
        h('span', { class: 'pill good' }, `${st.days.length}/7 days`),
        h('span', { class: 'pill' }, `${st.meals} meals`),
        h('span', { class: 'pill' }, `${st.items} dishes`),
        h('span', { class: st.matched === st.items ? 'pill good' : 'pill warn' }, `${st.matched} with macros`)),
      st.missingDays.length > 0 && h('p', { class: 'tiny muted' }, 'No dishes found for: ' + st.missingDays.join(', ') + '. You can paste those separately or type them in.'),
      h('div', { class: 'paste-preview' }, st.days.map(d => h('div', { class: 'stack-xs' },
        h('div', { class: 'eyebrow' }, d),
        MEALS.filter(m => parsed.week[d][m.id].length).map(m => h('div', { class: 'tiny' },
          h('b', null, m.icon + ' '),
          parsed.week[d][m.id].map((it, i) => h('span', { class: it.cal === '' ? 'miss-macro' : '' }, (i ? ', ' : '') + it.n)))))))
      ,
      st.unmatched.length > 0 && h('p', { class: 'tiny muted' },
        `${st.unmatched.length} dish${st.unmatched.length > 1 ? 'es aren’t' : ' isn’t'} in the food database, so ${st.unmatched.length > 1 ? 'their' : 'its'} macros are left blank for you to fill in (shown underlined): `,
        st.unmatched.slice(0, 12).join(', '), st.unmatched.length > 12 ? '…' : ''),
      h('button', { class: 'btn primary block lg', onclick: async () => { if (await onApply(parsed)) { toast(`Loaded ${st.days.length} days — check the macros, then save`); sh.close(); } } },
        `Load ${st.days.length} day${st.days.length > 1 ? 's' : ''} into the editor`));
  };

  ta.addEventListener('input', debounce(review, 400));
  const sh = sheet({
    title: 'Paste a week', wide: true,
    sub: 'Copy the mess chart from WhatsApp, a PDF or a spreadsheet and paste it here',
    body: h('div', { class: 'stack' },
      ta,
      h('p', { class: 'tiny muted' }, 'Understands day headings (Monday, MON, Tue…), meal labels (Breakfast, B/F, Lunch, Snacks, Dinner), commas, bullets, numbered lists and tab-separated tables. Nothing is saved until you load it and press Save or Publish.'),
      out),
  });
  setTimeout(() => ta.focus(), 250);
}

// ---------------- festival special editor (admins) ----------------
export function openSpecialEditor(existing = {}) {
  const sp = {
    id: existing.id, date: existing.date || todayKey(), title: existing.title || '', emoji: existing.emoji || '🪔', note: existing.note || '',
    messes: [...(existing.messes || [store.profile.mess])], meals: structuredClone(existing.meals || { dinner: [] }),
  };
  const mealArea = h('div', { class: 'stack' });
  const drawMeals = () => fill(mealArea, ...MEALS.filter(m => sp.meals[m.id]).map(m => h('div', { class: 'stack-xs' },
    h('div', { class: 'eyebrow' }, `${m.label} (replaces the usual menu)`), itemsEditor(sp.meals[m.id]))));
  const inp = (k, attrs = {}) => { const el = h('input', { class: 'input', value: sp[k], ...attrs }); el.addEventListener('input', () => { sp[k] = el.value; }); return el; };
  const allowed = store.isSuper ? ['ALL', ...MESSES.map(m => m.id)] : MESSES.map(m => m.id).filter(id => store.canEditMess(id));
  sp.messes = sp.messes.filter(m => allowed.includes(m));
  if (!sp.messes.length) sp.messes = allowed.filter(a => a !== 'ALL').slice(0, 1);
  const messChips = h('div', { class: 'chip-row' }, allowed.map(id => chip(id === 'ALL' ? 'All messes' : id, {
    on: sp.messes.includes(id), onclick: e => {
      const i = sp.messes.indexOf(id);
      i >= 0 ? sp.messes.splice(i, 1) : sp.messes.push(id);
      e.currentTarget.classList.toggle('on');
    },
  })));
  const mealChips = h('div', { class: 'chip-row' }, MEALS.map(m => chip([mealIcon(m.id, { size: 15 }), m.label], {
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
          toast('Special published'); sh.close();
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
      try { await store.report({ mess: messId, day: dayName, text: ta.value.trim().slice(0, 500) }); toast('Thanks! Sent to admins'); sh.close(); }
      catch (e) { toast('Could not send: ' + (e.message || e), 'err'); }
    } }, 'Send')),
  });
}
