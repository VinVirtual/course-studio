// Text helpers shared by the loader, lint, render and build steps.

/** Text as site-narrator fingerprints it: NFC, runs of white space folded to one space, trimmed. */
export const tidy = (text) => String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** Same 32-bit FNV-1a key as site-narrator's player.js, so a line maps to `<key>.mp3`. */
export function voiceKey(text) {
  const line = tidy(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < line.length; index += 1) {
    hash ^= line.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0') + line.length.toString(16);
}

export const slugify = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

export const countWords = (text) => (tidy(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Straight quotes and dashes, so a proof sentence typed with " matches a lesson written with “. */
export const looseText = (text) =>
  tidy(text)
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...');

/** Splits plain text into sentences. Good enough for prose; abbreviations like "e.g." may split early. */
export function sentences(text) {
  const clean = tidy(text);
  if (!clean) return [];
  return clean.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/u).map((part) => part.trim()).filter(Boolean);
}

/**
 * Parses the small inline markup lessons may use:
 *   [[term]]            a glossary term, shown as written
 *   [[shown|term]]      shown text, glossary term
 *   [label](target)     a link: https://..., lesson:<id>, lesson:<id>#section, glossary:<term>, #anchor
 *   \[ and \]           literal brackets
 * Returns the plain text a reader sees (and a narrator speaks) plus the marks over it.
 */
export function parseInline(source) {
  const input = String(source ?? '');
  let text = '';
  const marks = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (char === '\\' && (input[index + 1] === '[' || input[index + 1] === ']')) {
      text += input[index + 1];
      index += 2;
      continue;
    }
    if (char === '[' && input[index + 1] === '[') {
      const end = input.indexOf(']]', index + 2);
      if (end > index + 2) {
        const inner = input.slice(index + 2, end);
        const [shown, term] = inner.includes('|') ? inner.split('|', 2) : [inner, inner];
        marks.push({ kind: 'term', start: text.length, end: text.length + shown.length, term: tidy(term), explicit: true });
        text += shown;
        index = end + 2;
        continue;
      }
    }
    if (char === '[') {
      const close = findClose(input, index);
      if (close > 0 && input[close + 1] === '(') {
        const paren = input.indexOf(')', close + 2);
        if (paren > close + 1) {
          const label = input.slice(index + 1, close);
          const inner = parseInline(label);
          const start = text.length;
          for (const mark of inner.marks) marks.push({ ...mark, start: mark.start + start, end: mark.end + start });
          text += inner.text;
          marks.push({ kind: 'link', start, end: text.length, href: input.slice(close + 2, paren).trim() });
          index = paren + 1;
          continue;
        }
      }
    }
    text += char;
    index += 1;
  }
  return normalise(text, marks);
}

function findClose(input, open) {
  let depth = 0;
  for (let index = open; index < input.length; index += 1) {
    if (input[index] === '\\') {
      index += 1;
      continue;
    }
    if (input[index] === '[') depth += 1;
    if (input[index] === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Folds white space like tidy() and moves the marks with it, so mark offsets match the tidied text. */
function normalise(raw, marks) {
  const nfc = raw.normalize('NFC');
  const map = [];
  let text = '';
  let space = false;
  for (let index = 0; index < nfc.length; index += 1) {
    map.push(text.length);
    if (/\s/.test(nfc[index])) {
      space = text.length > 0;
      continue;
    }
    if (space) text += ' ';
    space = false;
    map[index] = text.length;
    text += nfc[index];
  }
  map.push(text.length);
  const at = (offset) => map[Math.min(offset, map.length - 1)];
  const moved = marks.map((mark) => ({ ...mark, start: at(mark.start), end: Math.min(at(mark.end), text.length) })).filter((mark) => mark.end > mark.start);
  return { text, marks: moved };
}

export const plainText = (source) => parseInline(source).text;
