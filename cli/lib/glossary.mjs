// Finds glossary terms in lesson text so the site can underline them and show a definition.
import { slugify, tidy } from './text.mjs';

const escapeForPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every name a glossary entry answers to (term and aliases), lower-cased, mapped to the entry. */
export function glossaryNames(glossary) {
  const names = new Map();
  for (const entry of glossary) for (const name of [entry.term, ...(entry.aliases ?? [])]) if (tidy(name)) names.set(tidy(name).toLowerCase(), entry);
  return names;
}

/** Looks up a term written in [[...]]: exact name, alias, or a simple plural. */
export function lookupTerm(names, term) {
  const key = tidy(term).toLowerCase();
  return names.get(key) ?? names.get(key.replace(/e?s$/, '')) ?? names.get(slugify(key).replace(/-/g, ' ')) ?? null;
}

/** A matcher for the course glossary. Longest names first, so "cloud droplet" wins over "cloud". */
export function termMatcher(glossary) {
  const names = glossaryNames(glossary);
  const sorted = [...names.keys()].sort((a, b) => b.length - a.length);
  const pattern = sorted.length ? new RegExp(`(?<![\\p{L}\\p{N}-])(${sorted.map(escapeForPattern).join('|')})(?:e?s)?(?![\\p{L}\\p{N}-])`, 'giu') : null;
  return { names, pattern };
}

/**
 * Glossary marks for one plain text. A term is marked only the first time it appears (tracked in `seen`,
 * shared across a lesson), never inside a link, and never where an explicit [[term]] mark already is.
 */
export function findTerms(text, matcher, seen = new Set(), existing = []) {
  const marks = [];
  const explicit = existing.filter((mark) => mark.kind === 'term');
  for (const mark of explicit) {
    const entry = lookupTerm(matcher.names, mark.term);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      marks.push({ kind: 'term', start: mark.start, end: mark.end, entry });
    }
  }
  if (!matcher.pattern) return marks;
  const blocked = existing.filter((mark) => mark.kind === 'link' || mark.kind === 'term');
  for (const match of text.matchAll(matcher.pattern)) {
    const entry = matcher.names.get(match[1].toLowerCase());
    if (!entry || seen.has(entry.id)) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (blocked.some((mark) => start < mark.end && end > mark.start)) continue;
    seen.add(entry.id);
    marks.push({ kind: 'term', start, end, entry });
  }
  return marks.sort((a, b) => a.start - b.start);
}
