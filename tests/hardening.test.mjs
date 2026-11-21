// Tests for the fixes from the independent review: unsafe SVG, output folders, the local server, paths
// outside the course, claims outside blocks, markup offsets, contrast, progress keys, non-Latin text,
// escaping under --force, course new, and the player's licence notice.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { blockTexts } from '../cli/lib/blocks.mjs';
import { renderBlock } from '../cli/lib/blockhtml.mjs';
import { buildCourse, checkOutput } from '../cli/lib/build.mjs';
import { courseFile } from '../cli/lib/files.mjs';
import { CSP } from '../cli/lib/layout.mjs';
import { checkLink, claimTokens, lintCourse, lintFigures, lintRestatedClaims, lintCourseClaims, lintTheme } from '../cli/lib/lint.mjs';
import { checkBlock, loadCourse } from '../cli/lib/load.mjs';
import { findProof } from '../cli/lib/quiz.mjs';
import { fileFor, parseRange, serve } from '../cli/lib/serve.mjs';
import { sanitizeSvg } from '../cli/lib/svg.mjs';
import { contrast, PRESETS, themeTokens, worstContrast } from '../cli/lib/theme.mjs';
import { parseInline, slugify, uniqueIds } from '../cli/lib/text.mjs';
import { checkSiteLinks } from '../cli/lib/verify.mjs';
import { basePathOf, progressKey } from '../site/js/progress-core.js';
import { buildIndex, search, wordsOf } from '../site/js/search-core.js';
import { EXAMPLE, lesson, rules, tempDir } from './helpers.mjs';

const CLI = new URL('../course', import.meta.url).pathname;
const NO_NARRATOR = { COURSE_NARRATOR: '/nonexistent/site-narrator' };

// ---- 1. SVG ----

const ATTACKS = [
  '<svg/onload=alert(1)><rect/onmouseover=alert(2) width="2"/></svg>',
  '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a><use href="jav&#x61;script:alert(1)"/></svg>',
  '<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="xlink:href" to="javascript:alert(1)"/></svg>',
  '<svg><image href="//evil.example/x.png"/><use href="//evil.example/s.svg#a"/></svg>',
  '<svg><style>@import url(//evil.example/x.css); * { display: none }</style><rect style="fill:url(https://evil.example/p)"/></svg>',
  '<svg><foreignObject><iframe src="https://evil.example"></iframe></foreignObject></svg>',
  '<svg><scr<script></script>ipt>alert(1)</script></svg>',
  '<svg><rect ONCLICK="alert(1)" fill="url(https://evil.example/p)"/><!-- <script>alert(1)</script> --></svg>',
  '<svg><![CDATA[<script>alert(1)</script>]]><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>',
];

test('every known SVG attack is removed and reported', () => {
  for (const attack of ATTACKS) {
    const { svg, removed } = sanitizeSvg(attack);
    assert.ok(removed.length > 0, attack);
    assert.doesNotMatch(svg, /\son[a-z]+=|<script|javascript:|<foreignobject|<animate|<set|<style|<image|<iframe|\/\/evil|url\(https/i, attack);
  }
});

test('escaped text stays text, never markup', () => {
  const { svg } = sanitizeSvg('<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>');
  assert.match(svg, /<text>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/text>/);
});

test('a clean figure keeps its shapes, classes, case and #fragment references', () => {
  const { svg, removed } = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect class="c-ink" fill="url(#g)" width="2" height="2"/><use href="#g"/><text class="t-serif">A &amp; B</text></svg>');
  assert.deepEqual(removed, []);
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.match(svg, /<linearGradient id="g">/);
  assert.match(svg, /fill="url\(#g\)"/);
  assert.match(svg, /<text class="t-serif">A &amp; B<\/text>/);
});

test('lint reports what the build would remove from an SVG', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'bad.svg'), ATTACKS[0]);
  const found = lintFigures(lesson({ blocks: [{ type: 'figure', src: 'bad.svg', alt: 'A long enough description of it.', caption: 'C.', cite: ['s1'] }] }), dir);
  assert.deepEqual(rules(found), ['unsafe-svg']);
  assert.match(found[0].message, /onload=.*onmouseover=/);
});

