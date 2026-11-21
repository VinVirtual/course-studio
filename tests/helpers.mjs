// Small builders for test data.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const EXAMPLE = new URL('../examples/how-rain-forms/', import.meta.url).pathname;

export const lesson = (extra = {}) => ({
  id: 'one',
  title: 'One',
  summary: '',
  blocks: [{ type: 'paragraph', text: 'Water turns into vapour when it is heated.', cite: ['s1'] }],
  takeaways: ['A takeaway.'],
  recap: ['A recap line.'],
  quiz: [],
  sources: [{ id: 's1', title: 'A source', url: 'https://example.org/a' }],
  file: '/course/lessons/01-one.json',
  number: 1,
  ...extra,
});

export const tempDir = () => mkdtempSync(join(tmpdir(), 'course-studio-test-'));
export const rules = (issues, level) => issues.filter((item) => !level || item.level === level).map((item) => item.rule);
