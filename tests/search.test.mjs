import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIndex, editDistance, search, snippet, wordsOf } from '../site/js/search-core.js';

const index = buildIndex([
  { kind: 'lesson', title: 'Water goes up', section: '', text: 'Before rain can fall, water has to reach the sky.', url: 'a/' },
  { kind: 'section', title: 'Clouds', section: 'Cooling to the dew point', text: 'Clouds form when the air cools below the dew point.', url: 'b/#c' },
  { kind: 'term', title: 'Coalescence', section: 'Glossary', text: 'Droplets bumping into each other and merging.', url: 'g/#coalescence' },
]);

test('words are folded, stemmed and stripped of stop words', () => {
  assert.deepEqual(wordsOf('The clouds are cooling'), ['cloud', 'cool']);
  assert.deepEqual(wordsOf('Café droplets'), ['cafe', 'droplet']);
});

test('every typed word must match', () => {
  assert.equal(search(index, 'dew point')[0].url, 'b/#c');
  assert.deepEqual(search(index, 'dew sky'), []);
});

test('the last word matches as a prefix, so results come while typing', () => {
  assert.equal(search(index, 'coale')[0].title, 'Coalescence');
});

test('small typos still find the word', () => {
  assert.equal(search(index, 'coalesence')[0].title, 'Coalescence');
  assert.equal(search(index, 'droplest')[0].title, 'Coalescence');
  assert.equal(editDistance('rain', 'rian'), 2);
});

test('title matches rank above body matches', () => {
  const results = search(index, 'clouds');
  assert.equal(results[0].url, 'b/#c');
});

test('empty and stop-word-only queries give nothing', () => {
  assert.deepEqual(search(index, '   '), []);
  assert.deepEqual(search(index, 'the and of'), []);
});

test('snippet marks the matched word', () => {
  const piece = snippet('Clouds form when the air cools below the dew point.', 'cool');
  assert.equal(piece.match, 'cools');
  assert.match(piece.before, /air $/);
});
