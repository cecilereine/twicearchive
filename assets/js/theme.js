/* ---------------------------------------------------------------------------
   Light / dark toggle.

   Until someone picks, the site follows the device (prefers-color-scheme).
   Picking one sets data-theme on <html>, which style.css already honours, and
   remembers it in this browser. A one-line script in each page's <head>
   applies the saved choice before first paint, so there's no flash of the
   wrong theme; this file only wires up the button.
--------------------------------------------------------------------------- */

/* ---------- site nav ----------

   The one list of pages, in the homepage cards' order. Each page's <nav> holds
   only the theme button; the links go in front of it here, and the page being
   viewed is marked "on". Add a page here, not in the HTML. */

const NAV_PAGES = [
  ['index.html',       'Home'],
  ['discography.html', 'Discography'],
  ['updates.html',     'Updates'],
  ['covers.html',      'Melody Project'],
  ['live.html',        'Concerts & Live'],
  ['vlogs.html',       'Vlogs'],
  ['timetotwice.html', 'TIME TO TWICE'],
  ['twicetv.html',     'TWICE TV'],
  ['variety.html',     'TV Variety & Reality'],
  ['streaming.html',   'Streaming Variety'],
  ['movies.html',      'Movies & Documentaries'],
  ['donate.html',      'Donate'],
];

{
  const nav = document.querySelector('.site-nav');
  const here = location.pathname.split('/').pop() || 'index.html';
  if (nav) nav.prepend(...NAV_PAGES.map(([href, label]) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === here) a.className = 'on';
    return a;
  }));
}

/* ---------- visit counter ----------

   GoatCounter (jeongsatzu.goatcounter.com): visits, pages and countries, no
   cookies. Loaded here so every page counts without its own tag. Only on the
   live site, so local previews don't show up as visits. */

if (location.hostname.endsWith('candybongvault.com')) {
  const gc = document.createElement('script');
  gc.async = true;
  gc.src = 'https://gc.zgo.at/count.js';
  gc.dataset.goatcounter = 'https://jeongsatzu.goatcounter.com/count';
  document.head.append(gc);
}

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

/* ---------- sticky filter toolbar ----------

   The toolbar is sticky so the filters stay at hand, but it covers a good part
   of the screen — on a phone, and on a desktop too once a page has many series
   tabs (TIME TO TWICE). Once it's stuck to the top, slide it away while the
   list scrolls down and bring it back on any scroll up. Not while the search
   box has focus, so it can't slide out from under the keyboard. */

const toolbar = document.querySelector('.toolbar');
if (toolbar) {
  const above = toolbar.previousElementSibling;
  let lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const dy = y - lastY;
    if (Math.abs(dy) < 6) return;           // ignore jitter
    lastY = y;
    const stuck = !above || above.getBoundingClientRect().bottom < 0;
    const typing = toolbar.contains(document.activeElement) && document.activeElement.matches('input');
    toolbar.classList.toggle('tucked', stuck && dy > 0 && !typing);
  }, { passive: true });
}

/* ---------- back to top ----------

   A round button in the bottom-right corner, there once you're a couple of
   screens down a long list. It sits under the discography's release panel
   (z-index below the overlay), so it never covers the panel's own arrows. */

{
  const top = document.createElement('button');
  top.type = 'button';
  top.className = 'to-top';
  top.setAttribute('aria-label', 'Back to top');
  top.title = 'Back to top';
  top.textContent = '↑';
  document.body.append(top);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  top.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: still.matches ? 'auto' : 'smooth' }));

  const paint = () => top.classList.toggle('shown', window.scrollY > window.innerHeight * 1.5);
  window.addEventListener('scroll', paint, { passive: true });
  paint();
}
