// Read-aloud with site-narrator's player: a section, the whole lesson, or the recap. Each line is the
// text content of a [data-line] element, exactly the text that was recorded, and is highlighted while read.
import { prefersReducedMotion } from './store.js';

const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/></svg>';

/** The lines a Listen button reads: [{ element, text, section, title }]. */
export function queueFor(target, data) {
  const sections = target === 'all' ? data.sections.map((section) => section.id) : [target];
  return sections.flatMap((id) => {
    const section = document.getElementById(id);
    if (!section) return [];
    const title = id === 'recap' ? 'Recap' : (data.sections.find((item) => item.id === id)?.title ?? '');
    return [...section.querySelectorAll('[data-line]')].map((element) => ({ element, text: element.textContent, section: id, title }));
  });
}

export async function setupNarration(data) {
  const buttons = [...document.querySelectorAll('[data-listen]')];
  if (!data.voice) {
    buttons.forEach((button) => button.remove());
    document.querySelector('.voice-note')?.remove();
    return;
  }
  let createNarrator;
  try {
    ({ createNarrator } = await import('./player.js'));
  } catch {
    buttons.forEach((button) => button.remove());
    return;
  }
  const narrator = createNarrator({ base: `${data.root}voice/`, storageKey: 'course-studio:voice' });
  const bar = document.querySelector('.player-bar');
  const sectionLabel = bar.querySelector('.player-section');
  const lineLabel = bar.querySelector('.player-line');
  const voiceButton = bar.querySelector('.player-voice');
  const meter = bar.querySelector('.player-meter');
  let queue = [];
  let offset = 0;
  let active = null; // the button whose queue is playing
  let lit = null;
  let frame = 0;

  const light = (element) => {
    lit?.classList.remove('is-speaking');
    lit = element;
    element?.classList.add('is-speaking');
  };

  const setButton = (button, playing) => {
    if (!button) return;
    const label = button.querySelector('span');
    button.dataset.label ??= label.textContent;
    button.dataset.aria ??= button.getAttribute('aria-label');
    button.classList.toggle('is-playing', playing);
    button.innerHTML = `${playing ? STOP_ICON : PLAY_ICON}<span>${playing ? 'Stop' : button.dataset.label}</span>`;
    button.setAttribute('aria-label', playing ? 'Stop reading' : button.dataset.aria);
  };

  const pulse = () => {
    const level = narrator.level();
    meter.style.setProperty('--level', String(level ?? 0.35));
    frame = requestAnimationFrame(pulse);
  };

  const finish = () => {
    light(null);
    setButton(active, false);
    active = null;
    bar.hidden = true;
    document.body.classList.remove('is-reading');
    cancelAnimationFrame(frame);
  };

  const play = (from) => {
    offset = from;
    narrator.speak(queue.slice(from).map((item) => item.text), { id: 'course' }).then((how) => {
      if (how === 'blocked') lineLabel.textContent = 'The browser blocked the sound. Press Listen again.';
    });
  };

  narrator.on('start', ({ index }) => {
    const item = queue[offset + index];
    if (!item) return;
    light(item.element);
    sectionLabel.textContent = item.title;
    lineLabel.textContent = item.text;
    const box = item.element.getBoundingClientRect();
    if (box.top < 80 || box.bottom > window.innerHeight - 120) item.element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  });
  narrator.on('done', finish);
  narrator.on('stopped', () => {
    if (!queue.length) finish();
  });
  narrator.on('blocked', finish);
  narrator.on('missing', ({ line }) => console.warn('[course-studio] no recording for:', line));

  const start = (button) => {
    const target = button.dataset.listen;
    if (active === button) {
      queue = [];
      narrator.stop();
      return;
    }
    const wasActive = active;
    queue = [];
    narrator.stop();
    setButton(wasActive, false);
    queue = queueFor(target, data);
    if (!queue.length) return;
    active = button;
    setButton(button, true);
    bar.hidden = false;
    document.body.classList.add('is-reading');
    if (!prefersReducedMotion()) frame = requestAnimationFrame(pulse);
    play(0);
  };

  buttons.forEach((button) => button.addEventListener('click', () => start(button)));
  bar.querySelector('.player-stop').addEventListener('click', () => {
    queue = [];
    narrator.stop();
    active?.focus();
  });
  bar.querySelector('.player-skip').addEventListener('click', () => {
    const current = queue[offset]?.section;
    const playingIndex = queue.findIndex((item) => item.element === lit);
    const from = playingIndex >= 0 ? playingIndex : offset;
    const next = queue.findIndex((item, at) => at > from && item.section !== (queue[from]?.section ?? current));
    if (next < 0) {
      queue = [];
      narrator.stop();
      return;
    }
    play(next);
  });
  const paintVoice = () => {
    voiceButton.setAttribute('aria-pressed', String(narrator.enabled));
    voiceButton.setAttribute('aria-label', narrator.enabled ? 'Voice on (press to read silently)' : 'Voice off (press to turn the voice on)');
    voiceButton.classList.toggle('is-off', !narrator.enabled);
  };
  paintVoice();
  voiceButton.addEventListener('click', () => {
    const playingIndex = queue.findIndex((item) => item.element === lit);
    narrator.setEnabled(!narrator.enabled);
    paintVoice();
    if (queue.length && playingIndex >= 0) play(playingIndex);
  });
}
