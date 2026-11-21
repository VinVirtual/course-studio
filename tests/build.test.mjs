import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCourse } from '../cli/lib/build.mjs';
import { textOf, tokenize } from '../cli/lib/html.mjs';
import { loadCourse } from '../cli/lib/load.mjs';
import { narratorPlayer } from '../cli/lib/paths.mjs';
import { voiceKey } from '../cli/lib/text.mjs';
import { verifySite } from '../cli/lib/verify.mjs';
import { EXAMPLE, tempDir } from './helpers.mjs';

const NO_NARRATOR = { COURSE_NARRATOR: '/nonexistent/site-narrator' };

test('without site-narrator the site still builds, with no voice and no player', () => {
  const out = join(tempDir(), 'dist');
  const { recorded } = buildCourse(loadCourse(EXAMPLE), { out, env: NO_NARRATOR });
  assert.equal(recorded, 0);
  for (const file of ['index.html', 'glossary/index.html', 'water-into-air/index.html', 'clouds/index.html', 'raindrops/index.html', 'assets/course.css', 'assets/theme.css', 'assets/search.json', 'assets/js/main.js', 'assets/fonts/InstrumentSerif-Regular.woff2']) {
    assert.ok(existsSync(join(out, file)), file);
  }
  assert.ok(!existsSync(join(out, 'assets', 'js', 'player.js')));
  assert.match(readFileSync(join(out, 'clouds', 'index.html'), 'utf8'), /"voice":false/);
  const result = verifySite(out, { requireVoice: false });
  assert.deepEqual(result.issues.filter((item) => item.level === 'error'), []);
  assert.ok(verifySite(out).issues.some((item) => item.rule === 'no-voice'));
});

test('every line on the built pages is a line that was collected for recording', () => {
  const out = join(tempDir(), 'dist');
  const { lines } = buildCourse(loadCourse(EXAMPLE), { out, env: NO_NARRATOR });
  const collected = new Set(lines.map((line) => line.key));
  for (const id of ['water-into-air', 'clouds', 'raindrops']) {
    const onPage = textOf(tokenize(readFileSync(join(out, id, 'index.html'), 'utf8')));
    assert.ok(onPage.length > 10);
    for (const text of onPage) assert.ok(collected.has(voiceKey(text)), `${id}: ${text}`);
    assert.equal(new Set(onPage.map(voiceKey)).size, lines.filter((line) => line.lesson === id).length);
  }
});

test('a lesson page holds the parts it promises', () => {
  const out = join(tempDir(), 'dist');
  buildCourse(loadCourse(EXAMPLE), { out, env: NO_NARRATOR });
  const html = readFileSync(join(out, 'clouds', 'index.html'), 'utf8');
  assert.match(html, /<h1>Clouds are made of droplets<\/h1>/);
  assert.match(html, /class="term" data-term="dew-point"/);
  assert.match(html, /id="proof-1"/);
  assert.match(html, /id="proof-2"/);
  assert.match(html, /href="#src-usgs-cond"/);
  assert.match(html, /rel="next"/);
  assert.match(html, /<svg aria-hidden="true"/);
  assert.match(html, /role="img" aria-label="A circle of air rises/);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.usgs\.gov|scied\.ucar\.edu|www\.w3\.org\/2000\/svg)/);
  const search = JSON.parse(readFileSync(join(out, 'assets', 'search.json'), 'utf8'));
  assert.ok(search.some((entry) => entry.kind === 'term' && entry.title === 'Coalescence'));
  assert.ok(search.some((entry) => entry.url === 'clouds/index.html#cooling-to-the-dew-point'));
});

test('with site-narrator and recordings, the built example verifies', { skip: !existsSync(narratorPlayer()) && 'site-narrator not installed' }, () => {
  const out = join(tempDir(), 'dist');
  const { recorded } = buildCourse(loadCourse(EXAMPLE), { out });
  assert.ok(recorded > 40);
  const manifest = JSON.parse(readFileSync(join(EXAMPLE, 'voice', 'manifest.json'), 'utf8'));
  const result = verifySite(out, { manifest });
  assert.deepEqual(result.issues.filter((item) => item.level === 'error'), []);
  assert.equal(result.narration.lines, recorded);
});

test('the output folder may not be the course folder', () => {
  assert.throws(() => buildCourse(loadCourse(EXAMPLE), { out: EXAMPLE, env: NO_NARRATOR }), /must not be the course folder/);
});
