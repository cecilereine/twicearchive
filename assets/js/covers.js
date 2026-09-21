/* ---------------------------------------------------------------------------
   Melody Project & Covers page.

   Reads data/covers.json and lists every cover by year: the song, who
   originally sang it, which members covered it, and each video filed against
   it (the cover, a behind-the-scenes, a live clip). Nothing opens in a panel:
   every video is a card in a grid, with its cover's details on the card.
--------------------------------------------------------------------------- */

/* Same cache-busting as the discography: the ?v= on this script tag is passed
   through to the data file, so one bump in the HTML covers everything. */
const ASSET_V  = (document.currentScript?.src.match(/[?&]v=([^&]+)/) || ['', ''])[1];
const DATA_URL = 'data/covers.json' + (ASSET_V ? '?v=' + ASSET_V : '');

const el = id => document.getElementById(id);
let paintReset = () => {};          /* set once the reset button is wired */

const state = {
  data: null,
  query: '',
  series: 'all',
  member: 'all',
  year: 'all',
};

/* ---------- small helpers ---------- */

const coverYear = c => (c.released || '').slice(0, 4);
const membersOf = c => String(c.members || '').split(',').map(m => m.trim()).filter(Boolean);
const allVideos = () => state.data.covers.flatMap(c => c.videos || []);
const seriesLabel = key =>
  (state.data.series || []).find(s => s.key === key)?.label || key || '';

const chipStyle = m => memberStyle(m, state.data.memberColors, state.data.groupColors);

/* ---------- filtering ---------- */

