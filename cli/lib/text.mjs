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

/** A short stable hash of any text, used where a readable slug cannot be made. */
export const shortHash = (text) => voiceKey(String(text ?? '')).slice(0, 6);

/**
 * A URL- and id-safe slug. Latin letters are kept (accents dropped); text with no Latin letters or
 * digits (Cyrillic, CJK, ...) gets "s-" plus a short hash of the text, so it is never empty and stays stable.
 */
export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || (tidy(text) ? `s-${shortHash(tidy(text))}` : '');
}

/** Makes ids unique by numbering repeats: a, a-2, a-3. */
export function uniqueIds() {
  const used = new Map();
  return (base) => {
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count > 1 ? `${base}-${count}` : base;
  };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

export const countWords = (text) => (tidy(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

const LOOSE = { '“': '"', '”': '"', '«': '"', '»': '"', '„': '"', '‘': "'", '’': "'", '‚': "'", '–': '-', '—': '-', '…': '...' };

/**
 * Straight quotes, plain dashes and "..." for "…", so a proof typed with " matches a lesson written
 * with “. Returns the loose text and, for each of its characters, the offset in the original text.
 */
export function looseMap(text) {
  const source = String(text ?? '');
  let loose = '';
  const map = [];
  for (let index = 0; index < source.length; index += 1) {
    const out = LOOSE[source[index]] ?? source[index];
    for (const char of out) {
      loose += char;
      map.push(index);
    }
  }
  map.push(source.length);
  return { loose, map };
}

export const looseText = (text) => looseMap(tidy(text)).loose;

/** Where `needle` sits in `text`, ignoring quote, dash and ellipsis style: { start, end } in text, or null. */
export function looseFind(text, needle) {
  const wanted = looseText(needle);
  if (!wanted) return null;
  const { loose, map } = looseMap(text);
  const at = loose.indexOf(wanted);
  if (at < 0) return null;
  return { start: map[at], end: map[at + wanted.length - 1] + 1 };
}

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
  // NFC first, so every offset below is an offset into the text the reader sees.
  const input = String(source ?? '').normalize('NFC');
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
        const paren = findParen(input, close + 1);
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

/** The ")" that closes the "(" at `open`, allowing balanced parentheses inside (Wikipedia-style URLs). */
function findParen(input, open) {
  let depth = 0;
  for (let index = open; index < input.length; index += 1) {
    if (input[index] === '(') depth += 1;
    if (input[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
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
  const nfc = raw; // already NFC: parseInline normalises its input first
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
