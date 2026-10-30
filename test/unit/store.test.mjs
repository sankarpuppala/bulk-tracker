import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, DEFAULT_PROFILE } from '../../js/store.js';
import { menuFor } from '../../js/menus.js';

/** Minimal in-memory localStorage so guest mode runs under Node. */
function withLocalStorage(seed = {}) {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  globalThis.localStorage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
  return () => { delete globalThis.localStorage; };
}

/** Fake Firestore that only knows collection().doc().get()/set(). */
function fakeDb(docs = {}, { failGet = false } = {}) {
  return {
    docs,
    collection: c => ({
      doc: id => ({
        get: async () => {
          if (failGet) throw new Error('offline');
          const d = docs[`${c}/${id}`];
          return { exists: d !== undefined, data: () => d };
        },
        set: async v => { docs[`${c}/${id}`] = v; },
      }),
    }),
  };
}

const cloudStore = db => {
  const s = new Store();
  s.db = db; s.mode = 'cloud'; s.user = { uid: 'u1', email: 'a@b.c' };
  return s;
};

test('a v1 guest profile loads migrated, with every v1 field intact', async () => {
  const v1 = { name: 'Meera', goal: 'lose', weight: 62, goalWeight: 55, pace: 0.5, diet: 'veg', mess: 'AV', onboarded: true, favorites: ['egg'] };
  const restore = withLocalStorage({ 'ff.guest.profile': v1 });
  try {
    const s = new Store();
    await s.start('guest');
    for (const [k, v] of Object.entries(v1)) assert.deepEqual(s.profile[k], v, k);
    assert.equal(s.profile.schema, 2);
    assert.deepEqual(s.profile.allergies, []);
    assert.equal(s.profile.locale, 'en-IN');
  } finally { restore(); }
});

test('a brand-new guest gets the v2 defaults', async () => {
  const restore = withLocalStorage();
  try {
    const s = new Store();
    await s.start('guest');
    assert.equal(s.profile.schema, 2);
    assert.equal(s.profile.goal, DEFAULT_PROFILE.goal);
    assert.equal(s.profile.activeGoalId, null);
  } finally { restore(); }
});

test('first publish is version 1 and records who/when', async () => {
  const db = fakeDb();
  const s = cloudStore(db);
  await s.publishMenu('CNV', { Monday: {} });
  const doc = db.docs['messes/CNV'];
  assert.equal(doc.version, 1);
  assert.ok(doc.updatedAt > 0);
  assert.equal(doc.updatedBy, 'a@b.c');
  assert.equal(s.shared.menus.CNV.version, 1);
});

test('each publish bumps the version, read from the server copy', async () => {
  const db = fakeDb({ 'messes/CNV': { menu: {}, version: 4 } });
  const s = cloudStore(db);
  await s.publishMenu('CNV', { Monday: {} });
  assert.equal(db.docs['messes/CNV'].version, 5);
  await s.publishMenu('CNV', { Monday: {} });
  assert.equal(db.docs['messes/CNV'].version, 6);
});

test('a legacy menu doc with no version counts as 0', async () => {
  const db = fakeDb({ 'messes/AV': { menu: {}, updatedAt: 1 } });
  const s = cloudStore(db);
  await s.publishMenu('AV', { Monday: {} });
  assert.equal(db.docs['messes/AV'].version, 1);
});

test('publishing still works offline, using the cached version', async () => {
  const db = fakeDb({}, { failGet: true });
  const s = cloudStore(db);
  s.shared.menus.BV = { menu: {}, version: 2 };
  await s.publishMenu('BV', { Monday: {} });
  assert.equal(db.docs['messes/BV'].version, 3);
});

test('menu resolution tolerates published docs without version fields', async () => {
  const restore = withLocalStorage();
  try {
    const { store } = await import('../../js/store.js');
    store.shared.menus.CNV = { menu: { Monday: { lunch: [{ n: 'Dal', cal: 160, p: 9, c: 22 }] } } };
    store.profile = { ...DEFAULT_PROFILE, menuOverrides: {} };
    const m = menuFor('CNV', '2026-11-02'); // a Monday
    assert.equal(m.source, 'shared');
    assert.equal(m.meals.lunch[0].n, 'Dal');
  } finally { restore(); }
});

