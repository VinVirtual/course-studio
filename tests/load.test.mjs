import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { lessonLines, sectionsOf } from '../cli/lib/blocks.mjs';
import { checkBlock, CourseError, loadCourse } from '../cli/lib/load.mjs';
import { EXAMPLE, lesson, tempDir } from './helpers.mjs';

test('the example course loads with lessons in order and a glossary', () => {
  const loaded = loadCourse(EXAMPLE);
  assert.deepEqual(loaded.problems, []);
  assert.deepEqual(loaded.lessons.map((item) => item.id), ['water-into-air', 'clouds', 'raindrops']);
  assert.deepEqual(loaded.lessons.map((item) => item.number), [1, 2, 3]);
  assert.equal(loaded.glossary.length, 9);
  assert.equal(loaded.course.theme.preset, 'ink');
});

test('block shapes are checked', () => {
  assert.deepEqual(checkBlock({ type: 'paragraph', text: 'x' }, 'w'), []);
  assert.match(checkBlock({ type: 'table' }, 'w')[0].message, /unknown block type/);
  assert.match(checkBlock({ type: 'figure', src: 'a.svg', caption: 'c' }, 'w')[0].message, /needs "alt"/);
  assert.match(checkBlock({ type: 'list', items: [] }, 'w')[0].message, /list of text/);
  assert.match(checkBlock({ type: 'paragraph', text: 'x', colour: 'red' }, 'w')[0].message, /unknown field "colour"/);
  assert.match(checkBlock({ type: 'callout', text: 'x', tone: 'loud' }, 'w')[0].message, /tone/);
});

test('shape problems in a course are collected, not thrown', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'lessons'));
  writeFileSync(join(dir, 'course.json'), JSON.stringify({ title: 'T', lessons: ['lessons/a.json', 'lessons/b.json'], theme: { preset: 'neon' } }));
  writeFileSync(join(dir, 'lessons', 'a.json'), JSON.stringify({ id: 'same', title: 'A', blocks: [{ type: 'paragraph', text: 'x' }], quiz: [{ question: 'Q', options: ['a', 'b'], answer: 5, proof: 'x' }] }));
  writeFileSync(join(dir, 'lessons', 'b.json'), JSON.stringify({ id: 'same', blocks: [] }));
  const messages = loadCourse(dir).problems.map((problem) => problem.message).join('\n');
  for (const expected of [/preset must be/, /"answer" must be the index/, /lesson needs "title"/, /lesson needs "blocks"/, /used twice/]) assert.match(messages, expected);
});

test('missing or broken files throw a CourseError', () => {
  const dir = tempDir();
  assert.throws(() => loadCourse(dir), CourseError);
  writeFileSync(join(dir, 'course.json'), '{ not json');
  assert.throws(() => loadCourse(dir), /not valid JSON/);
});

test('sections split at headings and number duplicate titles', () => {
  const sections = sectionsOf(lesson({ blocks: [{ type: 'paragraph', text: 'Intro.' }, { type: 'heading', text: 'Rain' }, { type: 'paragraph', text: 'A.' }, { type: 'heading', text: 'Rain' }, { type: 'code', text: 'x' }] }));
  assert.deepEqual(sections.map((section) => section.id), ['overview', 'rain', 'rain-2']);
  assert.deepEqual(sections[1].lines, ['Rain', 'A.']);
  assert.deepEqual(sections[2].lines, ['Rain']);
});

test('lesson lines are the sections then the recap, with markup removed', () => {
  const lines = lessonLines(lesson({ blocks: [{ type: 'paragraph', text: 'A [[term]] and [a link](#x).' }], recap: ['  Recap   line. '] }));
  assert.deepEqual(lines, ['A term and a link.', 'Recap line.']);
});
