// Checks a built site: links and anchors, third-party requests, sizes, recordings, accessibility basics.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { listFiles } from './build.mjs';
import { contentsOf, elements, textOf, tokenize } from './html.mjs';
import { voiceKey } from './text.mjs';

export const BUDGETS = {
  pageBytes: 200 * 1024, // one HTML file
  jsGzip: 80 * 1024, // all scripts, gzipped
  cssGzip: 30 * 1024, // all stylesheets, gzipped
  voiceBytes: 10 * 1024 * 1024, // all recordings
  lineBytes: 512 * 1024, // one recording
  minLineBytes: 1500, // a real spoken line at 32 kbit/s is several KB; less means an empty file
};

const issue = (level, rule, where, message) => ({ level, rule, where, message });
const isExternal = (url) => /^(https?:)?\/\//i.test(url);
const isSkipped = (url) => /^(mailto:|tel:)/i.test(url);
/** Scheme of a URL as a browser reads it: white space and control characters inside it are ignored. */
const unsafeScheme = (url) => /^(javascript|vbscript|data|blob|file):/i.test(String(url).replace(/[\s\u0000-\u001f]/g, ''));

/** Where a site-relative link lands on disk, with its fragment. Folders resolve to index.html. */
export function resolveTarget(dist, fromFile, url) {
  const [pathPart, hash = ''] = url.split('#');
  let target = pathPart ? resolve(dirname(fromFile), decodeURIComponent(pathPart.split('?')[0])) : fromFile;
  if (pathPart.endsWith('/') || (existsSync(target) && statSync(target).isDirectory())) target = join(target, 'index.html');
  return { target, hash, inside: target === dist || target.startsWith(dist + sep) };
}

const idsCache = new Map();
function idsOf(file) {
  if (!idsCache.has(file)) idsCache.set(file, new Set(elements(tokenize(readFileSync(file, 'utf8'))).map((token) => token.attrs.id).filter(Boolean)));
  return idsCache.get(file);
}

/** Every link, image, script and stylesheet reference in the built pages must resolve. */
export function checkSiteLinks(dist, pages) {
  idsCache.clear();
  const out = [];
  for (const file of pages) {
    const where = relative(dist, file);
    for (const token of elements(tokenize(readFileSync(file, 'utf8')))) {
      for (const attribute of ['href', 'src', 'poster']) {
        const url = token.attrs[attribute];
        if (url === undefined || url === '') continue;
        if (unsafeScheme(url)) {
          out.push(issue('error', 'unsafe-url', where, `<${token.name} ${attribute}="${url.slice(0, 40)}"> uses a script, data or local-file address`));
          continue;
        }
        if (isSkipped(url)) continue;
        if (isExternal(url)) {
          if (token.name !== 'a') out.push(issue('error', 'third-party', where, `<${token.name} ${attribute}="${url}"> loads from another server`));
          continue;
        }
        const { target, hash, inside } = resolveTarget(dist, file, url);
        if (!inside) out.push(issue('error', 'outside-site', where, `${url} points outside the site folder`));
        else if (!existsSync(target)) out.push(issue('error', 'broken-link', where, `${url} → missing file ${relative(dist, target)}`));
        else if (hash && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(hash))) out.push(issue('error', 'broken-anchor', where, `${url} → no element with id "${hash}"`));
      }
      // Quiz questions link to their proving sentence from script, by this attribute.
      if (token.attrs['data-proof'] && /\bq\b/.test(token.attrs.class ?? '') && !idsOf(file).has(token.attrs['data-proof'])) {
        out.push(issue('error', 'broken-proof', where, `quiz question links to #${token.attrs['data-proof']}, which is not on the page`));
      }
    }
  }
  return out;
}

