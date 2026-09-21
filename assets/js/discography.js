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

const state = {
  data: null,
  query: '',
  era: 'all',
  category: 'all',
  unwatchedOnly: false,
  needsLinks: false,
  openId: null,
};

/* ---------- small helpers ---------- */

/* A pinned video leads, then every official upload ahead of every fan one, and
   within each of those the kinds in VIDEO_ORDER, so lyric videos read as a
   footnote to a track. Sorting here rather than only in the data means a
   hand-edited entry can't show up out of place. */
const VIDEO_ORDER = { mv: 0, special: 1, dance: 2, 'dance-performance': 2.5, performance: 3,
                      live: 4, other: 5, lyric: 6 };
const orderVideos = list =>
  [...(list || [])].sort((a, b) =>
    (a.pin ? 0 : 1) - (b.pin ? 0 : 1) ||
    (a.official === false ? 1 : 0) - (b.official === false ? 1 : 0) ||
    (VIDEO_ORDER[a.kind] ?? 4) - (VIDEO_ORDER[b.kind] ?? 4));

const allVideos = album => album.tracks.flatMap(t => t.videos || []);

const albumYear = album => (album.released || '').slice(0, 4);

/* Dates may be partial. Some collaboration singles are only documented to the
   year, so "2025" renders as "2025" rather than inventing a January 1st. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const prettyDate = iso => {
  const [y, m, d] = String(iso || '').split('-');
  if (!y) return '';
  if (!m) return y;
  const month = MONTHS[parseInt(m, 10) - 1] || '';
  if (!d) return `${month} ${y}`;
  return `${month} ${parseInt(d, 10)}, ${y}`;
};

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

/* A writing credit is tinted with the member's colour; two or more members
   blend into a gradient across their colours. Colours live in memberColors in
   the data file, so changing one is an edit there rather than in here. */
function writtenByStyle(names) {
  const map = state.data.memberColors || {};
  const cols = names.split(',').map(n => map[n.trim()]).filter(Boolean);
  if (!cols.length) {
    const g = state.data.groupColors;
    return g && g.length > 1
      ? `background:linear-gradient(110deg, ${g.join(', ')});color:${readableOn(g[0])};` : '';
  }
  const bg = cols.length === 1
    ? cols[0]
    : `linear-gradient(110deg, ${cols.join(', ')})`;
  return `background:${bg};color:${readableOn(cols[0])};`;
}

/* Dark text on a pale chip, light text on a deep one, so the credit stays
   readable whatever colours are chosen. */
function readableOn(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? '#2a1b22' : '#fff';
}

/* ---------- filtering ---------- */

function matchesQuery(album, q) {
  if (!q) return true;
  const hay = [album.title, album.seq, album.type,
               ...album.tracks.flatMap(t => [t.title, t.titleKo, t.artist, t.note, t.writtenBy])]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function visibleTracks(album) {
  let tracks = album.tracks;
  if (state.needsLinks)     tracks = tracks.filter(t => !(t.videos || []).length);
  if (state.unwatchedOnly)  tracks = tracks.filter(t => (t.videos || []).some(v => !isWatched(v)));
  return tracks;
}

function visibleAlbums() {
  const q = state.query.trim().toLowerCase();
  return state.data.albums.filter(a => {
    if (state.category !== 'all' && a.category !== state.category) return false;
    if (state.era !== 'all' && albumYear(a) !== state.era) return false;
    if (!matchesQuery(a, q)) return false;
    if (state.needsLinks && !a.tracks.some(t => !(t.videos || []).length)) return false;
    if (state.unwatchedOnly && !allVideos(a).some(v => !isWatched(v))) return false;
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

function albumCard(album) {
  const vids  = allVideos(album);
  const seen  = vids.filter(isWatched).length;
  const done  = vids.length > 0 && seen === vids.length;
  const ring  = vids.length
    ? `<span class="ring${done ? ' done' : ''}">${seen}/${vids.length}</span>`
    : `<span class="ring">no links yet</span>`;

  return `
    <button type="button" class="album-card" data-album="${escapeHtml(album.id)}">
      ${coverHtml(album, ring)}
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
  const tracks = visibleTracks(album);
  const vids   = allVideos(album);
  const seen   = vids.filter(isWatched).length;

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
        <div class="stream-links">${services}</div>
        ${region}
      </div>
      <button type="button" class="panel-close" id="panelClose" aria-label="Close">&times;</button>
    </div>
    <div class="panel-body">
      ${tracks.length
        ? tracks.map((t, i) => trackRow(t, album.tracks.indexOf(t) + 1)).join('')
        : `<p class="empty-state">No tracks match the current filters.</p>`}
    </div>`;

  el('panelClose').addEventListener('click', closePanel);
}

function trackRow(track, no) {
  const vids = orderVideos(track.videos)
    .filter(v => !state.unwatchedOnly || !isWatched(v));

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
      ${track.writtenBy
        ? `<p class="written-row"><span class="written"
             style="${writtenByStyle(track.writtenBy)}">✎ Written by ${escapeHtml(track.writtenBy)}</span></p>`
        : ''}
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
}

/* ---------- filters ---------- */

function renderEraChips() {
  const pool = state.category === 'all'
    ? state.data.albums
    : state.data.albums.filter(a => a.category === state.category);
  const years = [...new Set(pool.map(albumYear))].filter(Boolean).sort();
  if (!years.includes(state.era)) state.era = 'all';   /* year gone with the category */
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

function wireFilters() {
  el('search').addEventListener('input', e => {
    state.query = e.target.value;
    renderGrid();
  });

  el('categories').addEventListener('click', e => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    [...el('categories').children].forEach(c => c.classList.toggle('on', c === chip));
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

  el('unwatched').addEventListener('click', e => {
    state.unwatchedOnly = !state.unwatchedOnly;
    e.currentTarget.classList.toggle('on', state.unwatchedOnly);
    renderGrid();
    if (state.openId) renderPanel(state.data.albums.find(a => a.id === state.openId));
  });

  el('needsLinks').addEventListener('click', e => {
    state.needsLinks = !state.needsLinks;
    e.currentTarget.classList.toggle('on', state.needsLinks);
    renderGrid();
    if (state.openId) renderPanel(state.data.albums.find(a => a.id === state.openId));
  });
}

/* ---------- where you were ----------

   The grid is only drawn once the data has loaded, which is after the browser
   has already tried, and failed, to put you back where you were on a reload.
   So this tab remembers the page's scroll and the open panel's own scroll, and
   puts both back once everything is drawn. sessionStorage is per tab and goes
   when the tab closes; if storage is off there's simply nothing to restore. */

const SCROLL_KEY = 'twice-archive:discography-scroll';

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
  renderEraChips();
  wireFilters();
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
    if (e.key === 'Escape' && state.openId) closePanel();
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
