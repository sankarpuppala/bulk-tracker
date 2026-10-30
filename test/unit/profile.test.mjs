import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProfile, profileV2Defaults, PROFILE_SCHEMA } from '../../js/engine/profile.js';

const v1 = {
  name: 'Sai', sex: 'male', age: 20, height: 170, weight: 60, goalWeight: 70,
  goal: 'gain', pace: 0.25, activity: 'moderate', diet: 'nonveg', mess: 'CNV', plan: 'ppl5',
  favorites: ['egg'], customFoods: [{ id: 'x' }], menuOverrides: { CNV: { Monday: {} } }, onboarded: true,
};

test('v1 → v2 adds the new fields and keeps every v1 field untouched', () => {
  const m = migrateProfile(v1);
  assert.equal(m.schema, PROFILE_SCHEMA);
  for (const [k, v] of Object.entries(v1)) assert.deepEqual(m[k], v, k);
  assert.deepEqual(m.allergies, []);
  assert.deepEqual(m.dietTags, []);
  assert.deepEqual(m.sources, {});
  assert.deepEqual(m.consents, {});
  assert.equal(m.locale, 'en-IN');
  assert.equal(m.activeGoalId, null);
});

test('is idempotent', () => {
  const once = migrateProfile(v1);
  assert.deepEqual(migrateProfile(once), once);
});

test('v2 → v2 preserves real values', () => {
  const v2 = { ...v1, schema: 2, allergies: ['peanut'], dietTags: ['jain'], locale: 'hi-IN', activeGoalId: 'g1', consents: { ai: 123 }, sources: { weekend: 'home' } };
  assert.deepEqual(migrateProfile(v2), v2);
});

test('does not mutate its input', () => {
  const input = structuredClone(v1);
  migrateProfile(input);
  assert.deepEqual(input, v1);
});

test('repairs wrong-typed fields instead of crashing', () => {
  const m = migrateProfile({ allergies: 'peanut', dietTags: [1, 'vegan'], sources: [], consents: null, locale: 5, activeGoalId: 9 });
  assert.deepEqual(m.allergies, []);
  assert.deepEqual(m.dietTags, ['vegan']);
  assert.deepEqual(m.sources, {});
  assert.deepEqual(m.consents, {});
  assert.equal(m.locale, 'en-IN');
  assert.equal(m.activeGoalId, null);
});

test('handles empty, null and non-object input', () => {
  for (const x of [undefined, null, {}, 'junk', 7, []]) {
    const m = migrateProfile(x);
    assert.equal(m.schema, PROFILE_SCHEMA);
    assert.deepEqual(m.allergies, []);
  }
});

test('never downgrades a profile from a newer build', () => {
  assert.equal(migrateProfile({ schema: 3, futureField: 1 }).schema, 3);
  assert.equal(migrateProfile({ schema: 3, futureField: 1 }).futureField, 1);
});

test('defaults are fresh objects each call', () => {
  const a = profileV2Defaults(), b = profileV2Defaults();
  a.allergies.push('x');
  assert.deepEqual(b.allergies, []);
});
