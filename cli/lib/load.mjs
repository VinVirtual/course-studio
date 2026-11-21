// Reads a course folder: course.json, one JSON file per lesson, an optional glossary.json.
// Shape problems are collected (not thrown) so `course lint` can report all of them at once.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { slugify, tidy, uniqueIds } from './text.mjs';

export const BLOCK_TYPES = {
  heading: { required: ['text'], optional: [] },
  paragraph: { required: ['text'], optional: ['cite', 'confirm'] },
  list: { required: ['items'], optional: ['ordered', 'cite', 'confirm'] },
  callout: { required: ['text'], optional: ['title', 'tone', 'cite', 'confirm'] },
  example: { required: ['title', 'steps'], optional: ['result', 'cite', 'confirm'] },
  figure: { required: ['src', 'alt', 'caption'], optional: ['width', 'height', 'cite', 'confirm', 'credit'] },
  code: { required: ['text'], optional: ['lang', 'caption'] },
  quote: { required: ['text'], optional: ['by', 'cite', 'confirm'] },
};
const COMMON = ['type'];
const CALLOUT_TONES = ['note', 'tip', 'warning'];
const LESSON_FIELDS = ['id', 'title', 'summary', 'minutes', 'blocks', 'takeaways', 'recap', 'quiz', 'sources'];
const COURSE_FIELDS = ['title', 'subtitle', 'audience', 'author', 'language', 'lessons', 'glossary', 'theme', 'voice', 'limits', 'footer', 'video'];
const THEME_PRESETS = ['paper', 'ink', 'moss'];

export const DEFAULT_LIMITS = {
  lessonWords: 1400,
  paragraphWords: 120,
  sentenceWords: 35,
  recapLines: 6,
};

export class CourseError extends Error {}

