// Read progress, kept as one small JSON object per course. Pure functions, so they can be unit-tested.

export const progressKey = (course) => `course-studio:${course}:progress`;

export function emptyProgress() {
  return { read: {}, sections: {}, quiz: {} };
}

/** Cleans whatever was stored: unknown shapes become an empty record rather than an error. */
export function parseProgress(value) {
  const base = emptyProgress();
  if (!value || typeof value !== 'object') return base;
  const read = value.read && typeof value.read === 'object' ? Object.fromEntries(Object.entries(value.read).filter(([, done]) => done === true)) : {};
  const sections = value.sections && typeof value.sections === 'object' ? Object.fromEntries(Object.entries(value.sections).filter(([, list]) => Array.isArray(list)).map(([id, list]) => [id, list.filter((item) => typeof item === 'string')])) : {};
  const quiz = value.quiz && typeof value.quiz === 'object' ? Object.fromEntries(Object.entries(value.quiz).filter(([, score]) => score && Number.isInteger(score.right) && Number.isInteger(score.total))) : {};
  return { ...base, read, sections, quiz };
}

export const withSection = (progress, lesson, section) => {
  const list = progress.sections[lesson] ?? [];
  if (list.includes(section)) return progress;
  return { ...progress, sections: { ...progress.sections, [lesson]: [...list, section] } };
};

export const withRead = (progress, lesson) => (progress.read[lesson] ? progress : { ...progress, read: { ...progress.read, [lesson]: true } });

export const withQuiz = (progress, lesson, right, total) => ({ ...progress, quiz: { ...progress.quiz, [lesson]: { right, total } } });

/** Where a reader stands with one lesson: 'read', 'started' or 'new'. */
export function lessonStatus(progress, lesson) {
  if (progress.read[lesson]) return 'read';
  if ((progress.sections[lesson] ?? []).length || progress.quiz[lesson]) return 'started';
  return 'new';
}

/** The lesson to continue with: the first one not read, in course order. Null when all are read. */
export const nextLesson = (progress, lessons) => lessons.find((lesson) => !progress.read[lesson]) ?? null;

export const readCount = (progress, lessons) => lessons.filter((lesson) => progress.read[lesson]).length;
