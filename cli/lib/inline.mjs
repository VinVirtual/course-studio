// Turns one piece of lesson text into HTML: links, glossary terms and quiz proof sentences, properly nested.
import { findTerms } from './glossary.mjs';
import { escapeHtml, looseText, parseInline } from './text.mjs';

const PRIORITY = { proof: 0, link: 1, term: 2 };

/** Proof sentences inside this text, each claimed once per lesson (ctx.proofs holds { text, id, used }). */
function proofMarks(text, proofs = []) {
  const loose = looseText(text);
  const marks = [];
  for (const proof of proofs) {
    if (proof.used) continue;
    const at = loose.indexOf(looseText(proof.text));
    if (at < 0 || loose.length !== text.length) continue;
    proof.used = true;
    marks.push({ kind: 'proof', start: at, end: at + looseText(proof.text).length, id: proof.id });
  }
  return marks;
}

function openTag(mark, continued, ctx) {
  if (mark.kind === 'proof') return continued ? `<span class="proof" data-proof="${mark.id}">` : `<span class="proof" id="${mark.id}" data-proof="${mark.id}">`;
  if (mark.kind === 'link') {
    const { href, external } = ctx.resolveLink ? ctx.resolveLink(mark.href) : { href: mark.href, external: /^https?:/i.test(mark.href) };
    return `<a href="${escapeHtml(href)}"${external ? ' class="ext" rel="noopener noreferrer"' : ''}>`;
  }
  return `<button type="button" class="term" data-term="${escapeHtml(mark.entry.id)}" aria-haspopup="dialog" aria-expanded="false">`;
}

const closeTag = (mark) => (mark.kind === 'proof' ? '</span>' : mark.kind === 'link' ? '</a>' : '</button>');

/** Renders text with marks. Marks that cross are closed and re-opened so the HTML stays well nested. */
export function renderMarks(text, marks, ctx = {}) {
  const sorted = [...marks].sort((a, b) => a.start - b.start || PRIORITY[a.kind] - PRIORITY[b.kind] || b.end - a.end);
  const points = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])].filter((point) => point >= 0 && point <= text.length).sort((a, b) => a - b);
  const stack = [];
  const opened = new Set();
  let html = '';
  let last = 0;
  for (const point of points) {
    html += escapeHtml(text.slice(last, point));
    last = point;
    const reopen = [];
    while (stack.some((mark) => mark.end <= point)) {
      const top = stack.pop();
      html += closeTag(top);
      if (top.end > point) reopen.unshift(top);
    }
    const starting = sorted.filter((mark) => mark.start === point && mark.end > point);
    for (const mark of [...reopen, ...starting]) {
      html += openTag(mark, opened.has(mark), ctx);
      opened.add(mark);
      stack.push(mark);
    }
  }
  while (stack.length) html += closeTag(stack.pop());
  return html;
}

/** One piece of lesson text as HTML, plus the plain text a narrator would speak for it. */
export function renderInline(source, ctx = {}) {
  const { text, marks } = parseInline(source);
  const links = marks.filter((mark) => mark.kind === 'link');
  const terms = ctx.matcher ? findTerms(text, ctx.matcher, ctx.seen ?? new Set(), marks) : [];
  for (const term of terms) ctx.usedTerms?.add(term.entry);
  const proofs = proofMarks(text, ctx.proofs);
  return { html: renderMarks(text, [...proofs, ...links, ...terms], ctx), text };
}
