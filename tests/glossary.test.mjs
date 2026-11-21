import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findTerms, lookupTerm, termMatcher } from '../cli/lib/glossary.mjs';
import { parseInline } from '../cli/lib/text.mjs';

const glossary = [
  { id: 'condensation', term: 'Condensation', aliases: [], definition: 'd' },
  { id: 'condensation-nuclei', term: 'Condensation nuclei', aliases: [], definition: 'd' },
  { id: 'water-vapour', term: 'Water vapour', aliases: ['vapour'], definition: 'd' },
];
const matcher = termMatcher(glossary);
const shown = (text, marks) => marks.map((mark) => text.slice(mark.start, mark.end));

test('the longest name wins and each term is marked once', () => {
  const text = 'Condensation nuclei help condensation. Condensation again.';
  const marks = findTerms(text, matcher);
  assert.deepEqual(shown(text, marks), ['Condensation nuclei', 'condensation']);
});

test('aliases and plurals match, case does not matter', () => {
  const text = 'Vapours rise.';
  assert.deepEqual(shown(text, findTerms(text, matcher)), ['Vapours']);
});

test('the seen set is shared across a lesson', () => {
  const seen = new Set();
  findTerms('water vapour', matcher, seen);
  assert.deepEqual(findTerms('more vapour', matcher, seen), []);
});

test('no term inside a link, and an explicit [[term]] is used where it is written', () => {
  const linked = parseInline('[condensation](lesson:x) then condensation');
  assert.deepEqual(shown(linked.text, findTerms(linked.text, matcher, new Set(), linked.marks)), ['condensation']);
  assert.equal(findTerms(linked.text, matcher, new Set(), linked.marks)[0].start, linked.text.lastIndexOf('condensation'));
  const explicit = parseInline('the [[vapour]] here, vapour there');
  assert.equal(findTerms(explicit.text, matcher, new Set(), explicit.marks)[0].start, 4);
});

test('words that only contain a term are not marked', () => {
  assert.deepEqual(findTerms('precondensation vapourware', matcher), []);
});

test('lookupTerm finds names, aliases and plurals; unknown is null', () => {
  assert.equal(lookupTerm(matcher.names, 'Vapour').id, 'water-vapour');
  assert.equal(lookupTerm(matcher.names, 'condensations').id, 'condensation');
  assert.equal(lookupTerm(matcher.names, 'hail'), null);
});
