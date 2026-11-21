// HTML for each block type. Every line that can be read aloud sits in its own <span data-line>, whose
// text content is exactly the recorded line, so the player can hash element.textContent.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInline } from './inline.mjs';
import { escapeHtml, plainText } from './text.mjs';

const line = (source, ctx, tag = 'span') => {
  const { html } = renderInline(source, ctx);
  return `<${tag} class="line" data-line>${html}</${tag}>`;
};

/** Superscript numbers that link to the lesson's sources. ctx.citeOrder numbers sources by first use. */
export function citations(ids = [], ctx) {
  if (!ids.length) return '';
  const links = ids.map((id) => {
    if (!ctx.citeOrder.has(id)) ctx.citeOrder.set(id, ctx.citeOrder.size + 1);
    const number = ctx.citeOrder.get(id);
    const source = ctx.sources.find((item) => item.id === id);
    const label = source ? `Source ${number}: ${source.title}` : `Source ${number}`;
    return `<a href="#src-${escapeHtml(id)}" aria-label="${escapeHtml(label)}">${number}</a>`;
  });
  return `<sup class="cite">${links.join('<span aria-hidden="true">,</span>')}</sup>`;
}

const CALLOUT_LABEL = { note: 'Note', tip: 'Tip', warning: 'Careful' };

/** An SVG file made safe to inline: no prolog, no doctype, no scripts, hidden from screen readers. */
export function inlineSvg(svg) {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"')
    .trim();
}

function figure(block, ctx) {
  const caption = `<figcaption>${line(block.caption, ctx)}${citations(block.cite, ctx)}${block.credit ? ` <span class="credit">${escapeHtml(block.credit)}</span>` : ''}</figcaption>`;
  const file = join(ctx.dir, block.src);
  let art;
  if (block.src.toLowerCase().endsWith('.svg') && existsSync(file)) {
    art = `<div class="fig-art" role="img" aria-label="${escapeHtml(block.alt)}">${inlineSvg(readFileSync(file, 'utf8'))}</div>`;
  } else {
    const src = ctx.asset ? ctx.asset(block.src) : block.src;
    const size = block.width && block.height ? ` width="${Number(block.width)}" height="${Number(block.height)}"` : '';
    art = `<div class="fig-art"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}"${size} loading="lazy" decoding="async"></div>`;
  }
  return `<figure class="fig">${art}${caption}</figure>`;
}

export function renderBlock(block, ctx) {
  const cite = () => citations(block.cite, ctx);
  switch (block.type) {
    case 'paragraph':
      return `<p>${line(block.text, ctx)}${cite()}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag} class="prose-list">${block.items.map((item) => `<li>${line(item, ctx)}</li>`).join('')}</${tag}>${block.cite?.length ? `<p class="list-cite">${cite()}</p>` : ''}`;
    }
    case 'callout': {
      const tone = block.tone ?? 'note';
      const title = block.title ? `<p class="callout-title">${line(block.title, ctx)}</p>` : `<p class="callout-title" aria-hidden="true">${CALLOUT_LABEL[tone]}</p>`;
      return `<aside class="callout callout-${tone}" aria-label="${CALLOUT_LABEL[tone]}">${title}<p>${line(block.text, ctx)}${cite()}</p></aside>`;
    }
    case 'example': {
      const steps = block.steps.map((step) => `<li>${line(step, ctx)}</li>`).join('');
      const result = block.result ? `<p class="example-result">${line(block.result, ctx)}${cite()}</p>` : cite();
      return `<section class="example" aria-label="Worked example"><p class="example-kicker" aria-hidden="true">Worked example</p><h3>${line(block.title, ctx)}</h3><ol class="steps">${steps}</ol>${result}</section>`;
    }
    case 'figure':
      return figure(block, ctx);
    case 'code': {
      const caption = block.caption ? `<figcaption>${escapeHtml(plainText(block.caption))}</figcaption>` : '';
      return `<figure class="code">${caption}<pre tabindex="0"><code${block.lang ? ` data-lang="${escapeHtml(block.lang)}"` : ''}>${escapeHtml(block.text)}</code></pre></figure>`;
    }
    case 'quote':
      return `<figure class="quote"><blockquote><p>${line(block.text, ctx)}</p></blockquote>${block.by || block.cite?.length ? `<figcaption>${block.by ? escapeHtml(block.by) : ''}${cite()}</figcaption>` : ''}</figure>`;
    default:
      return '';
  }
}
