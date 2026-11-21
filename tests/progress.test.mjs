import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyProgress, lessonStatus, nextLesson, parseProgress, readCount, withQuiz, withRead, withSection } from '../site/js/progress-core.js';

test('progress updates return new objects and never mutate', () => {
  const start = emptyProgress();
  const next = withSection(start, 'a', 'intro');
  assert.notEqual(next, start);
  assert.deepEqual(start.sections, {});
  assert.equal(withSection(next, 'a', 'intro'), next);
});

test('status, next lesson and count', () => {
  let progress = withSection(emptyProgress(), 'b', 's');
  assert.equal(lessonStatus(progress, 'a'), 'new');
  assert.equal(lessonStatus(progress, 'b'), 'started');
  progress = withRead(progress, 'a');
  assert.equal(lessonStatus(progress, 'a'), 'read');
  assert.equal(nextLesson(progress, ['a', 'b']), 'b');
  assert.equal(readCount(progress, ['a', 'b']), 1);
  assert.equal(nextLesson(withRead(progress, 'b'), ['a', 'b']), null);
  assert.deepEqual(withQuiz(progress, 'a', 2, 3).quiz.a, { right: 2, total: 3 });
});

test('stored junk is cleaned, not trusted', () => {
  assert.deepEqual(parseProgress(null), emptyProgress());
  assert.deepEqual(parseProgress({ read: { a: true, b: 'yes' }, sections: { a: ['x', 3], b: 'no' }, quiz: { a: { right: 1, total: 2 }, b: { right: 'x' } } }), {
    read: { a: true },
    sections: { a: ['x'] },
    quiz: { a: { right: 1, total: 2 } },
  });
});
