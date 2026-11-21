// Records the course's narration with site-narrator: writes the lines and a narrate.json, then runs its CLI.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { courseLines } from './blocks.mjs';
import { hasNarrator, narratorCli, narratorHome } from './paths.mjs';

/** The narrate.json site-narrator reads. Lines come from voice-lines.json, written next to it. */
export function narrateConfig(course) {
  const { voice = 'af_heart', speed = 0.96, say = {}, lang, bitrate = 32 } = course.voice;
  return { source: 'voice-lines.json', out: 'voice', voice, speed, bitrate, ...(lang ? { lang } : {}), say };
}

export function writeNarration(loaded) {
  const lines = courseLines(loaded.lessons);
  writeFileSync(join(loaded.dir, 'voice-lines.json'), `${JSON.stringify(lines, null, 1)}\n`);
  writeFileSync(join(loaded.dir, 'narrate.json'), `${JSON.stringify(narrateConfig(loaded.course), null, 2)}\n`);
  return lines;
}

/** Runs one site-narrator command on the course folder, streaming its output. Returns the exit code. */
export function runNarrator(command, dir, extra = [], env = process.env) {
  if (!hasNarrator(env)) throw new Error(`site-narrator not found at ${narratorHome(env)}. Install it or set COURSE_NARRATOR to its folder`);
  const result = spawnSync(narratorCli(env), [command, dir, ...extra], { stdio: 'inherit', env });
  return result.status ?? 1;
}
