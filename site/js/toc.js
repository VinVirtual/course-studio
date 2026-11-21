// The contents rail: folds shut on phones, and marks the section being read.
const PHONE = '(max-width: 63.99rem)';

export function setupContents() {
  const fold = document.querySelector('.fold');
  if (!fold) return;
  const phone = window.matchMedia(PHONE);
  const apply = () => {
    fold.open = !phone.matches;
  };
  apply();
  phone.addEventListener('change', apply);
  fold.addEventListener('click', (event) => {
    if (phone.matches && event.target.closest('a')) fold.open = false;
  });

  if (!('IntersectionObserver' in window)) return;
  const links = new Map([...document.querySelectorAll('[data-toc]')].map((link) => [link.dataset.toc, link]));
  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const current = [...links.keys()].filter((id) => visible.has(id)).pop();
      for (const [id, link] of links) {
        if (id === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    },
    { rootMargin: '-20% 0px -55% 0px' },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}
