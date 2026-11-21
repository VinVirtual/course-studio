// Full-text search over a course, used by the browser and by the build (and its tests).
// No dependencies. Words are lower-cased, accents folded, common endings trimmed.

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its of on or so than that the their them then there these they this to was what when where which who why will with you your'.split(' '),
);
const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'edly', 'ies', 'ied', 'ed', 'es', 's'];
const MAX_RESULTS = 8;

export const fold = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’']/g, '');

export function stem(word) {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  const suffix = SUFFIXES.find((ending) => word.length - ending.length >= 4 && word.endsWith(ending));
  return suffix ? word.slice(0, -suffix.length) : word;
}

/** Meaningful words of a text, stemmed. */
const LATIN = /^[a-z0-9]+$/;
// Scripts written without spaces between words: a typed word may match inside a longer run.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

/** Meaningful words of a text: letters and digits of any script, lower-cased; English endings trimmed. */
export const wordsOf = (text) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => (word.length > 1 || UNSPACED.test(word)) && !STOP.has(word))
    .map((word) => (LATIN.test(word) ? stem(word) : word));

/** Single-letter edits between two words, giving up past `limit`. */
export function editDistance(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next.push(Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}

const allowedTypos = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

/** Prepares entries ({ title, section, text, url, kind }) for searching. */
export function buildIndex(entries) {
  return entries.map((entry) => ({ entry, title: new Set(wordsOf(`${entry.title} ${entry.section ?? ''}`)), text: new Set(wordsOf(entry.text)) }));
}

// How well one typed word matches a set of words: 1 exact, 0.8 prefix (the word being typed), 0.6 typo.
function matchWord(word, words, isLast) {
  if (words.has(word)) return 1;
  let best = 0;
  for (const other of words) {
    if (UNSPACED.test(word) && other.includes(word)) best = Math.max(best, 0.8);
    if (isLast && word.length >= 2 && other.startsWith(word)) best = Math.max(best, 0.8);
    else if (best < 0.6 && allowedTypos(word) && editDistance(word, other, allowedTypos(word)) <= allowedTypos(word)) best = 0.6;
  }
  return best;
}

/** A short piece of the text around the first word that matched, with that word wrapped in [[ ]]. */
export function snippet(text, query, width = 140) {
  const typed = wordsOf(query);
  const tokens = [...String(text).matchAll(/[\p{L}\p{N}'’]+/gu)];
  const hit = tokens.find((token) => {
    const folded = fold(token[0]);
    const word = LATIN.test(folded) ? stem(folded) : folded;
    return typed.some((wanted) => word === wanted || word.startsWith(wanted) || (UNSPACED.test(wanted) && word.includes(wanted)) || (allowedTypos(wanted) && editDistance(wanted, word, 1) <= 1));
  });
  if (!hit) return { before: String(text).slice(0, width), match: '', after: '' };
  const from = Math.max(0, hit.index - Math.floor(width / 3));
  const before = (from > 0 ? '…' : '') + String(text).slice(from, hit.index).replace(/^\S*\s/, from > 0 ? '' : '$&');
  const end = Math.min(String(text).length, hit.index + width);
  const cut = end < String(text).length;
  const tail = String(text).slice(hit.index + hit[0].length, end);
  const after = cut ? `${tail.replace(/\s+\S*$/, '')}…` : tail;
  return { before, match: hit[0], after };
}

/**
 * Results for a query: every typed word must match (exactly, as a prefix for the last word, or with a
 * small typo). Title words count three times as much as body words.
 */
export function search(index, query, limit = MAX_RESULTS) {
  const typed = wordsOf(query);
  if (typed.length === 0) return [];
  const results = [];
  for (const doc of index) {
    let score = 0;
    let all = true;
    typed.forEach((word, at) => {
      const isLast = at === typed.length - 1;
      const inTitle = matchWord(word, doc.title, isLast);
      const inText = matchWord(word, doc.text, isLast);
      if (!inTitle && !inText) all = false;
      score += inTitle * 3 + inText;
    });
    if (all) results.push({ ...doc.entry, score: score + (doc.entry.kind === 'lesson' ? 0.5 : 0) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