function readJson(file, what) {
  if (!existsSync(file)) throw new CourseError(`${what} not found: ${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CourseError(`${what} is not valid JSON (${file}): ${error.message}`);
  }
}

/** Finds course.json from a folder or a file path. */
export function courseFile(target = '.') {
  const full = resolve(target);
  return full.endsWith('.json') ? full : join(full, 'course.json');
}

const isText = (value) => typeof value === 'string' && tidy(value).length > 0;
const isTextList = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);

/** Checks one block's shape. Returns problems as { where, message }. */
export function checkBlock(block, where) {
  if (!block || typeof block !== 'object') return [{ where, message: 'a block must be an object' }];
  const spec = BLOCK_TYPES[block.type];
  if (!spec) return [{ where, message: `unknown block type "${block.type}" (use ${Object.keys(BLOCK_TYPES).join(', ')})` }];
  const problems = [];
  for (const field of spec.required) {
    const value = block[field];
    const ok = field === 'items' || field === 'steps' ? isTextList(value) : isText(value);
    if (!ok) problems.push({ where, message: `${block.type} needs "${field}"${field === 'items' || field === 'steps' ? ' (a list of text)' : ''}` });
  }
  for (const field of Object.keys(block)) {
    if (!COMMON.includes(field) && !spec.required.includes(field) && !spec.optional.includes(field)) problems.push({ where, message: `unknown field "${field}" on ${block.type}` });
  }
  if (block.cite !== undefined && !(Array.isArray(block.cite) && block.cite.every(isText))) problems.push({ where, message: '"cite" must be a list of source ids' });
  if (block.confirm !== undefined && !isText(block.confirm)) problems.push({ where, message: '"confirm" must say why the claim needs checking (a non-empty text)' });
  if (block.tone !== undefined && !CALLOUT_TONES.includes(block.tone)) problems.push({ where, message: `callout tone must be one of ${CALLOUT_TONES.join(', ')}` });
  return problems;
}

function checkQuiz(quiz, where) {
  if (quiz === undefined) return [];
  if (!Array.isArray(quiz)) return [{ where, message: '"quiz" must be a list' }];
  return quiz.flatMap((item, index) => {
    const at = `${where}[${index}]`;
    const problems = [];
    if (!isText(item?.question)) problems.push({ where: at, message: 'needs "question"' });
    if (!isTextList(item?.options) || item.options.length < 2) problems.push({ where: at, message: 'needs at least two "options"' });
    else if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) problems.push({ where: at, message: `"answer" must be the index (0 to ${item.options.length - 1}) of the right option` });
    if (!isText(item?.proof)) problems.push({ where: at, message: 'needs "proof": the sentence in the lesson that shows the answer' });
    return problems;
  });
}

function checkSources(sources, where) {
  if (sources === undefined) return [];
  if (!Array.isArray(sources)) return [{ where, message: '"sources" must be a list' }];
  return sources.flatMap((source, index) => {
    const at = `${where}[${index}]`;
    const problems = [];
    if (!isText(source?.id)) problems.push({ where: at, message: 'needs "id"' });
    if (!isText(source?.title)) problems.push({ where: at, message: 'needs "title"' });
    if (!isText(source?.url) && !isText(source?.citation)) problems.push({ where: at, message: 'needs "url" or "citation" (for a book or a document with no address)' });
    return problems;
  });
}

/** Loads a lesson file and fills in defaults. */
export function loadLesson(file, index) {
  const raw = readJson(file, 'lesson');
  const name = basename(file).replace(/\.json$/, '').replace(/^\d+[-_]/, '');
  const lesson = {
    id: slugify(raw.id ?? name) || `lesson-${index + 1}`,
    title: raw.title ?? '',
    summary: raw.summary ?? '',
    minutes: raw.minutes,
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    takeaways: raw.takeaways ?? [],
    recap: raw.recap ?? [],
    quiz: Array.isArray(raw.quiz) ? raw.quiz : [],
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    file,
    number: index + 1,
  };
  const where = basename(file);
  const problems = [];
  if (!isText(raw.title)) problems.push({ where, message: 'lesson needs "title"' });
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) problems.push({ where, message: 'lesson needs "blocks"' });
  for (const field of Object.keys(raw)) if (!LESSON_FIELDS.includes(field)) problems.push({ where, message: `unknown lesson field "${field}"` });
  lesson.blocks.forEach((block, at) => problems.push(...checkBlock(block, `${where} blocks[${at}]`)));
  for (const field of ['takeaways', 'recap']) if (raw[field] !== undefined && !(Array.isArray(raw[field]) && raw[field].every(isText))) problems.push({ where, message: `"${field}" must be a list of text` });
  problems.push(...checkQuiz(raw.quiz, `${where} quiz`), ...checkSources(raw.sources, `${where} sources`));
  return { lesson, problems };
}

function loadGlossary(dir, field) {
  const file = join(dir, field ?? 'glossary.json');
  if (!field && !existsSync(file)) return { glossary: [], problems: [], file: null };
  const raw = readJson(file, 'glossary');
  const list = Array.isArray(raw) ? raw : raw?.terms;
  if (!Array.isArray(list)) return { glossary: [], problems: [{ where: basename(file), message: 'glossary must be a list of { term, definition }' }], file };
  const problems = [];
  const unique = uniqueIds();
  const glossary = list.map((entry, index) => {
    const where = `${basename(file)}[${index}]`;
    if (!isText(entry?.term)) problems.push({ where, message: 'needs "term"' });
    if (!isText(entry?.definition)) problems.push({ where, message: 'needs "definition"' });
    return { term: tidy(entry?.term), aliases: (entry?.aliases ?? []).map(tidy), definition: tidy(entry?.definition), lesson: entry?.lesson ?? null, cite: entry?.cite ?? [], id: unique(slugify(entry?.term) || `term-${index + 1}`) };
  });
  return { glossary, problems, file };
}

/** Loads a whole course. Throws CourseError only when a file cannot be read at all. */
export function loadCourse(target = '.') {
  const file = courseFile(target);
  const dir = dirname(file);
  const raw = readJson(file, 'course.json');
  const problems = [];
  if (!isText(raw.title)) problems.push({ where: 'course.json', message: 'needs "title"' });
  if (!Array.isArray(raw.lessons) || raw.lessons.length === 0) problems.push({ where: 'course.json', message: 'needs "lessons": the lesson files in reading order' });
  for (const field of Object.keys(raw)) if (!COURSE_FIELDS.includes(field)) problems.push({ where: 'course.json', message: `unknown field "${field}"` });
  const theme = { preset: 'paper', ...(raw.theme ?? {}) };
  if (!THEME_PRESETS.includes(theme.preset)) problems.push({ where: 'course.json theme', message: `preset must be one of ${THEME_PRESETS.join(', ')}` });
  if (theme.accent && !/^#[0-9a-f]{6}$/i.test(theme.accent)) problems.push({ where: 'course.json theme', message: 'accent must be a colour like #175a72' });

  const lessons = [];
  (raw.lessons ?? []).forEach((path, index) => {
    const { lesson, problems: found } = loadLesson(join(dir, path), index);
    lessons.push(lesson);
    problems.push(...found);
  });
  const ids = new Set();
  for (const lesson of lessons) {
    if (ids.has(lesson.id)) problems.push({ where: basename(lesson.file), message: `lesson id "${lesson.id}" is used twice` });
    ids.add(lesson.id);
  }
  const { glossary, problems: glossaryProblems, file: glossaryFile } = loadGlossary(dir, raw.glossary);
  problems.push(...glossaryProblems);

  const course = {
    title: raw.title ?? '',
    subtitle: raw.subtitle ?? '',
    audience: raw.audience ?? '',
    author: raw.author ?? '',
    language: raw.language ?? 'en',
    footer: raw.footer ?? '',
    theme,
    voice: { voice: 'af_heart', speed: 0.96, say: {}, ...(raw.voice ?? {}) },
    video: raw.video ?? {},
    limits: { ...DEFAULT_LIMITS, ...(raw.limits ?? {}) },
    slug: slugify(raw.title ?? 'course') || 'course',
  };
  return { dir, file, course, lessons, glossary, glossaryFile, problems };
}