function visibleCovers() {
  const q = state.query.trim().toLowerCase();
  return state.data.covers.filter(c => {
    if (state.series !== 'all' && c.series !== state.series) return false;
    if (state.member !== 'all' && !membersOf(c).includes(state.member)) return false;
    if (state.year !== 'all' && coverYear(c) !== state.year) return false;
    if (!q) return true;
    return [c.song, c.songKo, c.originalArtist, c.members, c.note,
            ...(c.videos || []).map(v => v.label)]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

/* ---------- list ---------- */

function renderList() {
  const host = el('list');
  if (!state.data.covers.length) {
    host.innerHTML = `<p class="empty-state">Nothing filed yet.</p>`;
    return;
  }
  const covers = visibleCovers();
  if (!covers.length) {
    host.innerHTML = `<p class="empty-state">Nothing matches those filters.</p>`;
    return;
  }

  /* Year headings, keeping the order the data file is written in. */
  const groups = new Map();
  for (const c of covers) {
    const y = coverYear(c) || '—';
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(c);
  }

  host.innerHTML = [...groups].map(([year, list]) => `
    <section>
      <div class="era-head">
        <h2>${escapeHtml(year)}</h2>
        <span class="rule"></span>
        <span class="count">${list.length} cover${list.length === 1 ? '' : 's'}</span>
      </div>
      <div class="cover-grid">
        ${list.flatMap(coverCards).join('')}
      </div>
    </section>`).join('');
}

/* One card per video, each carrying its cover's song, original artist and
   members, so a cover with a behind-the-scenes simply takes two cards side by
   side. Most covers have one video, which is why the videos are the grid
   rather than a box per cover with a lone thumbnail in it. */
function coverCards(c) {
  const members = membersOf(c).map(m =>
    `<span class="member" style="${chipStyle(m)}">${escapeHtml(m)}</span>`).join('');
  const head = `
    <h3 class="song">${escapeHtml(c.song)}${c.songKo ? ` <span class="track-ko">${escapeHtml(c.songKo)}</span>` : ''}</h3>
    ${c.originalArtist ? `<span class="orig">originally by ${escapeHtml(c.originalArtist)}</span>` : ''}
    <div class="cover-meta">
      ${members}
      <span class="series-badge" data-series="${escapeHtml(c.series)}">${escapeHtml(seriesLabel(c.series))}</span>
      <span class="date">${escapeHtml(prettyDate(c.released))}</span>
    </div>
    ${c.note ? `<p class="cover-note">${escapeHtml(c.note)}</p>` : ''}`;

  const vids = orderVideos(c.videos);
  if (!vids.length) {
    return [`<article class="vcard cover-card" id="${escapeHtml(c.id)}">
      <div class="vmeta">${head}<span class="no-video">No video linked yet.</span></div>
    </article>`];
  }
  /* "Cover" is the plain case and goes without saying on a single card; it's
     only worth a line next to a behind-the-scenes or a live clip. */
  return vids.map((v, i) => videoCard(v, {
    head, className: 'cover-card', id: i === 0 ? c.id : '', badge: false,
    caption: vids.length > 1 || v.label !== 'Cover' ? v.label : null,
  }));
}

/* ---------- progress ---------- */

function renderProgress() {
  const all  = allVideos();
  const seen = all.filter(isWatched).length;
  el('progress').innerHTML = `<b>${seen}</b> / ${all.length} videos watched`;
  paintReset();

  /* Left for the hub's card, same as the discography does. */
  const entries = state.data.covers.filter(c => (c.videos || []).length);
  const done = entries.filter(c => c.videos.every(isWatched)).length;
  try {
    localStorage.setItem('twice-archive:covers-progress', JSON.stringify(
      { seen, total: all.length, done, entries: entries.length }));
  } catch { /* nothing to remember */ }
}

/* ---------- filters ---------- */

function chips(hostId, key, items, current) {
  el(hostId).innerHTML = items.map(([value, label, n, style]) =>
    `<button type="button" class="chip${current === value ? ' on' : ''}" data-${key}="${escapeHtml(value)}">${
      style ? `<span class="dot" style="${style}"></span>` : ''}${escapeHtml(label)}${
      n != null ? ` <span class="chip-n">${n}</span>` : ''}</button>`).join('');
}

function renderChips() {
  const covers = state.data.covers;
  const count = pred => covers.filter(pred).length;

  chips('series', 'series', [
    ['all', 'All', covers.length],
    ...(state.data.series || []).map(s => [s.key, s.label, count(c => c.series === s.key)]),
  ].filter(([v, , n]) => v === 'all' || n), state.series);

  /* Members in the data file's colour order, only those with a cover. */
  const names = Object.keys(state.data.memberColors || {})
    .filter(m => covers.some(c => membersOf(c).includes(m)));
  chips('members', 'member', [
    ['all', 'Everyone'],
    ...names.map(m => [m, m, count(c => membersOf(c).includes(m)),
                       `background:${state.data.memberColors[m]}`]),
  ], state.member);

  /* Years narrow to what the chosen series and member actually have. */
  const pool = covers.filter(c =>
    (state.series === 'all' || c.series === state.series) &&
    (state.member === 'all' || membersOf(c).includes(state.member)));
  const years = [...new Set(pool.map(coverYear))].filter(Boolean).sort();
  if (!years.includes(state.year)) state.year = 'all';
  chips('years', 'year', [['all', 'All years'], ...years.map(y => [y, y])], state.year);
}

function wireFilters() {
  el('search').addEventListener('input', e => {
    state.query = e.target.value;
    renderList();
  });
  for (const [hostId, key] of [['series', 'series'], ['members', 'member'], ['years', 'year']]) {
    el(hostId).addEventListener('click', e => {
      const chip = e.target.closest(`[data-${key}]`);
      if (!chip) return;
      state[key] = chip.dataset[key];
      renderChips();
      renderList();
    });
  }
}

/* ---------- boot ---------- */

async function init() {
  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    data = await res.json();
  } catch (err) {
    el('list').innerHTML =
      `<p class="empty-state">Couldn't load ${DATA_URL} — ${escapeHtml(err.message)}.<br>
       If you opened this file directly, serve the folder over http instead
       (<code>python3 -m http.server</code>); fetch() is blocked on file://.</p>`;
    return;
  }

  state.data = data;
  renderChips();
  wireFilters();
  paintReset = resetButton(el('resetProgress'), allVideos, () => { renderList(); renderProgress(); });
  renderList();
  renderProgress();
  wireVideoCards(el('list'), renderProgress);

  /* #cover-id in the address scrolls to that entry, so links are shareable. */
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) document.getElementById(id)?.scrollIntoView();
}

init();
