// =============================================================
// ME — profile, targets, routine, appearance, data, admin
// Phone: one column (profile hero → targets → settings).
// Desktop ≥ 1100 px: profile + targets on the left, settings right.
// =============================================================
import { h, round, fmtNum, download, todayKey, lsSet, lsGet, fill } from '../util.js';
import { segmented, sheet, stepper, toast, confirmSheet, emptyState, chip, countUp } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { MESSES, MEALS } from '../../data/messes.js';
import { calcTargets, GOALS, DIETS, ACTIVITY } from '../nutrition.js';
import { timingsFor, messLabel } from '../menus.js';
import { scheduleReminders } from '../routine.js';
import { pageHead, card } from './common.js';
import { startOnboarding } from './onboard.js';
import { openSpecialEditor, openMenuEditor } from './mess.js';
import { icon, mealIcon } from '../components/icons.js';
import { field, dietDot } from '../components/bits.js';
import { artMascot, artKolam, artTiffin } from '../components/art.js';
import { openAiKey, aiSummary } from '../aikey.js';
import { foodRulesCard } from './foodrules.js';
import { privacyCard, glyph, setHead, setIcon, setRow, chevron, touch, fresh } from './privacy.js';
import { LOCALES, pickLocale, setLocale } from '../i18n/index.js';

const GOAL_ICON = { gain: 'progress', lose: 'flame', maintain: 'scale', recomp: 'swap' };
const DIET_DOT = { veg: 'v', egg: 'e', nonveg: 'n' };

export function renderYou(section) {
  const pf = store.profile;
  const auto = calcTargets(pf), t = ctx.targets();
  // The app re-renders the whole page after every save. Only a real arrival
  // (no You page on screen yet) gets the entrance flourishes.
  const entering = !document.querySelector('.page.me');
  const page = h('div', { class: 'page me' + (entering ? ' enter' : '') },
    pageHead('Profile & settings', 'You', null, { scene: 'hostel' }),
    h('div', { class: 'me-grid' },
      h('div', { class: 'me-side' }, heroCard(pf, auto), targetsCard(pf, auto, t, entering)),
      h('div', { class: 'me-main' },
        h('h2', { class: 'me-sec-t' }, 'Settings'),
        foodCard(pf),
        foodRulesCard(),
        routineCard(),
        aiCard(),
        languageCard(pf),
        appearanceCard(),
        myFoodsCard(),
        dataCard(),
        privacyCard(),
        store.isAdmin && adminCard(),
        accountCard(),
        h('p', { class: 'me-foot' }, glyph('info', { size: 14 }), h('span', null, 'Nutrition values are approximate (pack labels, brand sites & Indian food tables). Pack sizes and prices change — trust the pack. Not medical advice.')))));
  if (section) requestAnimationFrame(() => page.querySelector('#sec-' + section)?.scrollIntoView({ behavior: 'smooth' }));
  return page;
}

// ---------- profile hero ----------
function heroCard(pf, auto) {
  const goal = GOALS.find(g => g.id === pf.goal) || GOALS[0];
  const name = (pf.name || '').trim();
  // value and unit travel together: they never wrap apart
  const stat = (v, unit, label) => h('div', { class: 'me-stat' },
    h('span', { class: 'me-stat-v num' }, h('b', null, v), unit && h('small', null, unit)),
    h('span', { class: 'me-stat-l' }, label));
  return card('me-hero',
    h('div', { class: 'me-hero-bg', 'aria-hidden': 'true' }, artKolam({ size: 340, cls: 'me-kolam' })),
    h('div', { class: 'me-kato', 'aria-hidden': 'true' }, artMascot({ mood: 'cool', size: 76 })),
    h('div', { class: 'me-ava', 'aria-hidden': 'true' }, h('span', { class: 'me-ring' }), h('span', { class: 'me-avatar' }, (name || '?').charAt(0).toUpperCase())),
    h('h2', { class: 'me-name' }, name || 'Unnamed athlete'),
    h('p', { class: 'me-sub' }, store.mode === 'cloud'
      ? [glyph('check', { size: 14, sw: 2.2 }), store.user.email || 'Signed in']
      : [glyph('lock', { size: 14 }), 'Guest — data stays on this device']),
    h('div', { class: 'me-pills' },
      h('span', { class: 'pill me-pill accent' }, glyph(GOAL_ICON[goal.id] || 'target', { size: 15, sw: 2 }), goal.label),
      h('span', { class: 'pill me-pill' }, glyph('bowl', { size: 15 }), messLabel(pf.mess)),
      store.isAdmin && h('span', { class: 'pill me-pill good' }, glyph(store.isSuper ? 'star' : 'lock', { size: 14 }), store.isSuper ? 'Super-admin' : store.admin.messes.join('/') + ' admin')),
    h('div', { class: 'me-stats' },
      stat(pf.weight, 'kg', 'now'), stat(pf.goalWeight || '—', pf.goalWeight ? 'kg' : null, 'goal'), stat(pf.height, 'cm', 'height'), stat(auto.bmi, null, 'BMI')),
    h('button', { class: 'btn ghost block me-edit', onclick: () => startOnboarding(true) }, glyph('edit', { size: 17 }), 'Edit body, goal & plan'));
}

