/* ---------------------------------------------------------------------------
   Updates page.

   A stream of short posts, newest first, added as things happen. Posts live
   in one Markdown file per month, updates/<YYYY-MM>.md, and data/updates.json
   lists the months. Every month loads up front so the search and member
   filter cover every post; the newest PAGE_SIZE matching posts are shown
   and "Show older posts" adds more.

   Each post starts with a "## " line giving its date, and optionally a time
   and the members it's about:

     ## 2026-09-21
     ## 2026-09-21 18:00
     ## 2026-09-21 | Nayeon, Dahyun

   and runs until the next one. Without "| names" the members are picked up
   from the names in the post's text (see tagPost). Posts are shown newest first whatever order
   they're in the file, and posts on the same day keep their file order
   (newest at the top of the file, like the page). <!-- comments --> are
   skipped.

   Inside a post, a small slice of Markdown:

     ### Sana for ARENA              a heading (### or ####)
     **bold**, *italic*, [a link](https://…)
     - a list item
     ---                            a divider
     ![what it shows](updates/img/2026-09/sana.webp)
                                    a photo; several image lines in one block
                                    sit side by side as a gallery
     https://www.instagram.com/p/…  a link on a line of its own becomes the
     https://x.com/…/status/…       embedded post (Instagram, X) or a video
     https://youtu.be/…             card (YouTube); any other link on its
                                    own line becomes a link card

   Blocks are separated by a blank line. Anything else is a paragraph.
--------------------------------------------------------------------------- */

/* Unlike the other sections, this changes most days. Rather than bumping ?v=
   for every post, the list and the posts are fetched with no-cache: the
   browser asks the server whether they've changed each time (cheap, and a 304
   when they haven't) and never serves a stale copy. Only a change to this
   script or the CSS still needs a bump. */
const DATA_URL = 'data/updates.json';
const fresh    = url => fetch(url, { cache: 'no-cache' });

const el = id => document.getElementById(id);

/* ---------- dates ---------- */

const WEEKDAYS    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS_LONG = ['January','February','March','April','May','June','July',
                     'August','September','October','November','December'];

/* "2026-09-21" → "Monday, September 21, 2026" */
function longDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/* ---------- Markdown ---------- */

/* Links only go to web addresses or files on this site, never javascript:. */
const safeUrl = u => /^(https?:\/\/|[\w./-]+$)/i.test(u) ? u : '#';

function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/* no-referrer: news sites' image servers (Naver's among them) may refuse a
   photo requested from another site, but serve it when not told where from. */
function image(line) {
  const [, alt, src] = line.match(IMAGE_LINE);
  return `<a class="update-photo" href="${escapeHtml(safeUrl(src))}" target="_blank" rel="noopener">
            <img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"
                 referrerpolicy="no-referrer">
          </a>`;
}

/* Friendlier names for sites a link card points at; any other site shows its
   address. */
const SITE_NAMES = {
  'entertain.naver.com': 'Naver News',
  'n.news.naver.com':    'Naver News',
  'weverse.io':          'Weverse',
  'soompi.com':          'Soompi',
  'allkpop.com':         'allkpop',
  'biaf.or.kr':          'BIAF — official site',
  'bcwoori.com':         'Bucheon Woori News',
};

/* A pasted post link. The inline style on Instagram's blockquote is what its
   script copies onto the frame it swaps in; without it the frame sits at its
   326px minimum. Keep Instagram's own 540px maximum: any narrower and it
   crops the photo's edges to fit. Until the platform's script swaps in the real post (or
   if it never does: deleted post, blocked script) the link itself shows. */
function embed(url) {
  const ig = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/);
  if (ig) {
    const link = `https://www.instagram.com/${ig[1]}/${ig[2]}/`;
    return `<div class="update-embed">
              <blockquote class="instagram-media" data-instgrm-permalink="${link}" data-instgrm-version="14"
                          style="max-width:540px; min-width:326px; width:calc(100% - 2px);">
                <a href="${link}" target="_blank" rel="noopener">View this post on Instagram ↗</a>
              </blockquote>
            </div>`;
  }
  const x = url.match(/(?:x|twitter)\.com\/(\w+)\/status\/(\d+)/);
  if (x) {
    const link = `https://twitter.com/${x[1]}/status/${x[2]}`;
    return `<div class="update-embed">
              <blockquote class="twitter-tweet" data-dnt="true" data-theme="${isDark() ? 'dark' : 'light'}">
                <a href="${link}" target="_blank" rel="noopener">View this post on X ↗</a>
              </blockquote>
            </div>`;
  }
  if (youtubeId(url)) return `<div class="update-video">${videoCard({ url, kind: 'other' }, { caption: null, badge: false })}</div>`;
  /* Anything else (a news article, a Weverse post) can't be embedded, so it
     becomes a card naming the site it's on. */
  const host = new URL(url).hostname.replace(/^(www|m)\./, '');
  return `<a class="update-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">
            <span class="ico" aria-hidden="true">📰</span>
            <span class="txt"><b>${escapeHtml(SITE_NAMES[host] || host)}</b><small>${escapeHtml(host)}</small></span>
            <span class="go" aria-hidden="true">↗</span>
          </a>`;
}

