---
name: course-studio
description: Turn source material (the user's documents, notes, papers or an outline plus sources) into a complete static, interactive lesson site, on this machine and for free. Plans lessons, writes each lesson as structured blocks with citations, records narration locally with site-narrator (Kokoro), adds diagrams, a quiz per lesson whose answers link to the proving sentence, a glossary with underlined terms and popovers, full-text search and saved reading progress, then builds a fast site that works on any static host with no server and no third-party requests. Optional short lesson videos with reel-studio. Use whenever the user wants a course, lessons, a tutorial series, a study guide, training material, an explainer site, "turn these documents into lessons", "make a course from my notes", "an e-learning site", a narrated or "read aloud" course, a quiz per chapter, or wants to update, re-narrate or check a course made this way.
---

# course-studio

Local pipeline: **plan** the lessons from the sources → **write** each lesson as blocks with citations → **lint** → **narrate** with site-narrator → **build** a static site → **verify** → look at it in a browser. The site is plain HTML, CSS and a few small ES modules. It works on any static host (including a sub-folder), has no accounts and makes no requests to other servers.

Skill folder: `~/.claude/skills/course-studio/` (written below as `$C`). Every command is `$C/course <command> [course-folder]`. `$C/course help` lists them.

```
$C/course               the command line (check, new, lint, narrate, video, build, serve, verify, test)
$C/cli/lib/             loader, lint rules, glossary, quiz proofs, page rendering, build, verify
$C/site/                the site's CSS, fonts and browser modules (copied into every build)
$C/templates/           a one-lesson course that shows every block type
$C/examples/how-rain-forms/   a finished 3-lesson course with recordings and its built site in dist/
$C/README.md            install, content format, licences, limits
```

It builds on two other skills, called through their command lines:

- **site-narrator** (required for narration): `~/.claude/skills/site-narrator`, or set `COURSE_NARRATOR`.
- **reel-studio** (optional, only for `course video`): `~/.claude/skills/reel-studio`, or set `COURSE_REEL`.

## What it cannot do

Say these to the user before starting if they matter:

- **Static only.** No accounts, no server, no progress shared between devices. Progress lives in the reader's browser.
- **Narration only for text known at build time.** Every text change needs `course narrate` again; until then that line is silent.
- **Search, glossary and quiz are built from the lesson text.** There is no chatbot and no answer that is not in the lessons.
- **Text you draft must be checked by a person.** You can only trace claims to the sources you were given; you cannot vouch for the sources.
- **You cannot hear audio.** Verify recordings by numbers (count, seconds, size, not silent), never describe how they sound.

## Writing rules (the important part)

The course is only as trustworthy as these rules. Follow all of them.

1. **Write from the user's sources only.** Read the sources first. Every fact in a lesson must come from one of them. Do not fill gaps from memory, even when you are sure.
2. **Cite.** Every lesson lists its `sources` (title, publisher, URL or a `citation` for print, `accessed` date). Every paragraph, list, callout, example, quote and figure has `"cite": ["source-id"]`. `course lint` makes any block with a number, percentage, quantity or "studies/research" wording an error until it cites a source.
3. **Never invent facts, figures, statistics, dates, names or quotations.** Quotes are copied exactly. Numbers are copied exactly, with their units.
4. **When you cannot trace a claim to a source**, either leave it out or keep it with `"confirm": "why it needs checking"` on the block. `course lint` prints every such block under "To confirm with the user". **Show that list to the user** and do not call the course finished until they have answered it.
5. **Plain language.** Short sentences (lint warns past 35 words), one idea per paragraph (past 120 words), a lesson a reader finishes in one sitting (past 1,400 words, split it). Explain a term the first time it is used and add it to the glossary.
6. **Quiz questions test the lesson, not trivia.** Each question has a `proof`: a sentence copied exactly from the lesson that shows the answer. Lint fails when the sentence is not in the lesson, and warns when the sentence does not say the answer. Wrong options must be clearly wrong from the lesson, not trick questions.
7. **Figures are explanations.** Draw original SVG diagrams (see "Figures") or use the user's images. Alt text says what the picture shows; the caption says what to notice. Never use an image the user has not supplied or that you cannot license.

## Workflow

1. **Check the machine**: `$C/course check`. It also runs `narrate check`.
2. **Agree the plan with the user**: audience, number of lessons (3 to 8 is typical), one sentence per lesson, which sources each one draws on. Read every source before writing.
3. **Scaffold**: `$C/course new <dir>`. Put the user's sources in `<dir>/sources/` (not published).
4. **Write** `course.json`, one `lessons/NN-name.json` per lesson, `glossary.json` and any `figures/`. Fields are in `README.md`; `templates/lessons/01-first-lesson.json` shows every block type.
5. **Lint**: `$C/course lint <dir>`. Fix every error. Read every warning. Show the user the "To confirm" list.
6. **Narrate**: `$C/course narrate <dir> --dry-run`, then without `--dry-run`. It writes `voice-lines.json` and `narrate.json`, records new and changed lines into `<dir>/voice/` with 2 workers, and runs `narrate verify`. Add pronunciations the voice will get wrong to `course.json` `voice.say` (`"NOAA": "Noah"`), then narrate again (only lines containing them are redone).
7. **Optional video**: `$C/course video <dir> [lesson-id ...]` makes a short landscape video per lesson with reel-studio (title, the lesson's section titles over the recap, a closing card). Only text already in the lesson is used. It takes minutes per lesson; ask first.
8. **Build**: `$C/course build <dir>`. It refuses when lint has errors (`--force` overrides; do not use it to hide problems).
9. **Verify**: `$C/course verify <dir>` must end in `ok`. It checks every link and anchor, that nothing loads from another server, page and asset sizes, that every narrated line on every page has a recording (by hashing the page text exactly as the player does), that recordings are not empty, short or silent, and accessibility basics (lang, one h1, heading order, alt text, labels, button and link names, duplicate ids).
10. **Look at it**: `$C/course serve <dir>` and open it in a headless browser (playwright-cli) at 1440, 768, 390 and 320 px, light and dark. Read the screenshots. Click a glossary term, answer a quiz question and follow its proof link, search with a typo, press Listen and confirm lines highlight in order with no `missing` warnings in the console. Fix what is wrong and build again.
11. **Deliver**: tell the user what was built (lessons, terms, questions, narration seconds and size), the "To confirm" list, the voice used and that they need to listen to it, and that `dist/` can be uploaded to any static host as is.

After any text change: lint, narrate, build, verify again.

## Figures

SVG files are inlined into the page so they follow the light and dark theme. Use these classes instead of fixed colours:

| Fill | Stroke | Text |
|---|---|---|
| `c-ink`, `c-soft`, `c-faint`, `c-accent`, `c-paper`, `c-sunk`, `c-rule`, `c-tint`, `c-good` | `s-ink`, `s-soft`, `s-accent`, `s-rule` (with `stroke-width`) | default is ink in the sans face; `t-serif`, `t-soft`, `t-accent` |

No scripts, event handlers, external links or `<foreignObject>` (lint rejects them). Leave out a background rectangle; the page draws the frame. Give each SVG a `viewBox` and no fixed `width`/`height`. PNG, JPEG, WebP and AVIF need `width` and `height` in the block.

## Inline markup

Inside any text: `[[term]]` or `[[shown|term]]` marks a glossary term (lint fails if it is not in the glossary); `[label](https://...)`, `[label](lesson:id)`, `[label](lesson:id#section-id)`, `[label](glossary:term)`, `[label](#section-id)` or `[label](files/handout.pdf)` (a file in the course folder) make links. Glossary terms are also found and underlined automatically, once per lesson, except in headings and links. Section ids are the heading text in lower case with dashes.

## When something is wrong

| Symptom | Cause and fix |
|---|---|
| `uncited-claim` | the block states a number or a research claim with no `cite`. Cite the source, or add `confirm` and ask the user |
| `proof-not-found` | the quiz `proof` is not copied exactly from the lesson. Copy the sentence (inline markup is ignored, quote style is ignored) |
| `answer-not-in-proof` | the proving sentence does not contain the answer's words. Pick the sentence that does |
| `undefined-term` | a `[[term]]` is missing from `glossary.json`. Add it, or remove the brackets |
| `missing-recording` in verify | the page's text changed since the last narration. Run `course narrate`, then `course build` |
| `no-voice` in verify | no recordings at all: run `course narrate`; or `--no-voice` if the user does not want narration |
| Listen buttons are missing | site-narrator was not found at build time, or the lesson has no recordings |
| Nothing is interactive, or search says it could not load | the site was opened as a `file://` page, where browsers block ES modules. Serve it (`course serve`) or upload it |
| `third-party` in verify | something loads from another server. Self-host it or remove it |

## Honesty

Report only what you ran and looked at. List the claims the user must confirm. Say that the narration is a computer-generated voice that the user must listen to. Do not describe the audio.
