// =============================================================
// ME — profile, targets, routine, appearance, data, admin
// =============================================================
import { h, round, download, todayKey, lsSet, lsGet } from '../util.js';
import { segmented, sheet, stepper, toast, confirmSheet, emptyState } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MESSES, MEALS } from '../../data/messes.js';
import { calcTargets, GOALS, DIETS, ACTIVITY } from '../nutrition.js';
import { timingsFor, messLabel } from '../menus.js';
import { scheduleReminders } from '../routine.js';
import { pageHead, card, cardHead } from './common.js';
import { startOnboarding } from './onboard.js';
import { openSpecialEditor, openMenuEditor } from './mess.js';

export function renderMe(section) {
  const pf = store.profile;
  const auto = calcTargets(pf), t = ctx.targets();
  const goal = GOALS.find(g => g.id === pf.goal);
  const page = h('div', { class: 'page me' },
    pageHead('Profile', 'You'),
    card('profile-card',
      h('div', { class: 'row gap' },
        h('div', { class: 'avatar xl' }, (pf.name || '?').charAt(0).toUpperCase()),
        h('div', { class: 'grow' },
          h('div', { class: 'card-t' }, pf.name || 'Unnamed athlete'),
          h('div', { class: 'tiny muted' }, store.mode === 'cloud' ? (store.user.email || 'Signed in') : 'Guest — data stays on this device'),
          h('div', { class: 'chip-row' }, h('span', { class: 'pill' }, goal.icon + ' ' + goal.label), h('span', { class: 'pill' }, '🍽️ ' + messLabel(pf.mess)), store.isAdmin && h('span', { class: 'pill good' }, '🛡️ Admin')))),
      h('div', { class: 'stat-grid' },
        stat(pf.weight + ' kg', 'now'), stat(pf.goalWeight ? pf.goalWeight + ' kg' : '—', 'goal'), stat(pf.height + ' cm', 'height'), stat(auto.bmi, 'BMI')),
      h('button', { class: 'btn ghost block', onclick: () => startOnboarding(true) }, 'Edit body, goal & plan')),

    card('',
      cardHead('Daily targets', pf.customTargets ? h('span', { class: 'pill warn' }, 'Custom') : h('span', { class: 'pill good' }, 'Auto'), `BMR ${auto.bmr} · burn ≈ ${auto.tdee} kcal/day`),
      h('div', { class: 'target-grid' },
        tgt('🔥', t.cal, 'kcal'), tgt('🥩', t.p + 'g', 'protein'), tgt('🍚', t.c + 'g', 'carbs'), tgt('🥑', t.f + 'g', 'fat'), tgt('💧', t.water / 1000 + ' L', 'water'), tgt('🌾', t.fiber + 'g', 'fibre · guide')),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: customTargets }, 'Customise'),
        pf.customTargets && h('button', { class: 'btn ghost grow', onclick: () => { store.saveProfile({ customTargets: null }); toast('Back to auto targets'); } }, 'Reset to auto'))),

    card('',
      cardHead('Food & mess'),
      field('Diet', segmented(DIETS.map(d => ({ value: d.id, label: d.label, icon: d.icon })), pf.diet, v => store.saveProfile({ diet: v }))),
      field('Your mess', select([['', 'I don’t eat at a mess'], ...MESSES.map(m => [m.id, `${m.id} — ${m.name} (${m.kind})`])], pf.mess || '', v => store.saveProfile({ mess: v || null }))),
      field('Activity', select(ACTIVITY.map(a => [a.id, `${a.label} — ${a.sub}`]), pf.activity, v => store.saveProfile({ activity: v })))),

    routineCard(),
    appearanceCard(),
    myFoodsCard(),
    dataCard(),
    store.isAdmin && adminCard(),

    card('',
      cardHead('Account'),
      store.mode === 'guest'
        ? h('div', { class: 'stack' }, h('p', { class: 'small muted' }, 'Create a free account to sync phone + laptop, back up your data and join the leaderboard. Your guest data comes with you.'),
            h('button', { class: 'btn primary block', onclick: () => ctx.signOut() }, 'Create account / Sign in'))
        : h('button', { class: 'btn danger block', onclick: async () => { if (await confirmSheet('Sign out?', { ok: 'Sign out' })) ctx.signOut(); } }, 'Sign out'),
      h('p', { class: 'tiny muted' }, 'Nutrition values are approximate (pack labels, brand sites & Indian food tables). Pack sizes and prices change — trust the pack. Not medical advice.')));
  if (section) requestAnimationFrame(() => page.querySelector('#sec-' + section)?.scrollIntoView({ behavior: 'smooth' }));
  return page;
}

