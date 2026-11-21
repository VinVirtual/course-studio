import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { narratorPlayer } from '../cli/lib/paths.mjs';
import { countWords, escapeHtml, looseText, parseInline, plainText, sentences, slugify, tidy, voiceKey } from '../cli/lib/text.mjs';

test('parseInline turns [[term]] and [label](href) into plain text with marks', () => {
  const { text, marks } = parseInline('See [[dew point]] and [the glossary](glossary:dew point).');
  assert.equal(text, 'See dew point and the glossary.');
  assert.deepEqual(marks.map((mark) => [mark.kind, text.slice(mark.start, mark.end)]), [['term', 'dew point'], ['link', 'the glossary']]);
  assert.equal(marks[1].href, 'glossary:dew point');
});

test('[[shown|term]] shows one word and points at another', () => {
  const { text, marks } = parseInline('Clouds of [[droplets|cloud droplet]].');
  assert.equal(text, 'Clouds of droplets.');
  assert.equal(marks[0].term, 'cloud droplet');
});

test('escaped brackets and stray brackets stay as text', () => {
  assert.equal(plainText('a \\[1\\] b [not a link] c'), 'a [1] b [not a link] c');
  assert.equal(plainText('[[unclosed'), '[[unclosed');
});

test('white space is folded like site-narrator does, and marks move with it', () => {
  const { text, marks } = parseInline('  one\n  [two](#x)   three ');
  assert.equal(text, 'one two three');
  assert.equal(text.slice(marks[0].start, marks[0].end), 'two');
});

test('a term inside a link label is kept as a mark inside the link', () => {
  const { text, marks } = parseInline('[about [[rain]]](lesson:a)');
  assert.equal(text, 'about rain');
  assert.deepEqual(marks.map((mark) => mark.kind).sort(), ['link', 'term']);
});

test('voiceKey is FNV-1a of the tidied text plus its length', () => {
  assert.equal(voiceKey('a'), 'e40c292c1');
  assert.equal(voiceKey('  a  '), voiceKey('a'));
  assert.notEqual(voiceKey('a.'), voiceKey('a'));
});

test('voiceKey matches the installed site-narrator player', { skip: !existsSync(narratorPlayer()) && 'site-narrator not installed' }, async () => {
  const player = await import(narratorPlayer());
  for (const line of ['Rain starts as water on the ground.', 'Café “quotes” — and\nnew lines', '']) assert.equal(voiceKey(line), player.voiceKey(line));
});

test('sentences, words, slugs, escaping and loose text', () => {
  assert.deepEqual(sentences('One two. Three? “Four” five! 6 is a number.'), ['One two.', 'Three?', '“Four” five!', '6 is a number.']);
  assert.equal(countWords("It's 10 microns, not 1 mm."), 6);
  assert.equal(slugify('Cooling to the dew point!'), 'cooling-to-the-dew-point');
  assert.equal(slugify('Café crème'), 'cafe-creme');
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(looseText('“Earth’s” — ok'), '"Earth\'s" - ok');
  assert.equal(tidy(' a  b '), 'a b');
});
