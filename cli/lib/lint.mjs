// Checks a course before it is built. Every rule returns { level, rule, where, message }.
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { blockTexts, sectionsOf } from './blocks.mjs';
import { findTerms, lookupTerm, termMatcher } from './glossary.mjs';
import { answerSupport, findProof } from './quiz.mjs';
import { sanitizeSvg } from './svg.mjs';
import { MIN_CONTRAST, themeTokens, worstContrast } from './theme.mjs';
import { courseFile } from './files.mjs';
import { countWords, parseInline, plainText, sentences, tidy } from './text.mjs';

const issue = (level, rule, where, message) => ({ level, rule, where, message });
const PROSE = ['paragraph', 'list', 'callout', 'example', 'quote', 'figure'];
// Things that read as checkable facts. Digits, percentages, number words from ten upward and words for
// fractions and multiples, quantity words, and appeals to research. "one" to "nine" are left out: they
// are too common in plain prose ("one idea", "two steps") to mean a statistic.
const NUMBER_WORDS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|dozens?|half|halves|twice|thrice|double|triple|quarter|quarters|percent|per cent';
const RESEARCH = 'study|studies|research|researchers|survey|scientists (?:found|say|estimate)|according to|on average|estimated?';
const CLAIM_SOURCE = `\\d|%|\\b(?:${NUMBER_WORDS}|${RESEARCH})\\b`;
const CLAIM = new RegExp(CLAIM_SOURCE, 'i');
const CLAIM_ALL = new RegExp(`\\d+(?:[.,]\\d+)?|%|\\b(?:${NUMBER_WORDS}|${RESEARCH})\\b`, 'gi');

/** The claim-like pieces of a text ("90", "%", "millions", "according to"), lower-cased. */
export const claimTokens = (text) => [...String(text).matchAll(CLAIM_ALL)].map((match) => match[0].toLowerCase().replace(/^per cent$/, 'percent').replace(/^%$/, 'percent'));

const VAGUE_ALT = /^(image|picture|photo|figure|diagram|graphic|illustration|chart|img)\b\.?$/i;
const SAFE_SCHEMES = /^(https?:|mailto:)/i;

const where = (lesson, index) => `${basename(lesson.file)} blocks[${index}]`;

export function lintSources(lesson) {
  const out = [];
  const known = new Set(lesson.sources.map((source) => source.id));
  const cited = new Set();
  if (lesson.sources.length === 0) out.push(issue('error', 'no-sources', basename(lesson.file), 'the lesson lists no sources. Every lesson must be written from sources the user provided'));
  lesson.blocks.forEach((block, index) => {
    for (const id of block.cite ?? []) {
      cited.add(id);
      if (!known.has(id)) out.push(issue('error', 'unknown-source', where(lesson, index), `cites "${id}", which is not in this lesson's sources`));
    }
    if (!PROSE.includes(block.type) || (block.cite ?? []).length) return;
    const text = blockTexts(block).map(plainText).join(' ');
    const claim = text.match(CLAIM);
    if (claim && block.confirm) out.push(issue('warning', 'unconfirmed-claim', where(lesson, index), `states a fact with no source, marked for the user to confirm: "${excerpt(text, claim.index)}"`));
    else if (claim) out.push(issue('error', 'uncited-claim', where(lesson, index), `states a fact ("${excerpt(text, claim.index)}") but cites no source. Add "cite", or "confirm" and ask the user`));
    else if (block.type !== 'figure' && !block.confirm) out.push(issue('warning', 'uncited', where(lesson, index), `cites no source: "${excerpt(text, 0)}"`));
  });
  for (const source of lesson.sources) {
    if (!cited.has(source.id)) out.push(issue('warning', 'unused-source', basename(lesson.file), `source "${source.id}" is never cited`));
    if (source.url && !isHttpUrl(source.url)) out.push(issue('error', 'bad-source-url', basename(lesson.file), `source "${source.id}" has an address that is not an http(s) URL: ${source.url}`));
  }
  return out;
}

