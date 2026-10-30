import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlags, DEFAULT_FLAGS, allFlags, flag, setFlag } from '../../js/flags.js';

test('unfinished features ship dark by default', () => {
  assert.ok(Object.values(DEFAULT_FLAGS).every(v => v === false));
});

test('resolveFlags merges boolean overrides and ignores junk', () => {
  const r = resolveFlags({ a: false, b: true }, { a: true, b: 'yes', c: true });
  assert.deepEqual(r, { a: true, b: true });
});

test('resolveFlags tolerates missing or invalid overrides', () => {
  assert.deepEqual(resolveFlags({ a: false }, null), { a: false });
  assert.deepEqual(resolveFlags({ a: false }, 'x'), { a: false });
});

test('flag() works with no localStorage available (Node, private mode)', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined');
  assert.deepEqual(allFlags(), DEFAULT_FLAGS);
  assert.equal(flag('snap'), false);
  assert.equal(setFlag('nope', true), false);
});

test('overrides persist through localStorage', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  try {
    assert.equal(setFlag('verdict', true), true);
    assert.equal(flag('verdict'), true);
    assert.equal(flag('snap'), false);
  } finally { delete globalThis.localStorage; }
});
