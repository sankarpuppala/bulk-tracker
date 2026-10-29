// =============================================================
// STORE — one API, two backends.
//   guest: everything in localStorage on this device
//   cloud: Firestore (users/{uid} + users/{uid}/logs/{date})
// Shared campus data (mess menus, festival specials, leaderboard)
// always lives in Firestore when the SDK is available.
// =============================================================
import { lsGet, lsSet, lsDel, addDays, todayKey, debounce } from './util.js';

export const DEFAULT_PROFILE = {
  name: '', sex: 'male', age: 20, height: 170, weight: 60, goalWeight: null,
  goal: 'gain', pace: 0.25, activity: 'moderate', diet: 'nonveg', mess: 'CNV', plan: 'ppl5',
  routine: { wake: '06:30', sleep: '23:00', gym: '17:30' }, messTimings: null,
  customTargets: null, favorites: [], customFoods: [], templates: [], recents: [],
  menuOverrides: {}, leaderboard: false, reminders: false, onboarded: false,
};

export function emptyDay() {
  return { items: [], gymDone: [], sets: {}, water: 0, weight: null, note: '' };
}
export function normDay(d) {
  const e = emptyDay();
  if (!d) return e;
  return {
    items: Array.isArray(d.items) ? d.items : [],
    gymDone: Array.isArray(d.gymDone) ? d.gymDone : [],
    sets: d.sets && typeof d.sets === 'object' ? d.sets : {},
    water: +d.water || 0,
    weight: d.weight ? +d.weight : null,
    note: d.note || '',
  };
}
export const dayHasData = d => d && (d.items.length > 0 || d.water > 0 || d.weight || d.gymDone.length > 0);

const G = 'ff.guest.';

class Store {
  constructor() {
    this.mode = null;          // 'guest' | 'cloud'
    this.user = null;
    this.db = null;            // firestore instance or null
    this.profile = { ...DEFAULT_PROFILE };
    this.days = new Map();     // key -> normalized day
    this.loaded = new Set();   // keys fetched from backend
    this.shared = { menus: {}, specials: [], menusLoaded: false, specialsLoaded: false };
    this.isAdmin = false;
    this.syncState = 'ok';
    this._subs = new Set();
    this._dayUnsub = null;
    this._watchKey = null;
    this._writers = new Map();
  }

