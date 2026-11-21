// Makes an SVG figure safe to inline into a page. The file is parsed into tags, and only allowlisted
// elements and attributes are written back out; everything else is dropped and reported. Text is
// re-escaped on output, so markup can never be reassembled from pieces.
import { decodeEntities, parseAttributes } from './html.mjs';
import { escapeHtml } from './text.mjs';

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'symbol', 'use', 'marker',
]);
// Written back with this exact case (SVG is case-sensitive).
const CASED = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath', viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform', patternunits: 'patternUnits', patterncontentunits: 'patternContentUnits', patterntransform: 'patternTransform', markerwidth: 'markerWidth', markerheight: 'markerHeight', markerunits: 'markerUnits', refx: 'refX', refy: 'refY', clippathunits: 'clipPathUnits', maskunits: 'maskUnits', maskcontentunits: 'maskContentUnits', textlength: 'textLength', lengthadjust: 'lengthAdjust', pathlength: 'pathLength', spreadmethod: 'spreadMethod' };
const ATTRIBUTES = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'id', 'class', 'viewbox', 'preserveaspectratio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy',
  'd', 'points', 'pathlength', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask', 'opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'vector-effect', 'shape-rendering', 'color',
  'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing', 'word-spacing', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'patternunits', 'patterncontentunits', 'patterntransform',
  'clippathunits', 'maskunits', 'maskcontentunits', 'markerwidth', 'markerheight', 'markerunits', 'refx', 'refy', 'orient', 'marker-start', 'marker-mid', 'marker-end',
  'href', 'xlink:href',
]);
// Set by the page itself; dropped quietly from the file.
const QUIET = new Set(['aria-hidden', 'role', 'focusable', 'aria-label', 'aria-labelledby']);
const LINK_ATTRIBUTES = new Set(['href', 'xlink:href']);
// Attributes whose value may reference another element: only url(#id) is allowed in them.
const URL_VALUE = /url\s*\(/i;
const LOCAL_URL = /^\s*url\(\s*["']?#[\w.:-]+["']?\s*\)\s*$/i;

/** Lower-cased attribute name with any white space or control characters removed. */
const normalName = (name) => name.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();

/** Why an attribute is dropped, or null when it is kept. */
function attributeProblem(name, value) {
  if (name.startsWith('on')) return 'event handler';
  if (name === 'style') return 'style attribute';
  if (!ATTRIBUTES.has(name)) return 'attribute not allowed';
  const plain = decodeEntities(value).replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  if (LINK_ATTRIBUTES.has(name)) return /^#[\w.:-]+$/i.test(decodeEntities(value).trim()) ? null : 'link that is not #fragment';
  if (/javascript:|vbscript:|data:/.test(plain)) return 'script or data address';
  if (URL_VALUE.test(value) && !LOCAL_URL.test(decodeEntities(value))) return 'url() to something outside the figure';
  return null;
}

/**
 * Returns { svg, removed }: the cleaned SVG markup (hidden from screen readers, since the page gives the
 * figure its alt text), and a list of what was dropped, for lint to report.
 */
export function sanitizeSvg(source) {
  const input = String(source ?? '');
  const removed = [];
  const note = (what) => {
    if (!removed.includes(what)) removed.push(what);
  };
  const pattern = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[\s\S]*?(?:\?>|$)|<(\/?)([a-zA-Z][^\s/><]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const stack = []; // { name, keep }
  let out = '';
  let last = 0;
  let sawRoot = false;
  const dropping = () => stack.some((item) => !item.keep);
  const text = (raw) => {
    if (!raw) return;
    if (dropping()) return;
    if (raw.includes('<')) note('stray "<" in text');
    out += escapeHtml(decodeEntities(raw.replace(/</g, '')));
  };
  let match;
  while ((match = pattern.exec(input))) {
    text(input.slice(last, match.index));
    last = pattern.lastIndex;
    if (!match[2]) {
      if (match[0].startsWith('<![CDATA[')) note('CDATA section');
      continue; // comments, doctype, processing instructions
    }
    const name = match[2].toLowerCase().replace(/^svg:/, '');
    if (match[1]) {
      const at = stack.map((item) => item.name).lastIndexOf(name);
      if (at < 0) continue;
      while (stack.length > at) {
        const item = stack.pop();
        if (item.keep && !stack.some((other) => !other.keep)) out += `</${CASED[item.name] ?? item.name}>`;
      }
      continue;
    }
    const selfClosing = /\/\s*$/.test(match[3]);
    const allowed = ELEMENTS.has(name);
    if (!allowed) note(`<${name}> element`);
    if (allowed && !dropping()) {
      const attrs = parseAttributes(match[3].replace(/\/\s*$/, ''));
      let tag = `<${CASED[name] ?? name}`;
      for (const [rawName, value] of Object.entries(attrs)) {
        const attr = normalName(rawName);
        if (QUIET.has(attr)) continue;
        const problem = attributeProblem(attr, value);
        if (problem) {
          note(`${attr}= (${problem})`);
          continue;
        }
        tag += ` ${CASED[attr] ?? attr}="${escapeHtml(decodeEntities(value))}"`;
      }
      if (name === 'svg' && !sawRoot) {
        sawRoot = true;
        tag += ' aria-hidden="true" focusable="false"';
      }
      out += selfClosing ? `${tag}/>` : `${tag}>`;
    }
    if (!selfClosing) stack.push({ name, keep: allowed });
  }
  text(input.slice(last));
  while (stack.length) {
    const item = stack.pop();
    if (item.keep && !stack.some((other) => !other.keep)) out += `</${CASED[item.name] ?? item.name}>`;
  }
  return { svg: out.trim(), removed };
}
