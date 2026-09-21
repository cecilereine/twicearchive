/* ---------------------------------------------------------------------------
   TWICE Content Archive — shared helpers.

   Three things live here because every section page needs them:
     1. YouTube link handling  — turn whatever you pasted into a video id.
     2. Video cards            — a thumbnail that becomes a player when clicked.
     3. Watched state          — remembered in this browser via localStorage.
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

/* ---------- 3. Video cards ------------------------------------------------

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
  audio:       'Audio',
  other:       'Video',
};

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function videoCard(v) {
  const kind   = KIND_LABEL[v.kind] ? v.kind : 'other';
  const id     = youtubeId(v.url);
  const label  = v.label || KIND_LABEL[kind];
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
  } else {
    thumbInner = `<span class="fallback">${escapeHtml(KIND_LABEL[kind])}</span>`;
  }

  const official = v.official === false
    ? '<span class="official no" title="Not from an official channel">✦ Fan</span>'
    : '<span class="official yes" title="Official upload">✓ Official</span>';
  /* A fancam is shot from one spot or on one member; official or not is separate
     (M COUNTDOWN's MPD fancams are official). */
  const fancam = v.fancam ? '<span class="official fancam" title="Fancam">◉ Fancam</span>' : '';

  const durTag = v.duration ? `<span class="dur">${escapeHtml(v.duration)}</span>` : '';

  const thumbTag =
    `<a class="vthumb" href="${escapeHtml(watchUrl(v))}"
        target="_blank" rel="noopener"
        aria-label="Open ${escapeHtml(label)} ${id ? 'on YouTube' : 'in a new tab'}">
       ${thumbInner}<span class="play">${id ? '▶' : '↗'}</span>${durTag}
     </a>`;

  return `
    <article class="vcard${seen ? ' watched' : ''}" data-key="${key}">
      ${thumbTag}
      <div class="vmeta">
        <span class="vlabel">${escapeHtml(label)}</span>
        <div class="vtags">
          <span class="badge" data-kind="${kind}">${escapeHtml(KIND_LABEL[kind])}</span>
          ${official}${fancam}
          <a class="ext" href="${escapeHtml(watchUrl(v))}"
             target="_blank" rel="noopener" title="Open in a new tab">↗</a>
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