test('every built page carries a content security policy that allows only its own scripts', () => {
  const out = join(tempDir(), 'dist');
  buildCourse(loadCourse(EXAMPLE), { out, env: NO_NARRATOR });
  for (const page of ['index.html', 'clouds/index.html', 'glossary/index.html']) {
    const html = readFileSync(join(out, page), 'utf8');
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`), page);
    assert.doesNotMatch(html, /\son[a-z]+=/i, page);
  }
  assert.match(CSP, /script-src 'self';/);
  assert.doesNotMatch(CSP, /unsafe-inline/);
});

// ---- 2 and 5. output folders ----

function smallCourse(parent, extraBlocks = []) {
  const dir = join(parent, 'course');
  mkdirSync(join(dir, 'lessons'), { recursive: true });
  writeFileSync(join(dir, 'course.json'), JSON.stringify({ title: 'T', lessons: ['lessons/a.json'] }));
  writeFileSync(join(dir, 'lessons', 'a.json'), JSON.stringify({ id: 'a', title: 'A', blocks: [{ type: 'paragraph', text: 'Hello.', cite: ['s'] }, ...extraBlocks], sources: [{ id: 's', title: 'S', url: 'https://example.org' }] }));
  return dir;
}

test('an output folder that is the course folder or contains it is refused, and nothing is deleted', () => {
  const parent = tempDir();
  const dir = smallCourse(parent);
  for (const out of [dir, parent, join(parent, '..')]) {
    assert.throws(() => buildCourse(loadCourse(dir), { out, env: NO_NARRATOR }), /course folder or contains it/);
  }
  assert.ok(existsSync(join(dir, 'course.json')));
});

test('a non-empty folder not made by course build is refused; our own previous build is replaced', () => {
  const parent = tempDir();
  const dir = smallCourse(parent);
  const other = join(parent, 'photos');
  mkdirSync(other);
  writeFileSync(join(other, 'keep.jpg'), 'x');
  assert.throws(() => checkOutput(dir, other), /not empty and was not made by course build/);
  assert.ok(existsSync(join(other, 'keep.jpg')));
  const out = join(parent, 'site');
  buildCourse(loadCourse(dir), { out, env: NO_NARRATOR });
  buildCourse(loadCourse(dir), { out, env: NO_NARRATOR });
  assert.ok(existsSync(join(out, 'index.html')));
  assert.deepEqual(readdirSync(parent).sort(), ['course', 'photos', 'site']);
});

test('a build that fails leaves the previous site in place and no half-built folder', () => {
  const parent = tempDir();
  const dir = smallCourse(parent);
  const out = join(parent, 'site');
  buildCourse(loadCourse(dir), { out, env: NO_NARRATOR });
  const broken = join(parent, 'narrator');
  mkdirSync(join(broken, 'player', 'player.js'), { recursive: true }); // a folder where a file should be
  writeFileSync(join(broken, 'narrate'), '');
  assert.throws(() => buildCourse(loadCourse(dir), { out, env: { COURSE_NARRATOR: broken } }));
  assert.ok(existsSync(join(out, 'index.html')));
  assert.deepEqual(readdirSync(parent).sort(), ['course', 'narrator', 'site']);
});

test('a link to a folder does not crash the build', () => {
  const parent = tempDir();
  const dir = smallCourse(parent, [{ type: 'paragraph', text: 'See [the lessons](lessons).', cite: ['s'] }]);
  const out = join(parent, 'site');
  buildCourse(loadCourse(dir), { out, env: NO_NARRATOR });
  assert.match(readFileSync(join(out, 'a', 'index.html'), 'utf8'), /<a href="#">the lessons<\/a>/);
});

// ---- 3. server ----

test('Range headers: normal, open-ended, suffix, out of range and malformed', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
  for (const bad of ['bytes=100-', 'bytes=200-300', 'bytes=9-1', 'bytes=-0', 'bytes=-', 'items=0-1', 'bytes=0-1,5-6']) assert.equal(parseRange(bad, 100), null, bad);
});

test('the server answers 416 for an impossible range and keeps running', async () => {
  const root = tempDir();
  writeFileSync(join(root, 'a.mp3'), Buffer.from('0123456789'));
  const server = serve(root, { port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/a.mp3`, { headers: { range: 'bytes=50-60' } })).status, 416);
    const tail = await fetch(`${base}/a.mp3`, { headers: { range: 'bytes=-3' } });
    assert.equal(tail.status, 206);
    assert.equal(await tail.text(), '789');
    assert.equal((await fetch(`${base}/a.mp3`)).status, 200);
  } finally {
    server.close();
  }
  assert.equal(fileFor(root, '/a.mp3'), join(root, 'a.mp3'));
});

