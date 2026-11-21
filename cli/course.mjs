#!/usr/bin/env node
// course-studio command line. `course help` lists the commands.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BuildError, buildCourse } from './lib/build.mjs';
import { CourseError, loadCourse } from './lib/load.mjs';
import { formatIssues, lintCourse, toConfirm } from './lib/lint.mjs';
import { runNarrator, writeNarration } from './lib/narrate.mjs';
import { hasNarrator, hasReel, narratorCli, narratorHome, reelHome, SKILL, TEMPLATES } from './lib/paths.mjs';
import { serve } from './lib/serve.mjs';
import { verifySite } from './lib/verify.mjs';
import { makeVideos } from './lib/video.mjs';

const HELP = `course-studio: turn source material into a static, narrated lesson site.

  course check                      check node, site-narrator and (optional) reel-studio
  course new <dir>                  start a course from the template
  course lint [dir]                 check sources, length, glossary, quiz proofs, links, figures   [--strict] [--json]
  course narrate [dir]              record every readable line with site-narrator               [--dry-run] [--force]
  course video [dir] [lesson ...]   optional: a short video per lesson with reel-studio
  course build [dir]                write the static site to <dir>/dist                          [--out <dir>] [--force]
  course serve [dir]                serve the built site on http://127.0.0.1:4180               [--port N]
  course verify [dir]               links, sizes, a recording for every line, accessibility      [--out <dir>] [--no-voice] [--json]
  course test                       run the unit tests

dir defaults to the current folder (the one holding course.json).
site-narrator is found at ~/.claude/skills/site-narrator (COURSE_NARRATOR overrides),
reel-studio at ~/.claude/skills/reel-studio (COURSE_REEL overrides).`;

const FLAGS = {
  lint: { strict: false, json: false },
  narrate: { 'dry-run': false, force: false },
  build: { out: true, force: false, strict: false },
  verify: { out: true, 'no-voice': false, json: false },
  serve: { port: true },
  video: {},
  new: {},
  check: {},
  test: {},
};

function parse(command, args) {
  const allowed = FLAGS[command];
  const options = {};
  const rest = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!(name in allowed)) throw new CourseError(`unknown option ${arg} for "course ${command}"`);
    if (allowed[name] === true) {
      if (index + 1 >= args.length) throw new CourseError(`${arg} needs a value`);
      options[name] = args[(index += 1)];
    } else options[name] = true;
  }
  return { options, rest };
}

const say = (text) => process.stdout.write(`${text}\n`);
const count = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;
const errors = (issues) => issues.filter((item) => item.level === 'error');

function printLint(loaded, issues) {
  if (issues.length) say(formatIssues(issues));
  const confirm = toConfirm(loaded.lessons);
  if (confirm.length) {
    say(`\nTo confirm with the user (${confirm.length} claim${confirm.length === 1 ? '' : 's'} not traced to a source):`);
    for (const item of confirm) say(`  - ${item.where}: "${item.claim}" (${item.why})`);
  }
  say(`\n${count(loaded.lessons.length, 'lesson')}, ${count(loaded.glossary.length, 'glossary term')}: ${count(errors(issues).length, 'error')}, ${count(issues.length - errors(issues).length, 'warning')}`);
}

function lint(dir, options) {
  const loaded = loadCourse(dir);
  const issues = lintCourse(loaded);
  if (options.json) say(JSON.stringify({ issues, confirm: toConfirm(loaded.lessons) }, null, 2));
  else printLint(loaded, issues);
  return errors(issues).length || (options.strict && issues.length) ? 1 : 0;
}

function build(dir, options) {
  const loaded = loadCourse(dir);
  const issues = lintCourse(loaded);
  if (errors(issues).length) {
    say(formatIssues(errors(issues)));
    if (!options.force) {
      say(`\n${errors(issues).length} lint errors: fix them, or build anyway with --force`);
      return 1;
    }
  }
  const confirm = toConfirm(loaded.lessons);
  if (options.strict && confirm.length) {
    say(`${count(confirm.length, 'claim')} still marked "confirm" (not traced to a source):`);
    for (const item of confirm) say(`  - ${item.where}: "${item.claim}" (${item.why})`);
    say('\n--strict: confirm them with the user (then cite a source, or remove the claim) before publishing');
    return 1;
  }
  buildCourse(loaded, { out: options.out && resolve(options.out), log: say });
  return 0;
}