const stat = (v, l) => h('div', null, h('div', { class: 'big-num sm' }, v), h('div', { class: 'tiny muted' }, l));
const tgt = (ic, v, l) => h('div', { class: 'tgt' }, h('span', null, ic), h('b', null, v), h('span', { class: 'tiny muted' }, l));
const field = (label, el) => h('div', { class: 'field' }, h('label', null, label), el);

function select(opts, val, onChange) {
  const el = h('select', { class: 'input' }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function timeInput(val, onChange, label) {
  const el = h('input', { class: 'input', type: 'time', value: val, 'aria-label': label });
  el.addEventListener('change', () => el.value && onChange(el.value));
  return el;
}

function routineCard() {
  const pf = store.profile, r = pf.routine, tm = timingsFor(pf);
  const setR = (k, v) => store.saveProfile({ routine: { ...store.profile.routine, [k]: v } });
  const setT = (meal, i, v) => {
    const cur = { ...timingsFor(store.profile) };
    cur[meal] = [...cur[meal]]; cur[meal][i] = v;
    store.saveProfile({ messTimings: cur });
  };
  const c = card('',
    cardHead('Routine & reminders', null, 'Drives your day plan on the Today screen'),
    h('div', { class: 'grid3' }, field('Wake up', timeInput(r.wake, v => setR('wake', v), 'Wake time')), field('Workout', timeInput(r.gym, v => setR('gym', v), 'Gym time')), field('Sleep', timeInput(r.sleep, v => setR('sleep', v), 'Sleep time'))),
    h('div', { class: 'eyebrow' }, 'Mess timings'),
    MEALS.map(m => h('div', { class: 'row gap meal-time' }, h('span', { class: 'small grow' }, m.icon + ' ' + m.label),
      timeInput(tm[m.id][0], v => setT(m.id, 0, v), m.label + ' start'), h('span', { class: 'muted' }, '–'), timeInput(tm[m.id][1], v => setT(m.id, 1, v), m.label + ' end'))),
    h('label', { class: 'switch-row' },
      h('span', null, h('b', { class: 'small' }, 'Meal & workout reminders'), h('div', { class: 'tiny muted' }, 'Notifications 10 min before each meal and workout (while the app is open or installed)')),
      toggle(pf.reminders, async on => {
        if (on && 'Notification' in window && Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { toast('Notifications blocked in browser settings', 'err'); ctx.refresh(); return; }
        }
        store.saveProfile({ reminders: on });
        scheduleReminders(store.profile, ctx.targets());
        toast(on ? 'Reminders on 🔔' : 'Reminders off');
      })));
  c.id = 'sec-routine';
  return c;
}

function toggle(on, onChange) {
  const el = h('input', { type: 'checkbox', class: 'switch', checked: !!on });
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

const ACCENTS = [['volt', '#D4FF3A'], ['coral', '#FF5C7A'], ['cyan', '#4CC9F0'], ['violet', '#B98CFF'], ['amber', '#FFB547']];
function appearanceCard() {
  const theme = lsGet('ff.theme', 'auto'), accent = lsGet('ff.accent', 'volt');
  return card('',
    cardHead('Appearance'),
    field('Theme', segmented([{ value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], theme, v => { lsSet('ff.theme', v); applyTheme(); })),
    field('Accent', h('div', { class: 'row gap' }, ACCENTS.map(([id, col]) => h('button', {
      class: 'swatch' + (id === accent ? ' on' : ''), style: { background: col }, 'aria-label': id + ' accent',
      onclick: () => { lsSet('ff.accent', id); applyTheme(); ctx.refresh(); },
    })))));
}

export function applyTheme() {
  const theme = lsGet('ff.theme', 'auto'), accent = lsGet('ff.accent', 'volt');
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#07080A' : '#F3F3EE');
}

function myFoodsCard() {
  const list = store.profile.customFoods;
  return card('',
    cardHead('My foods', h('span', { class: 'pill' }, list.length), 'Foods you created or scanned'),
    list.length ? h('div', { class: 'list' }, list.slice(0, 50).map(f => h('div', { class: 'li' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, f.n), h('span', { class: 'li-s' }, `${f.brand ? f.brand + ' · ' : ''}${f.sizes[0][0]} · ${round(f.k[0] * f.sizes[0][1] / 100)} kcal`)),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Delete ' + f.n, onclick: () => { store.saveProfile({ customFoods: store.profile.customFoods.filter(x => x.id !== f.id) }); toast('Deleted'); } }, '🗑'))))
      : h('p', { class: 'muted small' }, 'Create a food or scan a barcode from the + button and it appears here.'));
}

function dataCard() {
  return card('',
    cardHead('Your data'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn ghost grow', onclick: exportJSON }, '⬇ Backup (JSON)'),
      h('button', { class: 'btn ghost grow', onclick: exportCSV }, '⬇ Food log (CSV)'),
      h('label', { class: 'btn ghost grow' }, '⬆ Restore backup', h('input', { type: 'file', accept: '.json,application/json', class: 'hide', onchange: importJSON }))));
}

async function exportJSON() {
  const days = await store.allDays();
  download(`fuel-forge-backup-${todayKey()}.json`, JSON.stringify({ app: 'fuel-forge', version: 2, profile: store.profile, days }, null, 1));
}
async function exportCSV() {
  const days = await store.allDays();
  const rows = [['date', 'meal', 'food', 'qty', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'price_inr']];
  days.forEach(d => d.items.forEach(i => rows.push([d.key, i.meal || '', i.n, i.qty || 1, i.unit || '', i.cal, i.p, i.c, i.f ?? '', i.price ?? ''])));
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
  download(`fuel-forge-log-${todayKey()}.csv`, csv, 'text/csv');
}
async function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (json.app !== 'fuel-forge') throw new Error('Not a Fuel & Forge backup');
    if (!(await confirmSheet('Restore this backup?', { ok: 'Restore', detail: `${json.days?.length || 0} days. Matching days are overwritten.` }))) return;
    await store.importBackup(json);
    await ctx.reloadHistory();
    toast('Backup restored ✅');
  } catch (err) { toast('Restore failed: ' + err.message, 'err'); }
}

function adminCard() {
  const list = h('div', { class: 'stack-xs' }, h('button', { class: 'btn ghost block', onclick: async () => {
    try {
      const reps = await store.reports();
      list.replaceChildren(reps.length ? h('div', { class: 'list' }, reps.map(r => h('div', { class: 'li' },
        h('span', { class: 'li-main' }, h('span', { class: 'li-t' }, `${r.mess} · ${r.day}`), h('span', { class: 'li-s' }, r.text)),
        h('span', { class: 'tiny muted' }, new Date(r.ts).toLocaleDateString('en-IN')))))
        : emptyState('📭', 'No reports', null));
    } catch (err) { toast('Could not load reports: ' + err.message, 'err'); }
  } }, 'Load menu reports'));
  return card('',
    cardHead('Admin 🛡️', null, 'Changes here are visible to every student'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary grow', onclick: () => openSpecialEditor() }, '✨ New festival special'),
      h('button', { class: 'btn ghost grow', onclick: () => openMenuEditor(store.profile.mess || 'CNV') }, '✏️ Publish a mess menu')),
    list);
}

function customTargets() {
  const t = { ...ctx.targets() };
  const row = (k, label, step, unit, max) => h('div', { class: 'row between' }, h('span', { class: 'small' }, label),
    stepper(t[k], { min: 0, max, step, onChange: v => { t[k] = v; }, fmt: v => v + unit }));
  const sh = sheet({
    title: 'Custom targets', sub: 'Override the auto-calculated numbers',
    body: h('div', { class: 'stack' },
      row('cal', 'Calories', 50, ' kcal', 6000), row('p', 'Protein', 5, ' g', 400), row('c', 'Carbs', 10, ' g', 900),
      row('f', 'Fat', 5, ' g', 300), row('water', 'Water', 250, ' ml', 8000),
      h('button', { class: 'btn primary block', onclick: () => {
        store.saveProfile({ customTargets: { cal: t.cal, p: t.p, c: t.c, f: t.f, water: t.water } });
        toast('Targets updated'); sh.close();
      } }, 'Save')),
  });
}

