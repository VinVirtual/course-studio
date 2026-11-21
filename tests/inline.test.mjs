import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBlock } from '../cli/lib/blockhtml.mjs';
import { termMatcher } from '../cli/lib/glossary.mjs';
import { textOf, tokenize } from '../cli/lib/html.mjs';
import { renderInline, renderMarks } from '../cli/lib/inline.mjs';

const glossary = [{ id: 'dew-point', term: 'Dew point', aliases: [], definition: 'The temperature.' }];
const ctx = () => ({ matcher: termMatcher(glossary), seen: new Set(), citeOrder: new Map(), sources: [{ id: 's', title: 'S' }], dir: '.' });

test('marks that cross are closed and re-opened, so the HTML nests', () => {
  const html = renderMarks('abcdef', [
    { kind: 'proof', start: 0, end: 4, id: 'proof-1' },
    { kind: 'link', start: 2, end: 6, href: '#x' },
  ]);
  assert.equal(html, '<span class="proof" id="proof-1" data-proof="proof-1">ab<a href="#x">cd</a></span><a href="#x">ef</a>');
});

test('text is escaped', () => {
  assert.equal(renderInline('a < b & "c"').html, 'a &lt; b &amp; &quot;c&quot;');
});

test('a glossary term becomes a button, only the first time', () => {
  const context = ctx();
  const first = renderInline('The dew point is here.', context).html;
  const second = renderInline('The dew point again.', context).html;
  assert.match(first, /<button type="button" class="term" data-term="dew-point"[^>]*>dew point<\/button>/);
  assert.doesNotMatch(second, /button/);
});

test('a proof sentence is wrapped and given its id once', () => {
  const context = { ...ctx(), proofs: [{ text: 'It cools.', id: 'proof-2' }] };
  const html = renderInline('Air rises. It cools. It cools.', context).html;
  assert.equal((html.match(/id="proof-2"/g) ?? []).length, 1);
});

test('the text content of every [data-line] equals the plain line, whatever markup is inside', () => {
  const context = { ...ctx(), proofs: [{ text: 'Below the dew point vapour condenses.', id: 'proof-1' }] };
  const block = { type: 'paragraph', text: 'Below the [[dew point]] vapour [condenses](https://example.org/a?b=1&c=2). Fish & “chips”.', cite: ['s'] };
  const tokens = tokenize(renderBlock(block, context));
  assert.deepEqual(textOf(tokens), ['Below the dew point vapour condenses. Fish & “chips”.']);
});

test('example steps, callout titles and captions are separate lines; code is not read', () => {
  const lines = (block) => textOf(tokenize(renderBlock(block, ctx())));
  assert.deepEqual(lines({ type: 'example', title: 'T', steps: ['One.', 'Two.'], result: 'Done.' }), ['T', 'One.', 'Two.', 'Done.']);
  assert.deepEqual(lines({ type: 'callout', title: 'Tip', text: 'Body.' }), ['Tip', 'Body.']);
  assert.deepEqual(lines({ type: 'code', text: 'x = 1' }), []);
});
