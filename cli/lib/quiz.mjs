// Ties each quiz answer to the sentence in the lesson that proves it.
import { lessonPlainTexts } from './blocks.mjs';
import { looseFind } from './text.mjs';
import { wordsOf } from '../../site/js/search-core.js';

/**
 * Where a proof sentence sits in the lesson: the plain text that contains it and the character offsets.
 * Matching ignores quote, dash and ellipsis style and white space, nothing else. Returns null when not found.
 */
export function findProof(lesson, proof) {
  for (const text of lessonPlainTexts(lesson)) {
    const found = looseFind(text, proof);
    if (found) return { text, ...found };
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