function excerpt(text, at) {
  const start = Math.max(0, at - 30);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 70)}${text.length > start + 70 ? '…' : ''}`;
}

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** The claim-like pieces stated by the cited blocks of a lesson: what a recap, quiz or heading may repeat. */
function citedTokens(lesson) {
  return new Set(lesson.blocks.filter((block) => (block.cite ?? []).length).flatMap((block) => blockTexts(block).flatMap((text) => claimTokens(plainText(text)))));
}

/** True when every claim-like piece of `text` is also stated by a cited block. */
const supportedBy = (text, tokens) => claimTokens(text).every((token) => tokens.has(token));

/**
 * Text with no "cite" of its own (headings, summary, takeaways, recap, the quiz question and its right
 * answer) may only repeat numbers and claims that a cited block of the same lesson states.
 */
export function lintRestatedClaims(lesson) {
  const out = [];
  const corpus = citedTokens(lesson);
  const file = basename(lesson.file);
  const check = (where, text) => {
    const plain = plainText(text ?? '');
    if (CLAIM.test(plain) && !supportedBy(plain, corpus)) out.push(issue('error', 'uncited-claim', where, `"${excerpt(plain, 0)}" states a number or claim that no cited block of this lesson states`));
  };
  check(`${file} summary`, lesson.summary);
  lesson.blocks.forEach((block, index) => {
    if (block.type === 'heading') check(where(lesson, index), block.text);
  });
  lesson.takeaways.forEach((text, index) => check(`${file} takeaways[${index}]`, text));
  lesson.recap.forEach((text, index) => check(`${file} recap[${index}]`, text));
  lesson.quiz.forEach((item, index) => {
    check(`${file} quiz[${index}].question`, item.question);
    if (Array.isArray(item.options)) check(`${file} quiz[${index}].answer`, item.options[item.answer]);
  });
  return out;
}

/** Glossary definitions and the course subtitle may repeat claims stated in any cited lesson block. */
export function lintCourseClaims(lessons, glossary, course) {
  const out = [];
  const corpus = new Set(lessons.flatMap((lesson) => [...citedTokens(lesson)]));
  const check = (where, text) => {
    const plain = plainText(text ?? '');
    if (CLAIM.test(plain) && !supportedBy(plain, corpus)) out.push(issue('error', 'uncited-claim', where, `"${excerpt(plain, 0)}" states a number or claim that no cited lesson block states`));
  };
  glossary.forEach((entry) => check(`glossary "${entry.term}"`, entry.definition));
  check('course.json subtitle', course.subtitle);
  check('course.json title', course.title);
  return out;
}

export function lintLength(lesson, limits) {
  const out = [];
  const texts = lesson.blocks.flatMap((block) => (block.type === 'code' ? [] : blockTexts(block).map(plainText)));
  const words = texts.reduce((sum, text) => sum + countWords(text), 0);
  if (words > limits.lessonWords) out.push(issue('warning', 'lesson-too-long', basename(lesson.file), `${words} words; keep a lesson under ${limits.lessonWords} (split it in two)`));
  lesson.blocks.forEach((block, index) => {
    if (block.type === 'paragraph' && countWords(plainText(block.text)) > limits.paragraphWords) out.push(issue('warning', 'paragraph-too-long', where(lesson, index), `${countWords(plainText(block.text))} words; keep paragraphs under ${limits.paragraphWords}`));
    for (const text of block.type === 'code' ? [] : blockTexts(block).map(plainText)) {
      for (const sentence of sentences(text)) {
        if (countWords(sentence) > limits.sentenceWords) out.push(issue('warning', 'sentence-too-long', where(lesson, index), `${countWords(sentence)} words: "${excerpt(sentence, 0)}". Plain language: split it`));
      }
    }
  });
  if (lesson.recap.length === 0) out.push(issue('warning', 'no-recap', basename(lesson.file), 'no "recap" lines to play at the end'));
  if (lesson.recap.length > limits.recapLines) out.push(issue('warning', 'recap-too-long', basename(lesson.file), `${lesson.recap.length} recap lines; keep it to ${limits.recapLines}`));
  if (lesson.takeaways.length === 0) out.push(issue('warning', 'no-takeaways', basename(lesson.file), 'no "takeaways"'));
  if (lesson.quiz.length === 0) out.push(issue('warning', 'no-quiz', basename(lesson.file), 'no "quiz" questions'));
  return out;
}

export function lintGlossary(lessons, glossary) {
  const out = [];
  const matcher = termMatcher(glossary);
  const used = new Set();
  const ids = new Set(lessons.map((lesson) => lesson.id));
  for (const lesson of lessons) {
    const seen = new Set();
    lesson.blocks.forEach((block, index) => {
      for (const source of blockTexts(block)) {
        const { text, marks } = parseInline(source);
        for (const mark of marks.filter((item) => item.kind === 'term')) {
          if (!lookupTerm(matcher.names, mark.term)) out.push(issue('error', 'undefined-term', where(lesson, index), `[[${mark.term}]] is not in the glossary`));
        }
        for (const found of findTerms(text, matcher, new Set(), marks)) used.add(found.entry.id);
        findTerms(text, matcher, seen, marks);
      }
    });
  }
  for (const entry of glossary) {
    if (!used.has(entry.id)) out.push(issue('warning', 'unused-term', 'glossary', `"${entry.term}" never appears in a lesson`));
    if (entry.lesson && !ids.has(entry.lesson)) out.push(issue('error', 'unknown-lesson', 'glossary', `"${entry.term}" points at lesson "${entry.lesson}", which does not exist`));
  }
  return out;
}

export function lintQuiz(lesson) {
  const out = [];
  lesson.quiz.forEach((item, index) => {
    const at = `${basename(lesson.file)} quiz[${index}]`;
    if (!Array.isArray(item.options) || !Number.isInteger(item.answer)) return;
    const options = item.options.map((option) => tidy(option).toLowerCase());
    if (new Set(options).size !== options.length) out.push(issue('error', 'duplicate-option', at, 'two options are the same'));
    if (!item.proof) return;
    if (!findProof(lesson, item.proof)) {
      out.push(issue('error', 'proof-not-found', at, `the proof is not a sentence of this lesson: "${excerpt(item.proof, 0)}". Copy the sentence exactly`));
      return;
    }
    if (answerSupport(item) < 0.5) out.push(issue('warning', 'answer-not-in-proof', at, `the proving sentence does not say the answer "${item.options[item.answer]}". Pick the sentence that does, or reword the option`));
  });
  return out;
}

/** Checks one link target written in a lesson. Returns an error message or null. */
export function checkLink(href, { lesson, lessons, glossary, dir }) {
  if (!href) return 'empty link';
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(lesson|glossary):/i.test(href)) {
    if (!SAFE_SCHEMES.test(href)) return `links may only use https:, http:, mailto:, lesson: or glossary: (got ${href.split(':')[0]}:)`;
    if (/^https?:/i.test(href) && !isHttpUrl(href)) return `not a valid address: ${href}`;
    return null;
  }
  const sectionIds = (target) => new Set(sectionsOf(target).map((section) => section.id));
  if (href.startsWith('lesson:')) {
    const [id, hash] = href.slice(7).split('#');
    const target = lessons.find((item) => item.id === id);
    if (!target) return `no lesson "${id}"`;
    if (hash && !sectionIds(target).has(hash)) return `lesson "${id}" has no section "${hash}" (sections: ${[...sectionIds(target)].join(', ')})`;
    return null;
  }
  if (href.startsWith('glossary:')) return lookupTerm(termMatcher(glossary).names, href.slice(9)) ? null : `no glossary term "${href.slice(9)}"`;
  if (href.startsWith('#')) return sectionIds(lesson).has(href.slice(1)) ? null : `this lesson has no section "${href.slice(1)}"`;
  return courseFile(dir, href).error ?? null;
}

export function lintLinks(lesson, context) {
  const out = [];
  lesson.blocks.forEach((block, index) => {
    for (const source of blockTexts(block)) {
      for (const mark of parseInline(source).marks.filter((item) => item.kind === 'link')) {
        const problem = checkLink(mark.href, { ...context, lesson });
        if (problem) out.push(issue('error', 'broken-link', where(lesson, index), problem));
      }
    }
  });
  return out;
}

export function lintFigures(lesson, dir) {
  const out = [];
  lesson.blocks.forEach((block, index) => {
    if (block.type !== 'figure') return;
    const at = where(lesson, index);
    const alt = tidy(block.alt);
    if (!alt) return; // reported as a shape problem
    if (alt.length < 15 || VAGUE_ALT.test(alt)) out.push(issue('warning', 'weak-alt', at, `alt text "${alt}" does not describe what the figure shows`));
    if (alt === tidy(plainText(block.caption))) out.push(issue('warning', 'alt-is-caption', at, 'alt text repeats the caption; say what the picture shows instead'));
    if (/^[a-z]+:/i.test(block.src) || block.src.startsWith('//')) {
      out.push(issue('error', 'remote-image', at, 'figures must be files in the course folder; the site makes no requests to other servers'));
      return;
    }
    const found = courseFile(dir, block.src);
    if (found.error) {
      out.push(issue('error', 'missing-image', at, found.error));
      return;
    }
    const { file } = found;
    const ext = extname(file).toLowerCase();
    if (ext === '.svg') {
      const { removed } = sanitizeSvg(readFileSync(file, 'utf8'));
      if (removed.length) out.push(issue('error', 'unsafe-svg', at, `the build would remove from this SVG: ${removed.join('; ')}. Remove them from the file (only plain shapes, text, gradients and #fragment links are kept)`));
    } else if (!['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'].includes(ext)) out.push(issue('error', 'image-type', at, `use SVG, PNG, JPEG, WebP or AVIF (got ${ext})`));
    else if (!block.width || !block.height) out.push(issue('warning', 'image-size', at, 'give "width" and "height" so the page does not jump while the image loads'));
  });
  return out;
}

