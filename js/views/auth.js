// =============================================================
// LANDING / AUTH — sign in, sign up, Google, or try as a guest
// The first screen a signed-out student sees: a composed hero
// (the thali, Kato waving), what the app does, and the card.
// Phone: hero → features → card. Desktop: hero and art on the
// left, the card on the right, features below.
// =============================================================
import { h, s, fill } from '../util.js';
import { segmented, toast } from '../ui.js';
import { ctx } from '../ctx.js';
import { icon } from '../components/icons.js';
import { logoMark, artWelcome, artMascot, artKolam, artMeal, artSearch, artDumbbell } from '../components/art.js';

const FRIENDLY = {
  'auth/unauthorized-domain': 'This domain isn’t authorised in Firebase (Auth → Settings → Authorised domains).',
  'auth/wrong-password': 'Wrong password. Try again.',
  'auth/user-not-found': 'No account with this email — switch to “Create account”.',
  'auth/invalid-email': 'That email doesn’t look right.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/network-request-failed': 'Network error — check your connection.',
  'auth/email-already-in-use': 'An account already exists with this email — sign in instead.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled in Firebase yet.',
  'auth/popup-closed-by-user': 'Google sign-in was closed.',
};

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small glyphs the shared icon set doesn't have (same 24px grid, 1.75 stroke) ----------
const glyph = (...kids) => s('svg', { viewBox: '0 0 24 24', width: 18, height: 18, class: 'ico', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, ...kids);
const mailGlyph = () => glyph(s('rect', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 3 }), s('path', { d: 'M4.5 7.5l7.5 5.5 7.5-5.5' }));
const eyeGlyph = open => glyph(
  s('path', { d: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }),
  s('circle', { cx: 12, cy: 12, r: 2.8 }),
  !open && s('path', { d: 'M4 20L20 4' }));
/** The four-colour Google mark, drawn inline so it works offline. */
const googleMark = () => s('svg', { viewBox: '0 0 48 48', width: 20, height: 20, class: 'g-mark', 'aria-hidden': 'true', focusable: 'false' },
  s('path', { fill: '#FFC107', d: 'M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z' }),
  s('path', { fill: '#FF3D00', d: 'M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z' }),
  s('path', { fill: '#4CAF50', d: 'M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z' }),
  s('path', { fill: '#1976D2', d: 'M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z' }));

/** A run of words that rise in one after another; the heading still reads as one sentence. */
function words(list, from) {
  const out = [];
  list.forEach((w, i) => { out.push(h('span', { class: 'w', style: `--i:${from + i}` }, w)); out.push(' '); });
  return out;
}

