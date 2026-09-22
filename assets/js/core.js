/* ---------------------------------------------------------------------------
   TWICE Content Archive — shared helpers.

   Four things live here because every section page needs them:
     1. YouTube link handling  — turn whatever you pasted into a video id.
     2. Watched state          — remembered in this browser via localStorage.
     3. Small shared helpers   — dates, member colours, video order.
     4. Video cards            — a thumbnail that opens the video in a new tab.
--------------------------------------------------------------------------- */

/* ---------- 1. YouTube links ---------------------------------------------

   You can put ANY of these in the data files and they all work, so you can
   paste straight from the address bar or the Share button:

     https://www.youtube.com/watch?v=ePpPVE-GGJw
     https://youtu.be/ePpPVE-GGJw?t=42
     https://www.youtube.com/shorts/ePpPVE-GGJw
     ePpPVE-GGJw                       (the bare id)

   Anything that isn't a YouTube link (Vlive mirrors, Naver, Weverse, a
   Google Drive file…) is kept as a plain link and shown with whatever
   "thumb" image the entry gives, or a coloured placeholder if it gives none.
-------------------------------------------------------------------------- */

const YT_ID = /^[\w-]{11}$/;

function youtubeId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (YT_ID.test(raw)) return raw;

  let url;
  try { url = new URL(raw, location.href); } catch { return null; }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const isYt = host === 'youtu.be' ||
               host.endsWith('youtube.com') ||
               host.endsWith('youtube-nocookie.com');
  if (!isYt) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return YT_ID.test(id) ? id : null;
  }
  const v = url.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;

  const m = url.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/* Start time, so "…?t=90" or "…&start=90" jumps straight to the good bit. */
function youtubeStart(input) {
  try {
    const url = new URL(String(input), location.href);
    const t = url.searchParams.get('t') || url.searchParams.get('start');
    if (!t) return 0;
    const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(\d+)s?$/);
    if (m) return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+m[3]);
    return parseInt(t, 10) || 0;
  } catch { return 0; }
}

/* YouTube generates a thumbnail for every video at a fixed address — no API
   key, no account, nothing to upload.

   The catch: a size a given video doesn't have is answered with a 120x90 grey
   stub and an HTTP 200, so onerror never fires and you get a blank card. The
   only reliable tell is the decoded size, which is what ytThumbFallback below
   checks. sddefault leads because it exists for virtually everything and is
   sharp enough for a card at 2x; the 4:3 sizes letterbox their 16:9 frame, and
   object-fit:cover crops those bars straight back off. */
const YT_SIZES = ['sddefault', 'hqdefault', 'mqdefault'];
const YT_STUB_W = 120;

const ytThumb = (id, step = 0) => `https://i.ytimg.com/vi/${id}/${YT_SIZES[step]}.jpg`;

function ytThumbFallback(img) {
  if (img.naturalWidth > YT_STUB_W) return;          /* a real image — keep it */
  const next = (parseInt(img.dataset.ytStep, 10) || 0) + 1;
  if (next >= YT_SIZES.length) {                     /* nothing left to try */
    img.hidden = true;                               /* reveals the gradient behind */
    return;
  }
  img.dataset.ytStep = next;
  img.src = ytThumb(img.dataset.ytId, next);
}

const ytWatch    = id => `https://www.youtube.com/watch?v=${id}`;

/* Where the ↗ link should go. A stored url with a ?t= carries a start time —
   rebuilding a bare watch?v= would throw that away and open at 0:00, which
   matters for a medley filed against one song inside it. */
function watchUrl(v) {
  const id = youtubeId(v.url);
  if (!id) return v.url;
  const t = youtubeStart(v.url);
  return t ? `${ytWatch(id)}&t=${t}` : ytWatch(id);
}

/* ---------- 2. Watched state ---------------------------------------------

   Stored per browser under one key. A video is identified by its YouTube id
   when it has one, otherwise by its URL — so the same video marked watched
   in the discography also shows as watched wherever else it appears.
-------------------------------------------------------------------------- */

const WATCHED_KEY = 'twice_archive_watched_v1';

function loadWatched() {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]')); }
  catch { return new Set(); }               /* private window, blocked storage */
}
function saveWatched(set) {
  try { localStorage.setItem(WATCHED_KEY, JSON.stringify([...set])); }
  catch { /* nothing to do — the page still works, it just won't remember */ }
}

const watched = loadWatched();

const videoKey  = v => youtubeId(v.url) || String(v.url || '').trim();
const isWatched = v => watched.has(videoKey(v));

function toggleWatched(v) {
  const key = videoKey(v);
  if (!key) return false;
  if (watched.has(key)) watched.delete(key); else watched.add(key);
  saveWatched(watched);
  return watched.has(key);
}

/* Mark (or unmark) a whole list at once — a release's "Mark all watched" —
   and save once rather than per video. */
function setWatchedAll(list, on) {
  for (const v of list) {
    const key = videoKey(v);
    if (!key) continue;
    if (on) watched.add(key); else watched.delete(key);
  }
  saveWatched(watched);
}