  // ---------- events ----------
  on(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  emit(reason) { this._subs.forEach(fn => fn(reason)); }
  setSync(st) { if (this.syncState !== st) { this.syncState = st; this.emit('sync'); } }

  attachDb(db) { this.db = db; }

  async start(mode, user = null) {
    this.stop();
    this.mode = mode;
    this.user = user;
    this.days.clear();
    this.loaded.clear();
    this.profile = { ...DEFAULT_PROFILE, ...(await this._readProfile()) };
    this.profile.routine = { ...DEFAULT_PROFILE.routine, ...(this.profile.routine || {}) };
    if (mode === 'cloud') this.checkAdmin();
    this.loadShared();
  }

  stop() {
    if (this._dayUnsub) { this._dayUnsub(); this._dayUnsub = null; }
    this._watchKey = null;
  }

  get cloud() { return this.mode === 'cloud' && this.db && this.user; }
  _userRef() { return this.db.collection('users').doc(this.user.uid); }
  _logRef(key) { return this._userRef().collection('logs').doc(key); }

  // ---------- profile ----------
  async _readProfile() {
    if (this.mode === 'guest') return lsGet(G + 'profile', {});
    try {
      const snap = await this._userRef().get();
      return snap.exists ? snap.data() : {};
    } catch (e) {
      console.warn('profile read failed', e);
      this.setSync('offline');
      return {};
    }
  }

  saveProfile(patch) {
    this.profile = { ...this.profile, ...patch };
    this.emit('profile');
    this._writeProfile();
  }

  _writeProfile = debounce(async () => {
    if (this.mode === 'guest') { lsSet(G + 'profile', this.profile); return; }
    if (!this.cloud) return;
    this.setSync('syncing');
    try {
      await this._userRef().set({ ...this.profile, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      this.setSync('ok');
    } catch (e) { console.error('profile save failed', e); this.setSync('offline'); }
  }, 350);

  // ---------- days ----------
  day(key) {
    if (!this.days.has(key)) {
      this.days.set(key, emptyDay());
      this.loadDay(key);
    }
    return this.days.get(key);
  }

  async loadDay(key) {
    if (this.loaded.has(key)) return this.days.get(key);
    this.loaded.add(key);
    let d;
    if (this.mode === 'guest') d = lsGet(G + 'day.' + key);
    else if (this.cloud) {
      try { const snap = await this._logRef(key).get(); d = snap.exists ? snap.data() : null; }
      catch (e) { console.warn('day read failed', e); this.setSync('offline'); }
    }
    // don't clobber edits made while the read was in flight
    if (!this._writers.has(key)) this.days.set(key, normDay(d));
    this.emit('day');
    return this.days.get(key);
  }

  /** Live-sync the day being viewed so phone + laptop stay in step. */
  watchDay(key) {
    if (this.mode !== 'cloud' || !this.cloud || this._watchKey === key) return;
    if (this._dayUnsub) this._dayUnsub();
    this._watchKey = key;
    this._dayUnsub = this._logRef(key).onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      this.loaded.add(key);
      this.days.set(key, normDay(snap.exists ? snap.data() : null));
      this.emit('day');
    }, err => { console.warn('watch failed', err); this.setSync('offline'); });
  }

  updateDay(key, mutate) {
    const d = structuredClone(this.day(key));
    mutate(d);
    this.days.set(key, d);
    this.loaded.add(key);
    this.emit('day');
    this._queueWrite(key);
  }

  _queueWrite(key) {
    clearTimeout(this._writers.get(key));
    this._writers.set(key, setTimeout(() => this._writeDay(key), 300));
  }

  async _writeDay(key) {
    const d = this.days.get(key);
    if (this.mode === 'guest') {
      lsSet(G + 'day.' + key, d);
      const idx = new Set(lsGet(G + 'index', []));
      idx.add(key); lsSet(G + 'index', [...idx].sort());
      this._writers.delete(key);
      return;
    }
    if (!this.cloud) return;
    this.setSync('syncing');
    try {
      await this._logRef(key).set({ ...d, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      this.setSync(navigator.onLine ? 'ok' : 'offline');
    } catch (e) { console.error('day save failed', e); this.setSync('offline'); }
    finally { this._writers.delete(key); }
  }

  /** All days in [from, to] inclusive, oldest first, as [{key, ...day}] */
  async range(from, to) {
    const out = new Map();
    if (this.mode === 'guest') {
      for (let k = from; k <= to; k = addDays(k, 1)) {
        const d = this.days.get(k) || normDay(lsGet(G + 'day.' + k));
        if (dayHasData(d)) out.set(k, d);
      }
    } else if (this.cloud) {
      try {
        const id = firebase.firestore.FieldPath.documentId();
        const snap = await this._userRef().collection('logs').where(id, '>=', from).where(id, '<=', to).get();
        snap.forEach(doc => {
          const k = doc.id;
          if (!this._writers.has(k)) {
            const d = normDay(doc.data());
            this.days.set(k, d);
            this.loaded.add(k);
          }
          out.set(k, this.days.get(k));
        });
      } catch (e) { console.warn('range read failed', e); this.setSync('offline'); }
      // include unsynced local edits
      for (const [k, d] of this.days) if (k >= from && k <= to && dayHasData(d)) out.set(k, d);
    }
    return [...out.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([key, d]) => ({ key, ...d }));
  }

  async allDays() {
    if (this.mode === 'guest') {
      const idx = lsGet(G + 'index', []);
      return idx.map(k => ({ key: k, ...normDay(lsGet(G + 'day.' + k)) })).filter(dayHasData);
    }
    return this.range('2000-01-01', addDays(todayKey(), 1));
  }

  // ---------- guest → account migration ----------
  static guestSnapshot() {
    const profile = lsGet(G + 'profile');
    if (!profile) return null;
    const idx = lsGet(G + 'index', []);
    return { profile, days: idx.map(k => [k, lsGet(G + 'day.' + k)]).filter(([, d]) => d) };
  }
  async importGuest(snapshot) {
    if (!this.cloud || !snapshot) return;
    this.profile = { ...DEFAULT_PROFILE, ...snapshot.profile };
    await this._userRef().set(this.profile);
    const batch = this.db.batch();
    snapshot.days.forEach(([k, d]) => batch.set(this._logRef(k), normDay(d), { merge: true }));
    await batch.commit();
    Store.clearGuest();
    this.days.clear(); this.loaded.clear();
    this.emit('profile');
  }
  static clearGuest() {
    lsGet(G + 'index', []).forEach(k => lsDel(G + 'day.' + k));
    lsDel(G + 'index'); lsDel(G + 'profile');
  }
  async importBackup(json) {
    if (json.profile) this.saveProfile({ ...json.profile });
    for (const d of json.days || []) {
      if (!d.key) continue;
      const { key, ...rest } = d;
      this.days.set(key, normDay(rest));
      this.loaded.add(key);
      await this._writeDay(key);
    }
    this.emit('day');
  }

  // ---------- shared campus data ----------
  async loadShared() {
    if (!this.db) { this.shared.menusLoaded = this.shared.specialsLoaded = true; return; }
    try {
      const snap = await this.db.collection('messes').get();
      snap.forEach(doc => { this.shared.menus[doc.id] = doc.data(); });
    } catch (e) { console.info('shared menus unavailable — using bundled menus', e.code || e); }
    this.shared.menusLoaded = true;
    try {
      const from = addDays(todayKey(), -14), to = addDays(todayKey(), 60);
      const snap = await this.db.collection('specials').where('date', '>=', from).where('date', '<=', to).get();
      this.shared.specials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.info('specials unavailable', e.code || e); }
    this.shared.specialsLoaded = true;
    this.emit('shared');
  }

  async checkAdmin() {
    if (!this.cloud) return;
    try {
      const snap = await this.db.collection('admins').doc(this.user.uid).get();
      this.isAdmin = snap.exists;
      if (this.isAdmin) this.emit('admin');
    } catch { this.isAdmin = false; }
  }

  async publishMenu(messId, menu) {
    await this.db.collection('messes').doc(messId).set({
      menu, updatedAt: Date.now(), updatedBy: this.user.displayName || this.user.email || this.user.uid,
    });
    this.shared.menus[messId] = { menu, updatedAt: Date.now() };
    this.emit('shared');
  }

  async saveSpecial(sp) {
    const { id, ...data } = sp;
    const ref = id ? this.db.collection('specials').doc(id) : this.db.collection('specials').doc();
    await ref.set({ ...data, updatedAt: Date.now(), by: this.user.uid });
    const rec = { id: ref.id, ...data };
    this.shared.specials = this.shared.specials.filter(x => x.id !== ref.id).concat(rec);
    this.emit('shared');
  }

  async deleteSpecial(id) {
    await this.db.collection('specials').doc(id).delete();
    this.shared.specials = this.shared.specials.filter(x => x.id !== id);
    this.emit('shared');
  }

  async report(data) {
    if (!this.cloud) throw new Error('Sign in to send reports');
    await this.db.collection('reports').add({ ...data, uid: this.user.uid, ts: Date.now() });
  }

  async reports() {
    const snap = await this.db.collection('reports').orderBy('ts', 'desc').limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async publishLeaderboard(entry) {
    if (!this.cloud) return;
    const ref = this.db.collection('leaderboard').doc(this.user.uid);
    try {
      if (entry) await ref.set({ ...entry, updatedAt: Date.now() });
      else await ref.delete();
    } catch (e) { console.warn('leaderboard write failed', e); }
  }

  async leaderboard() {
    if (!this.cloud) return [];
    const snap = await this.db.collection('leaderboard').orderBy('xp', 'desc').limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export { Store };
export const store = new Store();
