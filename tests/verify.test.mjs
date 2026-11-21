import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileFor } from '../cli/lib/serve.mjs';
import { voiceKey } from '../cli/lib/text.mjs';
import { checkAccessibility, checkAssets, checkNarration, checkSiteLinks } from '../cli/lib/verify.mjs';
import { rules, tempDir } from './helpers.mjs';

const doc = (body, head = '<title>T</title><meta name="viewport" content="width=device-width">') => `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

function site(files) {
  const dist = tempDir();
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dist, path, '..'), { recursive: true });
    writeFileSync(join(dist, path), content);
  }
  return dist;
}

test('links to missing files and missing anchors are found; folders resolve to index.html', () => {
  const dist = site({
    'index.html': doc('<h1>x</h1><a href="a/">ok</a><a href="a/index.html#here">ok</a><a href="a/#gone">bad anchor</a><a href="b/">missing</a><a href="#top">self</a><img src="i.png" alt="">'),
    'a/index.html': doc('<h1 id="here">a</h1>'),
  });
  const found = checkSiteLinks(dist, [join(dist, 'index.html')]);
  assert.deepEqual(rules(found).sort(), ['broken-anchor', 'broken-anchor', 'broken-link', 'broken-link']);
});

test('scripts, styles and images from other servers are third-party requests; plain links are fine', () => {
  const dist = site({ 'index.html': doc('<h1>x</h1><a href="https://example.org">fine</a><script src="https://cdn.example/x.js"></script><img src="//cdn.example/i.png" alt="i">'), 'a.css': '@import url("https://fonts.example/x.css");', 'b.js': 'fetch("https://api.example/x")' });
  assert.deepEqual(rules(checkSiteLinks(dist, [join(dist, 'index.html')])), ['third-party', 'third-party']);
  assert.deepEqual(rules(checkAssets([join(dist, 'a.css'), join(dist, 'b.js')])), ['third-party', 'third-party']);
});

test('links may not leave the site folder', () => {
  const dist = site({ 'index.html': doc('<h1>x</h1><a href="../../etc/passwd">x</a>') });
  assert.deepEqual(rules(checkSiteLinks(dist, [join(dist, 'index.html')])), ['outside-site']);
});

test('accessibility basics', () => {
  assert.deepEqual(checkAccessibility(doc('<h1>One</h1><h2>Two</h2><button aria-label="Close"></button><label for="q">Q</label><input id="q">'), 'p'), []);
  const bad = doc('<h1>A</h1><h1>B</h1><h4>C</h4><img src="x.png"><button></button><a href="x"></a><input id="n"><p id="d"></p><p id="d"></p><div role="img"></div>');
  assert.deepEqual(rules(checkAccessibility(bad, 'p')).sort(), ['a11y-alt', 'a11y-alt', 'a11y-button', 'a11y-duplicate-id', 'a11y-h1', 'a11y-heading-skip', 'a11y-label', 'a11y-link']);
  assert.deepEqual(rules(checkAccessibility('<html><body><h1>x</h1></body></html>', 'p')).sort(), ['a11y-lang', 'a11y-title', 'a11y-viewport']);
});

test('every [data-line] needs a recording named by the hash of its text', () => {
  const line = 'Rain starts as water on the ground.';
  const other = 'A line nobody recorded.';
  const dist = site({
    'index.html': doc(`<h1>x</h1><p><span data-line>Rain starts as <button>water</button> on the ground.</span></p><p><span data-line>${other}</span></p>`),
    [`voice/${voiceKey(line)}.mp3`]: Buffer.alloc(4000, 1),
    'voice/0000000000.mp3': Buffer.alloc(4000, 1),
  });
  const result = checkNarration(dist, [join(dist, 'index.html')], { manifest: { lines: { [voiceKey(line)]: { seconds: 2.1, level: 0.08 } } } });
  assert.deepEqual(rules(result.issues).sort(), ['missing-recording', 'unused-recording']);
  assert.equal(result.lines, 2);
  assert.equal(Math.round(result.seconds * 10), 21);
});

test('silent, short and empty recordings are errors', () => {
  const line = 'Quiet.';
  const dist = site({ 'index.html': doc(`<h1>x</h1><span data-line>${line}</span>`), [`voice/${voiceKey(line)}.mp3`]: Buffer.alloc(100) });
  const found = checkNarration(dist, [join(dist, 'index.html')], { manifest: { lines: { [voiceKey(line)]: { seconds: 0.1, level: 0 } } } });
  assert.deepEqual(rules(found.issues).sort(), ['empty-recording', 'short-recording', 'silent-recording']);
});

test('the local server refuses dot-files and paths outside its folder', () => {
  const dist = site({ 'index.html': 'x', '.secret': 'x', 'a/index.html': 'y' });
  assert.equal(fileFor(dist, '/'), join(dist, 'index.html'));
  assert.equal(fileFor(dist, '/a/'), join(dist, 'a', 'index.html'));
  assert.equal(fileFor(dist, '/.secret'), null);
  assert.equal(fileFor(dist, '/../../etc/passwd'), null);
  assert.equal(fileFor(dist, '/%E0%A4%A'), null);
});
