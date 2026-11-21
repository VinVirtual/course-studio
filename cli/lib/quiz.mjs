// Ties each quiz answer to the sentence in the lesson that proves it.
import { lessonPlainTexts } from './blocks.mjs';
import { looseText } from './text.mjs';
import { wordsOf } from '../../site/js/search-core.js';

/**
 * Where a proof sentence sits in the lesson: the plain text that contains it and the character offset.
 * Matching ignores quote style, dash style and white space, nothing else. Returns null when not found.
 */
export function findProof(lesson, proof) {
  const wanted = looseText(proof);
  if (!wanted) return null;
  for (const text of lessonPlainTexts(lesson)) {
    const loose = looseText(text);
    const at = loose.indexOf(wanted);
    // looseText keeps lengths for everything except "…", so offsets carry over when it is absent.
    if (at >= 0) return { text, start: at, end: at + wanted.length, exact: !/…/.test(text) };
  }
  return null;
}

/**
 * How much of the right answer the proof sentence actually says: the share of the answer's meaningful
 * words (stemmed) that appear in the proof or the question. 1 means every word is there.
 */
export function answerSupport(item) {
  const answer = wordsOf(item.options[item.answer] ?? '');
  if (answer.length === 0) return 1;
  const said = new Set([...wordsOf(item.proof), ...wordsOf(item.question)]);
  return answer.filter((word) => said.has(word)).length / answer.length;
}

export const proofId = (lessonQuizIndex) => `proof-${lessonQuizIndex + 1}`;
