// Where course-studio finds the two skills it builds on. Both can be moved with an environment variable.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE = join(SKILL, 'site');
export const TEMPLATES = join(SKILL, 'templates');

export const narratorHome = (env = process.env) => resolve(env.COURSE_NARRATOR || join(homedir(), '.claude', 'skills', 'site-narrator'));
export const reelHome = (env = process.env) => resolve(env.COURSE_REEL || join(homedir(), '.claude', 'skills', 'reel-studio'));

export const narratorCli = (env) => join(narratorHome(env), 'narrate');
export const narratorPlayer = (env) => join(narratorHome(env), 'player', 'player.js');
export const reelCli = (env) => join(reelHome(env), 'reel');

export const hasNarrator = (env) => existsSync(narratorCli(env)) && existsSync(narratorPlayer(env));
export const hasReel = (env) => existsSync(reelCli(env));