// ---------- goals, check-ins, day overrides ----------
test('an onboarded v1 guest gets exactly one goal plan, and starting again does not add another', async () => {
  const v1 = { name: 'Meera', goal: 'lose', weight: 62, goalWeight: 55, pace: 0.5, onboarded: true };
  const restore = withLocalStorage({ 'ff.guest.profile': v1 });
  try {
    const s = new Store();
    await s.start('guest');
    assert.equal(s.goals.length, 1);
    assert.equal(s.profile.activeGoalId, s.goals[0].id);
    assert.equal(s.activeGoal.type, 'lose');
    await new Promise(r => setTimeout(r, 450));                 // the profile write is debounced
    const s2 = new Store();
    await s2.start('guest');
    assert.equal(s2.goals.length, 1, 'persisted, not regenerated');
    assert.equal(s2.activeGoal.id, s.goals[0].id);
  } finally { restore(); }
});

test('a brand-new guest has no goal until onboarding makes one', async () => {
  const restore = withLocalStorage();
  try {
    const s = new Store();
    await s.start('guest');
    assert.equal(s.goals.length, 0);
    assert.equal(s.activeGoal, null);
  } finally { restore(); }
});

test('activating a plan archives the previous one; check-ins are keyed by week', async () => {
  const restore = withLocalStorage({ 'ff.guest.profile': { goal: 'gain', weight: 60, goalWeight: 66, pace: 0.25, onboarded: true } });
  try {
    const s = new Store();
    await s.start('guest');
    const first = s.activeGoal;
    s.saveGoal({ ...first, id: 'second', status: 'active' }, { activate: true });
    assert.equal(s.profile.activeGoalId, 'second');
    assert.equal(s.goals.find(g => g.id === first.id).status, 'archived');
    s.saveCheckIn({ week: '2026-W10', date: '2026-03-06', decision: 'on-track' });
    s.saveCheckIn({ week: '2026-W10', date: '2026-03-07', decision: 'watch' });
    s.saveCheckIn({ week: '2026-W09', date: '2026-02-28', decision: 'on-track' });
    assert.deepEqual(s.checkins.map(c => c.week), ['2026-W09', '2026-W10']);
    assert.equal(s.checkins[1].decision, 'watch');
  } finally { restore(); }
});

test('"not this today" overrides are kept on the day and default to empty', async () => {
  const { normDay, emptyDay } = await import('../../js/store.js');
  assert.deepEqual(emptyDay().dayOverrides, {});
  assert.deepEqual(normDay({ items: [] }).dayOverrides, {});
  const d = normDay({ items: [], dayOverrides: { dinner: [{ n: 'Egg curry', cal: 200, p: 14, c: 6, f: 12 }] } });
  assert.equal(d.dayOverrides.dinner[0].n, 'Egg curry');
  assert.deepEqual(normDay({ dayOverrides: ['bad'] }).dayOverrides, {});
});

test('cloud: plans, goals and check-ins live under the user, not at the top level', async () => {
  const docs = {};
  const sub = (path) => ({
    doc: id => ({ get: async () => ({ exists: docs[`${path}/${id}`] !== undefined, data: () => docs[`${path}/${id}`] }), set: async v => { docs[`${path}/${id}`] = v; } }),
    get: async () => ({ docs: Object.keys(docs).filter(k => k.startsWith(path + '/')).map(k => ({ id: k.split('/').pop(), data: () => docs[k] })), forEach() {} }),
  });
  const db = { collection: c => ({ doc: id => ({ get: async () => ({ exists: !!docs[`${c}/${id}`], data: () => docs[`${c}/${id}`] }), set: async v => { docs[`${c}/${id}`] = v; }, collection: n => sub(`${c}/${id}/${n}`) }) }) };
  docs['users/u1'] = { goal: 'gain', weight: 60, goalWeight: 65, pace: 0.25, onboarded: true };
  const s = cloudStore(db);
  await s.start('cloud', s.user);
  await new Promise(r => setTimeout(r, 50));
  const paths = Object.keys(docs).filter(k => k.includes('/goals/'));
  assert.deepEqual(paths, [`users/u1/goals/${s.activeGoal.id}`]);
  s.saveCheckIn({ week: '2026-W10', date: '2026-03-06', decision: 'on-track' });
  s.writePlan('2026-03-06', { date: '2026-03-06', version: 1 });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(docs['users/u1/checkins/2026-W10']);
  assert.ok(docs['users/u1/plans/2026-03-06']);
  s.stop();
});
