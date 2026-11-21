// An optional short video per lesson, made with reel-studio: a title card, the takeaways and a closing card.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasReel, reelCli, reelHome } from './paths.mjs';
import { PRESETS } from './theme.mjs';
import { sectionsOf } from './blocks.mjs';
import { plainText, tidy } from './text.mjs';

const MAX_ITEMS = 4;
const MAX_ITEM_CHARS = 64;

const shorten = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/** The reel-studio script for one lesson. Only text that is already in the lesson is used. */
export function lessonScript(lesson, course) {
  // Section titles are short enough for the screen; the recap lines are what the voice says over them.
  const parts = sectionsOf(lesson).filter((section) => section.heading).map((section) => shorten(section.title, MAX_ITEM_CHARS)).slice(0, MAX_ITEMS);
  const recap = lesson.recap.map(tidy);
  const scenes = [
    { id: 'title', type: 'title', kicker: `LESSON ${lesson.number}`, title: lesson.title, say: tidy(lesson.summary || lesson.title) },
  ];
  if (parts.length) scenes.push({ id: 'parts', type: 'steps', tag: 'IN THIS LESSON', title: 'Step by step', items: parts, say: recap.slice(0, MAX_ITEMS).join(' ') || lesson.takeaways.map((item) => tidy(plainText(item))).join(' ') });
  scenes.push({ id: 'end', type: 'cta', title: 'Read the full lesson', say: `The full lesson, with its sources and a short quiz, is in ${course.title}.` });
  return { lead: 0.3, pause: 0.45, tail: 2, scenes };
}

/** Patches the brand.json that `reel new` wrote: course name, theme colours, landscape format. */
export function lessonBrand(brand, course) {
  const preset = PRESETS[course.theme.preset] ?? PRESETS.paper;
  const dark = preset.dark;
  return {
    ...brand,
    name: course.title,
    format: course.video.format ?? 'embed',
    wordmark: [{ text: course.title }],
    colors: { ...brand.colors, bg: dark.bg, panel: dark.surface, panel2: dark.sunk, text: dark.ink, soft: dark.soft, mute: dark.faint, accent: course.theme.accent ?? dark.accent, accent2: dark.accent },
    voice: course.voice.voice ?? brand.voice,
    speed: course.video.speed ?? 1,
    music: { ...(brand.music ?? {}), on: course.video.music ?? false },
    captions: course.video.captions ?? true,
  };
}

/** Writes the video project for the chosen lessons and renders them with reel-studio. */
export function makeVideos(loaded, ids, { env = process.env, log = () => {} } = {}) {
  if (!hasReel(env)) throw new Error(`reel-studio not found at ${reelHome(env)}. Install it or set COURSE_REEL to its folder`);
  const project = join(loaded.dir, 'video');
  const run = (args) => spawnSync(reelCli(env), args, { stdio: 'inherit', env }).status ?? 1;
  if (!existsSync(join(project, 'brand.json')) && run(['new', project]) !== 0) throw new Error('reel new failed');
  const brandFile = join(project, 'brand.json');
  writeFileSync(brandFile, `${JSON.stringify(lessonBrand(JSON.parse(readFileSync(brandFile, 'utf8')), loaded.course), null, 1)}\n`);
  const lessons = ids.length ? loaded.lessons.filter((lesson) => ids.includes(lesson.id)) : loaded.lessons;
  if (ids.length && lessons.length !== ids.length) throw new Error(`unknown lesson: ${ids.filter((id) => !lessons.some((lesson) => lesson.id === id)).join(', ')}`);
  const failed = [];
  for (const lesson of lessons) {
    writeFileSync(join(project, `${lesson.id}.json`), `${JSON.stringify(lessonScript(lesson, loaded.course), null, 1)}\n`);
    log(`video: ${lesson.id}`);
    if (run(['lint', project, lesson.id]) !== 0 || run(['audio', project, lesson.id]) !== 0 || run(['video', project, lesson.id, '--web', '--workers', String(loaded.course.video.workers ?? 2)]) !== 0) failed.push(lesson.id);
  }
  return { project, made: lessons.map((lesson) => lesson.id).filter((id) => !failed.includes(id)), failed };
}
