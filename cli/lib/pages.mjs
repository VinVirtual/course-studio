// The three kinds of page: the course index, a lesson, and the glossary. Plus the search entries.
import { blockTexts, sectionsOf } from './blocks.mjs';
import { citations, renderBlock } from './blockhtml.mjs';
import { termMatcher } from './glossary.mjs';
import { renderInline } from './inline.mjs';
import { ICONS, page } from './layout.mjs';
import { proofId } from './quiz.mjs';
import { countWords, escapeHtml, plainText, tidy } from './text.mjs';

const WORDS_PER_MINUTE = 200;
const pad = (number) => String(number).padStart(2, '0');

export const lessonMinutes = (lesson) =>
  lesson.minutes ?? Math.max(1, Math.round(lesson.blocks.flatMap(blockTexts).reduce((sum, text) => sum + countWords(plainText(text)), 0) / WORDS_PER_MINUTE));

export const lessonHref = (lesson, root = '') => `${root}${lesson.id}/index.html`;

/** Resolves a link written in a lesson (lesson:, glossary:, #anchor, http) for a page at `root`. */
export function linkResolver(root, glossary) {
  const matcher = termMatcher(glossary);
  return (href) => {
    if (href.startsWith('lesson:')) {
      const [id, hash] = href.slice(7).split('#');
      return { href: `${root}${id}/index.html${hash ? `#${hash}` : ''}`, external: false };
    }
    if (href.startsWith('glossary:')) {
      const entry = matcher.names.get(tidy(href.slice(9)).toLowerCase());
      return { href: `${root}glossary/index.html${entry ? `#${entry.id}` : ''}`, external: false };
    }
    if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
    // Any other scheme (javascript:, data: ...) is never written into a page, even with build --force.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href: '#', external: false };
    if (href.startsWith('#')) return { href, external: false };
    return { href: `${root}files/${href}`, external: false };
  };
}

function sectionHtml(section, index, ctx) {
  const headingId = `h-${section.id}`;
  const heading = section.heading
    ? `<h2 id="${headingId}"><span class="sec-num" aria-hidden="true">${pad(index + 1)}</span><span class="line" data-line>${renderInline(section.heading.text, { ...ctx, matcher: null }).html}</span></h2>`
    : `<h2 id="${headingId}" class="sec-kicker"><span class="sec-num" aria-hidden="true">${pad(index + 1)}</span><span>${escapeHtml(section.title)}</span></h2>`;
  const listen = `<button type="button" class="listen" data-listen="${section.id}" aria-label="Listen to “${escapeHtml(section.title)}”">${ICONS.play}<span>Listen</span></button>`;
  const body = section.blocks.map((block) => renderBlock(block, ctx)).join('\n');
  return `<section class="sec${section.heading ? '' : ' sec-open'}" id="${section.id}" data-section="${section.id}" aria-labelledby="${headingId}">
<div class="sec-head">${heading}${listen}</div>
${body}
</section>`;
}

function quizHtml(lesson) {
  if (!lesson.quiz.length) return '';
  const items = lesson.quiz
    .map((item, index) => {
      const options = item.options
        .map((option, at) => `<li><button type="button" class="opt" data-index="${at}"><span class="opt-key" aria-hidden="true">${String.fromCharCode(65 + at)}</span><span class="opt-text">${escapeHtml(plainText(option))}</span></button></li>`)
        .join('');
      return `<li class="q" data-answer="${item.answer}" data-proof="${proofId(index)}">
<fieldset><legend><span class="q-num">Question ${index + 1}</span> ${escapeHtml(plainText(item.question))}</legend>
<ol class="opts" role="list">${options}</ol></fieldset>
<div class="q-feedback" role="status" aria-live="polite"></div>
</li>`;
    })
    .join('\n');
  return `<section class="quiz" id="quiz" aria-labelledby="quiz-title" data-total="${lesson.quiz.length}">
<p class="part-kicker">Check yourself</p>
<h2 id="quiz-title">Quiz</h2>
<p class="quiz-intro">Pick an answer. Each one links to the sentence in the lesson that proves it.</p>
<ol class="quiz-list">${items}</ol>
<p class="quiz-score" aria-live="polite"></p>
<button type="button" class="quiz-reset btn-quiet" hidden>Try the quiz again</button>
</section>`;
}

function sourcesHtml(lesson, ctx) {
  const ordered = [...lesson.sources].sort((a, b) => (ctx.citeOrder.get(a.id) ?? 999) - (ctx.citeOrder.get(b.id) ?? 999));
  if (!ordered.length) return '';
  const items = ordered
    .map((source) => {
      const number = ctx.citeOrder.get(source.id);
      const title = source.url ? `<a href="${escapeHtml(source.url)}" class="ext" rel="noopener noreferrer">${escapeHtml(source.title)}</a>` : escapeHtml(source.title);
      const meta = [source.publisher, source.citation, source.accessed ? `accessed ${source.accessed}` : ''].filter(Boolean).map(escapeHtml).join(' · ');
      return `<li id="src-${escapeHtml(source.id)}"><span class="src-num">${number ?? '·'}</span><span class="src-body">${title}${meta ? `<span class="src-meta">${meta}</span>` : ''}</span></li>`;
    })
    .join('');
  return `<section class="sources" aria-labelledby="sources-title"><h2 id="sources-title">Sources</h2><ol class="source-list">${items}</ol></section>`;
}

/** A lesson page. Returns the HTML and the glossary entries it underlines. */
export function lessonPage({ course, lessons, glossary, lesson, dir, video, voice = false }) {
  const root = '../';
  const usedTerms = new Set();
  const ctx = {
    dir,
    matcher: termMatcher(glossary),
    seen: new Set(),
    usedTerms,
    proofs: lesson.quiz.map((item, index) => ({ text: item.proof, id: proofId(index) })),
    citeOrder: new Map(),
    sources: lesson.sources,
    resolveLink: linkResolver(root, glossary),
    asset: (src) => `${root}files/${src}`,
  };
  const sections = sectionsOf(lesson);
  const index = lessons.indexOf(lesson);
  const next = lessons[index + 1];
  const previous = lessons[index - 1];
  const body = sections.map((section, at) => sectionHtml(section, at, ctx)).join('\n');
  const contents = sections
    .map((section) => `<li><a href="#${section.id}" data-toc="${section.id}"><span class="toc-tick" aria-hidden="true">${ICONS.check}</span>${escapeHtml(section.title)}</a></li>`)
    .join('');
  const extras = [lesson.recap.length ? ['recap', 'Recap'] : null, lesson.quiz.length ? ['quiz', 'Quiz'] : null, lesson.sources.length ? ['sources-title', 'Sources'] : null].filter(Boolean);
  const takeaways = lesson.takeaways.length
    ? `<section class="takeaways" aria-labelledby="takeaways-title"><p class="part-kicker">Remember</p><h2 id="takeaways-title">Takeaways</h2><ul>${lesson.takeaways.map((item) => `<li>${renderInline(item, { ...ctx, proofs: [] }).html}</li>`).join('')}</ul></section>`
    : '';
  const recap = lesson.recap.length
    ? `<section class="recap" id="recap" aria-labelledby="recap-title" data-section="recap">
<div class="recap-head"><div><p class="part-kicker">In under a minute</p><h2 id="recap-title">Recap</h2></div><button type="button" class="listen listen-strong" data-listen="recap" aria-label="Play the recap">${ICONS.play}<span>Play the recap</span></button></div>
<ol class="recap-lines">${lesson.recap.map((item) => `<li><span class="line" data-line>${escapeHtml(tidy(item))}</span></li>`).join('')}</ol>
</section>`
    : '';
  const videoHtml = video
    ? `<figure class="lesson-video"><video controls preload="none" playsinline poster="${root}${video.poster}" width="1280" height="720"><source src="${root}${video.src}" type="video/mp4">${video.vtt ? `<track kind="captions" src="${root}${video.vtt}" srclang="${escapeHtml(course.language)}" label="Captions" default>` : ''}</video><figcaption>A short video version of this lesson.</figcaption></figure>`
    : '';
  const nextHtml = next
    ? `<a class="next-card" href="${lessonHref(next, root)}" rel="next"><span class="next-kicker">Next lesson · ${pad(next.number)}</span><span class="next-title">${escapeHtml(next.title)}</span><span class="next-arrow">${ICONS.arrow}</span></a>`
    : `<a class="next-card" href="${root}index.html"><span class="next-kicker">That was the last lesson</span><span class="next-title">Back to the course</span><span class="next-arrow">${ICONS.arrow}</span></a>`;
  const html = page({
    course,
    root,
    title: `${lesson.title} · ${course.title}`,
    description: lesson.summary || course.subtitle,
    current: 'lesson',
    bodyClass: 'is-lesson',
    data: {
      course: course.slug,
      voice,
      lesson: lesson.id,
      lessons: lessons.map((item) => item.id),
      sections: sections.map((section) => ({ id: section.id, title: section.title })),
      terms: [...usedTerms].map((entry) => ({ id: entry.id, term: entry.term, definition: entry.definition })),
    },
    body: `<div class="lesson-grid">
<nav class="rail" aria-label="In this lesson">
<details class="fold" open><summary><span>Contents</span><span class="fold-count">${sections.length} parts</span></summary>
<ol class="toc">${contents}</ol>
<ol class="toc toc-extra">${extras.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ol>
</details>
<div class="rail-listen"><button type="button" class="listen listen-strong" data-listen="all" aria-label="Listen to the whole lesson">${ICONS.play}<span>Listen to the lesson</span></button><p class="voice-note">Computer-generated voice. Lines are highlighted as they are read.</p></div>
</nav>
<main id="main" class="lesson" tabindex="-1">
<header class="lesson-head">
<p class="lesson-kicker"><span class="lesson-no" aria-hidden="true">${pad(lesson.number)}</span><span>Lesson ${lesson.number} of ${lessons.length} · ${lessonMinutes(lesson)} min read</span></p>
<h1>${escapeHtml(lesson.title)}</h1>
${lesson.summary ? `<p class="dek">${escapeHtml(lesson.summary)}</p>` : ''}
${previous ? `<p class="prev-link"><a href="${lessonHref(previous, root)}" rel="prev">← ${escapeHtml(previous.title)}</a></p>` : ''}
</header>
${videoHtml}
<div class="lesson-body">
${body}
</div>
<div class="lesson-end" data-lesson-end></div>
${takeaways}
${recap}
${quizHtml(lesson)}
${sourcesHtml(lesson, ctx)}
<nav class="next" aria-label="Next">${nextHtml}</nav>
</main>
</div>`,
  });
  return { html, usedTerms: [...usedTerms], citations: ctx.citeOrder };
}

export function indexPage({ course, lessons, glossary = [] }) {
  const total = lessons.reduce((sum, lesson) => sum + lessonMinutes(lesson), 0);
  const sources = new Set(lessons.flatMap((lesson) => lesson.sources.map((source) => source.url || source.title)));
  const facts = [
    [lessons.length, lessons.length === 1 ? 'lesson' : 'lessons'],
    [lessons.reduce((sum, lesson) => sum + lesson.quiz.length, 0), 'quiz questions'],
    [glossary.length, 'glossary terms'],
    [sources.size, sources.size === 1 ? 'source, cited' : 'sources, cited'],
  ];
  const items = lessons
    .map(
      (lesson) => `<li class="lesson-item" data-lesson="${lesson.id}">
<a href="${lessonHref(lesson)}" class="lesson-link">
<span class="li-num" aria-hidden="true">${pad(lesson.number)}</span>
<span class="li-body"><span class="li-title">${escapeHtml(lesson.title)}</span>${lesson.summary ? `<span class="li-summary">${escapeHtml(lesson.summary)}</span>` : ''}</span>
<span class="li-meta"><span class="li-min">${lessonMinutes(lesson)} min</span><span class="li-status" data-status>Not started</span></span>
</a>
</li>`,
    )
    .join('\n');
  return page({
    course,
    root: '',
    title: course.title,
    description: course.subtitle || course.title,
    current: 'index',
    bodyClass: 'is-index',
    data: { course: course.slug, lessons: lessons.map((lesson) => lesson.id), titles: Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson.title])) },
    body: `<main id="main" tabindex="-1">
<section class="cover" aria-labelledby="course-title">
<p class="cover-kicker">A course in ${lessons.length} lessons${course.audience ? ` · for ${escapeHtml(course.audience)}` : ''}</p>
<h1 id="course-title">${escapeHtml(course.title)}</h1>
${course.subtitle ? `<p class="cover-dek">${escapeHtml(course.subtitle)}</p>` : ''}
<div class="cover-progress" data-progress>
<div class="meter" role="progressbar" aria-label="Lessons read" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="0"><span class="meter-fill"></span></div>
<p class="progress-text"><span data-progress-text>${lessons.length} lessons · about ${total} minutes · every lesson can be read aloud</span></p>
<a class="btn-primary" data-continue href="${lessonHref(lessons[0])}"><span data-continue-label>Start with lesson 1</span>${ICONS.arrow}</a>
</div>
<ul class="cover-facts" aria-label="This course in numbers">${facts.map(([value, label]) => `<li><span class="fact-num">${value}</span><span class="fact-label">${label}</span></li>`).join('')}</ul>
</section>
<section class="toc-list" id="lessons" aria-labelledby="lessons-title">
<h2 id="lessons-title" class="part-kicker">Lessons</h2>
<ol class="lesson-list">${items}</ol>
<p class="reset-row"><button type="button" class="btn-quiet progress-reset" hidden>Forget my progress</button></p>
</section>
</main>`,
  });
}

