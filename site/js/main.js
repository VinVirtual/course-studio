// Entry point for every page. Each feature is small and independent; a failure in one leaves the rest working.
import { setupTerms } from './glossary.js';
import { setupNarration } from './narration.js';
import { createProgress, showIndexProgress, trackLesson } from './progress.js';
import { setupQuiz } from './quiz.js';
import { setupSearch } from './search.js';
import { setupTheme } from './theme.js';
import { setupContents } from './toc.js';

const data = JSON.parse(document.getElementById('course-data')?.textContent ?? '{}');

const run = (name, feature) => {
  try {
    const result = feature();
    if (result instanceof Promise) result.catch((error) => console.error(`[course-studio] ${name}:`, error));
  } catch (error) {
    console.error(`[course-studio] ${name}:`, error);
  }
};

const progress = data.course ? createProgress(data.course) : null;
run('theme', setupTheme);
run('search', () => setupSearch(data));
if (document.body.classList.contains('is-index') && progress) run('progress', () => showIndexProgress(progress, data));
if (data.lesson) {
  run('contents', setupContents);
  run('progress', () => trackLesson(progress, data));
  run('glossary', () => setupTerms(data));
  run('quiz', () => setupQuiz(data, progress));
  run('narration', () => setupNarration(data));
}