function markdown(src) {
  return src.replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').map(l => l.trim());
    const h = block.match(/^(#{3,4})\s+(.+)$/);
    if (h && lines.length === 1) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    if (block.trim() === '---') return '<hr>';
    if (lines.every(l => /^[-*]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every(l => IMAGE_LINE.test(l))) {
      const cls = lines.length > 1 ? 'update-gallery' : 'update-single';
      return `<div class="${cls}">${lines.map(image).join('')}</div>`;
    }
    if (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0])) return embed(lines[0]);
    return `<p>${inline(block.trim())}</p>`;
  }).join('\n');
}

/* ---------- embeds ---------- */

const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/* Each platform's script is fetched only when a post actually embeds from it,
   so posts without embeds loads nothing from Instagram or X. Once
   loaded, later batches just ask it to process the new blockquotes. */
function loadScript(src, ready) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) { existing.dataset.loaded ? ready() : existing.addEventListener('load', ready); return; }
  const s = document.createElement('script');
  s.src = src; s.async = true;
  s.onload = () => { s.dataset.loaded = '1'; ready(); };
  document.body.appendChild(s);
}

function runEmbeds(root) {
  if (root.querySelector('.instagram-media')) {
    loadScript('https://www.instagram.com/embed.js', () => window.instgrm?.Embeds.process());
  }
  if (root.querySelector('.twitter-tweet')) {
    loadScript('https://platform.twitter.com/widgets.js', () => window.twttr?.widgets?.load(root));
  }
}

/* ---------- posts ---------- */

/* "## 2026-09-22", "## 2026-09-22 18:00", and either with "| Nayeon, Dahyun"
   on the end to set the member tags by hand. */
const POST_HEAD = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*(?:\|\s*(.*?))?\s*$/;

/* Splits a month's file into { date, time, tags, body } posts. */
function parsePosts(src) {
  const posts = [];
  let cur = null;
  for (const line of src.replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '').split('\n')) {
    const m = line.trim().match(POST_HEAD);
    if (m) posts.push(cur = { date: m[1], time: m[2] || '', tags: m[3] ?? null, lines: [] });
    else if (cur) cur.lines.push(line);
  }
  return posts.map(p => ({ date: p.date, time: p.time, tags: p.tags, body: p.lines.join('\n') }));
}

/* Newest first. sort() is stable, so same-day posts without a time keep
   their order from the file. */
const newestFirst = (a, b) =>
  (b.date + (b.time || '').padStart(5, '0')).localeCompare(a.date + (a.time || '').padStart(5, '0'));

