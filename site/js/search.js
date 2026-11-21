// The search dialog: opens with the Search button or "/", loads the index on first use, and keeps
// arrow-key movement between the results.
import { buildIndex, search, snippet } from './search-core.js';

export function setupSearch(data) {
  const dialog = document.querySelector('.search-dialog');
  const input = document.getElementById('search-input');
  const list = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!dialog || !input) return;
  let index = null;
  let loading = null;

  const load = () => {
    loading ??= fetch(`${data.root}assets/search.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`search index: ${response.status}`);
        return response.json();
      })
      .then((entries) => {
        index = buildIndex(entries);
      })
      .catch(() => {
        status.textContent = 'Search could not load. It needs the site to be served, not opened as a file.';
      });
    return loading;
  };

  const render = () => {
    const query = input.value;
    list.replaceChildren();
    if (!index || !query.trim()) {
      status.textContent = index ? '' : status.textContent;
      return;
    }
    const results = search(index, query);
    status.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Nothing found. Try another word.';
    for (const result of results) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `${data.root}${result.url}`;
      link.className = `result result-${result.kind}`;
      const where = document.createElement('span');
      where.className = 'result-where';
      where.textContent = result.kind === 'term' ? 'Glossary' : result.kind === 'lesson' ? 'Lesson' : result.title;
      const title = document.createElement('span');
      title.className = 'result-title';
      title.textContent = result.kind === 'section' ? result.section : result.title;
      const text = document.createElement('span');
      text.className = 'result-text';
      const piece = snippet(result.text, query);
      const mark = document.createElement('mark');
      mark.textContent = piece.match;
      text.append(piece.before, ...(piece.match ? [mark] : []), piece.after);
      link.append(where, title, text);
      link.addEventListener('click', () => dialog.close());
      item.append(link);
      list.append(item);
    }
  };

  const open = async () => {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    await load();
    render();
  };

  document.querySelectorAll('.search-open').forEach((button) => button.addEventListener('click', open));
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      open();
    }
  });
  input.addEventListener('input', render);
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [...list.querySelectorAll('a')];
    if (!links.length) return;
    event.preventDefault();
    const at = links.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % links.length : at <= 0 ? -1 : at - 1;
    (next === -1 ? input : links[next]).focus();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
