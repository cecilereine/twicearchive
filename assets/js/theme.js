/* ---------------------------------------------------------------------------
   Light / dark toggle.

   Until someone picks, the site follows the device (prefers-color-scheme).
   Picking one sets data-theme on <html>, which style.css already honours, and
   remembers it in this browser. A one-line script in each page's <head>
   applies the saved choice before first paint, so there's no flash of the
   wrong theme; this file only wires up the button.
--------------------------------------------------------------------------- */

const THEME_KEY = 'twice-archive:theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const currentTheme = () =>
  document.documentElement.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');

function paintToggle(btn) {
  const dark = currentTheme() === 'dark';
  btn.textContent = dark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.title = btn.getAttribute('aria-label');
}

const toggle = document.getElementById('themeToggle');
if (toggle) {
  paintToggle(toggle);
  toggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: just won't remember */ }
    paintToggle(toggle);
  });
  /* Still following the device? Keep the icon in step if it changes. */
  darkQuery.addEventListener('change', () => paintToggle(toggle));
}
