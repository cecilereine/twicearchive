/* ---------------------------------------------------------------------------
   Concerts & Live page.

   Reads data/live.json and lists every show by year: a whole concert, festival
   set, broadcast special, fanmeeting or award show, each as one video you'd
   watch end to end. A per-song cut from one of these shows is not here — it
   stays on its track in the discography, which answers a different question
   ("every version of this song" rather than "what was that show like").

   Same card grid as the covers page: one card per video, with the show's
   details on the card, so an event with a second upload — a 4K reissue, a
   Day 2 — simply takes two cards side by side.
--------------------------------------------------------------------------- */

/* Same cache-busting as the other sections: the ?v= on this script tag is
   passed through to the data file, so one bump in the HTML covers everything. */
const ASSET_V  = (document.currentScript?.src.match(/[?&]v=([^&]+)/) || ['', ''])[1];
const DATA_URL = 'data/live.json' + (ASSET_V ? '?v=' + ASSET_V : '');

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

const eventYear = e => (e.date || '').slice(0, 4);
/* A show with no "artist" is TWICE; a solo one names the member. A sub-unit
   names both: "artist" is what it's billed as (MISAMO, matching how the
   discography credits it) and "members" is who's in it. Splitting those lets
   the chip read MISAMO while the filter still finds it under Mina. */
const membersOf = e => String(e.members || e.artist || '').split(',').map(a => a.trim()).filter(Boolean);
const allVideos = () => state.data.events.flatMap(e => e.videos || []);
const seriesLabel = key =>
  (state.data.series || []).find(s => s.key === key)?.label || key || '';

const chipStyle = m => memberStyle(m, state.data.memberColors, state.data.groupColors);

/* Unlike the discography, this file isn't hand-ordered — shows get pasted in
   as they're found — so the page sorts rather than trusting the file. */
const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));

/* ---------- filtering ---------- */

function visibleEvents() {
  const q = state.query.trim().toLowerCase();
  return state.data.events.filter(e => {
    if (state.series !== 'all' && e.series !== state.series) return false;
    if (state.member !== 'all' && !membersOf(e).includes(state.member)) return false;
    if (state.year !== 'all' && eventYear(e) !== state.year) return false;
    if (!q) return true;
    return [e.title, e.venue, e.artist, e.members, e.note, seriesLabel(e.series), e.date,
            ...(e.videos || []).map(v => v.label)]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }).sort(byDate);
}

/* ---------- list ---------- */

function renderList() {
  const host = el('list');
  if (!state.data.events.length) {
    host.innerHTML = `<p class="empty-state">Nothing filed yet — paste shows into
      <code>data/live.json</code>. <code>data/event-template.json</code> has a block to copy.</p>`;
    return;
  }
  const events = visibleEvents();
  if (!events.length) {
    host.innerHTML = `<p class="empty-state">Nothing matches those filters.</p>`;
    return;
  }

  const groups = new Map();
  for (const e of events) {
    const y = eventYear(e) || '—';
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(e);
  }

  host.innerHTML = [...groups].map(([year, list]) => `
    <section>
      <div class="era-head">
        <h2>${escapeHtml(year)}</h2>
        <span class="rule"></span>
        <span class="count">${list.length} show${list.length === 1 ? '' : 's'}</span>
      </div>
      <div class="live-grid">
        ${list.flatMap(eventCards).join('')}
      </div>
    </section>`).join('');
}

function eventCards(e) {
  /* An act with a name of its own gets one chip wearing it, coloured by blending
     its members' colours; anything else gets a chip per member. */
  const members = membersOf(e);
  const billing = String(e.artist || '').trim();
  const artists = billing && billing !== members.join(', ')
    ? `<span class="member" style="${chipStyle(members.join(', '))}">${escapeHtml(billing)}</span>`
    : members.map(m => `<span class="member" style="${chipStyle(m)}">${escapeHtml(m)}</span>`).join('');
  const head = `
    <h3 class="song">${escapeHtml(e.title)}</h3>
    ${e.venue ? `<span class="orig">${escapeHtml(e.venue)}</span>` : ''}
    <div class="live-meta">
      ${artists}
      <span class="series-badge" data-series="${escapeHtml(e.series)}">${escapeHtml(seriesLabel(e.series))}</span>
      <span class="date">${escapeHtml(prettyDate(e.date))}</span>
    </div>
    ${e.note ? `<p class="live-note">${escapeHtml(e.note)}</p>` : ''}`;

  const vids = orderVideos(e.videos);
  if (!vids.length) {
    return [`<article class="vcard live-card" id="${escapeHtml(e.id)}">
      <div class="vmeta">${head}<span class="no-video">No video linked yet.</span></div>
    </article>`];
  }
  /* The kind badge stays on here: unlike the covers page, these cards are a
     mix — a concert reads "Live", an award-show set reads "Performance". */
  return vids.map((v, i) => videoCard(v, {
    head, className: 'live-card', id: i === 0 ? e.id : '',
  }));
}

/* ---------- progress ---------- */

function renderProgress() {
  const all  = allVideos();
  const seen = all.filter(isWatched).length;
  el('progress').innerHTML = `<b>${seen}</b> / ${all.length} videos watched`;
  paintReset();

  /* Left for the hub's card, same as the other sections do. */
  const entries = state.data.events.filter(e => (e.videos || []).length);
  const done = entries.filter(e => e.videos.every(isWatched)).length;
  try {
    localStorage.setItem('twice-archive:live-progress', JSON.stringify(
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
  const events = state.data.events;
  const count = pred => events.filter(pred).length;

  chips('series', 'series', [
    ['all', 'All', events.length],
    ...(state.data.series || []).map(s => [s.key, s.label, count(e => e.series === s.key)]),
  ].filter(([v, , n]) => v === 'all' || n), state.series);

  /* Members in the data file's colour order, only those with a show of their
     own. Most shows are the whole group, so the row stays hidden until a solo
     one turns up rather than sitting there saying only "Everyone". */
  const names = Object.keys(state.data.memberColors || {})
    .filter(m => events.some(e => membersOf(e).includes(m)));
  el('members').hidden = !names.length;
  if (names.length) {
    chips('members', 'member', [
      ['all', 'Everyone'],
      ...names.map(m => [m, m, count(e => membersOf(e).includes(m)),
                         `background:${state.data.memberColors[m]}`]),
    ], state.member);
  } else if (state.member !== 'all') {
    state.member = 'all';
  }

  /* Years narrow to what the chosen series and member actually have. */
  const pool = events.filter(e =>
    (state.series === 'all' || e.series === state.series) &&
    (state.member === 'all' || membersOf(e).includes(state.member)));
  const years = [...new Set(pool.map(eventYear))].filter(Boolean).sort();
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
  state.data.events = state.data.events || [];
  renderChips();
  wireFilters();
  paintReset = resetButton(el('resetProgress'), allVideos, () => { renderList(); renderProgress(); });
  renderList();
  renderProgress();
  wireVideoCards(el('list'), renderProgress);

  /* #event-id in the address scrolls to that show, so links are shareable. */
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) document.getElementById(id)?.scrollIntoView();
}

init();
