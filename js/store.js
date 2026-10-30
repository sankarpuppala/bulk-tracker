// =============================================================
// STORE — one API, two backends.
//   guest: everything in localStorage on this device
//   cloud: Firestore (users/{uid} + users/{uid}/logs/{date})
// Shared campus data (mess menus, festival specials, leaderboard)
// always lives in Firestore when the SDK is available.
// =============================================================
import { lsGet, lsSet, lsDel, addDays, todayKey, debounce } from './util.js';
import { migrateProfile, profileV2Defaults, PROFILE_SCHEMA } from './engine/profile.js';
import { planFromProfile } from './engine/goal.js';

export const DEFAULT_PROFILE = {
  name: '', sex: 'male', age: 20, height: 170, weight: 60, goalWeight: null,
  goal: 'gain', pace: 0.25, activity: 'moderate', diet: 'nonveg', mess: 'CNV', plan: 'ppl5',
  routine: { wake: '06:30', sleep: '23:00', gym: '17:30' }, messTimings: null,
  customTargets: null, favorites: [], customFoods: [], templates: [], recents: [],
  menuOverrides: {}, leaderboard: false, reminders: false, onboarded: false,
  experience: 'beginner',   // lifting experience: sets safe rates and the suggested training plan
  phase: null,              // set by the goal plan: null | 'maintain' | 'minicut' (see calcTargets)
  calAdjust: 0,             // kcal added by weekly check-ins
  schema: PROFILE_SCHEMA, ...profileV2Defaults(),
};