test('--port must be a number', () => {
  const result = spawnSync(CLI, ['serve', EXAMPLE, '--port', 'abc'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--port must be a number/);
  assert.doesNotMatch(result.stderr, /at .*\.mjs/);
});

// ---- 4. paths outside the course ----

test('course files must be regular files inside the course folder', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'f'));
  writeFileSync(join(dir, 'f', 'a.pdf'), 'x');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'x');
  assert.equal(courseFile(dir, 'f/a.pdf').rel, 'f/a.pdf');
  assert.equal(courseFile(dir, 'f/a.pdf#page=2').rel, 'f/a.pdf');
  for (const [path, why] of [['../outside.txt', /leaves the course/], ['/etc/passwd', /absolute/], ['f', /not a file/], ['', /empty/], ['f/../../x', /leaves the course/], ['.git/config', /hidden/], ['C:\\x', /absolute/], ['~/x', /absolute/]]) {
    assert.match(courseFile(dir, path).error, why, path);
  }
});

test('lint refuses links and figures outside the course, and the build never copies them', () => {
  const parent = tempDir();
  writeFileSync(join(parent, 'secret.txt'), 'private');
  const dir = smallCourse(parent, [
    { type: 'paragraph', text: 'See [this](../secret.txt).', cite: ['s'] },
    { type: 'figure', src: '../secret.txt', alt: 'A long enough description of it.', caption: 'C.', cite: ['s'] },
  ]);
  const loaded = loadCourse(dir);
  const found = lintCourse(loaded);
  assert.ok(found.some((item) => item.rule === 'broken-link' && /leaves the course/.test(item.message)));
  assert.ok(found.some((item) => item.rule === 'missing-image' && /leaves the course/.test(item.message)));
  const out = join(parent, 'site');
  buildCourse(loaded, { out, env: NO_NARRATOR });
  assert.ok(!existsSync(join(out, 'secret.txt')));
  assert.ok(!existsSync(join(parent, 'secret.txt.copy')));
  assert.doesNotMatch(readFileSync(join(out, 'a', 'index.html'), 'utf8'), /secret/);
  assert.match(checkLink('lessons', { lesson: loaded.lessons[0], lessons: loaded.lessons, glossary: [], dir }), /not a file/);
});

// ---- 6. claims ----

test('spelled-out quantities count as claims', () => {
  assert.deepEqual(claimTokens('one hundred, half, twice, fifty, 2.5 mm, 40%, per cent'), ['hundred', 'half', 'twice', 'fifty', '2.5', '40', 'percent', 'percent']);
  assert.deepEqual(claimTokens('one idea, two steps'), []);
});

test('recap, takeaways, headings, summary and quiz may only repeat claims a cited block states', () => {
  const base = { blocks: [{ type: 'paragraph', text: 'About 90 percent comes from the sea.', cite: ['s1'] }] };
  assert.deepEqual(lintRestatedClaims(lesson({ ...base, recap: ['About 90 percent is from the sea.'], takeaways: ['90 percent: the sea.'] })), []);
  const bad = lintRestatedClaims(lesson({ ...base, summary: 'Half of all rain.', recap: ['Twice as much.'], takeaways: ['80 percent.'], blocks: [...base.blocks, { type: 'heading', text: 'A thousand drops' }], quiz: [{ question: 'Is it 70 percent?', options: ['Yes', 'Fifty'], answer: 1, proof: 'x' }] }));
  assert.deepEqual(bad.map((item) => item.where.split(' ').pop()).sort(), ['blocks[1]', 'quiz[0].answer', 'quiz[0].question', 'recap[0]', 'summary', 'takeaways[0]']);
});

test('glossary definitions and the course subtitle are checked too', () => {
  const lessons = [lesson()];
  const found = lintCourseClaims(lessons, [{ term: 'Rain', definition: 'Falls at 9 metres a second.' }], { title: 'T', subtitle: 'Studies show rain is wet.' });
  assert.equal(found.length, 2);
});

