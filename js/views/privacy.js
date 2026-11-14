// =============================================================
// PRIVACY — consent, the privacy notice, and "delete my account and
// data" (DPDP Act 2023: explicit consent, withdrawal, erasure).
//   ensureHealthConsent()  asks once; nothing is stored before "I agree"
//   privacyCard()          the You › Privacy card
//   openPrivacyNotice()    plain-language notice
//   openDeleteAccount()    typed confirmation, then erases everything
// Also home to the small settings building blocks (row, head, icon
// tile, a few extra line glyphs) that you.js, foodrules.js and
// aikey.js share, because this module imports none of them.
// =============================================================
import { h, s, fill } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { ctx } from '../ctx.js';
import { t } from '../i18n/index.js';
import { card } from './common.js';
import { icon } from '../components/icons.js';
import { aiConfigured, removeKey } from '../ai.js';

// ---------- line glyphs the shared icon set doesn't have yet ----------
// Same 24-unit grid, stroke and caps as components/icons.js; anything
// else falls through to icon(). (Asked for in icons.js; drop these then.)
const P = d => ['path', { d }];
const C = (cx, cy, r, fill) => ['circle', fill ? { cx, cy, r, fill: 'currentColor', stroke: 'none' } : { cx, cy, r }];
const GLYPHS = {
  globe: [C(12, 12, 9), P('M3.2 12h17.6'), P('M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z')],
  shield: [P('M12 3.2l7 2.7v5.6c0 4.3-2.9 7.8-7 9.3-4.1-1.5-7-5-7-9.3V5.9z'), P('M9 12.1l2.2 2.2 4-4.3')],
  key: [C(8, 15.5, 4), P('M10.9 12.6L19.5 4M16 7.5l2.4 2.4M18 5.5l2 2')],
  palette: [P('M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7-8.5-7z'),
    C(7.6, 11.2, 1.15, true), C(9.4, 7.5, 1.15, true), C(13.8, 6.8, 1.15, true), C(16.8, 9.6, 1.15, true)],
  external: [P('M14 4.5h5.5V10M19.5 4.5L11 13'), P('M17 14v3.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H10')],
  ban: [C(12, 12, 8.5), P('M6 18L18 6')],
  archive: [['rect', { x: 3.5, y: 4.5, width: 17, height: 4.5, rx: 1.6 }], P('M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4')],
};
/** icon() plus the extra glyphs above. Decorative (aria-hidden). */
export function glyph(name, { size = 22, sw = 1.75, cls = '' } = {}) {
  if (!GLYPHS[name]) return icon(name, { size, sw, cls });
  const svg = s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ico ' + cls, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  GLYPHS[name].forEach(([tag, a]) => svg.appendChild(s(tag, a)));
  return svg;
}

// ---------- settings building blocks ----------
/** A brushed-steel icon tile. `tone` tints the glyph (a token, e.g. 'var(--accent)'). */
export const setIcon = (ic, tone) => h('span', { class: 'set-ic' + (tone ? ' toned' : ''), style: tone ? `--tone: ${tone}` : null, 'aria-hidden': 'true' }, glyph(ic, { size: 18 }));

/** Card header: icon tile, title, one-line description, optional trailing element. */
export const setHead = (ic, title, sub, right, { tone, level = 'h3' } = {}) => h('div', { class: 'set-head' },
  setIcon(ic, tone),
  h('div', { class: 'set-head-t' }, h(level, { class: 'card-t' }, title), sub && h('p', { class: 'set-head-s' }, sub)),
  right);

/** A settings row: leading icon, title + sub, trailing control. `tag` 'button' / 'label' make the whole row the control. */
export function setRow({ ic, tone, title, sub, end, tag = 'div', cls = '', attrs = {} }) {
  return h(tag, { class: 'set-row ' + cls, ...attrs },
    ic && setIcon(ic, tone),
    h('span', { class: 'set-main' }, h('span', { class: 'set-t' }, title), sub && h('span', { class: 'set-s' }, sub)),
    end);
}
export const chevron = () => h('span', { class: 'set-chev', 'aria-hidden': 'true' }, glyph('chevron', { size: 18, sw: 2 }));

// The page re-renders on every save, so a "just picked" flourish has to be
// re-applied to the freshly built element. touch() marks it; fresh() asks.
let recent = { key: null, at: 0 };
export const touch = key => { recent = { key, at: performance.now() }; };
export const fresh = key => recent.key === key && performance.now() - recent.at < 700;

export const hasHealthConsent = () => !!store.profile.consents?.health;

/** Shows the consent sheet until the user decides. Resolves true on "I agree". */
export function ensureHealthConsent() {
  if (hasHealthConsent()) return Promise.resolve(true);
  return new Promise(resolve => {
    const body = h('div', { class: 'stack consent' });
    let sh, decided = false;
    const finish = v => { if (decided) return; decided = true; sh.close(); resolve(v); };
    const draw = declined => fill(body,
      h('div', { class: 'cs-medal' + (declined ? '' : ' enter'), 'aria-hidden': 'true' },
        h('span', { class: 'cs-halo' }), h('span', { class: 'cs-disc' }, glyph('shield', { size: 34, sw: 1.6 }))),
      h('p', { class: 'cs-body' }, t('consent.body')),
      h('button', { class: 'link small cs-notice', onclick: () => openPrivacyNotice() }, glyph('info', { size: 16 }), t('privacy.notice')),
      declined && h('p', { class: 'small warn-t cs-declined', role: 'alert' }, glyph('info', { size: 16 }), h('span', null, t('consent.declined'))),
      h('div', { class: 'cs-actions' },
        h('button', { class: 'btn primary block lg', onclick: () => { store.saveProfile({ consents: { ...(store.profile.consents || {}), health: Date.now() } }); finish(true); } }, t('consent.agree')),
        h('button', { class: 'btn ghost block cs-later', onclick: () => draw(true) }, t('consent.decline'))));
    sh = sheet({ title: t('consent.title'), body, onClose: () => { if (!decided) { decided = true; resolve(false); } } });
    draw(false);
  });
}

