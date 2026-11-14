// =============================================================
// CAMERA SHEET — the centre button. Modes: Meal · Label · Menu · Barcode.
// A file input with capture="environment" is the universal path (it
// opens the camera on phones and a file picker on desktops); a live
// preview is offered where getUserMedia exists. Photos are handed to
// views/snap.js, which resizes, analyses and discards them.
// Barcode scanning needs no AI and works offline.
// =============================================================
import { h, fill } from '../util.js';
import { sheet, segmented, toast, glide } from '../ui.js';
import { ctx } from '../ctx.js';
import { icon } from './icons.js';
import { artViewfinder, artMascot } from './art.js';
import { flag } from '../flags.js';
import { aiReady } from '../ai.js';
import { queued, dequeue } from '../snapqueue.js';

const MODES = {
  meal: { title: 'Point at your plate', text: 'Snap a meal and get a nutrient table in seconds, checked against what’s left of your day. On a mess day it picks from today’s menu.', icon: 'bowl', search: ['Search or type it instead', 'search', () => ctx.openLog()] },
  label: { title: 'Read a nutrition label', text: 'Photograph the back of a pack and the numbers are copied into a food you can log again with one tap.', icon: 'image', search: ['Create a food by hand', 'plus', () => ctx.openLog({ tab: 'create' })] },
  menu: { title: 'Photograph the mess chart', text: 'Turn the notice-board photo into this week’s menu. You review it before anything is saved. You can also paste the chart from WhatsApp.', icon: 'list', search: ['Paste a week instead', 'list', () => ctx.go('plan', 'menus')] },
  barcode: { title: 'Scan a barcode', text: 'Packaged food in one beep. Works offline for the foods we know and looks the rest up online.', icon: 'barcode', search: ['Open the scanner', 'barcode', () => ctx.openLog({ tab: 'scan' })] },
};

/** The viewfinder: a sunken lens with four corner brackets that breathe like a camera finding focus. */
function lens(inner, { off = false, mode = 'meal' } = {}) {
  return h('div', { class: 'snap-lens lens-' + mode + (off ? ' off' : '') },
    h('div', { class: 'snap-lens-art' }, inner),
    h('span', { class: 'lens-sweep', 'aria-hidden': 'true' }),
    ['tl', 'tr', 'bl', 'br'].map(c => h('span', { class: 'lens-c ' + c, 'aria-hidden': 'true' })));
}

/** A quiet alternative route: icon tile, label, chevron. */
const altRow = (label, ic, onclick) => h('button', { class: 'snap-alt', onclick },
  h('span', { class: 'snap-alt-ic', 'aria-hidden': 'true' }, icon(ic, { size: 18, sw: 2 })),
  h('span', { class: 'snap-alt-t' }, label),
  icon('chevron', { size: 16, cls: 'snap-alt-go' }));