export function glossaryPage({ course, lessons, glossary }) {
  const byId = Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson]));
  const sorted = [...glossary].sort((a, b) => a.term.localeCompare(b.term, course.language));
  const letters = [...new Set(sorted.map((entry) => entry.term[0].toUpperCase()))];
  const groups = letters
    .map((letter) => {
      const entries = sorted
        .filter((entry) => entry.term[0].toUpperCase() === letter)
        .map((entry) => {
          const lesson = byId[entry.lesson];
          return `<div class="g-entry" id="${entry.id}"><dt>${escapeHtml(entry.term)}</dt><dd><p>${escapeHtml(entry.definition)}</p>${lesson ? `<p class="g-from"><a href="${lessonHref(lesson, '../')}">Lesson ${lesson.number}: ${escapeHtml(lesson.title)}</a></p>` : ''}</dd></div>`;
        })
        .join('');
      return `<section class="g-group" aria-labelledby="g-${letter}"><h2 id="g-${letter}" class="g-letter">${letter}</h2><dl>${entries}</dl></section>`;
    })
    .join('\n');
  return page({
    course,
    root: '../',
    title: `Glossary · ${course.title}`,
    description: `The words used in ${course.title}, in plain language.`,
    current: 'glossary',
    bodyClass: 'is-glossary',
    data: { course: course.slug, lessons: lessons.map((lesson) => lesson.id) },
    body: `<main id="main" class="glossary" tabindex="-1">
<header class="g-head"><p class="part-kicker">${glossary.length} terms</p><h1>Glossary</h1><p class="dek">Every underlined word in the lessons, explained in plain language.</p>
<nav class="g-jump" aria-label="Letters">${letters.map((letter) => `<a href="#g-${letter}">${letter}</a>`).join('')}</nav></header>
${groups}
</main>`,
  });
}

/** Entries for the search index: one per lesson, one per section, one per glossary term. */
export function searchEntries({ lessons, glossary }) {
  const entries = [];
  for (const lesson of lessons) {
    entries.push({ kind: 'lesson', title: lesson.title, section: '', text: lesson.summary || '', url: lessonHref(lesson) });
    for (const section of sectionsOf(lesson)) {
      const text = [...section.lines.slice(section.heading ? 1 : 0), ...section.blocks.filter((block) => block.type === 'code').map((block) => block.text)].join(' ');
      entries.push({ kind: 'section', title: lesson.title, section: section.title, text, url: `${lessonHref(lesson)}#${section.id}` });
    }
    if (lesson.recap.length) entries.push({ kind: 'section', title: lesson.title, section: 'Recap', text: lesson.recap.join(' '), url: `${lessonHref(lesson)}#recap` });
  }
  for (const entry of glossary) entries.push({ kind: 'term', title: entry.term, section: 'Glossary', text: entry.definition, url: `glossary/index.html#${entry.id}` });
  return entries;
}

export { citations };