test('"confirm" must be a non-empty reason', () => {
  assert.match(checkBlock({ type: 'paragraph', text: 'x', confirm: true }, 'w')[0].message, /confirm/);
  assert.match(checkBlock({ type: 'paragraph', text: 'x', confirm: ' ' }, 'w')[0].message, /confirm/);
  assert.deepEqual(checkBlock({ type: 'paragraph', text: 'x', confirm: 'not in the sources' }, 'w'), []);
});

test('build --strict fails while claims are marked confirm', () => {
  const work = tempDir();
  cpSync(EXAMPLE, join(work, 'c'), { recursive: true, filter: (path) => !path.includes('/dist') && !path.includes('/voice') });
  const result = spawnSync(CLI, ['build', join(work, 'c'), '--strict'], { encoding: 'utf8', env: { ...process.env, ...NO_NARRATOR } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /still marked "confirm"/);
  assert.ok(!existsSync(join(work, 'c', 'dist')));
});

// ---- 7. markup ----

test('decomposed (NFD) text keeps its marks in the right place', () => {
  const { text, marks } = parseInline('Cafe\u0301 [[dew point]] and [x](#a)');
  assert.equal(text, 'Café dew point and x');
  assert.equal(text.slice(marks[0].start, marks[0].end), 'dew point');
  assert.equal(text.slice(marks[1].start, marks[1].end), 'x');
});

test('a link target with balanced parentheses is kept whole', () => {
  const { marks } = parseInline('See [clouds](https://en.wikipedia.org/wiki/Cloud_(disambiguation)) here.');
  assert.equal(marks[0].href, 'https://en.wikipedia.org/wiki/Cloud_(disambiguation)');
});

test('a proof sentence with an ellipsis is found and anchored, whichever way it is typed', () => {
  const body = lesson({ blocks: [{ type: 'paragraph', text: 'Wait… the drop “falls” now. Then more.', cite: ['s1'] }] });
  for (const proof of ['Wait… the drop “falls” now.', 'Wait... the drop "falls" now.']) {
    const found = findProof(body, proof);
    assert.equal(found.text.slice(found.start, found.end), 'Wait… the drop “falls” now.');
    const html = renderBlock(body.blocks[0], { proofs: [{ text: proof, id: 'proof-1' }], citeOrder: new Map(), sources: body.sources, dir: '.' });
    assert.match(html, /<span class="proof" id="proof-1" data-proof="proof-1">Wait… the drop “falls” now\.<\/span>/);
  }
});

test('verify reports a quiz question whose proof anchor is missing', () => {
  const dist = tempDir();
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html lang="en"><body><h1>x</h1><li class="q" data-proof="proof-1"></li><li class="q" data-proof="proof-2"></li><span id="proof-2">y</span></body></html>');
  assert.deepEqual(rules(checkSiteLinks(dist, [join(dist, 'index.html')])), ['broken-proof']);
});

// ---- 8. contrast ----

test('every text colour of every theme reaches 4.5:1 on every background', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const [mode, tokens] of Object.entries(preset)) {
      for (const text of ['ink', 'soft', 'faint', 'accent', 'good', 'bad']) assert.ok(worstContrast(tokens[text], tokens) >= 4.5, `${name} ${mode} ${text}`);
      assert.ok(contrast(tokens.accentInk, tokens.accent) >= 4.5, `${name} ${mode} accentInk`);
    }
  }
});

test('a course accent gets a readable dark version and text colour; a pale one is warned about', () => {
  const tokens = themeTokens({ preset: 'paper', accent: '#175a72' });
  assert.ok(worstContrast(tokens.dark.accent, tokens.dark) >= 4.5);
  assert.ok(contrast(tokens.light.accentInk, tokens.light.accent) >= 4.5);
  assert.deepEqual(lintTheme({ theme: { preset: 'paper', accent: '#175a72' } }), []);
  assert.deepEqual(rules(lintTheme({ theme: { preset: 'paper', accent: '#ffcc00' } })), ['accent-contrast']);
});