export function openSnap(start = 'meal') {
  let mode = start, stream = null, drawn = 0;
  import('../views/snap.js').catch(() => {});      // load the result screen now, so a photo taken offline can still be queued
  const stage = h('div', { class: 'snap-stage' });
  const body = h('div', { class: 'snap' });
  const sh = sheet({ title: 'Snap', sub: 'The fastest way to log what you’re eating', wide: false, body, onClose: () => stopLive() });

  const tabs = segmented([
    { value: 'meal', label: 'Meal', icon: icon('bowl', { size: 16 }) },
    { value: 'label', label: 'Label', icon: icon('image', { size: 16 }) },
    { value: 'menu', label: 'Menu', icon: icon('list', { size: 16 }) },
    { value: 'barcode', label: 'Barcode', icon: icon('barcode', { size: 16 }) },
  ], mode, v => { stopLive(); mode = v; draw(); }, 'snap-seg');
  tabs.setAttribute('aria-label', 'What are you photographing?');
  glide(tabs);
  body.append(tabs, stage);

  const stopLive = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };

  const pick = (file) => {
    if (!file) return;
    stopLive(); sh.close();
    import('../views/snap.js').then(m => m.runSnap(mode, file));
  };

  const fileInput = (capture) => {
    const el = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    if (capture) el.setAttribute('capture', 'environment');
    el.addEventListener('change', () => pick(el.files?.[0]));
    return el;
  };

  /** The live preview takes over the lens; the actions swap to Capture / Cancel. */
  async function live(view, area) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch { toast('Couldn’t open the camera. Use “Take photo” instead.', 'warn'); return; }
    const video = h('video', { class: 'snap-video', autoplay: true, playsinline: true, muted: true, 'aria-label': 'Camera preview' });
    video.srcObject = stream;
    view.classList.add('live');
    fill(view.querySelector('.snap-lens-art'), video);
    fill(area, h('div', { class: 'row gap snap-live-acts' },
      h('button', { class: 'btn primary grow lg snap-shutter', onclick: () => {
        const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        c.toBlob(b => b && pick(new File([b], 'snap.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92);
      } }, icon('snap', { size: 18, sw: 2 }), 'Capture'),
      h('button', { class: 'btn ghost lg', onclick: () => { stopLive(); draw(); } }, 'Cancel')));
  }

  async function draw() {
    const token = ++drawn;
    const m = MODES[mode];
    const [label, ic, run] = m.search;
    if (mode === 'barcode') {
      return fill(stage, lens(artViewfinder(156), { mode }),
        h('div', { class: 'snap-copy' }, h('h3', { class: 'snap-t' }, m.title), h('p', { class: 'muted' }, m.text)),
        h('button', { class: 'btn primary lg block snap-go', onclick: () => { sh.close(); run(); } }, icon(ic, { size: 18, sw: 2 }), label));
    }
    const gate = flag('snap') ? aiReady() : { title: 'Coming soon', text: 'Photo logging is switched off on this device.', action: 'search' };
    const capture = fileInput(true), gallery = fileInput(false), area = h('div', { class: 'snap-acts' });
    const pending = (await queued()).filter(q => q.mode === mode);
    if (token !== drawn) return;                                  // the mode changed while the queue was being read

    const view = gate ? lens(artMascot({ mood: 'think', size: 120, label: null }), { off: true, mode }) : lens(artViewfinder(156), { mode });
    if (!gate) fill(area,
      h('button', { class: 'btn primary lg block snap-shutter', onclick: () => capture.click() }, icon('snap', { size: 20, sw: 2 }), 'Take photo'),
      h('div', { class: 'row gap snap-pair' },
        h('button', { class: 'btn ghost grow', onclick: () => gallery.click() }, icon('image', { size: 16 }), 'Choose a photo'),
        navigator.mediaDevices?.getUserMedia && h('button', { class: 'btn ghost grow', onclick: () => live(view, area) }, icon('snap', { size: 16 }), 'Live camera')));

    fill(stage, view,
      h('div', { class: 'snap-copy' + (gate ? ' gated' : '') },
        gate && h('span', { class: 'pill warn snap-gate' }, icon('lock', { size: 12, sw: 2.4 }), gate.title),
        h('h3', { class: 'snap-t' }, m.title), h('p', { class: 'muted' }, gate ? gate.text : m.text)),
      area, capture, gallery,
      pending.length > 0 && navigator.onLine !== false && !gate && h('button', { class: 'snap-pending', onclick: async () => {
        const first = pending[0]; await dequeue(first.id); sh.close();
        import('../views/snap.js').then(v => v.runSnap(first.mode, { base64: first.base64 }, { meal: first.meal }));
      } }, h('span', { class: 'snap-pending-ic', 'aria-hidden': 'true' }, icon('clock', { size: 18, sw: 2 })),
        h('span', { class: 'snap-alt-t' }, `Analyse ${pending.length} saved photo${pending.length > 1 ? 's' : ''}`), icon('chevron', { size: 16, cls: 'snap-alt-go' })),
      gate && gate.action === 'add-key' && h('button', { class: 'btn primary lg block', onclick: () => { sh.close(); import('../aikey.js').then(a => a.openAiKey()); } }, icon('sparkle', { size: 18, sw: 2 }), 'Add my free key'),
      gate && gate.action === 'sign-in' && h('button', { class: 'btn primary lg block', onclick: () => { sh.close(); ctx.signOut(); } }, 'Sign in'),
      h('div', { class: 'snap-or', 'aria-hidden': 'true' }, h('span', null, 'or')),
      h('div', { class: 'snap-alts' },
        altRow(label, ic, () => { sh.close(); run(); }),
        altRow('Scan a barcode', 'barcode', () => { sh.close(); ctx.openLog({ tab: 'scan' }); })));
  }
  draw();
  return sh;
}
