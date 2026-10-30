// =============================================================
// LANDING / AUTH — sign in, sign up, Google, or try as a guest
// =============================================================
import { h } from '../util.js';
import { segmented, toast } from '../ui.js';
import { ctx } from '../ctx.js';
import { icon } from '../components/icons.js';
import { logoMark, thaliArt } from '../components/art.js';

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

export function renderAuth({ onGuest }) {
  let mode = 'signin';
  const err = h('div', { class: 'auth-err', role: 'alert' });
  const name = h('input', { class: 'input', placeholder: 'First name', autocomplete: 'given-name' });
  const email = h('input', { class: 'input', type: 'email', placeholder: 'College or personal email', autocomplete: 'email' });
  const pass = h('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const nameWrap = h('div', { class: 'hide' }, name);
  const submit = h('button', { class: 'btn primary lg block' }, 'Sign in');
  const forgot = h('button', { class: 'link tiny' }, 'Forgot password?');
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

  const seg = segmented([{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }], mode, v => {
    mode = v; err.textContent = '';
    nameWrap.classList.toggle('hide', v !== 'signup');
    submit.textContent = v === 'signup' ? 'Create account' : 'Sign in';
    pass.setAttribute('autocomplete', v === 'signup' ? 'new-password' : 'current-password');
  });

  const feats = [
    ['bowl', 'Your mess, decoded', 'Every mess menu with a suggested plate for your goal'],
    ['search', '380+ campus foods', 'Bingo ₹20 to biryani, plus barcode scan and online search'],
    ['edit', 'Log by typing', '“2 eggs, chai, lays 20rs” and it’s done'],
    ['dumbbell', 'Train and grow', 'Plans, set logging, PRs, streaks and badges'],
  ];

  return h('div', { class: 'auth' },
    h('div', { class: 'auth-grid' },
      h('div', { class: 'auth-art' }, h('div', { class: 'art-float' }, thaliArt({ size: 300 }))),
      h('div', { class: 'auth-hero' },
        h('div', { class: 'logo' }, logoMark(40), 'Fuel & Forge'),
        h('h1', { class: 'auth-t' }, 'Eat right at the ', h('em', null, 'mess'), '. Grow everywhere else.'),
        h('p', { class: 'muted auth-p' }, 'The campus nutrition app for gaining, losing or maintaining, built around your hostel mess, canteen snacks and gym.'),
        h('div', { class: 'feat-grid' }, feats.map(([i, t, d]) => h('div', { class: 'feat' }, h('span', { class: 'feat-ic' }, icon(i, { size: 20 })), h('div', null, h('b', { class: 'small' }, t), h('div', { class: 'tiny muted' }, d)))))),
      h('div', { class: 'auth-card' },
        seg,
        h('div', { class: 'stack' }, nameWrap, email, pass, submit, err,
          h('div', { class: 'row between' }, forgot, h('span', { class: 'tiny muted' }, 'Syncs phone and laptop')),
          h('div', { class: 'or' }, h('span', null, 'or')),
          h('button', { class: 'btn ghost block', onclick: google }, h('span', { class: 'g-logo' }, 'G'), ' Continue with Google'),
          h('button', { class: 'btn ghost block', onclick: onGuest }, icon('today', { size: 18 }), 'Try it as a guest'),
          h('p', { class: 'tiny muted center' }, 'Guest data stays on this device. Create an account later and it moves with you.')))));
}
