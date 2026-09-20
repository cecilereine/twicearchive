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
  unwatchedOnly: false,
  needsLinks: false,
  openId: null,
};

/* ---------- small helpers ---------- */

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

/* ---------- filtering ---------- */

function matchesQuery(album, q) {
  if (!q) return true;
  const hay = [album.title, album.seq, album.type,
               ...album.tracks.flatMap(t => [t.title, t.titleKo, t.artist, t.note])]
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
  const vids = (track.videos || [])
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
  const years = [...new Set(state.data.albums.map(albumYear))].filter(Boolean).sort();
  el('eras').innerHTML = [
    `<button type="button" class="chip on" data-era="all">All years</button>`,
    ...years.map(y => `<button type="button" class="chip" data-era="${y}">${y}</button>`),
  ].join('');
}

function wireFilters() {
  el('search').addEventListener('input', e => {
    state.query = e.target.value;
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

/* ---------- boot ---------- */

async function init() {
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
  renderEraChips();
  wireFilters();
  renderGrid();
  renderProgress();

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
}

init();
