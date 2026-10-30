import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, looksLikeKey, maskKey, friendly, makeCooldown, interpret, MAX_EDGE } from '../../js/engine/aicore.js';

test('images are fitted to 1024 px on the long edge and never upscaled', () => {
  assert.deepEqual(fitWithin(4000, 3000), { w: 1024, h: 768 });
  assert.deepEqual(fitWithin(3000, 4000), { w: 768, h: 1024 });
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 });
  assert.ok(Object.values(fitWithin(10000, 1)).every(v => v >= 1));
  assert.equal(MAX_EDGE, 1024);
});

test('key shape and masking', () => {
  assert.equal(looksLikeKey('AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY'), true);
  assert.equal(looksLikeKey('sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx'), false);
  assert.equal(looksLikeKey(''), false);
  assert.equal(maskKey('AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY'), 'AIza••••BWY'.replace('BWY', 'MBWY'));
});

test('every error code has a friendly state with an action', () => {
  for (const c of ['offline', 'unconfigured', 'signin', 'unauthorized', 'no_key', 'bad_key', 'quota', 'paced', 'too_large', 'upstream', 'network', 'invalid_output', 'model_unavailable']) {
    const s = friendly(c); assert.ok(s.title && s.text, c); assert.ok('action' in s);
  }
  assert.equal(friendly('no_key').action, 'add-key');
  assert.equal(friendly('quota').action, 'search');
  assert.doesNotMatch(friendly('quota').text, /429|RESOURCE/);
  assert.equal(friendly('something-new').code, 'something-new');
});

test('a double tap is held back by the cooldown', () => {
  const c = makeCooldown(4000);
  assert.equal(c.ready('vision/meal', 0), true);
  c.mark('vision/meal', 0);
  assert.equal(c.ready('vision/meal', 1000), false);
  assert.equal(c.ready('parse/ask', 1000), true, 'other routes are independent');
  assert.equal(c.ready('vision/meal', 4000), true);
});

test('gateway outcomes map to friendly states', () => {
  assert.equal(interpret(200, { ok: true, data: { a: 1 }, prompt: 'p@1' }).data.a, 1);
  assert.equal(interpret(0, null).error.code, 'network');
  assert.equal(interpret(200, null, { offline: true }).error.code, 'offline');
  assert.equal(interpret(401, { ok: false, code: 'unauthorized' }).error.code, 'unauthorized');
  assert.equal(interpret(403, { ok: false, code: 'no_key' }).error.action, 'add-key');
  assert.equal(interpret(429, { ok: false, code: 'quota' }).error.code, 'quota');
  assert.equal(interpret(429, null).error.code, 'quota', 'a bare 429 is still the quota message');
  assert.equal(interpret(413, null).error.code, 'too_large');
  assert.equal(interpret(500, null).error.code, 'upstream');
});