// ---------- daily targets ----------
function targetsCard(pf, auto, t, entering) {
  const kc = { p: t.p * 4, c: t.c * 4, f: t.f * 9 };
  const sum = kc.p + kc.c + kc.f || 1;
  const pct = k => Math.round((kc[k] / sum) * 100);
  const n = v => { const b = h('b', null, fmtNum(v)); if (entering) countUp(b, v, 900); return b; };
  const tile = (k, ic, v, unit, label) => h('div', { class: 'tg tg-' + k },
    h('span', { class: 'tg-ic', 'aria-hidden': 'true' }, glyph(ic, { size: 17, sw: 2 })),
    h('span', { class: 'tg-v num' }, v, h('small', null, unit)),
    h('span', { class: 'tg-l' }, label));
  return card('me-targets',
    setHead('target', 'Daily targets', `BMR ${auto.bmr} · burn ≈ ${auto.tdee} kcal/day`,
      pf.customTargets ? h('span', { class: 'pill me-pill warn' }, glyph('edit', { size: 13, sw: 2 }), 'Custom') : h('span', { class: 'pill me-pill good' }, glyph('sparkle', { size: 13, sw: 2 }), 'Auto'),
      { level: 'h2' }),
    h('div', { class: 'tg-grid' },
      h('div', { class: 'tg tg-cal' },
        h('span', { class: 'tg-ic', 'aria-hidden': 'true' }, glyph('flame', { size: 19, sw: 2 })),
        h('span', { class: 'tg-v num' }, n(t.cal), h('small', null, 'kcal / day')),
        h('div', { class: 'tg-split', 'aria-hidden': 'true' }, ['p', 'c', 'f'].map(k => h('i', { class: 'sp-' + k, style: `--w: ${Math.max(1, pct(k))}` }))),
        h('div', { class: 'tg-legend' }, [['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, l]) => h('span', { class: 'lg-' + k }, h('i', { 'aria-hidden': 'true' }), l, h('b', { class: 'num' }, pct(k) + '%'))))),
      tile('p', 'egg', n(t.p), 'g', 'protein'),
      tile('c', 'bowl', n(t.c), 'g', 'carbs'),
      tile('f', 'drop', n(t.f), 'g', 'fat'),
      tile('w', 'cup', t.water / 1000, 'L', 'water'),
      tile('fib', 'leaf', t.fiber, 'g', 'fibre · guide')),
    h('div', { class: 'row gap me-tg-act' },
      h('button', { class: 'btn ghost grow', onclick: customTargets }, glyph('settings', { size: 17 }), 'Customise'),
      pf.customTargets && h('button', { class: 'btn ghost grow', onclick: () => { store.saveProfile({ customTargets: null }); toast('Back to auto targets'); } }, glyph('undo', { size: 17 }), 'Reset to auto')));
}

// ---------- settings ----------
/** A row whose control is a labelled field (the label doubles as the row title). */
const fieldRow = (ic, f, { tone, cls = '', sub } = {}) => {
  if (sub) f.querySelector(':scope > label')?.after(h('span', { class: 'set-s' }, sub));
  return h('div', { class: 'set-row field-row ' + cls }, setIcon(ic, tone), f);
};
const setCard = (cls, id, ...kids) => { const c = card('set ' + cls, ...kids); c.id = id; return c; };

function foodCard(pf) {
  return setCard('food', 'sec-food',
    setHead('utensils', 'Food & mess', 'What you eat, and where'),
    h('div', { class: 'set-rows' },
      fieldRow('leaf', field('Diet', segmented(DIETS.map(d => ({ value: d.id, label: d.label, icon: dietDot(DIET_DOT[d.id]) })), pf.diet, v => store.saveProfile({ diet: v }))), { cls: 'stacked' }),
      fieldRow('bowl', field('Your mess', select([['', 'I don’t eat at a mess'], ...MESSES.map(m => [m.id, `${m.id} — ${m.name} (${m.kind})`])], pf.mess || '', v => store.saveProfile({ mess: v || null }))), { cls: 'stacked' }),
      fieldRow('dumbbell', field('Activity', select(ACTIVITY.map(a => [a.id, `${a.label} — ${a.sub}`]), pf.activity, v => store.saveProfile({ activity: v }))), { cls: 'stacked' })));
}

function aiCard() {
  const st = aiSummary();
  return setCard('ai', 'sec-ai',
    setHead('sparkle', 'AI features', 'Snap, smart asks and the coach', h('span', { class: 'pill me-pill ' + (st === 'On' ? 'good' : '') }, h('i', { class: 'me-dot ' + (st === 'On' ? 'on' : ''), 'aria-hidden': 'true' }), st), { tone: 'var(--accent)' }),
    h('p', { class: 'small set-p' }, 'Run on your own free Google AI key, so they never cost anyone anything. Optional: the rest of the app needs no key.'),
    h('button', { class: 'btn ghost block me-ai-btn', onclick: () => openAiKey() }, glyph('sparkle', { size: 18 }), 'Set up AI'));
}

function languageCard(pf) {
  return setCard('lang', 'sec-language',
    fieldRow('globe', field('Language', select(LOCALES.map(l => [l.id, l.label]), pickLocale(pf.locale), v => { store.saveProfile({ locale: v === 'en' ? 'en-IN' : v + '-IN' }); setLocale(v); ctx.relabel?.(); ctx.refresh(); })),
      { cls: 'inline', sub: 'Navigation and privacy text' }));
}

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
  const when = (ic, tone, label, key, aria) => fieldRow(ic, field(label, timeInput(r[key], v => setR(key, v), aria)), { tone, cls: 'inline time' });
  return setCard('routine', 'sec-routine',
    setHead('clock', 'Routine & reminders', 'Drives your day plan on the Today screen'),
    h('div', { class: 'set-rows' },
      when('sunrise', 'var(--hue-breakfast)', 'Wake up', 'wake', 'Wake time'),
      when('dumbbell', 'var(--accent)', 'Workout', 'gym', 'Gym time'),
      when('moon', 'var(--hue-dinner)', 'Sleep', 'sleep', 'Sleep time')),
    h('div', { class: 'set-sub' }, h('span', { class: 'eyebrow' }, 'Mess timings')),
    h('div', { class: 'set-rows mt-list' }, MEALS.map(m => h('div', { class: 'set-row mt-row m-' + m.id },
      h('span', { class: 'set-ic toned', 'aria-hidden': 'true' }, mealIcon(m.id, { size: 18 })),
      h('span', { class: 'set-main' }, h('span', { class: 'set-t' }, m.label)),
      h('span', { class: 'mt-times' }, timeInput(tm[m.id][0], v => setT(m.id, 0, v), m.label + ' start'), h('span', { class: 'mt-dash', 'aria-hidden': 'true' }, '–'), timeInput(tm[m.id][1], v => setT(m.id, 1, v), m.label + ' end'))))),
    h('div', { class: 'set-rows' },
      h('label', { class: 'switch-row set-row' },
        setIcon('bell'),
        h('span', { class: 'set-main' }, h('b', { class: 'set-t' }, 'Meal & workout reminders'), h('span', { class: 'set-s' }, 'Notifications 10 min before each meal and workout (while the app is open or installed)')),
        toggle(pf.reminders, async on => {
          if (on && 'Notification' in window && Notification.permission !== 'granted') {
            const p = await Notification.requestPermission();
            if (p !== 'granted') { toast('Notifications blocked in browser settings', 'err'); ctx.refresh(); return; }
          }
          store.saveProfile({ reminders: on });
          scheduleReminders(store.profile, ctx.targets());
          toast(on ? 'Reminders on' : 'Reminders off');
        }))));
}

function toggle(on, onChange) {
  const el = h('input', { type: 'checkbox', class: 'switch', checked: !!on });
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

// ---------- appearance ----------
const ACCENTS = [['ember', '#FF7A2E', 'Ember'], ['saffron', '#FFB020', 'Saffron'], ['herb', '#34C77B', 'Herb'], ['berry', '#FF5C93', 'Berry'], ['indigo', '#7C8BFF', 'Indigo']];
const THEMES = [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']];

function appearanceCard() {
  const theme = lsGet('ff.theme', 'auto'), accent = lsGet('ff.accent', 'ember');
  const ti = Math.max(0, THEMES.findIndex(([v]) => v === theme));
  const accentName = (ACCENTS.find(([id]) => id === accent) || ACCENTS[0])[2];

  // a tiny screen drawn in its own colour scheme: the tokens resolve light or dark inside it
  const screen = scheme => h('span', { class: 'tp-scr', style: `color-scheme: ${scheme}` },
    h('span', { class: 'tp-card' }, h('span', { class: 'tp-dot' }), h('span', { class: 'tp-ln' }), h('span', { class: 'tp-ln s' })),
    h('span', { class: 'tp-bar' }));
  const themeHint = h('span', { class: 'look-v' }, theme === 'auto' ? 'Follows your device' : '');
  const themes = h('div', { class: 'tp', role: 'group', 'aria-labelledby': 'tp-l', style: `--i: ${ti}` },
    h('span', { class: 'tp-thumb', 'aria-hidden': 'true' }),
    THEMES.map(([v, label], k) => h('button', {
      class: 'tp-opt' + (v === theme ? ' on' : ''), 'aria-pressed': String(v === theme),
      onclick: e => reveal(e.currentTarget, 'theme', () => {
        lsSet('ff.theme', v); applyTheme();
        themes.style.setProperty('--i', k);
        themeHint.textContent = v === 'auto' ? 'Follows your device' : '';
        themes.querySelectorAll('.tp-opt').forEach((b, j) => { b.classList.toggle('on', j === k); b.setAttribute('aria-pressed', String(j === k)); });
      }),
    }, h('span', { class: 'tp-pv tp-' + v, 'aria-hidden': 'true' }, v === 'auto' ? [screen('light'), screen('dark')] : screen(v)), h('span', { class: 'tp-l' }, label))));

  const orbs = h('div', { class: 'orbs', role: 'group', 'aria-labelledby': 'orb-l' }, ACCENTS.map(([id, col, label]) => h('button', {
    class: 'orb' + (id === accent ? ' on' : '') + (id === accent && fresh('accent') ? ' pop' : ''), style: `--orb: ${col}`,
    'aria-label': label + ' accent', 'aria-pressed': String(id === accent), title: label,
    onclick: e => {
      const pick = () => { lsSet('ff.accent', id); applyTheme(); ctx.refresh(); };
      if (id === lsGet('ff.accent', 'ember')) return pick();
      touch('accent');
      reveal(e.currentTarget, 'accent', pick);
    },
  }, h('span', { class: 'orb-gloss', 'aria-hidden': 'true' }))));

  return setCard('look', 'sec-appearance',
    setHead('palette', 'Appearance', 'Theme and accent colour'),
    h('div', { class: 'look-f' }, h('div', { class: 'look-l' }, h('span', { id: 'tp-l' }, 'Theme'), themeHint), themes),
    h('div', { class: 'look-f' }, h('div', { class: 'look-l' }, h('span', { id: 'orb-l' }, 'Accent'), h('span', { class: 'look-v' }, accentName)), orbs));
}

/**
 * Apply a look change with a circular reveal that grows from the control you
 * touched (View Transitions). Straight swap when unsupported or motion is reduced.
 * `data-me-vt` tells the stylesheet to switch off the default cross-fade for this one.
 */
function reveal(from, kind, apply) {
  const root = document.documentElement;
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); return; }
  const r = from.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const cs = getComputedStyle(root);
  root.dataset.meVt = kind;
  const tr = document.startViewTransition(apply);
  tr.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
    { duration: parseFloat(cs.getPropertyValue('--dur-5')) || 820, easing: cs.getPropertyValue('--ease').trim() || 'ease-out', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
  tr.finished.finally(() => { if (root.dataset.meVt === kind) delete root.dataset.meVt; });
}

export function applyTheme() {
  const theme = lsGet('ff.theme', 'auto');
  let accent = lsGet('ff.accent', 'ember');
  if (!ACCENTS.some(([id]) => id === accent)) accent = 'ember'; // a pre-redesign accent name
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#110E0B' : '#FBF6EC');
}

// ---------- my foods, data ----------
function myFoodsCard() {
  const list = store.profile.customFoods;
  return setCard('foods', 'sec-foods',
    setHead('list', 'My foods', 'Foods you created or scanned', h('span', { class: 'pill me-pill num' }, list.length)),
    list.length ? h('div', { class: 'set-rows' }, list.slice(0, 50).map(f => h('div', { class: 'set-row food-row' },
      h('span', { class: 'food-av', 'aria-hidden': 'true' }, (f.n || '?').trim().charAt(0).toUpperCase()),
      h('span', { class: 'set-main' }, h('span', { class: 'set-t' }, f.n), h('span', { class: 'set-s' }, `${f.brand ? f.brand + ' · ' : ''}${f.sizes[0][0]} · ${round(f.k[0] * f.sizes[0][1] / 100)} kcal`)),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Delete ' + f.n, onclick: () => { store.saveProfile({ customFoods: store.profile.customFoods.filter(x => x.id !== f.id) }); toast('Deleted'); } }, icon('trash', { size: 16 })))))
      : h('div', { class: 'foods-empty' }, h('span', { class: 'foods-art' }, artTiffin(64)), h('p', { class: 'muted small' }, 'Create a food or scan a barcode from the + button and it appears here.')));
}

function dataCard() {
  const act = (ic, title, sub, onclick) => setRow({ tag: 'button', cls: 'act', ic, title, sub, end: chevron(), attrs: { onclick } });
  return setCard('data', 'sec-data',
    setHead('archive', 'Your data', 'Yours to keep, move or restore'),
    h('div', { class: 'set-rows' },
      act('download', 'Backup (JSON)', 'Everything, to restore later', exportJSON),
      act('list', 'Food log (CSV)', 'Every meal, for Sheets or Excel', exportCSV),
      setRow({ tag: 'label', cls: 'act', ic: 'upload', title: 'Restore backup', sub: 'From a Thali backup file', end: [chevron(), h('input', { type: 'file', accept: '.json,application/json', class: 'me-file', onchange: importJSON })] })));
}

async function exportJSON() {
  const days = await store.allDays();
  download(`fuel-forge-backup-${todayKey()}.json`, JSON.stringify({ app: 'fuel-forge', version: 2, profile: store.profile, days, goals: store.goals, checkins: store.checkins }, null, 1));
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
    if (json.app !== 'fuel-forge') throw new Error('Not a Thali backup');
    if (!(await confirmSheet('Restore this backup?', { ok: 'Restore', detail: `${json.days?.length || 0} days. Matching days are overwritten.` }))) return;
    await store.importBackup(json);
    await ctx.reloadHistory();
    toast('Backup restored');
  } catch (err) { toast('Restore failed: ' + err.message, 'err'); }
}

// ---------- admin ----------
function adminCard() {
  const list = h('div', { class: 'stack-xs adm-reports' }, h('button', { class: 'btn ghost block', onclick: async () => {
    try {
      const reps = await store.reports();
      fill(list, reps.length ? h('div', { class: 'set-rows' }, reps.map(r => h('div', { class: 'set-row' },
        setIcon('flag'),
        h('span', { class: 'set-main' }, h('span', { class: 'set-t' }, `${r.mess} · ${r.day}`), h('span', { class: 'set-s' }, r.text)),
        h('span', { class: 'tiny muted num' }, new Date(r.ts).toLocaleDateString('en-IN')))))
        : emptyState(icon('flag', { size: 32 }), 'No reports', null));
    } catch (err) { toast('Could not load reports: ' + err.message, 'err'); }
  } }, glyph('flag', { size: 17 }), 'Load menu reports'));
  const mine = store.isSuper ? MESSES.map(m => m.id) : store.admin.messes;
  const first = mine.includes(store.profile.mess) ? store.profile.mess : mine[0];
  const act = (ic, title, sub, onclick, cls = '') => setRow({ tag: 'button', cls: 'act ' + cls, ic, title, sub, end: chevron(), attrs: { onclick } });
  return setCard('admin', 'sec-admin',
    setHead('users', 'Admin', store.isSuper ? 'You can edit every mess. Changes are visible to every student.' : 'You can edit ' + (mine.join(', ') || 'no mess yet') + '. Changes are visible to every student in those messes.',
      store.isSuper ? h('span', { class: 'pill me-pill good' }, glyph('star', { size: 13, sw: 2 }), 'Super-admin') : null),
    h('div', { class: 'set-rows' },
      first && act('sparkle', 'New festival special', 'A banner on every student’s Today', () => openSpecialEditor(), 'lead'),
      first && act('edit', 'Publish a mess menu', 'Edit the week for ' + first, () => openMenuEditor(first)),
      store.isSuper && act('users', 'Manage mess committee access', 'Grant or revoke who can publish', openAdminManager)),
    list);
}

// Super-admins grant access by user ID. A student finds theirs under
// Account → "Your ID" and sends it over; nothing here exposes emails.
function openAdminManager() {
  const body = h('div', { class: 'stack adm' });
  sheet({ title: 'Mess committee access', sub: 'Grant or revoke who can publish menus and specials', wide: true, body });

  const draw = async () => {
    fill(body, h('p', { class: 'muted small' }, 'Loading…'));
    let admins = [];
    try { admins = await store.listAdmins(); }
    catch (e) { fill(body, h('p', { class: 'warn-t small' }, 'Could not load the admin list: ' + (e.message || e) + '. Check that firestore.rules is published.')); return; }

    const uid = h('input', { class: 'input', placeholder: 'Paste their user ID', spellcheck: 'false' });
    let picked = [], sup = false;
    const messChips = h('div', { class: 'chip-row' }, MESSES.map(m => chip(m.id, {
      onclick: e => {
        const i = picked.indexOf(m.id);
        i >= 0 ? picked.splice(i, 1) : picked.push(m.id);
        e.currentTarget.classList.toggle('on');
        e.currentTarget.setAttribute('aria-pressed', String(i < 0));
      },
    })));
    messChips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    const superToggle = h('label', { class: 'switch-row' },
      h('span', null, h('b', { class: 'small' }, 'Super-admin'), h('div', { class: 'tiny muted' }, 'Every mess, and can grant access to others')),
      h('input', { type: 'checkbox', class: 'switch', onchange: e => { sup = e.currentTarget.checked; messChips.style.opacity = sup ? 0.4 : 1; } }));

    fill(body,
      h('div', { class: 'list adm-list' }, admins.map(a => h('div', { class: 'li' },
        h('span', { class: 'li-ic' + (a.super ? ' sup' : '') }, icon(a.super ? 'star' : 'lock', { size: 18 })),
        h('span', { class: 'li-main' },
          h('span', { class: 'li-t' }, a.uid === store.user.uid ? 'You' : a.uid.slice(0, 12) + '…'),
          h('span', { class: 'li-s' }, a.super ? 'Super-admin — every mess' : (a.messes || []).join(', ') || 'no mess assigned')),
        a.uid !== store.user.uid && h('button', { class: 'icon-btn sm', 'aria-label': 'Revoke', onclick: async () => {
          if (!(await confirmSheet('Revoke access?', { ok: 'Revoke', danger: true, detail: 'They keep their student account and data — they just can’t publish menus any more.' }))) return;
          try { await store.removeAdmin(a.uid); toast('Access revoked'); draw(); } catch (e) { toast('Failed: ' + e.message, 'err'); }
        } }, icon('trash', { size: 16 }))))),
      h('div', { class: 'adm-add' },
        h('div', { class: 'field' }, h('label', null, 'Add someone'), uid),
        h('div', { class: 'field' }, h('label', null, 'Messes they look after'), messChips),
        superToggle),
      h('button', { class: 'btn primary block', onclick: async () => {
        const id = uid.value.trim();
        if (!id) { toast('Paste their user ID first', 'err'); return; }
        if (!sup && !picked.length) { toast('Pick at least one mess', 'err'); return; }
        try { await store.setAdmin(id, { isSuper: sup, messes: picked }); toast('Access granted'); draw(); }
        catch (e) { toast('Failed: ' + (e.message || e), 'err'); }
      } }, 'Grant access'));
  };
  draw();
}

// ---------- account ----------
function accountCard() {
  const guest = store.mode === 'guest';
  return setCard('acct', 'sec-account',
    setHead('you', 'Account', guest ? 'You’re using Thali as a guest' : 'Signed in and syncing'),
    guest
      ? h('div', { class: 'stack acct-guest' },
          h('ul', { class: 'acct-perks' },
            h('li', null, glyph('swap', { size: 16 }), 'Sync phone + laptop'),
            h('li', null, glyph('shield', { size: 16 }), 'Back up your data'),
            h('li', null, glyph('trophy', { size: 16 }), 'Join the leaderboard')),
          h('p', { class: 'small muted' }, 'A free account. Everything you logged as a guest comes with you.'),
          h('button', { class: 'btn primary block', onclick: () => ctx.signOut() }, 'Create account / Sign in'))
      : h('div', { class: 'stack' },
          h('div', { class: 'field acct-id' },
            h('label', null, 'Your ID'),
            h('div', { class: 'row gap' },
              h('code', { class: 'uid' }, store.user.uid),
              h('button', { class: 'btn ghost sm', onclick: async () => {
                try { await navigator.clipboard.writeText(store.user.uid); toast('ID copied'); }
                catch { toast('Select and copy it manually', 'warn'); }
              } }, glyph('copy', { size: 16 }), 'Copy')),
            h('div', { class: 'tiny muted' }, 'Send this to the app owner if you are on a mess committee and need to publish menus.')),
          h('button', { class: 'btn danger block acct-out', onclick: async () => { if (await confirmSheet('Sign out?', { ok: 'Sign out' })) ctx.signOut(); } }, glyph('logout', { size: 17 }), 'Sign out')));
}

function customTargets() {
  const t = { ...ctx.targets() };
  const row = (k, label, step, unit, max, tone) => h('div', { class: 'ct-row', style: `--tone: ${tone}` }, h('span', { class: 'ct-l' }, h('i', { 'aria-hidden': 'true' }), label),
    stepper(t[k], { min: 0, max, step, onChange: v => { t[k] = v; }, fmt: v => v + unit }));
  const sh = sheet({
    title: 'Custom targets', sub: 'Override the auto-calculated numbers',
    body: h('div', { class: 'stack ct' },
      row('cal', 'Calories', 50, ' kcal', 6000, 'var(--c-cal)'), row('p', 'Protein', 5, ' g', 400, 'var(--c-p)'), row('c', 'Carbs', 10, ' g', 900, 'var(--c-c)'),
      row('f', 'Fat', 5, ' g', 300, 'var(--c-f)'), row('water', 'Water', 250, ' ml', 8000, 'var(--c-water)'),
      h('button', { class: 'btn primary block', onclick: () => {
        store.saveProfile({ customTargets: { cal: t.cal, p: t.p, c: t.c, f: t.f, water: t.water } });
        toast('Targets updated'); sh.close();
      } }, 'Save')),
  });
}
