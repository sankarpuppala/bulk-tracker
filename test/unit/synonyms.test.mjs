import test from 'node:test';
import assert from 'node:assert/strict';
import { expand, synonymsOf, GROUPS } from '../../js/engine/synonyms.js';

test('a word in any Indian language finds the English name, and the other way round', () => {
  assert.ok(expand('dahi').includes('curd'));
  assert.ok(expand('thayir').includes('curd'));
  assert.ok(expand('curd').includes('dahi'));
  assert.ok(expand('chawal').includes('rice'));
  assert.ok(expand('anda').includes('egg'));
  assert.ok(expand('bhindi').includes('okra'));
  assert.ok(expand('murgh').includes('chicken'));
});

test('phrases swap one word at a time, so "curd rice" still means rice', () => {
  const e = expand('curd rice');
  assert.ok(e.includes('thayir sadam') || e.includes('dahi rice') || e.includes('curd chawal'), e.join('|'));
  assert.ok(e.every(x => /rice|chawal|sadam|annam|bhaat|bhat|soru|choru|anna|mosaranna/.test(x)), e.join('|'));
});

test('the query itself always comes first, and the list stays short', () => {
  assert.equal(expand('dahi')[0], 'dahi');
  assert.ok(expand('rice').length <= 6);
  assert.ok(expand('chicken biryani rice bowl thing').length <= 6);
});

test('unknown and empty queries are passed through untouched', () => {
  assert.deepEqual(expand('quinoa risotto'), ['quinoa risotto']);
  assert.deepEqual(expand(''), []);
  assert.deepEqual(expand('   '), []);
  assert.deepEqual(synonymsOf('notafood'), []);
});

test('queries are normalised, so case and punctuation do not matter', () => {
  assert.ok(expand("  DAHI  ").includes('curd'));
  assert.ok(expand('Lady-Finger').includes('bhindi'));
});

test('groups are well-formed: no duplicate words across groups, nothing too short', () => {
  const seen = new Map();
  for (const [i, g] of GROUPS.entries()) {
    assert.ok(g.length >= 2, `group ${i} needs at least two words`);
    for (const w of g) {
      assert.equal(w, w.toLowerCase().trim(), `"${w}" must be lowercase and trimmed`);
      assert.ok(w.length >= 2, `"${w}" is too short to search on`);
      assert.ok(!seen.has(w), `"${w}" is in groups ${seen.get(w)} and ${i}; merge them`);
      seen.set(w, i);
    }
  }
});

test('synonyms never claim one food is another: meat words stay out of vegetarian groups', () => {
  // every word a group could use for a meat or egg food, in any of the languages above
  const MEAT = /^(chicken|murgh|murg|kodi|koli|mutton|gosht|goat meat|lamb|mamsam|fish|machli|machhi|meen|chepa|maasu|prawn|prawns|shrimp|jhinga|royya|eral|egg|eggs|anda|ande|muttai|kodi guddu|motte)$/;
  for (const g of GROUPS) {
    const meat = g.filter(w => MEAT.test(w));
    if (meat.length) assert.equal(meat.length, g.length, `group mixes meat and non-meat: ${g.join(', ')}`);
  }
});
