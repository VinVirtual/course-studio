// Runs before the page paints, so a chosen theme never flashes the other one first.
(function () {
  try {
    var theme = localStorage.getItem('course-studio:theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    /* storage blocked: follow the system setting */
  }
  document.documentElement.classList.add('js');
})();
