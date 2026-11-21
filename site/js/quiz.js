// The quiz: one answer per question, instant feedback, and a link to the sentence that proves the answer.
import { prefersReducedMotion } from './store.js';

const LETTERS = 'ABCDEFGH';

export function setupQuiz(data, progress) {
  const quiz = document.querySelector('.quiz');
  if (!quiz) return;
  const questions = [...quiz.querySelectorAll('.q')];
  const score = quiz.querySelector('.quiz-score');
  const reset = quiz.querySelector('.quiz-reset');

  const finish = () => {
    const answered = questions.filter((question) => question.dataset.chosen !== undefined);
    if (answered.length < questions.length) return;
    const right = answered.filter((question) => question.dataset.chosen === question.dataset.answer).length;
    score.textContent = right === questions.length ? `All ${right} right.` : `${right} of ${questions.length} right. Follow the links to read those parts again.`;
    reset.hidden = false;
    progress?.quiz(data.lesson, right, questions.length);
  };

  for (const question of questions) {
    const feedback = question.querySelector('.q-feedback');
    const options = [...question.querySelectorAll('.opt')];
    for (const option of options) {
      option.addEventListener('click', () => {
        if (question.dataset.chosen !== undefined) return;
        const chosen = option.dataset.index;
        const answer = question.dataset.answer;
        question.dataset.chosen = chosen;
        question.classList.add(chosen === answer ? 'is-right' : 'is-wrong');
        for (const other of options) {
          other.setAttribute('aria-disabled', 'true');
          if (other.dataset.index === answer) other.classList.add('opt-answer');
          if (other === option) other.setAttribute('aria-pressed', 'true');
        }
        const rightText = options[Number(answer)].querySelector('.opt-text').textContent;
        const verdict = chosen === answer ? 'Right.' : `Not quite. The answer is ${LETTERS[Number(answer)]}: ${rightText}`;
        feedback.replaceChildren();
        const line = document.createElement('p');
        line.className = 'q-verdict';
        line.textContent = verdict;
        const link = document.createElement('a');
        link.className = 'q-proof';
        link.href = `#${question.dataset.proof}`;
        link.textContent = 'See where the lesson says this';
        link.addEventListener('click', (event) => showProof(event, question.dataset.proof));
        feedback.append(line, link);
        finish();
      });
    }
  }

  reset?.addEventListener('click', () => {
    for (const question of questions) {
      delete question.dataset.chosen;
      question.classList.remove('is-right', 'is-wrong');
      question.querySelector('.q-feedback').replaceChildren();
      for (const option of question.querySelectorAll('.opt')) {
        option.removeAttribute('aria-disabled');
        option.removeAttribute('aria-pressed');
        option.classList.remove('opt-answer');
      }
    }
    score.textContent = '';
    reset.hidden = true;
    questions[0]?.querySelector('.opt')?.focus();
  });
}

/** Scrolls to the proving sentence, flashes it and moves focus there so keyboard users land on it too. */
function showProof(event, id) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  history.replaceState(null, '', `#${id}`);
  target.setAttribute('tabindex', '-1');
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
  for (const piece of document.querySelectorAll(`.proof[data-proof="${id}"]`)) {
    piece.classList.remove('is-shown');
    void piece.offsetWidth;
    piece.classList.add('is-shown');
  }
}
