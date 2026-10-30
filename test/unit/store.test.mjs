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