/* "Reset watched progress" for one section. Wiping every mark shouldn't
   happen on one stray click, and a browser confirm box would be jarring, so
   the button arms on the first click and clears on the second; left alone it
   disarms itself. listVideos gives the section's videos (only those are
   cleared), onCleared redraws the page. Returns a painter to call whenever
   the watched count changes. */
function resetButton(btn, listVideos, onCleared) {
  let timer = null;
  const paint = () => {
    const seen = listVideos().filter(isWatched).length;
    clearTimeout(timer);
    btn.classList.remove('armed');
    btn.disabled = !seen;
    btn.textContent = seen ? `Reset watched progress · ${seen}` : 'Nothing watched yet';
  };
  btn.addEventListener('click', () => {
    if (!btn.classList.contains('armed')) {
      const seen = listVideos().filter(isWatched).length;
      btn.classList.add('armed');
      btn.textContent = `Clear ${seen} watched mark${seen === 1 ? '' : 's'}? Click again`;
      timer = setTimeout(paint, 4000);
      return;
    }
    setWatchedAll(listVideos(), false);
    onCleared();
  });
  return paint;
}

/* ---------- 3. Small shared helpers --------------------------------------- */

/* Dates may be partial. "2025-07-11" reads "Jul 11, 2025", "2025-07" reads
   "Jul 2025", and a bare "2025" stays "2025" rather than inventing a January 1st. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function prettyDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!y) return '';
  if (!m) return y;
  const month = MONTHS[parseInt(m, 10) - 1] || '';
  if (!d) return `${month} ${y}`;
  return `${month} ${parseInt(d, 10)}, ${y}`;
}

/* Dark text on a pale chip, light text on a deep one, so a chip stays
   readable whatever colour it's given. */
function readableOn(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? '#2a1b22' : '#fff';
}

/* Inline style for a chip in a member's colour. "Dahyun, Chaeyoung" blends
   into a gradient across both; a name that matches nobody ("all members")
   falls back to the group colours. The colours come from the data file, so
   changing one is an edit there rather than here. */
function memberStyle(names, colors, groupColors) {
  const cols = String(names || '').split(',').map(n => (colors || {})[n.trim()]).filter(Boolean);
  if (!cols.length) {
    const g = groupColors;
    return g && g.length > 1
      ? `background:linear-gradient(110deg, ${g.join(', ')});color:${readableOn(g[0])};` : '';
  }
  const bg = cols.length === 1 ? cols[0] : `linear-gradient(110deg, ${cols.join(', ')})`;
  return `background:${bg};color:${readableOn(cols[0])};`;
}

/* A pinned video leads, then every official upload ahead of every fan one, and
   within each of those the kinds in VIDEO_ORDER, so lyric videos read as a
   footnote. Sorting here rather than only in the data means a hand-edited
   entry can't show up out of place. */
const VIDEO_ORDER = { mv: 0, special: 1, dance: 2, 'dance-performance': 2.5, performance: 3,
                      live: 4, other: 5, lyric: 6 };
const orderVideos = list =>
  [...(list || [])].sort((a, b) =>
    (a.pin ? 0 : 1) - (b.pin ? 0 : 1) ||
    (a.official === false ? 1 : 0) - (b.official === false ? 1 : 0) ||
    (VIDEO_ORDER[a.kind] ?? 4) - (VIDEO_ORDER[b.kind] ?? 4));

/* ---------- 4. Video cards ------------------------------------------------

   The thumbnail is a link that opens the video on its own site in a new tab,
   start time included, so the archive stays open where you left it. Nothing
   is embedded, which also keeps a page of a few hundred cards light.
-------------------------------------------------------------------------- */

const KIND_LABEL = {
  mv:          'M/V',
  special:     'Special',
  lyric:       'Lyric Video',
  performance: 'Performance',
  dance:       'Dance Practice',
  'dance-performance': 'Dance Performance',
  live:        'Live',
  vlog:        'Vlog',
  episode:     'Episode',
  audio:       'Audio',
  other:       'Video',
};

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* opts.head is HTML placed at the top of the card's text — the covers page
   puts the song and member there. opts.caption replaces the label line, and
   null hides it. opts.badge false drops the kind badge (M/V, Live…) — on a page
   where every card is a cover it says nothing. opts.id names the card so a
   #hash can scroll to it. */
