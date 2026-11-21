// The page frame shared by every page: head, masthead, search dialog, glossary popover, read-aloud bar.
import { escapeHtml } from './text.mjs';

export const ICONS = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3v10l7-5zM11 3h2v10h-2z" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  theme: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
  voice: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/** JSON safe to put inside a <script type="application/json"> element. */
export const jsonScript = (id, value) => `<script type="application/json" id="${id}">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;

function masthead(course, root, current) {
  const link = (href, label, key) => `<a href="${root}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="masthead">
  <a class="brand" href="${root}index.html"><span class="brand-mark" aria-hidden="true">${escapeHtml(course.title.slice(0, 1))}</span><span class="brand-name">${escapeHtml(course.title)}</span></a>
  <nav class="topnav" aria-label="Course">
    ${link('index.html#lessons', 'Lessons', 'index')}
    ${link('glossary/index.html', 'Glossary', 'glossary')}
  </nav>
  <div class="tools">
    <button type="button" class="tool search-open" aria-haspopup="dialog" aria-keyshortcuts="/">${ICONS.search}<span class="tool-label">Search</span><kbd aria-hidden="true">/</kbd></button>
    <button type="button" class="tool theme-toggle" aria-label="Colour theme: automatic">${ICONS.theme}</button>
  </div>
</header>`;
}

const searchDialog = `<dialog class="search-dialog" aria-label="Search the course">
  <form method="dialog" class="search-form" role="search">
    <label class="search-label" for="search-input">Search lessons and glossary</label>
    <div class="search-row">${ICONS.search}<input id="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Try a word from the lessons" aria-controls="search-results" aria-describedby="search-status"><button type="submit" class="search-close" value="close">Close</button></div>
  </form>
  <p id="search-status" class="search-status" role="status" aria-live="polite"></p>
  <ol id="search-results" class="search-results"></ol>
</dialog>`;

const popover = `<div class="term-pop" id="term-pop" role="dialog" aria-modal="false" aria-labelledby="term-pop-title" hidden>
  <p class="term-pop-title" id="term-pop-title"></p>
  <p class="term-pop-text"></p>
  <a class="term-pop-more" href="#">In the glossary</a>
</div>`;

const playerBar = `<div class="player-bar" role="region" aria-label="Read aloud" hidden>
  <div class="player-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <div class="player-now"><p class="player-section"></p><p class="player-line" aria-live="off"></p></div>
  <div class="player-controls">
    <button type="button" class="pbtn player-skip" aria-label="Next section">${ICONS.next}</button>
    <button type="button" class="pbtn player-stop" aria-label="Stop reading">${ICONS.stop}</button>
    <button type="button" class="pbtn player-voice" aria-pressed="true" aria-label="Voice on">${ICONS.voice}</button>
  </div>
  <p class="player-note">Computer-generated voice</p>
</div>`;

/** A full page. `root` is the relative path back to the site root ("" or "../"). */
export function page({ course, root, title, description, body, current, data, bodyClass = '' }) {
  return `<!doctype html>
<html lang="${escapeHtml(course.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="light dark">
<link rel="preload" href="${root}assets/fonts/InstrumentSerif-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/course.css">
<link rel="stylesheet" href="${root}assets/theme.css">
<link rel="icon" href="${root}assets/icon.svg" type="image/svg+xml">
<script src="${root}assets/js/theme-init.js"></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${masthead(course, root, current)}
${body}
<footer class="colophon"><p>${escapeHtml(course.footer || `${course.title}${course.author ? ` · ${course.author}` : ''}`)}</p><p>Progress is kept in this browser only. Narration is a computer-generated voice.</p></footer>
${searchDialog}
${popover}
${playerBar}
${jsonScript('course-data', { root, ...data })}
<script type="module" src="${root}assets/js/main.js"></script>
</body>
</html>
`;
}
