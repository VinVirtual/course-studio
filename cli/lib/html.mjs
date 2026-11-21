// A small scanner for the HTML course-studio writes. Not a general parser: enough to read attributes,
// ids, headings and the text of [data-line] elements back out of a built page.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (all, code) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[lower] ?? all;
  });
}

export function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attributes;
}

/** Tokens: { type: 'open' | 'close' | 'text', name, attrs, selfClosing, text }. Script and style bodies are kept as raw text. */
export function tokenize(html) {
  const tokens = [];
  const pattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let last = 0;
  let match;
  while ((match = pattern.exec(html))) {
    if (match.index > last) tokens.push({ type: 'text', text: html.slice(last, match.index) });
    last = pattern.lastIndex;
    if (!match[2]) continue;
    const name = match[2].toLowerCase();
    if (match[1]) {
      tokens.push({ type: 'close', name });
      continue;
    }
    const selfClosing = /\/\s*$/.test(match[3]) || VOID.has(name);
    tokens.push({ type: 'open', name, attrs: parseAttributes(match[3].replace(/\/\s*$/, '')), selfClosing });
    if (RAW.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, last);
      const stop = end < 0 ? html.length : end;
      tokens.push({ type: 'text', text: html.slice(last, stop), raw: true });
      pattern.lastIndex = last = stop;
    }
  }
  if (last < html.length) tokens.push({ type: 'text', text: html.slice(last) });
  return tokens;
}

/** The text content of every element carrying `attribute`, as a browser's textContent would give it. */
export function textOf(tokens, attribute = 'data-line') {
  const found = [];
  tokens.forEach((token, start) => {
    if (token.type !== 'open' || !(attribute in token.attrs) || token.selfClosing) return;
    let depth = 0;
    let text = '';
    for (let index = start; index < tokens.length; index += 1) {
      const item = tokens[index];
      if (item.type === 'open' && !item.selfClosing) depth += 1;
      else if (item.type === 'close') depth -= 1;
      else if (item.type === 'text') text += decodeEntities(item.text);
      if (depth === 0) break;
    }
    found.push(text);
  });
  return found;
}

export const elements = (tokens, name) => tokens.filter((token) => token.type === 'open' && (!name || token.name === name));

/** Text inside each element with the given tag name (used for headings, buttons and links). */
export function contentsOf(tokens, name) {
  const found = [];
  tokens.forEach((token, start) => {
    if (token.type !== 'open' || token.name !== name || token.selfClosing) return;
    let depth = 0;
    let text = '';
    const inner = [];
    for (let index = start; index < tokens.length; index += 1) {
      const item = tokens[index];
      if (item.type === 'open' && !item.selfClosing) depth += 1;
      else if (item.type === 'close') depth -= 1;
      else if (item.type === 'text') text += decodeEntities(item.text);
      if (index > start && item.type === 'open') inner.push(item);
      if (depth === 0) break;
    }
    found.push({ attrs: token.attrs, text: text.replace(/\s+/g, ' ').trim(), inner });
  });
  return found;
}
