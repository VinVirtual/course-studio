// The theme button cycles automatic → light → dark, and remembers the choice in this browser.
import { readText, writeText } from './store.js';

const KEY = 'course-studio:theme';
const ORDER = ['auto', 'light', 'dark'];
const LABEL = { auto: 'Colour theme: automatic', light: 'Colour theme: light', dark: 'Colour theme: dark' };

export function setupTheme() {
  const button = document.querySelector('.theme-toggle');
  if (!button) return;
  let current = readText(KEY);
  if (!ORDER.includes(current)) current = 'auto';
  const apply = () => {
    if (current === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', current);
    button.setAttribute('aria-label', LABEL[current]);
    button.title = LABEL[current];
    button.dataset.mode = current;
  };
  apply();
  button.addEventListener('click', () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    writeText(KEY, current === 'auto' ? null : current);
    apply();
  });
}
