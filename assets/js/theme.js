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

/* ---------- nav row on a narrow window ----------

   Below 640px the nav is one row that scrolls sideways (style.css). A phone
   swipes it, but a mouse wheel only scrolls vertically, so turn the wheel
   sideways while the row actually overflows, and start with the current
   page's link in view. This file loads on every page, which is why it lives
   here rather than in core.js. */

const siteNav = document.querySelector('.site-nav');
if (siteNav) {
  const overflows = () => siteNav.scrollWidth > siteNav.clientWidth + 1;

  siteNav.addEventListener('wheel', e => {
    if (!overflows() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    siteNav.scrollLeft += e.deltaY;
  }, { passive: false });

  const current = siteNav.querySelector('a.on');
  if (current && overflows()) current.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/* ---------- filter toolbar on a phone ----------

   The toolbar is sticky so the filters stay at hand, but on a phone it covers
   a good part of the screen. Once it's stuck to the top, slide it away while
   the list scrolls down and bring it back on any scroll up. Not while the
   search box has focus, so it can't slide out from under the keyboard. */

const toolbar = document.querySelector('.toolbar');
if (toolbar) {
  const narrow = window.matchMedia('(max-width: 640px)');
  const above = toolbar.previousElementSibling;
  let lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const dy = y - lastY;
    if (Math.abs(dy) < 6) return;           // ignore jitter
    lastY = y;
    const stuck = !above || above.getBoundingClientRect().bottom < 0;
    const typing = toolbar.contains(document.activeElement) && document.activeElement.matches('input');
    toolbar.classList.toggle('tucked', narrow.matches && stuck && dy > 0 && !typing);
  }, { passive: true });

  narrow.addEventListener('change', () => toolbar.classList.remove('tucked'));
}