export function openPrivacyNotice() {
  const sec = (ic, title, text) => h('section', { class: 'nt-sec' },
    h('span', { class: 'nt-ic', 'aria-hidden': 'true' }, glyph(ic, { size: 18 })),
    h('div', null, h('h4', null, title), h('p', { class: 'small' }, text)));
  sheet({
    title: t('privacy.notice'), sub: 'In plain language', wide: true,
    body: h('div', { class: 'stack notice' },
      sec('lock', 'What we keep', 'Your name, body stats, goal and plan, food and water logs, weight, workouts, check-ins and settings. As a guest this lives only in this browser. With an account it lives in your private space in Google Firebase, readable only by you.'),
      sec('users', 'What others can see', 'Nothing, unless you opt in. The leaderboard shows your first name, mess, level and streaks. Dish ratings are counted anonymously: mess committees see averages, never who rated. Menus you publish as a committee member are public to your mess.'),
      sec('sparkle', 'AI features (optional)', 'Snap and the coach send the photo or text you choose to Google’s Gemini API using your own free key. Our gateway checks who you are, forwards the request, and logs only counts and timings: never your photos, words or key. Your key is stored encrypted and shown masked. Photos are not kept. On Google’s free tier, Google may use what you send to improve its products, so don’t send anything you wouldn’t want that. Check Google’s current Gemini API terms.'),
      sec('shield', 'Your rights', 'Download your data (You › Data), withdraw consent, or delete your account and everything in it (You › Privacy). Deleting is immediate and permanent.'),
      sec('info', 'Not medical advice', 'Targets and answers are general nutrition guidance. If you have a medical condition, are pregnant, or are under 18, follow your doctor and involve a parent or coach.'),
      h('p', { class: 'small muted nt-foot' }, 'Questions or requests: contact the person who runs your copy of this app (your mess committee or the app owner).')),
  });
}

export function openDeleteAccount() {
  const cloud = store.mode === 'cloud';
  const input = h('input', { class: 'input del-in', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': t('privacy.delete.type'), placeholder: 'DELETE' });
  const go = h('button', { class: 'btn danger block', disabled: true }, glyph('trash', { size: 18 }), t('privacy.delete'));
  const status = h('p', { class: 'small del-status', role: 'status' });
  const wrap = h('div', { class: 'stack del-acc' });
  input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'DELETE'; wrap.classList.toggle('armed', !go.disabled); });
  fill(wrap,
    h('div', { class: 'del-warn' }, h('span', { class: 'del-ic', 'aria-hidden': 'true' }, glyph('alert', { size: 20 })),
      h('p', null, t('privacy.delete.confirm', { account: cloud ? ', and your sign-in' : '' }))),
    h('div', { class: 'del-type' }, h('label', { class: 'small', for: 'del-in' }, t('privacy.delete.type')), Object.assign(input, { id: 'del-in' })),
    go, status,
    h('button', { class: 'btn ghost block', onclick: () => sh.close() }, t('common.cancel')));
  const sh = sheet({ title: t('privacy.delete'), sub: cloud ? store.user?.email : 'Guest data on this device', body: wrap });
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
  const consentRow = (checked, onchange, text, sub, ic) => h('label', { class: 'check-row set-row' },
    setIcon(ic),
    h('span', { class: 'set-main' }, h('span', { class: 'set-t' }, text), sub && h('span', { class: 'set-s' }, sub)),
    h('input', { type: 'checkbox', class: 'switch', checked, onchange }));
  const el = card('set privacy',
    setHead('lock', t('privacy.title'), 'Consent and your rights'),
    h('div', { class: 'set-rows' },
      consentRow(!!c.health, e => {
        if (e.target.checked) store.saveProfile({ consents: { ...c, health: Date.now() } });
        else { e.target.checked = true; toast('To withdraw, delete your data below. We can’t build a plan without it.', 'warn'); }
      }, 'Store my health data to build my plan', 'Needed for your targets and plan', 'scale'),
      consentRow(!!c.ai, e => { const n = { ...c }; if (e.target.checked) n.ai = Date.now(); else delete n.ai; store.saveProfile({ consents: n }); toast(e.target.checked ? 'AI features allowed' : 'AI features off'); },
        t('consent.ai'), null, 'sparkle'),
      setRow({ tag: 'button', cls: 'act', ic: 'info', title: t('privacy.notice'), sub: 'What we keep, who sees it, your rights', end: chevron(), attrs: { onclick: openPrivacyNotice } })),
    h('div', { class: 'dz', role: 'group', 'aria-label': 'Danger zone' },
      h('div', { class: 'dz-h' }, glyph('alert', { size: 16, sw: 2 }), 'Danger zone'),
      h('p', { class: 'small dz-p' }, 'Erases your profile, logs, goals and ratings, here and in the cloud. You’ll type DELETE to confirm.'),
      h('button', { class: 'btn danger block', onclick: openDeleteAccount }, glyph('trash', { size: 16 }), t('privacy.delete'))));
  el.id = 'sec-privacy';
  return el;
}
