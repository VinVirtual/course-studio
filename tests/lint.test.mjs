import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_LIMITS, loadCourse } from '../cli/lib/load.mjs';
import { checkLink, lintCourse, lintFigures, lintGlossary, lintLength, lintLinks, lintQuiz, lintSources, toConfirm } from '../cli/lib/lint.mjs';
import { EXAMPLE, lesson, rules, tempDir } from './helpers.mjs';

test('the example course lints clean', () => {
  assert.deepEqual(lintCourse(loadCourse(EXAMPLE)).filter((item) => item.level === 'error'), []);
});

test('a lesson without sources is an error', () => {
  assert.ok(rules(lintSources(lesson({ sources: [], blocks: [{ type: 'heading', text: 'H' }] })), 'error').includes('no-sources'));
});

test('a number, a percentage or "studies show" without a citation is an uncited claim', () => {
  for (const text of ['About 90 percent comes from the sea.', 'Drops are 2 mm wide.', 'Studies show rain is wet.', 'Millions of droplets.']) {
    const found = lintSources(lesson({ blocks: [{ type: 'paragraph', text }] }));
    assert.ok(rules(found, 'error').includes('uncited-claim'), text);
  }
});

test('a claim marked "confirm" is a warning and is listed for the user', () => {
  const marked = lesson({ blocks: [{ type: 'paragraph', text: 'Drops are 2 mm wide.', confirm: 'not in the sources' }] });
  assert.deepEqual(rules(lintSources(marked), 'error'), []);
  assert.ok(rules(lintSources(marked)).includes('unconfirmed-claim'));
  assert.equal(toConfirm([marked])[0].why, 'not in the sources');
});

test('plain prose without a citation is a warning; unknown and unused sources are reported', () => {
  const found = lintSources(lesson({ blocks: [{ type: 'paragraph', text: 'Rain is wet.' }, { type: 'paragraph', text: 'Snow is cold.', cite: ['nope'] }] }));
  assert.ok(rules(found, 'warning').includes('uncited'));
  assert.ok(rules(found, 'error').includes('unknown-source'));
  assert.ok(rules(found, 'warning').includes('unused-source'));
});

test('long lessons, paragraphs and sentences are flagged', () => {
  const long = Array.from({ length: 40 }, () => 'word').join(' ');
  const found = lintLength(lesson({ blocks: [{ type: 'paragraph', text: `${long}.` }] }), { ...DEFAULT_LIMITS, lessonWords: 30, paragraphWords: 30 });
  assert.deepEqual(rules(found).filter((rule) => rule !== 'no-quiz').sort(), ['lesson-too-long', 'paragraph-too-long', 'sentence-too-long']);
  assert.ok(rules(lintLength(lesson({ recap: [], takeaways: [] }), DEFAULT_LIMITS)).includes('no-recap'));
});

test('[[terms]] must be in the glossary; unused glossary entries are warned about', () => {
  const glossary = [{ id: 'rain', term: 'Rain', aliases: [], definition: 'd' }, { id: 'hail', term: 'Hail', aliases: [], definition: 'd', lesson: 'ghost' }];
  const found = lintGlossary([lesson({ blocks: [{ type: 'paragraph', text: 'Rain and [[sleet]].' }] })], glossary);
  assert.deepEqual(rules(found, 'error').sort(), ['undefined-term', 'unknown-lesson']);
  assert.ok(found.some((item) => item.rule === 'unused-term' && item.message.includes('Hail')));
});

test('a quiz answer must be proved by a sentence in the lesson', () => {
  const quiz = (proof, options = ['Heat', 'Cold']) => lintQuiz(lesson({ quiz: [{ question: 'What turns water into vapour?', options, answer: 0, proof }] }));
  assert.deepEqual(quiz('Water turns into vapour when it is heated.'), []);
  assert.deepEqual(rules(quiz('Water boils at sea level.')), ['proof-not-found']);
  assert.deepEqual(rules(quiz('Water turns into vapour when it is heated.', ['Cold air from mountains', 'Heat'])), ['answer-not-in-proof']);
  assert.ok(rules(quiz('Water turns into vapour when it is heated.', ['Heat', 'heat'])).includes('duplicate-option'));
});

test('links: lessons, sections, glossary terms, anchors, files and schemes', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'notes.pdf'), 'x');
  const a = lesson({ id: 'a', blocks: [{ type: 'heading', text: 'Start here' }] });
  const context = { lesson: a, lessons: [a], glossary: [{ id: 'rain', term: 'Rain', aliases: [] }], dir };
  assert.equal(checkLink('lesson:a#start-here', context), null);
  assert.match(checkLink('lesson:b', context), /no lesson "b"/);
  assert.match(checkLink('lesson:a#nope', context), /no section "nope"/);
  assert.equal(checkLink('glossary:rain', context), null);
  assert.match(checkLink('glossary:snow', context), /no glossary term/);
  assert.equal(checkLink('#start-here', context), null);
  assert.equal(checkLink('notes.pdf', context), null);
  assert.match(checkLink('missing.pdf', context), /file not found/);
  assert.match(checkLink('javascript:alert(1)', context), /may only use/);
  assert.match(checkLink('https://exa mple', context), /not a valid address/);
  const found = lintLinks(lesson({ blocks: [{ type: 'paragraph', text: 'See [x](lesson:zzz).', cite: ['s1'] }] }), context);
  assert.deepEqual(rules(found), ['broken-link']);
});

test('figures: alt text, missing files, remote images, unsafe SVG, raster sizes', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'f'));
  writeFileSync(join(dir, 'f', 'ok.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
  writeFileSync(join(dir, 'f', 'bad.svg'), '<svg onload="alert(1)"><script>x</script></svg>');
  writeFileSync(join(dir, 'f', 'a.png'), 'png');
  const fig = (src, alt = 'A long description of what the drawing shows.', extra = {}) => ({ type: 'figure', src, alt, caption: 'Caption.', cite: ['s1'], ...extra });
  const check = (block) => rules(lintFigures(lesson({ blocks: [block] }), dir));
  assert.deepEqual(check(fig('f/ok.svg')), []);
  assert.deepEqual(check(fig('f/none.svg')), ['missing-image']);
  assert.deepEqual(check(fig('https://example.org/x.png')), ['remote-image']);
  assert.deepEqual(check(fig('f/bad.svg')), ['unsafe-svg']);
  assert.deepEqual(check(fig('f/ok.svg', 'image')), ['weak-alt']);
  assert.deepEqual(check(fig('f/a.png')), ['image-size']);
  assert.deepEqual(check(fig('f/a.png', undefined, { width: 10, height: 10 })), []);
});
