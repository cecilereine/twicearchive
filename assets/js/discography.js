/* ---------------------------------------------------------------------------
   Korean discography page.

   Reads data/discography-kr.json and draws a cover grid grouped by year.
   Clicking a release opens a panel with its tracks, its streaming links and
   every video filed against each song.
--------------------------------------------------------------------------- */

/* The data file has to cache-bust along with the scripts. GitHub Pages caches
   for ten minutes, so editing the JSON without this can leave a browser showing
   yesterday's tracklist against today's code. Reusing the ?v= already on this
   script tag means one bump in the HTML covers CSS, JS and data together. */
const ASSET_V  = (document.currentScript?.src.match(/[?&]v=([^&]+)/) || ['', ''])[1];
const DATA_URL = 'data/discography.json' + (ASSET_V ? '?v=' + ASSET_V : '');

const el = id => document.getElementById(id);
let paintReset = () => {};          /* set once the reset button is wired */

const state = {
  data: null,
  query: '',
  era: 'all',
  category: 'all',
  member: 'all',
  openId: null,
};

/* ---------- small helpers ---------- */

const allVideos = album => album.tracks.flatMap(t => t.videos || []);

const albumYear = album => (album.released || '').slice(0, 4);

/* Two-letter stand-in drawn on the cover tile until real art is dropped into
   assets/img/covers/ and named in the data file. */
const initials = title => title.replace(/[^A-Za-z0-9가-힣 ]/g, '')
  .split(/\s+/).filter(Boolean).slice(0, 2)
  .map(w => w[0]).join('').toUpperCase() || 'TW';

function coverHtml(album, extra = '') {
  const inner = album.cover
    ? `<img src="${escapeHtml(album.cover)}" alt="${escapeHtml(album.title)} cover" loading="lazy">`
    : `<span class="initials">${escapeHtml(initials(album.title))}</span>`;
  return `<div class="cover">${inner}${extra}</div>`;
}

/* A credit chip is tinted with the member's colour (memberStyle in core.js). */
const writtenByStyle = names => memberStyle(names, state.data.memberColors, state.data.groupColors);

/* Member credits under a track: lyrics (writtenBy) and music (composedBy).
   When the same member did both it reads as one chip rather than two. */
function creditRow(track) {
  const w = track.writtenBy, c = track.composedBy;
  if (!w && !c) return '';
  const chip = (who, text) =>
    `<span class="written" style="${writtenByStyle(who)}">${text} ${escapeHtml(who)}</span>`;
  const chips = w && c && w === c
    ? [chip(w, '✎ Written &amp; composed by')]
    : [w && chip(w, '✎ Written by'), c && chip(c, '♪ Composed by')].filter(Boolean);
  return `<p class="written-row">${chips.join(' ')}</p>`;
}

/* ---------- filtering ---------- */