export function renderAuth({ onGuest }) {
  let mode = 'signin';
  const err = h('div', { class: 'auth-err', role: 'alert' });
  const name = h('input', { class: 'input', id: 'auth-name', placeholder: 'First name', autocomplete: 'given-name' });
  const email = h('input', { class: 'input', id: 'auth-email', type: 'email', placeholder: 'College or personal email', autocomplete: 'email' });
  const pass = h('input', { class: 'input', id: 'auth-pass', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const nameWrap = h('div', { class: 'hide auth-f auth-f-name' }, h('label', { class: 'auth-l', for: 'auth-name' }, 'Your name'), name);
  const submit = h('button', { class: 'btn primary lg block auth-go' }, 'Sign in');
  const forgot = h('button', { class: 'link tiny auth-forgot', type: 'button' }, 'Forgot password?');
  const fb = ctx.auth;

  const busy = on => { submit.disabled = on; submit.classList.toggle('loading', on); };
  const fail = e => { busy(false); err.textContent = FRIENDLY[e.code] || e.message || 'Something went wrong'; console.error(e); };

  const go = async () => {
    err.textContent = '';
    if (!fb) { err.textContent = 'Can’t reach the sync server right now — continue as guest and sign in later.'; return; }
    if (!email.value.trim() || !pass.value) { err.textContent = 'Enter your email and password'; return; }
    busy(true);
    try {
      if (mode === 'signup') {
        const cred = await fb.createUserWithEmailAndPassword(email.value.trim(), pass.value);
        if (name.value.trim()) await cred.user.updateProfile({ displayName: name.value.trim() });
      } else await fb.signInWithEmailAndPassword(email.value.trim(), pass.value);
    } catch (e) { fail(e); }
  };
  submit.addEventListener('click', go);
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  forgot.addEventListener('click', async () => {
    if (!fb || !email.value.trim()) { err.textContent = 'Type your email above first'; return; }
    try { await fb.sendPasswordResetEmail(email.value.trim()); toast('Reset link sent. Check your inbox.'); } catch (e) { fail(e); }
  });

  const google = async () => {
    if (!fb) { err.textContent = 'Sync server unreachable — try guest mode.'; return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await fb.signInWithPopup(provider); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') fb.signInWithRedirect(provider);
      else fail(e);
    }
  };

  // show / hide the password: a convenience only, the field is a password field by default
  const eye = h('button', { type: 'button', class: 'auth-eye', 'aria-label': 'Show password', 'aria-pressed': 'false' }, eyeGlyph(true));
  eye.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    fill(eye, eyeGlyph(!show));
  });

  const cardSub = h('p', { class: 'auth-card-s' }, 'Sign in to pick up where you left off. Syncs phone and laptop.');
  const seg = segmented([{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }], mode, v => {
    mode = v; err.textContent = '';
    nameWrap.classList.toggle('hide', v !== 'signup');
    submit.textContent = v === 'signup' ? 'Create account' : 'Sign in';
    pass.setAttribute('autocomplete', v === 'signup' ? 'new-password' : 'current-password');
    cardSub.textContent = v === 'signup' ? 'Free for students. Your plan syncs between phone and laptop.' : 'Sign in to pick up where you left off. Syncs phone and laptop.';
  }, 'auth-seg');

  const cardTitle = h('h2', { class: 'auth-card-t', id: 'auth-card-t', tabindex: '-1' }, 'Welcome');
  const card = h('section', { class: 'auth-card', id: 'auth-card', 'aria-labelledby': 'auth-card-t' },
    h('header', { class: 'auth-card-h' }, h('p', { class: 'eyebrow' }, 'Free for students'), cardTitle, cardSub),
    seg,
    h('div', { class: 'stack auth-form' },
      nameWrap,
      h('div', { class: 'auth-f' }, h('label', { class: 'auth-l', for: 'auth-email' }, 'Email'), h('div', { class: 'auth-in' }, mailGlyph(), email)),
      h('div', { class: 'auth-f' },
        h('div', { class: 'auth-l-row' }, h('label', { class: 'auth-l', for: 'auth-pass' }, 'Password'), forgot),
        h('div', { class: 'auth-in has-eye' }, icon('lock', { size: 18 }), pass, eye)),
      submit, err,
      h('div', { class: 'or' }, h('span', null, 'or')),
      h('button', { class: 'btn ghost block auth-alt', onclick: google }, h('span', { class: 'g-logo' }, googleMark()), 'Continue with Google'),
      h('button', { class: 'btn ghost block auth-alt auth-guest', onclick: onGuest }, icon('today', { size: 18 }), 'Try it as a guest'),
      h('p', { class: 'tiny muted center auth-note' }, 'Guest data stays on this device. Create an account later and it moves with you.')));

  /** "Get started" and "Sign in" on a phone bring the card up and hand it focus. */
  const toCard = field => () => {
    card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    (field || cardTitle).focus({ preventScroll: true });
  };

  // ---------- the hero ----------
  const swoosh = s('svg', { class: 'auth-swoosh', viewBox: '0 0 120 16', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M4 11.5C30 5 72 3.5 116 8.5', pathLength: 1 }));
  const hero = h('div', { class: 'auth-hero' },
    h('p', { class: 'eyebrow auth-eyebrow' }, 'Campus nutrition · made for hostel life'),
    h('h1', { class: 'auth-t' },
      h('span', { class: 'auth-t-l' }, ...words(['Eat', 'right', 'at', 'the'], 0),
        h('span', { class: 'w w-em', style: '--i:4' }, h('em', null, 'mess'), '.', swoosh)),
      ' ',
      h('span', { class: 'auth-t-l' }, ...words(['Grow', 'everywhere', 'else.'], 5))),
    h('p', { class: 'auth-p' }, 'The campus nutrition app for gaining, losing or maintaining, built around your hostel mess, canteen snacks and gym.'),
    h('div', { class: 'auth-cta' },
      h('button', { class: 'btn primary lg auth-start', onclick: toCard(null) }, 'Get started', icon('chevron', { size: 18, sw: 2.2 }))),
    h('ul', { class: 'auth-proof' },
      h('li', null, icon('bowl', { size: 16 }), 'Every mess menu'),
      h('li', null, icon('barcode', { size: 16 }), 'Offline barcodes'),
      h('li', null, icon('lock', { size: 16 }), 'Private by default')));

  // the scene: a lamp-lit thali with Kato waving from its rim, two little readouts floating beside it
  const art = h('div', { class: 'auth-art', 'aria-hidden': 'true' },
    h('div', { class: 'auth-scene' },
      h('div', { class: 'auth-glow' }),
      h('div', { class: 'auth-kolam' }, artKolam({ size: 520 })),
      h('div', { class: 'auth-thali' }, h('div', { class: 'auth-thali-in' }, artWelcome(340))),
      h('div', { class: 'auth-kato' }, h('div', { class: 'auth-kato-in' }, artMascot({ mood: 'wave', size: 112 }))),
      h('div', { class: 'auth-tag auth-tag-a' },
        h('span', { class: 'auth-tag-ic ok' }, icon('check', { size: 16, sw: 2.4 })),
        h('span', null, h('b', null, 'Plate fits your goal'), h('small', null, 'Lunch · rajma, roti, curd'))),
      h('div', { class: 'auth-tag auth-tag-b' },
        h('span', { class: 'auth-tag-ic p' }, icon('bolt', { size: 16, sw: 2 })),
        h('span', null, h('b', { class: 'num' }, '48 of 60 g'), h('small', null, 'protein today')),
        h('i', { class: 'auth-tag-bar' }, h('i')))));

  // ---------- what it does ----------
  const chips = (...xs) => h('div', { class: 'feat-chips' }, xs.map(x => h('span', { class: 'feat-chip' }, x)));
  const feats = [
    {
      cls: 'f-mess', t: 'Your mess, decoded', d: 'Every mess menu, with a suggested plate for your goal.',
      art: () => [artMeal('lunch', 96), h('div', { class: 'feat-plate' },
        h('span', { class: 'feat-eb' }, 'Suggested plate'),
        chips('Rajma chawal', 'Roti ×3', 'Curd'),
        h('span', { class: 'feat-ok' }, icon('check', { size: 14, sw: 2.4 }), 'Fits your goal'))],
    },
    {
      cls: 'f-foods', t: '10,000+ foods', d: 'Mess dishes, Indian home cooking, packaged snacks and world foods, searchable in Hindi, Tamil, Telugu and more. Barcode scanning works offline.',
      art: () => [artSearch(96), chips('हिन्दी', 'தமிழ்', 'తెలుగు', '+5')],
    },
    {
      cls: 'f-type', t: 'Log by typing', d: '“2 eggs, chai, lays 20rs” and it’s done.',
      art: () => [h('div', { class: 'feat-type' }, h('span', { class: 'feat-q' }, '2 eggs, chai, lays 20rs'), h('i', { class: 'feat-caret' })),
        h('div', { class: 'feat-chips feat-parsed' }, ['2 boiled eggs', 'Masala chai', 'Lays ₹20'].map(x => h('span', { class: 'feat-chip' }, icon('check', { size: 12, sw: 2.6 }), x)))],
    },
    {
      cls: 'f-train', t: 'Train and grow', d: 'Plans, set logging, PRs, streaks and badges.',
      art: () => [artDumbbell(96), h('div', { class: 'feat-chips' },
        h('span', { class: 'feat-chip hot' }, icon('flame', { size: 13 }), '12-day streak'),
        h('span', { class: 'feat-chip' }, icon('trophy', { size: 13 }), 'New PR'))],
    },
  ];
  const features = h('section', { class: 'auth-feats', 'aria-labelledby': 'auth-feats-t' },
    h('header', { class: 'auth-feats-h' },
      h('p', { class: 'eyebrow' }, 'Why Thali'),
      h('h2', { class: 'auth-feats-t', id: 'auth-feats-t' }, 'Built for the way you ', h('em', null, 'actually'), ' eat.')),
    h('div', { class: 'feat-grid' }, feats.map((f, i) => h('article', { class: 'feat ' + f.cls, style: `--i:${i}` },
      h('div', { class: 'feat-art', 'aria-hidden': 'true' }, h('div', { class: 'feat-art-in' }, ...f.art())),
      h('div', { class: 'feat-txt' }, h('h3', { class: 'feat-t' }, f.t), h('p', { class: 'feat-d' }, f.d))))));

  return h('div', { class: 'auth landing' },
    h('div', { class: 'auth-bg', 'aria-hidden': 'true' }, h('i', { class: 'auth-bg-a' }), h('i', { class: 'auth-bg-b' })),
    h('header', { class: 'auth-top' },
      h('div', { class: 'logo' }, logoMark(36), 'Thali'),
      h('button', { class: 'btn ghost sm auth-top-in', onclick: toCard(email) }, 'Sign in')),
    h('main', { class: 'auth-grid' }, hero, art, card, features),
    h('footer', { class: 'auth-foot' },
      h('div', { class: 'logo' }, logoMark(26), 'Thali'),
      h('p', { class: 'tiny muted' }, 'Free for students · Works offline · Your data stays yours')));
}
