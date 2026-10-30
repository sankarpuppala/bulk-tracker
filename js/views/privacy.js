// =============================================================
// PRIVACY — consent, the privacy notice, and "delete my account and
// data" (DPDP Act 2023: explicit consent, withdrawal, erasure).
//   ensureHealthConsent()  asks once; nothing is stored before "I agree"
//   privacyCard()          the You › Privacy card
//   openPrivacyNotice()    plain-language notice
//   openDeleteAccount()    typed confirmation, then erases everything
// =============================================================
import { h, fill } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { t } from '../i18n/index.js';
import { card, cardHead } from './common.js';
import { icon } from '../components/icons.js';
import { aiConfigured, removeKey } from '../ai.js';

export const hasHealthConsent = () => !!store.profile.consents?.health;

/** Shows the consent sheet until the user decides. Resolves true on "I agree". */
export function ensureHealthConsent() {
  if (hasHealthConsent()) return Promise.resolve(true);
  return new Promise(resolve => {
    const body = h('div', { class: 'stack consent' });
    let sh, decided = false;
    const finish = v => { if (decided) return; decided = true; sh.close(); resolve(v); };
    const draw = declined => fill(body,
      h('p', null, t('consent.body')),
      h('button', { class: 'link small', onclick: () => openPrivacyNotice() }, t('privacy.notice')),
      declined && h('p', { class: 'small warn-t', role: 'alert' }, t('consent.declined')),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary grow lg', onclick: () => { store.saveProfile({ consents: { ...(store.profile.consents || {}), health: Date.now() } }); finish(true); } }, t('consent.agree')),
        h('button', { class: 'btn ghost', onclick: () => draw(true) }, t('consent.decline'))));
    sh = sheet({ title: t('consent.title'), body, onClose: () => { if (!decided) { decided = true; resolve(false); } } });
    draw(false);
  });
}

export function openPrivacyNotice() {
  const p = (...c) => h('p', { class: 'small' }, ...c);
  sheet({
    title: t('privacy.notice'), sub: 'In plain language', wide: true,
    body: h('div', { class: 'stack notice' },
      h('h4', null, 'What we keep'), p('Your name, body stats, goal and plan, food and water logs, weight, workouts, check-ins and settings. As a guest this lives only in this browser. With an account it lives in your private space in Google Firebase, readable only by you.'),
      h('h4', null, 'What others can see'), p('Nothing, unless you opt in. The leaderboard shows your first name, mess, level and streaks. Dish ratings are counted anonymously: mess committees see averages, never who rated. Menus you publish as a committee member are public to your mess.'),
      h('h4', null, 'AI features (optional)'), p('Snap and the coach send the photo or text you choose to Google’s Gemini API using your own free key. Our gateway checks who you are, forwards the request, and logs only counts and timings: never your photos, words or key. Your key is stored encrypted and shown masked. Photos are not kept. On Google’s free tier, Google may use what you send to improve its products, so don’t send anything you wouldn’t want that. Check Google’s current Gemini API terms.'),
      h('h4', null, 'Your rights'), p('Download your data (You › Data), withdraw consent, or delete your account and everything in it (You › Privacy). Deleting is immediate and permanent.'),
      h('h4', null, 'Not medical advice'), p('Targets and answers are general nutrition guidance. If you have a medical condition, are pregnant, or are under 18, follow your doctor and involve a parent or coach.'),
      p('Questions or requests: contact the person who runs your copy of this app (your mess committee or the app owner).')),
  });
}

export function openDeleteAccount() {
  const cloud = store.mode === 'cloud';
  const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', 'aria-label': t('privacy.delete.type'), placeholder: 'DELETE' });
  const go = h('button', { class: 'btn danger block', disabled: true }, t('privacy.delete'));
  const status = h('p', { class: 'small', role: 'status' });
  input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'DELETE'; });
  const sh = sheet({
    title: t('privacy.delete'), sub: cloud ? store.user?.email : 'Guest data on this device',
    body: h('div', { class: 'stack' }, h('p', null, t('privacy.delete.confirm', { account: cloud ? ', and your sign-in' : '' })),
      h('label', { class: 'small', for: 'del-in' }, t('privacy.delete.type')), Object.assign(input, { id: 'del-in' }), go, status,
      h('button', { class: 'btn ghost block', onclick: () => sh.close() }, t('common.cancel'))),
  });
  go.addEventListener('click', async () => {
    go.disabled = true; input.disabled = true; status.textContent = 'Deleting…';
    try {
      if (cloud && aiConfigured()) await removeKey().catch(() => {});          // the gateway's encrypted copy of your Gemini key
      const n = await store.deleteAllData();
      if (cloud) {
        try { await ctx.auth.currentUser.delete(); }
        catch (e) {
          if (/requires-recent-login/.test(e.code || e.message || '')) {
            status.textContent = 'Your data is deleted. To remove the sign-in itself, sign out, sign in again and delete once more.';
            return;
          }
          throw e;
        }
      }
      status.textContent = t('privacy.delete.done') + ` (${n} items)`;
      toast(t('privacy.delete.done'));
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      go.disabled = false; input.disabled = false;
      status.textContent = 'Couldn’t finish deleting: ' + (e.message || e) + '. Nothing else was changed; try again.';
    }
  });
}

export function privacyCard() {
  const c = store.profile.consents || {};
  return card('',
    cardHead(t('privacy.title'), null, 'Consent and your rights'),
    h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: !!c.health, onchange: e => {
        if (e.target.checked) store.saveProfile({ consents: { ...c, health: Date.now() } });
        else { e.target.checked = true; toast('To withdraw, delete your data below. We can’t build a plan without it.', 'warn'); }
      } }), h('span', null, 'Store my health data to build my plan')),
    h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: !!c.ai, onchange: e => { const n = { ...c }; if (e.target.checked) n.ai = Date.now(); else delete n.ai; store.saveProfile({ consents: n }); toast(e.target.checked ? 'AI features allowed' : 'AI features off'); } }),
      h('span', null, t('consent.ai'))),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn ghost', onclick: openPrivacyNotice }, icon('info', { size: 16 }), t('privacy.notice')),
      h('button', { class: 'btn danger', onclick: openDeleteAccount }, icon('trash', { size: 16 }), t('privacy.delete'))));
}
