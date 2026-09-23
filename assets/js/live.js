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
   passed through to the data file, so one bump in the HTML covers everything.

   The Vlogs page runs this same script against its own file: the script tag's
   data-src, data-progress and data-noun point it there. Left off, it's the
   Concerts & Live page. */
const SCRIPT       = document.currentScript;
const ASSET_V      = (SCRIPT?.src.match(/[?&]v=([^&]+)/) || ['', ''])[1];
const DATA_FILE    = SCRIPT?.dataset.src || 'data/live.json';
const DATA_URL     = DATA_FILE + (ASSET_V ? '?v=' + ASSET_V : '');
const PROGRESS_KEY = SCRIPT?.dataset.progress || 'twice-archive:live-progress';
const NOUN         = SCRIPT?.dataset.noun || 'show';

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
const seriesOf  = key => (state.data.series || []).find(s => s.key === key);
const seriesLabel = key => seriesOf(key)?.label || key || '';
/* An entry can sit in a second series too — a special stage at an award show
   is both Stage Covers & Collabs and Award Shows. "series" is its home (where
   it's grouped, and its badge comes first); "alsoSeries" adds more tags, and
   the tabs find it under each of them. */
const seriesKeys = e => [e.series, ...(e.alsoSeries || [])].filter(Boolean);
const inSeries = (e, key) => seriesKeys(e).includes(key);
/* A series can hold seasons (TW-LOG's Secret Friend, its tour runs); the
   entry names its own with "season". */
const seasonLabel = e =>
  (seriesOf(e.series)?.seasons || []).find(s => s.key === e.season)?.label || e.season || '';

const chipStyle = m => memberStyle(m, state.data.memberColors, state.data.groupColors);

/* Unlike the discography, this file isn't hand-ordered — shows get pasted in
   as they're found — so the page sorts rather than trusting the file. */
const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));

/* ---------- filtering ---------- */

function visibleEvents() {
  const q = state.query.trim().toLowerCase();
  return state.data.events.filter(e => {
    if (state.series !== 'all' && !inSeries(e, state.series)) return false;
    if (state.member !== 'all' && !membersOf(e).includes(state.member)) return false;
    if (state.year !== 'all' && eventYear(e) !== state.year) return false;
    if (!q) return true;
    return [e.title, e.venue, e.artist, e.members, e.note, ...seriesKeys(e).map(seriesLabel), seasonLabel(e), e.date,
            ...(e.videos || []).map(v => v.label)]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }).sort(byDate);
}

/* ---------- list ---------- */

function renderList() {
  const host = el('list');
  if (!state.data.events.length) {
    host.innerHTML = `<p class="empty-state">Nothing filed yet — paste shows into
      <code>${escapeHtml(DATA_FILE)}</code>. <code>data/event-template.json</code> has a block to copy.</p>`;
    return;
  }
  const events = visibleEvents();
  if (!events.length) {
    host.innerHTML = `<p class="empty-state">Nothing matches those filters.</p>`;
    return;
  }

  if (state.data.groupBy === 'series') {
    host.innerHTML = seriesSections(events);
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
      ${sectionHead(year, list.length)}
      <div class="live-grid">
        ${list.flatMap(eventCards).join('')}
      </div>
    </section>`).join('');
}

const countOf = n => `${n} ${NOUN}${n === 1 ? '' : 's'}`;
/* "2015", or "2021–2025" when the entries span more than one year. */
const yearSpan = list => {
  const years = [...new Set(list.map(eventYear).filter(Boolean))].sort();
  return years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0] || '';
};
const sectionHead = (title, n, years = '', must = false) => `
      <div class="era-head">
        <h2>${escapeHtml(title)}${years ? ` <span class="era-years">${escapeHtml(years)}</span>` : ''}</h2>
        ${must ? '<span class="must">★ Must watch</span>' : ''}
        <span class="rule"></span>
        <span class="count">${countOf(n)}</span>
      </div>`;

/* The Vlogs page ("groupBy": "series") keeps each series in one section in the
   data file's order instead of splitting it across years, so an umbrella like
   TW-LOG stays together however its dates fall against everything else. Its
   seasons, in the order the series lists them, get a sub-heading each, with
   the years they span. A series without seasons shows its years on its own
   heading instead (SIXTEEN 2015). A series, like a season, can carry
   "mustWatch" and a "summary". */
function seriesSections(events) {
  const listed = (state.data.series || []).map(s => s.key);
  const keys = [...listed, ...new Set(events.map(e => e.series).filter(k => !listed.includes(k)))];

  return keys.map(key => {
    const mine = events.filter(e => e.series === key);
    if (!mine.length) return '';
    const seasons = seriesOf(key)?.seasons || [];
    const parts = [
      ...seasons.map(ss => [ss, mine.filter(e => e.season === ss.key)]),
      [null, mine.filter(e => !seasons.some(ss => ss.key === e.season))],
    ].filter(([, list]) => list.length);

    return `
    <section>
      ${sectionHead(seriesLabel(key), mine.length, seasons.length ? '' : yearSpan(mine),
                    seriesOf(key)?.mustWatch)}
      ${seriesOf(key)?.summary ? `<p class="season-summary">${escapeHtml(seriesOf(key).summary)}</p>` : ''}
      ${parts.map(([season, list]) => {
        /* A season can pin its "years" when a late upload (a Secret Cut clip
           posted years on) would otherwise stretch the span. */
        const span = season?.years || yearSpan(list);
        /* A season can be flagged as the one to start with, and say in a line
           what it's about, since the episode cards only name who it follows. */
        return `${season ? `
      <div class="season-head">
        <h3>${escapeHtml(season.label)}</h3>
        ${season.mustWatch ? '<span class="must">★ Must watch</span>' : ''}
        <span class="count">${escapeHtml(span)} · ${countOf(list.length)}</span>
      </div>
      ${season.summary ? `<p class="season-summary">${escapeHtml(season.summary)}</p>` : ''}` : ''}
      <div class="live-grid">
        ${list.flatMap(eventCards).join('')}
      </div>`;
      }).join('')}
    </section>`;
  }).join('');
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
      <span class="series-badge" data-series="${escapeHtml(e.series)}">${escapeHtml(
        [seriesLabel(e.series), seasonLabel(e)].filter(Boolean).join(': '))}</span>
      ${(e.alsoSeries || []).map(k =>
        `<span class="series-badge" data-series="${escapeHtml(k)}">${escapeHtml(seriesLabel(k))}</span>`).join('')}
      ${artists}
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
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(
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
    ...(state.data.series || []).map(s => [s.key, s.label, count(e => inSeries(e, s.key))]),
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
    (state.series === 'all' || inSeries(e, state.series)) &&
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
