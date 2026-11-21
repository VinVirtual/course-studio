// Underlined glossary terms open a small popover with the definition. Escape or a click elsewhere closes it.
export function setupTerms(data) {
  const pop = document.getElementById('term-pop');
  if (!pop || !data.terms?.length) return;
  const terms = new Map(data.terms.map((term) => [term.id, term]));
  const title = pop.querySelector('.term-pop-title');
  const text = pop.querySelector('.term-pop-text');
  const more = pop.querySelector('.term-pop-more');
  pop.tabIndex = -1;
  let owner = null;

  const place = (button) => {
    const box = button.getBoundingClientRect();
    const width = Math.min(320, document.documentElement.clientWidth - 32);
    pop.style.width = `${width}px`;
    const left = Math.min(Math.max(16, box.left + box.width / 2 - width / 2), document.documentElement.clientWidth - width - 16);
    pop.style.left = `${left + window.scrollX}px`;
    const below = box.bottom + 10;
    const height = pop.offsetHeight;
    const flip = below + height > window.innerHeight - 8 && box.top - height - 10 > 8;
    pop.style.top = `${(flip ? box.top - height - 10 : below) + window.scrollY}px`;
    pop.dataset.side = flip ? 'above' : 'below';
  };

  const close = (returnFocus) => {
    if (!owner) return;
    pop.hidden = true;
    owner.setAttribute('aria-expanded', 'false');
    if (returnFocus) owner.focus();
    owner = null;
  };

  const open = (button, byKeyboard) => {
    const term = terms.get(button.dataset.term);
    if (!term) return;
    if (owner === button) {
      close(true);
      return;
    }
    close(false);
    owner = button;
    title.textContent = term.term;
    text.textContent = term.definition;
    more.href = `${data.root}glossary/index.html#${term.id}`;
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', 'term-pop');
    place(button);
    if (byKeyboard) pop.focus();
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.term');
    if (button) {
      open(button, event.detail === 0);
      return;
    }
    if (owner && !pop.contains(event.target)) close(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && owner) {
      event.preventDefault();
      close(true);
    }
  });
  pop.addEventListener('focusout', (event) => {
    if (owner && !pop.contains(event.relatedTarget) && event.relatedTarget !== owner) close(false);
  });
  window.addEventListener('resize', () => owner && place(owner));
}