export function emptyDay() {
  return { items: [], gymDone: [], sets: {}, water: 0, weight: null, note: '', dayOverrides: {} };
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
    // one-off "not this today" menus: { mealId: [{ n, cal, p, c, f, diet }] }
    dayOverrides: d.dayOverrides && typeof d.dayOverrides === 'object' && !Array.isArray(d.dayOverrides) ? d.dayOverrides : {},
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
    this.goals = [];           // GoalPlans, newest last
    this.checkins = [];        // CheckIns, oldest first
    this._sharedUnsubs = [];
    this.admin = null;        // null | { super: bool, messes: [messId] }
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
    this.profile = { ...DEFAULT_PROFILE, ...migrateProfile(await this._readProfile()) };
    this.profile.routine = { ...DEFAULT_PROFILE.routine, ...(this.profile.routine || {}) };
    await this._loadGoals();
    if (mode === 'cloud') this.checkAdmin();
    this.loadShared();
  }

  stop() {
    if (this._dayUnsub) { this._dayUnsub(); this._dayUnsub = null; }
    this._sharedUnsubs.forEach(fn => { try { fn(); } catch { /* already gone */ } });
    this._sharedUnsubs = [];
    this._watchKey = null;
  }

  /** Full teardown on sign-out, so signing back in starts clean. */
  reset() {
    this.stop();
    this.mode = null;
    this.user = null;
    this.admin = null;
    this.days.clear();
    this.loaded.clear();
    this.goals = []; this.checkins = [];
    this.profile = { ...DEFAULT_PROFILE };
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

  // ---------- goals, check-ins and day plans ----------
  // guest: ff.guest.goals / .checkins / .plan.{date};  cloud: users/{uid}/goals/{id},
  // checkins/{week} and plans/{date} (all covered by the users/{userId}/** rule)
  get activeGoal() {
    return this.goals.find(g => g.id === this.profile.activeGoalId) || null;
  }

  async _loadGoals() {
    this.goals = []; this.checkins = [];
    let ok = true;
    if (this.mode === 'guest') {
      this.goals = lsGet(G + 'goals', []);
      this.checkins = lsGet(G + 'checkins', []);
    } else if (this.cloud) {
      try {
        const [g, c] = await Promise.all([this._userRef().collection('goals').get(), this._userRef().collection('checkins').get()]);
        this.goals = g.docs.map(d => ({ id: d.id, ...d.data() }));
        this.checkins = c.docs.map(d => d.data());
      } catch (e) { console.warn('goals read failed', e); this.setSync('offline'); ok = false; }
    }
    this.checkins.sort((a, b) => (a.date < b.date ? -1 : 1));
    // existing users get a plan generated from their v1 goal / pace / goalWeight
    if (ok && this.profile.onboarded && !this.activeGoal) {
      const plan = planFromProfile(this.profile, { id: this.goals.some(g => g.id === 'g1') ? 'g' + Date.now().toString(36) : 'g1' });
      this.goals.push(plan);
      this._writeGoal(plan);
      this.profile = { ...this.profile, activeGoalId: plan.id };
      this._writeProfile();
    }
  }

  _persistGuestGoals() { lsSet(G + 'goals', this.goals); lsSet(G + 'checkins', this.checkins); }

  async _writeGoal(plan) {
    if (this.mode === 'guest') { this._persistGuestGoals(); return; }
    if (!this.cloud) return;
    try { await this._userRef().collection('goals').doc(plan.id).set(plan); }
    catch (e) { console.error('goal save failed', e); this.setSync('offline'); }
  }

  /** Save (or replace) a plan. `activate` makes it the active one and archives the previous. */
  saveGoal(plan, { activate = false } = {}) {
    const rest = this.goals.filter(g => g.id !== plan.id);
    if (activate) rest.forEach(g => { if (g.status === 'active') { g.status = 'archived'; this._writeGoal(g); } });
    this.goals = [...rest, plan];
    this._writeGoal(plan);
    if (activate) this.saveProfile({ activeGoalId: plan.id });
    else this.emit('goal');
  }

  saveCheckIn(ci) {
    this.checkins = [...this.checkins.filter(c => c.week !== ci.week), ci].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (this.mode === 'guest') this._persistGuestGoals();
    else if (this.cloud) this._userRef().collection('checkins').doc(ci.week).set(ci).catch(e => { console.error('check-in save failed', e); this.setSync('offline'); });
    this.emit('checkin');
  }

  /** Day plans (js/planner.js): the latest version of each day plus up to 7 earlier ones in `history`. */
  async readPlans(from, to) {
    const out = {};
    if (this.mode === 'guest') {
      for (let k = from; k <= to; k = addDays(k, 1)) { const d = lsGet(G + 'plan.' + k); if (d) out[k] = d; }
    } else if (this.cloud) {
      try {
        const id = firebase.firestore.FieldPath.documentId();
        const snap = await this._userRef().collection('plans').where(id, '>=', from).where(id, '<=', to).get();
        snap.forEach(doc => { out[doc.id] = doc.data(); });
      } catch (e) { console.info('plans unavailable', e.code || e); }
    }
    return out;
  }

  writePlan(date, doc) {
    if (this.mode === 'guest') { lsSet(G + 'plan.' + date, doc); return; }
    if (!this.cloud) return;
    this._userRef().collection('plans').doc(date).set(doc).catch(e => console.info('plan save failed', e.code || e));
  }

  /** Guest plans older than the 7-day window are dead weight. */
  prunePlans(before) {
    if (this.mode !== 'guest') return;
    for (let k = addDays(before, -14); k < before; k = addDays(k, 1)) lsDel(G + 'plan.' + k);
  }

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
    return { profile, days: idx.map(k => [k, lsGet(G + 'day.' + k)]).filter(([, d]) => d), goals: lsGet(G + 'goals', []), checkins: lsGet(G + 'checkins', []) };
  }
  async importGuest(snapshot) {
    if (!this.cloud || !snapshot) return;
    this.profile = { ...DEFAULT_PROFILE, ...migrateProfile(snapshot.profile) };
    await this._userRef().set(this.profile);
    const batch = this.db.batch();
    snapshot.days.forEach(([k, d]) => batch.set(this._logRef(k), normDay(d), { merge: true }));
    (snapshot.goals || []).forEach(g => batch.set(this._userRef().collection('goals').doc(g.id), g));
    (snapshot.checkins || []).forEach(c => batch.set(this._userRef().collection('checkins').doc(c.week), c));
    await batch.commit();
    this.goals = snapshot.goals || []; this.checkins = snapshot.checkins || [];
    Store.clearGuest();
    this.days.clear(); this.loaded.clear();
    this.emit('profile');
  }
  static clearGuest() {
    lsGet(G + 'index', []).forEach(k => lsDel(G + 'day.' + k));
    lsDel(G + 'index'); lsDel(G + 'profile'); lsDel(G + 'goals'); lsDel(G + 'checkins');
  }
  async importBackup(json) {
    if (json.profile) this.saveProfile(migrateProfile(json.profile));
    for (const g of json.goals || []) if (g?.id) this.saveGoal(g);
    for (const c of json.checkins || []) if (c?.week) this.saveCheckIn(c);
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
    this._watchShared();
  }

  /**
   * Live menus and specials: when a committee publishes or edits, every open
   * app re-plans (js/planner.js) within a moment instead of at next launch.
   */
  _watchShared() {
    if (!this.db || this._sharedUnsubs.length) return;
    const bad = e => console.info('live menu updates unavailable', e.code || e);
    try {
      this._sharedUnsubs.push(this.db.collection('messes').onSnapshot(snap => {
        const menus = {};
        snap.forEach(doc => { menus[doc.id] = doc.data(); });
        this.shared.menus = menus;
        this.emit('shared');
      }, bad));
      const from = addDays(todayKey(), -14), to = addDays(todayKey(), 60);
      this._sharedUnsubs.push(this.db.collection('specials').where('date', '>=', from).where('date', '<=', to).onSnapshot(snap => {
        this.shared.specials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.emit('shared');
      }, bad));
    } catch (e) { bad(e); }
  }


  // ---------- admin roles ----------
  // admins/{uid} holds either { super: true } (every mess) or
  // { messes: ['AV','BV'] } (that committee's messes only). A legacy
  // doc with neither field is treated as a super-admin.
  get isAdmin() { return !!this.admin; }
  get isSuper() { return !!this.admin && this.admin.super; }
  canEditMess(messId) {
    return !!this.admin && (this.admin.super || this.admin.messes.includes(messId));
  }

  async checkAdmin() {
    if (!this.cloud) return;
    try {
      const snap = await this.db.collection('admins').doc(this.user.uid).get();
      if (!snap.exists) { this.admin = null; return; }
      const d = snap.data() || {};
      const messes = Array.isArray(d.messes) ? d.messes.filter(x => typeof x === 'string') : null;
      this.admin = { super: d.super === true || !messes, messes: messes || [] };
      this.emit('admin');
    } catch { this.admin = null; }
  }

  async listAdmins() {
    const snap = await this.db.collection('admins').get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  }
  async setAdmin(uid, { isSuper = false, messes = [] } = {}) {
    await this.db.collection('admins').doc(uid).set(
      isSuper ? { super: true, by: this.user.uid, at: Date.now() } : { messes, by: this.user.uid, at: Date.now() });
  }
  async removeAdmin(uid) {
    await this.db.collection('admins').doc(uid).delete();
  }

  /** Every publish bumps `version`; older docs without one count as 0. */
  async publishMenu(messId, menu) {
    const ref = this.db.collection('messes').doc(messId);
    let prev = this.shared.menus[messId]?.version || 0;
    try { const cur = await ref.get(); if (cur.exists) prev = Math.max(prev, +cur.data().version || 0); } catch { /* offline: fall back to the cached version */ }
    const rec = {
      menu, version: prev + 1, updatedAt: Date.now(),
      updatedBy: this.user.displayName || this.user.email || this.user.uid,
    };
    await ref.set(rec);
    this.shared.menus[messId] = rec;
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
    } catch (e) {
      // rules published before friend challenges only allow the original fields: keep the board working
      if (entry && /permission/i.test(String(e.code || e.message || e))) {
        const { pStreak, group, ...base } = entry;
        try { await ref.set({ ...base, updatedAt: Date.now() }); return; } catch { /* fall through */ }
      }
      console.warn('leaderboard write failed', e);
    }
  }

  async leaderboard(group = '') {
    if (!this.cloud) return [];
    let q = this.db.collection('leaderboard');
    if (group) q = q.where('group', '==', group);
    const snap = await q.limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Erase everything this person has here: logs, goals, check-ins, plans, profile, leaderboard
   * entry and dish ratings (cloud), or every ff.* key in this browser (guest). Returns how many
   * records went. Deleting the sign-in itself is the caller's job (it needs a recent login).
   */
  async deleteAllData() {
    let n = 0;
    if (this.cloud) {
      const ref = this._userRef();
      for (const sub of ['logs', 'goals', 'checkins', 'plans']) {
        const snap = await ref.collection(sub).get();
        for (const d of snap.docs) { await d.ref.delete(); n++; }
      }
      await this.db.collection('leaderboard').doc(this.user.uid).delete().catch(() => {});
      const mine = await this.db.collection('dishRatings').where('uid', '==', this.user.uid).get().catch(() => ({ docs: [] }));
      for (const d of mine.docs) { await d.ref.delete(); n++; }
      await ref.delete(); n++;
    }
    try {
      Object.keys(localStorage).filter(k => k.startsWith('ff.')).forEach(k => { localStorage.removeItem(k); n++; });
      sessionStorage.clear();
    } catch { /* storage blocked: nothing to clear */ }
    this._unwatchDay?.();
    return n;
  }

  // ---------- dish ratings (Phase 9) ----------
  /** One rating per user per dish per day; the rules refuse a second write, which we report as 'already'. */
  async rateDish({ mess, date, meal, dish, v, id, dishKey }) {
    if (!this.cloud) return 'offline';
    try {
      await this.db.collection('dishRatings').doc(id).set({ mess, date, meal, dish: String(dish).slice(0, 60), dishKey, v, uid: this.user.uid, ts: Date.now() });
      return 'ok';
    } catch (e) { return /permission|already|denied/i.test(String(e.message || e)) ? 'already' : 'error'; }
  }

  /** Recent ratings for one mess (the committee dashboard aggregates them on the client). */
  async dishRatings(mess, sinceDate) {
    if (!this.cloud) return [];
    const snap = await this.db.collection('dishRatings').where('mess', '==', mess).limit(1000).get();
    return snap.docs.map(d => d.data()).filter(r => !sinceDate || r.date >= sinceDate);
  }
}

export { Store };
export const store = new Store();