/** Every "confirm" note: claims the assistant could not trace to a source, for the user to check. */
export function toConfirm(lessons) {
  return lessons.flatMap((lesson) =>
    lesson.blocks.flatMap((block, index) => (block.confirm ? [{ where: where(lesson, index), claim: excerpt(blockTexts(block).map(plainText).join(' '), 0), why: block.confirm }] : [])),
  );
}

/** A course accent must be readable as text on the light backgrounds (the dark one is adjusted automatically). */
export function lintTheme(course) {
  const accent = course.theme?.accent;
  if (!/^#[0-9a-f]{6}$/i.test(accent ?? '')) return [];
  const tokens = themeTokens(course.theme).light;
  const ratio = worstContrast(tokens.accent, tokens);
  return ratio < MIN_CONTRAST ? [issue('warning', 'accent-contrast', 'course.json theme', `accent ${accent} has ${ratio.toFixed(2)}:1 contrast on the page background; links and labels need ${MIN_CONTRAST}:1. Pick a darker colour`)] : [];
}

export function lintCourse(loaded) {
  const { lessons, glossary, dir, course } = loaded;
  const out = loaded.problems.map((problem) => issue('error', 'shape', problem.where, problem.message));
  const context = { lessons, glossary, dir };
  for (const lesson of lessons) {
    out.push(...lintSources(lesson), ...lintRestatedClaims(lesson), ...lintLength(lesson, course.limits), ...lintQuiz(lesson), ...lintLinks(lesson, context), ...lintFigures(lesson, dir));
  }
  out.push(...lintGlossary(lessons, glossary), ...lintCourseClaims(lessons, glossary, course), ...lintTheme(course));
  return out;
}

export function formatIssues(issues) {
  return issues.map((item) => `${item.level === 'error' ? 'error  ' : 'warning'}  ${item.where}  ${item.message}  [${item.rule}]`).join('\n');
}