/* A post's words, for tagging and search: no link addresses or Markdown marks. */
const plainText = body => body
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^\s*https?:\/\/\S+\s*$/gm, '')
  .replace(/[*#_]/g, ' ');

/* Who a post is about. p.chips is what the card shows: a unit (MISAMO) is one
   chip, and a member named on their own gets their own. p.filter lists every
   member either way, so a MISAMO post turns up under Mina, Sana and Momo. */
function tagPost(p, data) {
  const units = data.units || {};
  const names = [...Object.keys(data.memberColors || {}), ...Object.keys(units)];
  let found;
  if (p.tags != null) {
    const wanted = p.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    found = names.filter(n => wanted.includes(n.toLowerCase()));
  } else {
    const text = plainText(p.body);
    found = names.filter(n => new RegExp(`\\b${n}\\b`, 'i').test(text));
  }
  const unitNames = found.filter(n => units[n]);
  const inUnits   = unitNames.flatMap(n => units[n]);
  const solo      = found.filter(n => !units[n]);
  p.chips  = [...unitNames, ...solo.filter(n => !inUnits.includes(n))];
  p.filter = [...new Set([...solo, ...inUnits])];
  p.search = [longDate(p.date), plainText(p.body), ...found].join(' ').toLowerCase();
}

function memberChip(name, data) {
  const cols = (data.units || {})[name] || [name];
  return `<span class="member" style="${memberStyle(cols.join(', '), data.memberColors)}">${escapeHtml(name)}</span>`;
}

function renderPost(p, data) {
  const when = `${longDate(p.date)}${p.time ? ' · ' + escapeHtml(p.time) : ''}`;
  const art = document.createElement('article');
  art.className = 'update';
  art.innerHTML =
    `<div class="update-top">
       <time class="update-when" datetime="${p.date}${p.time ? 'T' + p.time : ''}">${when}</time>
       ${p.chips.length ? `<span class="update-tags">${p.chips.map(n => memberChip(n, data)).join('')}</span>` : ''}
     </div>
     <div class="update-body">${markdown(p.body)}</div>`;
  return art;
}

/* ---------- the stream ---------- */

const PAGE_SIZE = 15;

const state = { data: null, posts: [], query: '', member: 'all', limit: PAGE_SIZE };

const matches = p =>
  (state.member === 'all' || p.filter.includes(state.member)) &&
  state.query.split(/\s+/).filter(Boolean).every(w => p.search.includes(w));

/* A post's card is built the first time it's shown and then kept, only hidden
   while a filter leaves it out, so an embedded post never reloads as you type.
   Each new card slots in before the next built one, keeping post order. */
function showPosts() {
  const hits  = state.posts.filter(matches);
  const shown = new Set(hits.slice(0, state.limit));
  const built = [];
  state.posts.forEach((p, i) => {
    if (shown.has(p) && !p.el) {
      p.el = renderPost(p, state.data);
      const next = state.posts.slice(i + 1).find(q => q.el)?.el || null;
      el('stream').insertBefore(p.el, next);
      built.push(p.el);
    }
    if (p.el) p.el.hidden = !shown.has(p);
  });
  built.forEach(runEmbeds);

  el('none').hidden = hits.length > 0;
  el('more').hidden = hits.length <= state.limit;
  const n = state.posts.length;
  el('count').innerHTML = state.query || state.member !== 'all'
    ? `<b>${hits.length}</b> of ${n} posts` : `${n} post${n === 1 ? '' : 's'}`;
}

function renderChips() {
  const colors = state.data.memberColors || {};
  const names  = Object.keys(colors).filter(m => state.posts.some(p => p.filter.includes(m)));
  el('members').hidden = !names.length;
  el('members').innerHTML = [
    ['all', 'Everyone', state.posts.length, ''],
    ...names.map(m => [m, m, state.posts.filter(p => p.filter.includes(m)).length, `background:${colors[m]}`]),
  ].map(([value, label, n, style]) =>
    `<button type="button" class="chip${state.member === value ? ' on' : ''}" data-member="${escapeHtml(value)}">${
      style ? `<span class="dot" style="${style}"></span>` : ''}${escapeHtml(label)} <span class="chip-n">${n}</span></button>`
  ).join('');
}

function wireFilters() {
  el('search').addEventListener('input', e => {
    state.query = e.target.value.trim().toLowerCase();
    state.limit = PAGE_SIZE;
    showPosts();
  });
  el('members').addEventListener('click', e => {
    const chip = e.target.closest('[data-member]');
    if (!chip) return;
    state.member = chip.dataset.member;
    state.limit = PAGE_SIZE;
    renderChips();
    showPosts();
  });
  el('more').addEventListener('click', () => {
    state.limit += PAGE_SIZE;
    showPosts();
  });
}

async function loadMonth(month) {
  try {
    const res = await fresh(`updates/${month}.md`);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return parsePosts(await res.text());
  } catch (err) {
    console.warn(`Couldn't load updates/${month}.md — ${err.message}`);
    return [];
  }
}

async function init() {
  try {
    const res = await fresh(DATA_URL);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    state.data = await res.json();
  } catch (err) {
    el('stream').innerHTML =
      `<p class="empty-state">Couldn't load ${DATA_URL} — ${escapeHtml(err.message)}.<br>
       If you opened this file directly, serve the folder over http instead
       (<code>python3 -m http.server</code>); fetch() is blocked on file://.</p>`;
    return;
  }

  /* A month's text is small, so all of it loads up front and search covers
     the whole archive. Only the cards on screen get built, which is what
     keeps the embeds from piling up. */
  const months = [...new Set(state.data.months || [])].sort().reverse();
  state.posts = (await Promise.all(months.map(loadMonth))).flat().sort(newestFirst);
  state.posts.forEach(p => tagPost(p, state.data));

  wireVideoCards(el('stream'), () => {});
  wireFilters();
  renderChips();
  showPosts();
}

init();
