// =============================================================
// SNAP SHEET — the centre button. Barcode scanning works today;
// meal / label / menu photos arrive with the AI gateway (Phase 6)
// and are shown honestly as "coming" with the working alternative
// one tap away, so the button is never a dead end.
// =============================================================
import { h, fill } from '../util.js';
import { sheet, segmented } from '../ui.js';
import { ctx } from '../ctx.js';
import { icon } from './icons.js';
import { artViewfinder } from './art.js';
import { flag } from '../flags.js';

const MODES = {
  meal: {
    ready: () => flag('snap'),
    title: 'Point at your plate',
    text: 'Snap a meal and get a nutrient table in seconds. It runs on your own free Google AI key, so it never costs you anything.',
    primary: ['Search or type it instead', 'search', () => ctx.openLog()],
  },
  label: {
    ready: () => flag('snap'),
    title: 'Read a nutrition label',
    text: 'Photograph the back of a pack and we copy the numbers into a food you can log again with one tap.',
    primary: ['Create a food by hand', 'plus', () => ctx.openLog({ tab: 'create' })],
  },
  menu: {
    ready: () => flag('snap'),
    title: 'Photograph the mess chart',
    text: 'Turn the notice-board photo into this week’s menu. Until then, paste the chart from WhatsApp and it reads that too.',
    primary: ['Paste a week instead', 'list', () => ctx.go('plan', 'menus')],
  },
  barcode: {
    ready: () => true,
    title: 'Scan a barcode',
    text: 'Packaged food in one beep. Works offline for the foods we know and looks the rest up online.',
    primary: ['Open the scanner', 'barcode', () => ctx.openLog({ tab: 'scan' })],
  },
};

export function openSnap(start = 'meal') {
  let mode = start;
  const body = h('div', { class: 'snap' });
  const sh = sheet({ title: 'Snap', sub: 'The fastest way to log what you’re eating', wide: false, body });

  const tabs = segmented([
    { value: 'meal', label: 'Meal', icon: icon('bowl', { size: 16 }) },
    { value: 'label', label: 'Label', icon: icon('image', { size: 16 }) },
    { value: 'menu', label: 'Menu', icon: icon('list', { size: 16 }) },
    { value: 'barcode', label: 'Barcode', icon: icon('barcode', { size: 16 }) },
  ], mode, v => { mode = v; draw(); }, 'snap-seg');

  function draw() {
    const m = MODES[mode];
    const [label, ic, run] = m.primary;
    fill(body,
      tabs,
      h('div', { class: 'snap-art' }, artViewfinder(150)),
      h('div', { class: 'snap-copy' },
        !m.ready() && h('span', { class: 'pill warn' }, 'Coming with the AI update'),
        h('h4', { class: 'snap-t' }, m.title),
        h('p', { class: 'muted' }, m.text)),
      h('button', { class: 'btn primary lg block', onclick: () => { sh.close(); run(); } }, icon(ic, { size: 18 }), label),
      mode !== 'barcode' && h('button', { class: 'btn ghost block', onclick: () => { sh.close(); ctx.openLog({ tab: 'scan' }); } }, icon('barcode', { size: 18 }), 'Scan a barcode'));
  }
  draw();
  return sh;
}