function videoCard(v, opts = {}) {
  const kind   = KIND_LABEL[v.kind] ? v.kind : 'other';
  const id     = youtubeId(v.url);
  /* A freely watchable copy of the same video, for when the official link is
     region-locked or behind a subscription. It rides on this card instead of
     taking one of its own: same show, so one thumbnail and one watched mark.
     When there is one it becomes what the card opens — the official link is
     the canonical record, but the free copy is the one that actually plays. */
  const altId  = youtubeId(v.alt);
  const freeUrl = v.alt ? watchUrl({ url: v.alt }) : null;
  const mainUrl = freeUrl || watchUrl(v);
  const label  = opts.caption === undefined ? (v.label || KIND_LABEL[kind]) : opts.caption;
  const seen   = isWatched(v);
  const key    = escapeHtml(videoKey(v));

  /* The thumbnail: YouTube's own image, an image the entry supplies, or a
     coloured block with the kind written on it if there's neither. */
  let thumbInner;
  if (id) {
    thumbInner =
      `<span class="fallback">${escapeHtml(KIND_LABEL[kind])}</span>
       <img src="${ytThumb(id)}" alt="" loading="lazy" decoding="async"
            data-yt-id="${id}" data-yt-step="0"
            onload="ytThumbFallback(this)" onerror="ytThumbFallback(this)">`;
  } else if (v.thumb) {
    /* no-referrer: Bilibili's image server refuses requests that say they
       came from another site. */
    thumbInner = `<img src="${escapeHtml(v.thumb)}" alt="" loading="lazy" decoding="async"
                       referrerpolicy="no-referrer">`;
  } else if (altId) {
    /* An official link that isn't on YouTube — Amazon, Weverse, Beyond LIVE —
       has no thumbnail to borrow, and those pages are JS shells with no
       preview image either. The mirror is the same show, so use its. */
    thumbInner =
      `<span class="fallback">${escapeHtml(KIND_LABEL[kind])}</span>
       <img src="${ytThumb(altId)}" alt="" loading="lazy" decoding="async"
            data-yt-id="${altId}" data-yt-step="0"
            onload="ytThumbFallback(this)" onerror="ytThumbFallback(this)">`;
  } else {
    thumbInner = `<span class="fallback">${escapeHtml(KIND_LABEL[kind])}</span>`;
  }

  const official = v.official === false
    ? '<span class="official no" title="Not from an official channel">✦ Fan</span>'
    : '<span class="official yes" title="Official upload">✓ Official</span>';
  /* A fancam is shot from one spot or on one member; official or not is separate
     (M COUNTDOWN's MPD fancams are official). */
  const fancam = v.fancam ? '<span class="official fancam" title="Fancam">◉ Fancam</span>' : '';

  /* A hand-picked highlight: the one to start with when an entry, or a whole
     section, has more than you can sit through. It rides on the thumbnail as a
     sticker rather than in the tag row, so it reads at a glance down a long
     grid. Nothing else keys off it — it doesn't reorder the card. */
  const must = v.mustWatch
    ? '<span class="must">★ Must watch</span>' : '';

  const durTag = v.duration ? `<span class="dur">${escapeHtml(v.duration)}</span>` : '';

  const thumbTag =
    `<a class="vthumb" href="${escapeHtml(mainUrl)}"
        target="_blank" rel="noopener"
        aria-label="Watch ${escapeHtml(label || KIND_LABEL[kind])}${freeUrl ? '' : id ? ' on YouTube' : ' in a new tab'}">
       ${thumbInner}<span class="play">${id ? '▶' : '↗'}</span>${durTag}${must}
     </a>`;

  return `
    <article class="vcard${seen ? ' watched' : ''}${opts.className ? ' ' + opts.className : ''}"
             data-key="${key}"${opts.id ? ` id="${escapeHtml(opts.id)}"` : ''}>
      ${thumbTag}
      <div class="vmeta">
        ${opts.head || ''}
        ${label ? `<span class="vlabel">${escapeHtml(label)}</span>` : ''}
        <div class="vtags">
          ${opts.badge === false ? '' : `<span class="badge" data-kind="${kind}">${escapeHtml(KIND_LABEL[kind])}</span>`}
          ${official}${fancam}
          ${freeUrl
            ? `<a class="ext orig" href="${escapeHtml(watchUrl(v))}"
                  target="_blank" rel="noopener"
                  title="The official release — may be region-locked or need a subscription">Original ↗</a>`
            : `<a class="ext" href="${escapeHtml(watchUrl(v))}"
                  target="_blank" rel="noopener" title="Open in a new tab">↗</a>`}
        </div>
        <button type="button" class="watch-btn${seen ? ' on' : ''}" data-watch="${key}">
          ${seen ? '✓ Watched' : 'Mark watched'}
        </button>
      </div>
    </article>`;
}

/* One delegated listener covers every card on the page, however many get
   rendered or re-rendered by the filters. */
function wireVideoCards(root, onWatchChange) {
  root.addEventListener('click', event => {
    const mark = event.target.closest('[data-watch]');
    if (mark) {
      const key = mark.dataset.watch;
      const now = toggleWatched({ url: key });
      /* The same video can sit on two tracks of one release (a medley, say),
         so update every card for it, not just the one clicked. */
      root.querySelectorAll('[data-watch]').forEach(btn => {
        if (btn.dataset.watch !== key) return;
        btn.classList.toggle('on', now);
        btn.textContent = now ? '✓ Watched' : 'Mark watched';
        btn.closest('.vcard')?.classList.toggle('watched', now);
      });
      onWatchChange?.();
    }
  });
}