function verify(dir, options) {
  const loaded = existsSync(join(resolve(dir), 'course.json')) ? loadCourse(dir) : null;
  const dist = resolve(options.out ?? (loaded ? join(loaded.dir, 'dist') : dir));
  const manifestFile = loaded ? join(loaded.dir, 'voice', 'manifest.json') : join(dist, 'voice', 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
  const result = verifySite(dist, { manifest, requireVoice: !options['no-voice'] });
  if (options.json) {
    say(JSON.stringify(result, null, 2));
    return errors(result.issues).length ? 1 : 0;
  }
  if (result.issues.length) say(formatIssues(result.issues));
  if (result.sizes) {
    const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
    const { sizes, narration } = result;
    say(`\n${result.pages} pages · total ${kb(sizes.total)} · HTML ${kb(sizes.html)} · JS ${kb(sizes.jsGzip)} gz · CSS ${kb(sizes.cssGzip)} gz · fonts ${kb(sizes.fonts)} · voice ${kb(sizes.voice)}${sizes.video ? ` · video ${kb(sizes.video)}` : ''}`);
    if (narration?.lines) say(`narration: ${narration.lines} lines${narration.seconds ? `, ${Math.round(narration.seconds)} s` : ''}, ${kb(narration.bytes)}`);
  }
  const failed = errors(result.issues).length;
  say(failed ? `\n${failed} errors` : '\nok');
  return failed ? 1 : 0;
}

function narrate(dir, options) {
  const loaded = loadCourse(dir);
  const issues = errors(lintCourse(loaded));
  if (issues.length) {
    say(formatIssues(issues));
    say('\nfix the lint errors before recording, so nothing is recorded twice');
    return 1;
  }
  const lines = writeNarration(loaded);
  say(`wrote voice-lines.json (${lines.length} lines) and narrate.json`);
  const extra = ['--workers', '2', ...(options['dry-run'] ? ['--dry-run'] : []), ...(options.force ? ['--force'] : [])];
  const recorded = runNarrator('record', loaded.dir, extra);
  if (recorded !== 0 || options['dry-run']) return recorded;
  return runNarrator('verify', loaded.dir);
}

function check() {
  let ok = true;
  const line = (good, label, hint = '') => {
    say(`${good ? 'ok  ' : 'MISSING'}  ${label}${!good && hint ? `\n         ${hint}` : ''}`);
    return good;
  };
  const [major, minor] = process.versions.node.split('.').map(Number);
  ok = line(major > 18 || (major === 18 && minor >= 17), `node ${process.versions.node} (18.17 or newer)`, 'install Node.js 18.17 or newer') && ok;
  const narrator = line(hasNarrator(), `site-narrator (${narratorHome()})`, 'git clone https://github.com/VinVirtual/site-narrator ~/.claude/skills/site-narrator, or set COURSE_NARRATOR');
  ok = narrator && ok;
  if (narrator) {
    say('\nsite-narrator check:');
    ok = (spawnSync(narratorCli(), ['check'], { stdio: 'inherit' }).status === 0) && ok;
  }
  say('');
  line(hasReel(), `reel-studio (${reelHome()}), optional: only for \`course video\``, 'git clone https://github.com/VinVirtual/reel-studio ~/.claude/skills/reel-studio, or set COURSE_REEL');
  say(ok ? '\nall good' : '\nsomething is missing (see above)');
  return ok ? 0 : 1;
}

function newCourse(dir) {
  if (!dir) throw new CourseError('usage: course new <dir>');
  const target = resolve(dir);
  if (existsSync(join(target, 'course.json'))) throw new CourseError(`${target} already holds a course.json`);
  if (existsSync(target) && !statSync(target).isDirectory()) throw new CourseError(`${target} is a file, not a folder`);
  if (existsSync(target) && readdirSync(target).length) throw new CourseError(`${target} is not empty. Use a new or empty folder (course new never overwrites files)`);
  cpSync(TEMPLATES, target, { recursive: true, errorOnExist: true, force: false });
  say(`course ready: ${relative(process.cwd(), target) || '.'}`);
  say('next: put the source material in sources/, write the lessons, then: course lint → course narrate → course build → course verify');
  return 0;
}

function main(argv) {
  const [command = 'help', ...args] = argv;
  if (command === 'help' || command === '--help' || command === '-h') {
    say(HELP);
    return 0;
  }
  if (!(command in FLAGS)) throw new CourseError(`unknown command "${command}". Run "course help"`);
  const { options, rest } = parse(command, args);
  const dir = rest[0] ?? '.';
  switch (command) {
    case 'check':
      return check();
    case 'new':
      return newCourse(rest[0]);
    case 'lint':
      return lint(dir, options);
    case 'narrate':
      return narrate(dir, options);
    case 'video': {
      const loaded = loadCourse(dir);
      const { made, failed, project } = makeVideos(loaded, rest.slice(1), { log: say });
      say(`videos: ${made.length} made${failed.length ? `, failed: ${failed.join(', ')}` : ''} (project: ${relative(process.cwd(), project)}). Run course build to add them to the site.`);
      return failed.length ? 1 : 0;
    }
    case 'build':
      return build(dir, options);
    case 'serve': {
      const folder = existsSync(join(resolve(dir), 'course.json')) ? join(resolve(dir), 'dist') : resolve(dir);
      if (!existsSync(join(folder, 'index.html'))) throw new CourseError(`${folder} has no index.html: run course build first`);
      const port = options.port === undefined ? 4180 : Number(options.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535 || !/^\d+$/.test(String(options.port ?? 4180))) throw new CourseError(`--port must be a number from 0 to 65535 (got ${options.port})`);
      serve(folder, { port, log: say });
      return null;
    }
    case 'verify':
      return verify(dir, options);
    case 'test': {
      const tests = readdirSync(join(SKILL, 'tests')).filter((file) => file.endsWith('.test.mjs')).map((file) => join(SKILL, 'tests', file));
      return spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' }).status ?? 1;
    }
    default:
      return 1;
  }
}

try {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exitCode = code;
} catch (error) {
  if (error instanceof CourseError || error.code === 'ENOENT') {
    process.stderr.write(`course: ${error.message}\n`);
    process.exitCode = 2;
  } else if (error instanceof BuildError || (error instanceof Error && /not found at|unknown lesson|reel new failed/.test(error.message))) {
    process.stderr.write(`course: ${error.message}\n`);
    process.exitCode = 2;
  } else throw error;
}