/** Stylesheets and scripts must not pull anything from other servers. */
export function checkAssets(files) {
  const out = [];
  for (const file of files) {
    const ext = extname(file);
    if (ext !== '.css' && ext !== '.js') continue;
    const text = readFileSync(file, 'utf8');
    if (ext === '.css' && (/@import\s+(url\()?\s*["']?(https?:)?\/\//i.test(text) || /url\(\s*["']?(https?:)?\/\//i.test(text))) out.push(issue('error', 'third-party', file, 'stylesheet loads something from another server'));
    if (ext === '.js' && /(fetch|import)\s*\(\s*["'`](https?:)?\/\//.test(text)) out.push(issue('error', 'third-party', file, 'script requests another server'));
  }
  return out;
}

function headingLevels(tokens) {
  return tokens.filter((token) => token.type === 'open' && /^h[1-6]$/.test(token.name)).map((token) => Number(token.name[1]));
}

/** Accessibility basics that can be checked from the HTML alone. */
export function checkAccessibility(html, where) {
  const out = [];
  const tokens = tokenize(html);
  const root = elements(tokens, 'html')[0];
  if (!root?.attrs.lang) out.push(issue('error', 'a11y-lang', where, '<html> has no lang'));
  const title = contentsOf(tokens, 'title')[0];
  if (!title?.text) out.push(issue('error', 'a11y-title', where, 'page has no <title>'));
  if (!elements(tokens, 'meta').some((meta) => meta.attrs.name === 'viewport')) out.push(issue('error', 'a11y-viewport', where, 'no viewport meta'));
  const levels = headingLevels(tokens);
  if (levels.filter((level) => level === 1).length !== 1) out.push(issue('error', 'a11y-h1', where, `${levels.filter((level) => level === 1).length} <h1> elements; use exactly one`));
  levels.forEach((level, index) => {
    if (index > 0 && level > levels[index - 1] + 1) out.push(issue('warning', 'a11y-heading-skip', where, `heading jumps from h${levels[index - 1]} to h${level}`));
  });
  for (const image of elements(tokens, 'img')) if (image.attrs.alt === undefined) out.push(issue('error', 'a11y-alt', where, `<img src="${image.attrs.src}"> has no alt`));
  for (const node of elements(tokens).filter((token) => token.attrs.role === 'img')) if (!node.attrs['aria-label'] && !node.attrs['aria-labelledby']) out.push(issue('error', 'a11y-alt', where, 'role="img" without aria-label'));
  for (const button of contentsOf(tokens, 'button')) if (!button.text && !button.attrs['aria-label']) out.push(issue('error', 'a11y-button', where, 'a button has no text and no aria-label'));
  for (const link of contentsOf(tokens, 'a')) if (!link.text && !link.attrs['aria-label']) out.push(issue('error', 'a11y-link', where, `link to ${link.attrs.href} has no text`));
  const labels = new Set(elements(tokens, 'label').map((label) => label.attrs.for));
  for (const input of elements(tokens, 'input')) if (input.attrs.type !== 'hidden' && !labels.has(input.attrs.id) && !input.attrs['aria-label']) out.push(issue('error', 'a11y-label', where, `input ${input.attrs.id ?? ''} has no label`));
  const ids = elements(tokens).map((token) => token.attrs.id).filter(Boolean);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  for (const id of duplicates) out.push(issue('error', 'a11y-duplicate-id', where, `id "${id}" is used more than once`));
  for (const video of contentsOf(tokens, 'video')) if (!video.inner.some((token) => token.name === 'track')) out.push(issue('warning', 'a11y-captions', where, 'video has no captions track'));
  return out;
}

/** Every [data-line] on every page must have a recording in dist/voice, named by the hash of its text. */
export function checkNarration(dist, pages, { manifest = null, required = true } = {}) {
  const out = [];
  const voiceDir = join(dist, 'voice');
  const hasVoice = existsSync(voiceDir);
  if (!hasVoice) {
    if (required) out.push(issue('error', 'no-voice', 'voice/', 'the site has no recordings. Run `course narrate`, then `course build`'));
    return { issues: out, lines: 0, bytes: 0, seconds: 0 };
  }
  const keys = new Set();
  for (const file of pages) {
    for (const text of textOf(tokenize(readFileSync(file, 'utf8')))) {
      const key = voiceKey(text);
      keys.add(key);
      if (!existsSync(join(voiceDir, `${key}.mp3`))) out.push(issue('error', 'missing-recording', relative(dist, file), `no recording for "${text.slice(0, 70)}${text.length > 70 ? '…' : ''}" (${key}.mp3)`));
    }
  }
  let bytes = 0;
  let seconds = 0;
  for (const key of keys) {
    const file = join(voiceDir, `${key}.mp3`);
    if (!existsSync(file)) continue;
    const size = statSync(file).size;
    bytes += size;
    if (size < BUDGETS.minLineBytes) out.push(issue('error', 'empty-recording', `voice/${key}.mp3`, `only ${size} bytes`));
    if (size > BUDGETS.lineBytes) out.push(issue('warning', 'large-recording', `voice/${key}.mp3`, `${Math.round(size / 1024)} KB`));
    const entry = manifest?.lines?.[key];
    if (entry) {
      seconds += entry.seconds ?? 0;
      if ((entry.seconds ?? 0) < 0.3) out.push(issue('error', 'short-recording', `voice/${key}.mp3`, `${entry.seconds} s long`));
      if (entry.level !== undefined && entry.level < 0.005) out.push(issue('error', 'silent-recording', `voice/${key}.mp3`, `level ${entry.level}: silent`));
    }
  }
  for (const file of listFiles(voiceDir)) {
    if (file.endsWith('.mp3') && !keys.has(file.split(sep).pop().replace(/\.mp3$/, ''))) out.push(issue('warning', 'unused-recording', relative(dist, file), 'no line on any page uses this recording'));
  }
  if (bytes > BUDGETS.voiceBytes) out.push(issue('warning', 'voice-size', 'voice/', `${(bytes / 1048576).toFixed(1)} MB of recordings`));
  return { issues: out, lines: keys.size, bytes, seconds };
}

export function sizeReport(files) {
  const sum = (filter, gzip) => files.filter(filter).reduce((total, file) => total + (gzip ? gzipSync(readFileSync(file)).length : statSync(file).size), 0);
  return {
    total: sum(() => true),
    html: sum((file) => file.endsWith('.html')),
    jsGzip: sum((file) => file.endsWith('.js'), true),
    cssGzip: sum((file) => file.endsWith('.css'), true),
    fonts: sum((file) => file.endsWith('.woff2')),
    voice: sum((file) => file.endsWith('.mp3')),
    video: sum((file) => file.endsWith('.mp4')),
  };
}

export function verifySite(dist, { manifest = null, requireVoice = true } = {}) {
  const root = resolve(dist);
  if (!existsSync(join(root, 'index.html'))) return { issues: [issue('error', 'no-site', root, 'no index.html: run `course build` first')], sizes: null, narration: null };
  const files = listFiles(root);
  const pages = files.filter((file) => file.endsWith('.html'));
  const issues = [...checkSiteLinks(root, pages), ...checkAssets(files)];
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    issues.push(...checkAccessibility(html, relative(root, file)));
    if (Buffer.byteLength(html) > BUDGETS.pageBytes) issues.push(issue('warning', 'page-size', relative(root, file), `${Math.round(Buffer.byteLength(html) / 1024)} KB of HTML`));
  }
  const narration = checkNarration(root, pages, { manifest, required: requireVoice });
  issues.push(...narration.issues);
  const sizes = sizeReport(files);
  if (sizes.jsGzip > BUDGETS.jsGzip) issues.push(issue('warning', 'js-size', 'assets/', `${Math.round(sizes.jsGzip / 1024)} KB of script (gzipped)`));
  if (sizes.cssGzip > BUDGETS.cssGzip) issues.push(issue('warning', 'css-size', 'assets/', `${Math.round(sizes.cssGzip / 1024)} KB of CSS (gzipped)`));
  return { issues, sizes, narration, pages: pages.length };
}
