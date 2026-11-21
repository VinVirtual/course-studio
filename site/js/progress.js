// Saves what has been read and shows it: ticks in the contents, the index's meter and status labels.
import { emptyProgress, lessonStatus, nextLesson, parseProgress, progressKey, readCount, withQuiz, withRead, withSection } from './progress-core.js';
import { readJson, writeJson } from './store.js';

export function createProgress(course, title, basePath) {
  const key = progressKey(course, title, basePath);
  const listeners = new Set();
  let state = parseProgress(readJson(key, emptyProgress()));
  const save = (next) => {
    if (next === state) return;
    state = next;
    writeJson(key, state);
    listeners.forEach((listener) => listener(state));
  };
  window.addEventListener('storage', (event) => {
    if (event.key !== key) return;
    state = parseProgress(readJson(key, emptyProgress()));
    listeners.forEach((listener) => listener(state));
  });
  return {
    get: () => state,
    section: (lesson, section) => save(withSection(state, lesson, section)),
    read: (lesson) => save(withRead(state, lesson)),
    quiz: (lesson, right, total) => save(withQuiz(state, lesson, right, total)),
    reset: () => save(emptyProgress()),
    subscribe: (listener) => listeners.add(listener),
  };
}

const STATUS_TEXT = { read: 'Read', started: 'In progress', new: 'Not started' };

/** The course index: meter, continue button and a status per lesson. */
export function showIndexProgress(progress, data) {
  const paint = (state) => {
    const done = readCount(state, data.lessons);
    const meter = document.querySelector('.meter');
    if (meter) {
      meter.setAttribute('aria-valuenow', String(done));
      meter.style.setProperty('--done', String(done / data.lessons.length));
    }
    const text = document.querySelector('[data-progress-text]');
    const anything = done > 0 || data.lessons.some((lesson) => lessonStatus(state, lesson) !== 'new');
    if (text && anything) text.textContent = done === data.lessons.length ? `All ${done} lessons read.` : `${done} of ${data.lessons.length} lessons read.`;
    const next = nextLesson(state, data.lessons);
    const button = document.querySelector('[data-continue]');
    if (button && anything) {
      const target = next ?? data.lessons[0];
      button.setAttribute('href', `${target}/index.html`);
      button.querySelector('[data-continue-label]').textContent = next ? `Continue: ${data.titles[next]}` : 'Read it again from the start';
    }
    for (const item of document.querySelectorAll('[data-lesson]')) {
      const status = lessonStatus(state, item.dataset.lesson);
      const score = state.quiz[item.dataset.lesson];
      item.dataset.state = status;
      item.querySelector('[data-status]').textContent = STATUS_TEXT[status] + (score ? ` · quiz ${score.right}/${score.total}` : '');
    }
    const reset = document.querySelector('.progress-reset');
    if (reset) reset.hidden = !anything;
  };
  paint(progress.get());
  progress.subscribe(paint);
  document.querySelector('.progress-reset')?.addEventListener('click', () => {
    progress.reset();
    document.querySelector('[data-progress-text]').textContent = 'Progress cleared.';
  });
}

/** A lesson page: marks sections read as their end scrolls past, and the lesson once its end is reached. */
export function trackLesson(progress, data) {
  const tick = (state) => {
    const seen = new Set(state.sections[data.lesson] ?? []);
    for (const link of document.querySelectorAll('[data-toc]')) link.classList.toggle('is-read', seen.has(link.dataset.toc));
  };
  tick(progress.get());
  progress.subscribe(tick);
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        if (target.dataset.sectionEnd) progress.section(data.lesson, target.dataset.sectionEnd);
        if (target.hasAttribute('data-lesson-end')) progress.read(data.lesson);
        observer.unobserve(target);
      }
    },
    { rootMargin: '0px 0px -15% 0px' },
  );
  for (const section of document.querySelectorAll('.lesson-body [data-section]')) {
    const end = document.createElement('span');
    end.className = 'sec-end';
    end.dataset.sectionEnd = section.dataset.section;
    end.setAttribute('aria-hidden', 'true');
    section.append(end);
    observer.observe(end);
  }
  const end = document.querySelector('[data-lesson-end]');
  if (end) observer.observe(end);
}