test('a proof sentence keeps a visible focus outline', () => {
  const css = readFileSync(new URL('../site/course.css', import.meta.url), 'utf8');
  assert.match(css, /\.proof:focus \{ outline: 2px solid var\(--accent\)/);
  assert.doesNotMatch(css, /\.proof:focus \{ outline: none/);
});

// ---- 9 and 10. progress keys, non-Latin text ----

test('progress keys differ by course title and by the folder the site is served from', () => {
  const a = progressKey('course', 'Rain', '/a/');
  assert.notEqual(a, progressKey('course', 'Snow', '/a/'));
  assert.notEqual(a, progressKey('course', 'Rain', '/b/'));
  assert.equal(a, progressKey('course', 'Rain', '/a/'));
  assert.equal(basePathOf('../', 'https://example.org/courses/rain/clouds/index.html'), '/courses/rain/');
  assert.equal(basePathOf('', 'https://example.org/courses/rain/index.html'), '/courses/rain/');
});

test('non-Latin titles get stable, non-empty, distinct slugs; repeats are numbered', () => {
  const ru = slugify('Как образуется дождь');
  const zh = slugify('雨是怎样形成的');
  assert.match(ru, /^s-[0-9a-f]{6}$/);
  assert.match(zh, /^s-[0-9a-f]{6}$/);
  assert.notEqual(ru, zh);
  assert.equal(ru, slugify('Как образуется дождь'));
  assert.equal(slugify('   '), '');
  const unique = uniqueIds();
  assert.deepEqual(['a', 'a', 'b', 'a'].map(unique), ['a', 'a-2', 'b', 'a-3']);
});

test('search handles Cyrillic and CJK text', () => {
  const index = buildIndex([
    { kind: 'section', title: 'Облака', text: 'Облака состоят из капель воды.', url: 'ru' },
    { kind: 'section', title: '雲', text: '雲は小さな水滴でできている。', url: 'ja' },
  ]);
  assert.deepEqual(wordsOf('Облака состоят'), ['облака', 'состоят']);
  assert.equal(search(index, 'капель')[0].url, 'ru');
  assert.equal(search(index, 'капл')[0]?.url, undefined); // a different word form is not matched
  assert.equal(search(index, '水滴')[0].url, 'ja');
});

// ---- 11. escaping under --force ----

test('a bad callout tone or quiz answer never reaches the HTML unescaped', () => {
  const html = renderBlock({ type: 'callout', tone: '"><script>alert(1)</script>', text: 'x' }, { citeOrder: new Map(), sources: [], dir: '.' });
  assert.match(html, /class="callout callout-note"/);
  assert.doesNotMatch(html, /<script/);
});

test('verify flags javascript:, data: and file: addresses, however they are written', () => {
  const dist = tempDir();
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html lang="en"><body><h1>x</h1><a href="java&#x09;script:alert(1)">a</a><a href=" JavaScript:alert(1)">b</a><a href="data:text/html,x">c</a><img src="file:///etc/passwd" alt="x"><a href="mailto:a@example.org">ok</a></body></html>');
  assert.deepEqual(rules(checkSiteLinks(dist, [join(dist, 'index.html')])), ['unsafe-url', 'unsafe-url', 'unsafe-url', 'unsafe-url']);
});

// ---- 12. course new ----

test('course new into a non-empty folder is a clear error, not a stack trace', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'notes.txt'), 'x');
  const result = spawnSync(CLI, ['new', dir], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /is not empty/);
  assert.doesNotMatch(result.stderr, /at .*\.mjs/);
  assert.deepEqual(readdirSync(dir), ['notes.txt']);
});

// ---- 13. licence notice ----

test("site-narrator's licence travels with the copied player", () => {
  const parent = tempDir();
  const dir = smallCourse(parent);
  const narrator = join(parent, 'narrator');
  mkdirSync(join(narrator, 'player'), { recursive: true });
  writeFileSync(join(narrator, 'narrate'), '');
  writeFileSync(join(narrator, 'player', 'player.js'), 'export const createNarrator = () => ({});');
  writeFileSync(join(narrator, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026 Example');
  const out = join(parent, 'site');
  buildCourse(loadCourse(dir), { out, env: { COURSE_NARRATOR: narrator } });
  assert.match(readFileSync(join(out, 'assets', 'js', 'player.js.LICENSE.txt'), 'utf8'), /MIT License/);
});

// ---- 14. example facts ----

test('the example no longer states the disputed cloud droplet size range', () => {
  const text = loadCourse(EXAMPLE).lessons.flatMap((item) => item.blocks.flatMap(blockTexts)).join(' ');
  assert.doesNotMatch(text, /microns/);
});
