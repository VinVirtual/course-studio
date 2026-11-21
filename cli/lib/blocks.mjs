// What each block says, how a lesson splits into sections, and which lines get a voice.
import { parseInline, plainText, slugify, tidy } from './text.mjs';

/** The source strings of a block that hold inline text, in reading order. */
export function blockTexts(block) {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return [block.text];
    case 'list':
      return block.items;
    case 'callout':
      return block.title ? [block.title, block.text] : [block.text];
    case 'example':
      return [block.title, ...block.steps, ...(block.result ? [block.result] : [])];
    case 'figure':
      return [block.caption];
    default:
      return [];
  }
}

/** Plain lines that are read aloud for a block. Code is never read aloud. */
export const spokenLines = (block) => (block.type === 'code' ? [] : blockTexts(block).map(plainText).filter(Boolean));

export const OPENING_TITLE = 'Overview';

/** Cuts a lesson at its headings. Blocks before the first heading form an opening section. */
export function sectionsOf(lesson) {
  const sections = [];
  const used = new Map();
  const add = (title) => {
    const base = slugify(title) || 'section';
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const section = { id: count > 1 ? `${base}-${count}` : base, title, heading: null, blocks: [], lines: [] };
    sections.push(section);
    return section;
  };
  for (const block of lesson.blocks) {
    if (block.type === 'heading') {
      const section = add(plainText(block.text));
      section.heading = block;
      section.lines.push(plainText(block.text));
      continue;
    }
    const section = sections.at(-1) ?? add(OPENING_TITLE);
    section.blocks.push(block);
    section.lines.push(...spokenLines(block));
  }
  return sections;
}

/** Every line of a lesson that gets a recording: sections in order, then the recap. */
export function lessonLines(lesson) {
  return [...sectionsOf(lesson).flatMap((section) => section.lines), ...lesson.recap.map(tidy)];
}

/** All lines of a course, de-duplicated, for site-narrator to record. */
export function courseLines(lessons) {
  return [...new Set(lessons.flatMap(lessonLines))];
}

/** Every sentence a reader can see in the lesson body, as plain text. Used to find quiz proofs. */
export function lessonPlainTexts(lesson) {
  return lesson.blocks.flatMap((block) => (block.type === 'code' ? [] : blockTexts(block).map(plainText)));
}

/** The inline marks of every text in a lesson, with where they came from. */
export function lessonMarks(lesson) {
  return lesson.blocks.flatMap((block, index) => blockTexts(block).flatMap((source) => parseInline(source).marks.map((mark) => ({ ...mark, block: index, source }))));
}
