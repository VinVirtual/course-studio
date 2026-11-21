// Builds the static site: one folder per lesson, a glossary, assets, recordings and a search index.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { blockTexts, lessonLines } from './blocks.mjs';
import { glossaryPage, indexPage, lessonPage, searchEntries } from './pages.mjs';
import { hasNarrator, narratorPlayer, SITE } from './paths.mjs';
import { parseInline, voiceKey } from './text.mjs';
import { themeCss } from './theme.mjs';

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

/** Files a lesson refers to on disk: raster figures and relative file links. */
function lessonFiles(lesson) {
  const files = [];
  for (const block of lesson.blocks) {
    if (block.type === 'figure' && !block.src.toLowerCase().endsWith('.svg')) files.push(block.src);
    for (const source of blockTexts(block)) {
      for (const mark of parseInline(source).marks) {
        if (mark.kind === 'link' && !/^([a-z][a-z0-9+.-]*:|#)/i.test(mark.href)) files.push(mark.href.split('#')[0]);
      }
    }
  }
  return files;
}

/** The lesson video made by `course video`, if there is one. */
function videoFor(dir, lesson) {
  const web = join(dir, 'video', 'out', 'web');
  const mp4 = join(web, `${lesson.id}.mp4`);
  if (!existsSync(mp4)) return null;
  const poster = join(web, `${lesson.id}.jpg`);
  const vtt = join(web, `${lesson.id}.vtt`);
  return { files: { mp4, poster: existsSync(poster) ? poster : null, vtt: existsSync(vtt) ? vtt : null }, src: `video/${lesson.id}.mp4`, poster: `video/${lesson.id}.jpg`, vtt: existsSync(vtt) ? `video/${lesson.id}.vtt` : null };
}

export function buildCourse(loaded, { out, env = process.env, log = () => {} } = {}) {
  const { course, lessons, glossary, dir } = loaded;
  const dist = resolve(out ?? join(dir, 'dist'));
  if (dist === resolve(dir) || !relative(dir, dist) || relative(dist, dir) === '') throw new Error('the output folder must not be the course folder');
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  // assets
  cpSync(join(SITE, 'course.css'), join(dist, 'assets', 'course.css'));
  cpSync(join(SITE, 'icon.svg'), join(dist, 'assets', 'icon.svg'));
  cpSync(join(SITE, 'fonts'), join(dist, 'assets', 'fonts'), { recursive: true });
  cpSync(join(SITE, 'js'), join(dist, 'assets', 'js'), { recursive: true });
  write(join(dist, 'assets', 'theme.css'), themeCss(course.theme));
  const narrator = hasNarrator(env);
  if (narrator) copyFileSync(narratorPlayer(env), join(dist, 'assets', 'js', 'player.js'));
  else log('warning: site-narrator not found; read-aloud is left out (set COURSE_NARRATOR)');

  // recordings: only the ones the course still uses
  const voiceDir = join(dir, 'voice');
  const lines = lessons.flatMap((lesson) => lessonLines(lesson).map((text) => ({ lesson: lesson.id, text, key: voiceKey(text) })));
  let recorded = 0;
  for (const line of lines) {
    const file = join(voiceDir, `${line.key}.mp3`);
    if (narrator && existsSync(file)) {
      if (!existsSync(join(dist, 'voice', `${line.key}.mp3`))) {
        mkdirSync(join(dist, 'voice'), { recursive: true });
        copyFileSync(file, join(dist, 'voice', `${line.key}.mp3`));
        recorded += 1;
      }
      line.recorded = true;
    }
  }
  const voiced = new Set(lines.filter((line) => line.recorded).map((line) => line.lesson));

  // pages
  write(join(dist, 'index.html'), indexPage({ course, lessons, glossary }));
  write(join(dist, 'glossary', 'index.html'), glossaryPage({ course, lessons, glossary }));
  for (const lesson of lessons) {
    const video = videoFor(dir, lesson);
    if (video) {
      copyFileSync(video.files.mp4, join(mkdirp(join(dist, 'video')), `${lesson.id}.mp4`));
      if (video.files.poster) copyFileSync(video.files.poster, join(dist, 'video', `${lesson.id}.jpg`));
      if (video.files.vtt) copyFileSync(video.files.vtt, join(dist, 'video', `${lesson.id}.vtt`));
    }
    const { html } = lessonPage({ course, lessons, glossary, lesson, dir, video: video && video.files.poster ? video : null, voice: voiced.has(lesson.id) });
    write(join(dist, lesson.id, 'index.html'), html);
    for (const file of lessonFiles(lesson)) {
      const from = join(dir, file);
      if (existsSync(from)) write(join(dist, 'files', file), readFileSync(from));
    }
  }

  write(join(dist, 'assets', 'search.json'), JSON.stringify(searchEntries({ lessons, glossary })));
  write(
    join(dist, 'build.json'),
    JSON.stringify({ generator: 'course-studio', course: course.slug, lessons: lessons.map((lesson) => lesson.id), lines: lines.map(({ lesson, text, key }) => ({ lesson, key, text })) }, null, 1),
  );
  const plural = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;
  log(`built ${plural(lessons.length, 'lesson')}, ${plural(glossary.length, 'glossary term')}, ${plural(recorded, 'recording')} of ${plural(new Set(lines.map((line) => line.key)).size, 'line')} → ${relative(process.cwd(), dist) || '.'}`);
  return { dist, lines, recorded };
}

function mkdirp(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export const listFiles = (root) =>
  readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