function matchesQuery(album, q) {
  if (!q) return true;
  const hay = [album.title, album.seq, album.type,
               ...album.tracks.flatMap(t => [t.title, t.titleKo, t.artist, t.note, t.writtenBy, t.composedBy])]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/* Artists are credited in free text — "Jihyo with Shenseea", "MISAMO",
   "Jeongyeon, Jihyo, Chaeyoung" — so a release belongs to a member when their
   name appears in the release's own artist line. Only the release's main
   artist counts: a unit or solo track inside a group album doesn't put that
   album under the member. Group releases credit TWICE rather than the nine
   names, so they stay under Everyone. Named units are choices of their own,
   next to the members, rather than folded into each of theirs. */
const UNITS = { MISAMO: ['Mina', 'Sana', 'Momo'] };

const memberCache = new Map();
function albumMembers(album) {
  if (!memberCache.has(album.id)) {
    const text = album.artist || '';
    memberCache.set(album.id, new Set(
      [...Object.keys(state.data.memberColors || {}), ...Object.keys(UNITS)]
        .filter(name => new RegExp(`\\b${name}\\b`).test(text))));
  }
  return memberCache.get(album.id);
}

const inCategory = a => state.category === 'all' || a.category === state.category;
const hasMember  = a => state.member === 'all' || albumMembers(a).has(state.member);

function visibleAlbums() {
  const q = state.query.trim().toLowerCase();
  return state.data.albums.filter(a => {
    if (!inCategory(a) || !hasMember(a)) return false;
    if (state.era !== 'all' && albumYear(a) !== state.era) return false;
    if (!matchesQuery(a, q)) return false;
    return true;
  });
}

/* ---------- grid ---------- */

function renderGrid() {
  const albums = visibleAlbums();
  const host = el('grid');

  if (!albums.length) {
    host.innerHTML = `<p class="empty-state">Nothing matches those filters.</p>`;
    return;
  }

  /* Group into year headings, keeping the order the data file is written in. */
  const groups = new Map();
  for (const a of albums) {
    const y = albumYear(a) || '—';
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(a);
  }

  host.innerHTML = [...groups].map(([year, list]) => `
    <section>
      <div class="era-head">
        <h2>${escapeHtml(year)}</h2>
        <span class="rule"></span>
        <span class="count">${list.length} release${list.length === 1 ? '' : 's'}</span>
      </div>
      <div class="album-grid">
        ${list.map(albumCard).join('')}
      </div>
    </section>`).join('');
}

/* Watched state on a cover reads the way YouTube's does: a bar along the bottom
   edge fills as videos are watched, and a finished release gets a tick, a
   dimmed cover and a green frame, so "done" shows from across the grid without
   reading a number. */
function albumCard(album) {
  const vids  = allVideos(album);
  const seen  = vids.filter(isWatched).length;
  const done  = vids.length > 0 && seen === vids.length;
  const pill  = !vids.length ? 'no links yet' : done ? '✓ Watched' : `${seen}/${vids.length}`;
  const extra = `<span class="ring${done ? ' done' : ''}">${pill}</span>` +
    (vids.length ? `<span class="bar"><i style="width:${Math.round(100 * seen / vids.length)}%"></i></span>` : '') +
    (done ? '<span class="tick" aria-hidden="true">✓</span>' : '');

  return `
    <button type="button" class="album-card${done ? ' done' : ''}" data-album="${escapeHtml(album.id)}">
      ${coverHtml(album, extra)}
      <div class="body">
        <h3>${escapeHtml(album.title)}</h3>
        ${album.artist ? `<p class="card-artist">${escapeHtml(album.artist)}</p>` : ''}
        <p class="type-row"><span class="type-badge"
           data-type="${escapeHtml(album.type)}">${escapeHtml(album.type)}</span></p>
        <p class="meta">${escapeHtml(album.seq)} · ${escapeHtml(prettyDate(album.released))}</p>
      </div>
    </button>`;
}

/* ---------- album panel ---------- */

function renderPanel(album) {
  const tracks = album.tracks;
  const vids   = allVideos(album);
  const seen   = vids.filter(isWatched).length;
  const allSeen = vids.length > 0 && seen === vids.length;

  const services = state.data.services.map(s => {
        const href = (album.links || {})[s.key];
        return href
          ? `<a class="stream-btn" data-svc="${s.key}" href="${escapeHtml(href)}"
                target="_blank" rel="noopener"><span class="dot"></span>${escapeHtml(s.label)}</a>`
          : `<span class="stream-btn empty" data-svc="${s.key}"
                title="No link yet"><span class="dot"></span>${escapeHtml(s.label)}</span>`;
      }).join('');

  /* Some releases only exist on one country's storefront, which is worth saying
     so a link that looks broken from elsewhere reads as expected instead. */
  const region = album.regionLocked
    ? `<p class="region-lock">${escapeHtml(album.regionLocked)}</p>` : '';

  /* Neighbours in the order the grid is showing, so with a category or year
     chip on the arrows walk through just those. A release opened from a link
     while the filters hide it falls back to the full list. */
  let trail = visibleAlbums();
  if (!trail.some(a => a.id === album.id)) trail = state.data.albums;
  const at = trail.findIndex(a => a.id === album.id);
  /* An SVG chevron rather than ‹ ›, which sit off-centre in the circle. */
  const chevron = d => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
      stroke-linejoin="round"><path d="${d}"/></svg>`;
  const arrow = (a, id, dir, glyph) => a
    ? `<button type="button" class="panel-arrow" id="${id}" data-go="${escapeHtml(a.id)}"
          title="${escapeHtml(a.title)}" aria-label="${dir}: ${escapeHtml(a.title)}">${glyph}</button>`
    : `<button type="button" class="panel-arrow" id="${id}" disabled aria-label="${dir}">${glyph}</button>`;

  el('panelBody').innerHTML = `
    <div class="panel-head">
      ${coverHtml(album)}
      <div class="info">
        <h2>${escapeHtml(album.title)}</h2>
        ${album.artist ? `<p class="panel-artist">${escapeHtml(album.artist)}</p>` : ''}
        ${album.note ? `<p class="ko">${escapeHtml(album.note)}</p>` : ''}
        <p class="type-row"><span class="type-badge"
           data-type="${escapeHtml(album.type)}">${escapeHtml(album.type)}</span></p>
        <p class="meta">${escapeHtml(album.seq)} ·
           ${escapeHtml(prettyDate(album.released))} ·
           ${seen}/${vids.length} watched</p>
        ${vids.length ? `<button type="button" class="watch-btn mark-all${allSeen ? ' on' : ''}" id="markAll">
           ${allSeen ? '✓ All watched · Unmark all' : 'Mark all watched'}</button>` : ''}
        <div class="stream-links">${services}</div>
        ${region}
      </div>
      <div class="panel-nav">
        <button type="button" class="panel-close" id="panelClose" aria-label="Close">&times;</button>
      </div>
    </div>
    <div class="panel-body">
      ${tracks.map((t, i) => trackRow(t, i + 1)).join('')}
    </div>`;

  /* The arrows float beside the panel rather than inside it, so they stay put
     while a long tracklist scrolls. */
  el('panelArrows').innerHTML =
    arrow(trail[at - 1], 'panelPrev', 'Previous release', chevron('M15 18l-6-6 6-6')) +
    arrow(trail[at + 1], 'panelNext', 'Next release', chevron('M9 18l6-6-6-6'));

  el('panelClose').addEventListener('click', closePanel);
  for (const b of document.querySelectorAll('#panelBody [data-go], #panelArrows [data-go]'))
    b.addEventListener('click', () => goTo(b.dataset.go));
  /* One click for the whole release; once everything is watched it undoes. The
     grid's per-release counts refresh when the panel closes. */
  el('markAll')?.addEventListener('click', () => {
    setWatchedAll(vids, !allSeen);
    renderPanel(album);
    renderProgress();
  });
}

function trackRow(track, no) {
  const vids = orderVideos(track.videos);

  const body = vids.length
    ? `<div class="video-strip">${vids.map(videoCard).join('')}</div>`
    : `<div class="no-video">
         <span>No video linked yet.</span>
         <a href="https://www.youtube.com/results?search_query=${
              encodeURIComponent('TWICE ' + track.title)}"
            target="_blank" rel="noopener">Search YouTube ↗</a>
       </div>`;

  return `
    <div class="track">
      <div class="track-head">
        <span class="track-no">${no}</span>
        <span class="track-title">${escapeHtml(track.title)}</span>
        ${track.titleKo ? `<span class="track-ko">${escapeHtml(track.titleKo)}</span>` : ''}
        ${track.artist ? `<span class="credit">${escapeHtml(track.artist)}</span>` : ''}
        ${track.titleTrack ? `<span class="star">Title</span>` : ''}
        ${track.note ? `<span class="track-ko">· ${escapeHtml(track.note)}</span>` : ''}
      </div>
      ${creditRow(track)}
      ${body}
    </div>`;
}

function openPanel(id) {
  const album = state.data.albums.find(a => a.id === id);
  if (!album) return;
  state.openId = id;
  renderPanel(album);
  el('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (location.hash.slice(1) !== id) history.pushState(null, '', '#' + id);
}

/* Step to a neighbouring release without closing. The grid redraws first so
   the card being left shows what was watched in it. */
function goTo(id) {
  renderGrid();
  openPanel(id);
  el('overlay').scrollTop = 0;
}

function closePanel() {
  state.openId = null;
  el('overlay').classList.remove('open');
  document.body.style.overflow = '';
  if (location.hash) history.pushState(null, '', location.pathname);
  renderGrid();                    /* watched counts may have changed */
  renderProgress();
}

/* ---------- progress ---------- */

function renderProgress() {
  const all  = state.data.albums.flatMap(allVideos);
  const seen = all.filter(isWatched).length;
  el('progress').innerHTML = `<b>${seen}</b> / ${all.length} videos watched`;
  paintReset();

  /* The hub shows the same totals on its Discography card without loading the
     data file: the numbers are left here for it, in the same browser the
     watched marks live in. */
  const releases = state.data.albums.filter(a => allVideos(a).length);
  const done = releases.filter(a => allVideos(a).every(isWatched)).length;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(
      { seen, total: all.length, done, entries: releases.length }));
  } catch { /* nothing to remember */ }
}

/* ---------- filters ---------- */

function renderEraChips() {
  const pool = state.data.albums.filter(a => inCategory(a) && hasMember(a));
  const years = [...new Set(pool.map(albumYear))].filter(Boolean).sort();
  if (!years.includes(state.era)) state.era = 'all';   /* year gone with the category or member */
  el('eras').innerHTML = [
    `<button type="button" class="chip${state.era === 'all' ? ' on' : ''}" data-era="all">All years</button>`,
    ...years.map(y => `<button type="button" class="chip${state.era === y ? ' on' : ''}" data-era="${y}">${y}</button>`),
  ].join('');
}

function renderCategoryChips() {
  const counts = {};
  for (const a of state.data.albums) counts[a.category] = (counts[a.category] || 0) + 1;
  const total = state.data.albums.length;
  el('categories').innerHTML = [
    `<button type="button" class="chip on" data-category="all">All <span class="chip-n">${total}</span></button>`,
    ...(state.data.categories || []).map(c => counts[c.key]
      ? `<button type="button" class="chip" data-category="${c.key}">${escapeHtml(c.label)} <span class="chip-n">${counts[c.key]}</span></button>`
      : '').filter(Boolean),
  ].join('');
}

/* Members in the data file's colour order, then units, each counted within the
   chosen category, and only those with something to show there. A unit's dot
   blends its members' colours. */
function renderMemberChips() {
  const memberColors = state.data.memberColors || {};
  const colors = { ...memberColors };
  for (const [unit, members] of Object.entries(UNITS))
    colors[unit] = `linear-gradient(135deg, ${members.map(m => memberColors[m]).join(', ')})`;
  const pool = state.data.albums.filter(inCategory);
  const counts = Object.keys(colors)
    .map(m => [m, pool.filter(a => albumMembers(a).has(m)).length])
    .filter(([, n]) => n);
  if (state.member !== 'all' && !counts.some(([m]) => m === state.member)) state.member = 'all';
  el('members').innerHTML = [
    `<button type="button" class="chip${state.member === 'all' ? ' on' : ''}" data-member="all">Everyone</button>`,
    ...counts.map(([m, n]) =>
      `<button type="button" class="chip${state.member === m ? ' on' : ''}" data-member="${escapeHtml(m)}"><span class="dot" style="background:${escapeHtml(colors[m])}"></span>${escapeHtml(m)} <span class="chip-n">${n}</span></button>`),
  ].join('');
}

function wireFilters() {
  el('search').addEventListener('input', e => {
    state.query = e.target.value;
    renderGrid();
  });

  el('members').addEventListener('click', e => {
    const chip = e.target.closest('[data-member]');
    if (!chip) return;
    state.member = chip.dataset.member;
    [...el('members').children].forEach(c => c.classList.toggle('on', c === chip));
    renderEraChips();
    renderGrid();
  });

  el('categories').addEventListener('click', e => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    [...el('categories').children].forEach(c => c.classList.toggle('on', c === chip));
    renderMemberChips();
    renderEraChips();
    renderGrid();
  });

  el('eras').addEventListener('click', e => {
    const chip = e.target.closest('[data-era]');
    if (!chip) return;
    state.era = chip.dataset.era;
    [...el('eras').children].forEach(c => c.classList.toggle('on', c === chip));
    renderGrid();
  });
}

/* ---------- where you were ----------

   The grid is only drawn once the data has loaded, which is after the browser
   has already tried, and failed, to put you back where you were on a reload.
   So this tab remembers the page's scroll and the open panel's own scroll, and
   puts both back once everything is drawn. sessionStorage is per tab and goes
   when the tab closes; if storage is off there's simply nothing to restore. */

const SCROLL_KEY   = 'twice-archive:discography-scroll';
const PROGRESS_KEY = 'twice-archive:discography-progress';

function saveScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({
      page: window.scrollY, panel: el('overlay').scrollTop, openId: state.openId }));
  } catch { /* nothing to remember */ }
}

function savedScroll() {
  try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null') || {}; }
  catch { return {}; }
}

/* ---------- boot ---------- */

async function init() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveScroll();
  });

  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    data = await res.json();
  } catch (err) {
    el('grid').innerHTML =
      `<p class="empty-state">Couldn't load ${DATA_URL} — ${escapeHtml(err.message)}.<br>
       If you opened this file directly, serve the folder over http instead
       (<code>python3 -m http.server</code>); fetch() is blocked on file://.</p>`;
    return;
  }

  state.data = data;
  renderCategoryChips();
  renderMemberChips();
  renderEraChips();
  wireFilters();
  paintReset = resetButton(el('resetProgress'), () => state.data.albums.flatMap(allVideos), () => {
    renderGrid();
    renderProgress();
    if (state.openId) renderPanel(state.data.albums.find(a => a.id === state.openId));
  });
  renderGrid();
  renderProgress();

  /* The page scroll goes back before a panel opens: an open panel locks the
     page, and some browsers ignore scrollTo on a locked page. */
  const where = savedScroll();
  window.scrollTo(0, where.page || 0);

  el('grid').addEventListener('click', e => {
    const card = e.target.closest('[data-album]');
    if (card) openPanel(card.dataset.album);
  });

  /* Clicking the dimmed backdrop, but not the panel itself, closes it. */
  el('overlay').addEventListener('click', e => {
    if (e.target === el('overlay')) closePanel();
  });
  document.addEventListener('keydown', e => {
    if (!state.openId) return;
    if (e.key === 'Escape') closePanel();
    /* ← → step between releases, unless you're typing somewhere. */
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.matches?.('input, textarea')) {
      const b = el(e.key === 'ArrowLeft' ? 'panelPrev' : 'panelNext');
      if (b?.dataset.go) goTo(b.dataset.go);
    }
  });

  wireVideoCards(el('overlay'), () => { renderProgress(); });

  /* #album-id in the address opens that release, so links are shareable and
     the back button steps out of the panel. */
  const fromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) openPanel(id); else if (state.openId) closePanel();
  };
  window.addEventListener('popstate', fromHash);
  fromHash();
  if (state.openId && where.openId === state.openId) el('overlay').scrollTop = where.panel || 0;
}

init();
