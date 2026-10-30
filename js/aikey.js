// =============================================================
// AI KEY — the "AI features" settings sheet. Consent first (photos and
// text go to Google's Gemini on YOUR free key), then add / replace /
// remove the key. The key is sent once to the gateway, stored
// encrypted, and only ever shown masked (AIza••••1a2b).
// =============================================================
import { h, fill } from './util.js';
import { sheet, toast, confirmSheet } from './ui.js';
import { store } from './store.js';
import { ctx } from './ctx.js';
import { icon } from './components/icons.js';
import { aiConfigured, keyStatus, saveKey, removeKey } from './ai.js';
import { looksLikeKey } from './engine/aicore.js';

export const KEY_URL = 'https://aistudio.google.com/apikey';

export function openAiKey() {
  const body = h('div', { class: 'stack aikey' });
  const sh = sheet({ title: 'AI features', sub: 'Snap, smart asks and the coach, on your own free key', body });
  let status = null;

  async function load() {
    fill(body, h('p', { class: 'muted small' }, 'Checking…'));
    status = store.mode === 'cloud' && aiConfigured() ? await keyStatus() : null;
    draw();
  }

  function draw() {
    const consented = !!store.profile.consents?.ai;
    const out = [];
    out.push(h('p', { class: 'small' }, 'These features send your meal photos or typed questions to Google’s Gemini, using an API key that belongs to you. Google’s free tier covers normal use, so nobody is billed. Everything else in the app works without any of this.'));
    out.push(h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: consented, onchange: e => {
        const c = { ...(store.profile.consents || {}) };
        if (e.target.checked) c.ai = Date.now(); else delete c.ai;
        store.saveProfile({ consents: c });
        draw();
      } }),
      h('span', null, 'I agree to send my photos and questions to Google Gemini for this. I can withdraw this any time.')));

    if (!aiConfigured()) out.push(note('This copy of the app isn’t connected to an AI gateway yet, so the key can’t be saved. See the README to deploy one.'));
    else if (store.mode !== 'cloud') out.push(note('Sign in with an account to save your key. It’s stored encrypted against your account, never in this browser.'));
    else if (status && !status.ok) out.push(note(status.error.text));
    else if (status?.hasKey) {
      out.push(h('div', { class: 'card inset' }, h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Your key'), h('code', { class: 'uid' }, status.masked)),
        h('button', { class: 'btn danger sm', onclick: async () => {
          if (!await confirmSheet('Remove your AI key?', { ok: 'Remove', danger: true, detail: 'Snap and the coach stop working until you add one again.' })) return;
          const r = await removeKey(); if (!r.ok) return toast(r.error.text, 'err');
          toast('Key removed'); load();
        } }, 'Remove'))));
    }

    if (aiConfigured() && store.mode === 'cloud' && status?.ok) {
      const input = h('input', { class: 'input', type: 'password', placeholder: 'Paste your key (starts with AIza)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Google AI key' });
      out.push(h('div', { class: 'stack' },
        h('div', { class: 'eyebrow' }, status.hasKey ? 'Replace your key' : 'Add your free key'),
        h('ol', { class: 'small steps' },
          h('li', null, 'Open Google AI Studio: it’s free, no card, about 30 seconds.'),
          h('li', null, 'Press “Create API key” and copy it.'),
          h('li', null, 'Paste it here.')),
        h('a', { class: 'btn ghost block', href: KEY_URL, target: '_blank', rel: 'noopener' }, icon('send', { size: 16 }), 'Get a free key'),
        input,
        h('button', { class: 'btn primary block', disabled: !consented, onclick: async e => {
          const v = input.value.trim();
          if (!looksLikeKey(v)) return toast('That doesn’t look like a Google AI key (it starts with AIza).', 'warn');
          e.currentTarget.disabled = true;
          const r = await saveKey(v); input.value = '';
          if (!r.ok) { toast(r.error.text, 'err'); return load(); }
          toast('Key saved'); load();
        } }, consented ? 'Save key' : 'Agree above to save'),
        h('p', { class: 'tiny muted' }, 'Sent once over HTTPS and stored encrypted. We only ever show it masked.')));
    }
    fill(body, ...out);
  }

  load();
  return sh;
}

const note = text => h('div', { class: 'impact warn' }, icon('info', { size: 18 }), h('span', null, text));

/** Status line for the You tab. */
export const aiSummary = () => (!aiConfigured() ? 'Not connected' : store.profile.consents?.ai ? 'On' : 'Off');
