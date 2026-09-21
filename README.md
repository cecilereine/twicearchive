# TWICE Content Archive

A fan-made archive that gathers links to TWICE videos and audio, sorted by era and
category. Nothing is hosted here — every entry points at its original source.

Plain HTML, CSS and JavaScript with JSON data files. No build step, no dependencies,
no API keys. Drop it on GitHub Pages and it runs.

```
index.html            hub — one card per section
discography.html      discography (Korean releases for now)
data/
  discography.json    all the release/track/video data
assets/css/style.css  shared styles (light + dark)
assets/js/core.js     YouTube links, video cards, watched state
assets/js/discography.js
assets/img/covers/    album art goes here (optional)
```

## Running it locally

`fetch()` can't read the JSON off `file://`, so serve the folder:

```bash
python3 -m http.server 8790
```

Then open <http://localhost:8790>.

## Adding a video link

Open `data/discography.json`, find the track, and add an entry to its `videos` array:

```json
{ "title": "Rainbow", "videos": [
  { "kind": "lyric", "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX", "official": true }
] }
```

**`url`** — paste whatever YouTube gives you. All of these work:
`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, or the bare `ID`.
A `?t=90` on the end opens the video at that point. Every card opens its video in a
new tab. Anything that isn't YouTube (Vimeo, Bilibili, Naver, a Drive file) works
too — give it a `"thumb"` image, or it shows a coloured placeholder.

**`kind`** — sets the coloured badge. One of:

| `kind` | badge |
|---|---|
| `mv` | M/V |
| `lyric` | Lyric Video |
| `performance` | Performance |
| `dance` | Dance Practice |
| `dance-performance` | Dance Performance (relay dances, STUDIO CHOOM) |
| `live` | Live |
| `audio` | Audio |
| `other` | Video |

**`official`** — `true` shows a green ✓ Official, `false` shows an amber ✦ Fan.
Leave it out and it's treated as official.

**`fancam`** — optional; `true` adds a ◉ Fancam tag. Independent of `official`:
M COUNTDOWN's MPD fancams are official fancams.

**`label`** — optional; overrides the badge text as the card's caption, e.g.
`"Choreography Video (Moving Ver.)"`.

## Track fields

```json
{ "title": "Meeeeee", "artist": "Nayeon", "note": "Korean ver.",
  "titleKo": "우아하게", "titleTrack": true, "videos": [] }
```

`artist` is for solo, sub-unit and featured credits — it shows as a pill beside the
track title and is searchable, so typing "Tzuyu" or "Megan" finds those tracks.
`titleTrack` adds the TITLE flag. `note` adds a small grey aside ("English ver.",
"Pre-release single").

## Release fields

`type` drives the coloured label under the title on each card. Use one of
**EP**, **Full Album**, **Single**, **Reissue** or **Compilation** (the #TWICE best albums). `seq` is the free-text line
underneath it ("1st Mini Album", "Repackage"). Reissues list only their *new*
tracks, with a `note` saying what they're a reissue of.

To find links fast: turn on the **Needs links** filter, open a release, and every
song without a video shows a *Search YouTube ↗* link that runs the search for you.

## Adding links without labelling them

You don't have to write any of the fields out by hand. Paste bare YouTube URLs,
one per line, and let the tool work it out:

```bash
python3 tools/add-links.py auto < links.txt
```

For each link it asks YouTube for the video's real title and channel, then fills
in the rest itself:

| field | how it's decided |
|---|---|
| which release and track | the track name found in the video title, longest match wins |
| `kind` | keywords in the title — "Comeback Stage", "Dance Practice", "Lyrics"… |
| `official` | **the channel**, never the title |
| `label` | the video title, tidied up |
| `noEmbed` | set when the uploader has disabled embedding (informational) |
| `fancam` | set when the title says fancam or 직캠 |

Lines that aren't links are treated as headings and ignored, so you can paste a
song name above each group. Pass a release id instead of `auto` to confine it to
one release, and `--dry-run` to see what it would do without writing.

It refuses to guess: anything it can't match to a track, or that's already
filed, is listed at the end and left alone.

Two things it gets right that are easy to get wrong by hand. A channel called
"TWICE World" is *not* official, and fan reuploads regularly title themselves
"Official MV" — so official status comes from the channel only. And a few
uploads (SBS Inkigayo stages, for instance) have embedding disabled; oEmbed
won't describe those, so the tool reads the watch page instead and flags them
`noEmbed`.

## Adding streaming links

Each release has a `links` object. Fill in whichever you have — the rest render
greyed out so the gaps stay visible:

```json
"links": {
  "spotify": "https://open.spotify.com/album/...",
  "appleMusic": "https://music.apple.com/.../...",
  "youtubeMusic": "",
  "melon": ""
}
```

## Cover art

YouTube thumbnails come for free, but album covers don't. Drop an image in
`assets/img/covers/` and name it in the release's `cover` field:

```json
"cover": "assets/img/covers/feel-special.jpg"
```

Without one you get a coloured tile with the release's initials, which is a
perfectly fine placeholder.

Covers are shown in a **square** tile (`aspect-ratio: 1/1`, `object-fit: cover`),
so standard square album art fits with no cropping. Anything non-square is
centre-cropped to a square rather than squashed.

Export at **600x600** — the grid tile is roughly 170-250 CSS pixels, so that is
still comfortably sharp on a retina screen. Bigger just costs load time; the
originals in this repo were resized from 1000px and 3000px masters, which took
the set from 38.5 MB to 3.1 MB. To resize a new one in place:

```bash
sips -Z 600 -s format jpeg -s formatOptions 82 assets/img/covers/new-cover.jpg
```

## Dates

`released` may be partial. `2025-07-11` renders as "Jul 11, 2025", `2025-07` as
"Jul 2025", and a bare `2025` as "2025" — used for a few collaboration singles
whose exact day isn't documented. Releases are grouped by the year, and a partial
date sorts to the end of its year.

## Categories

Korean, Japanese and solo releases all live in **one file**, `data/discography.json`,
and share one page. Every release carries a `category`:

| `category` | meaning |
|---|---|
| `korean` | Twice's Korean releases |
| `japanese` | Twice's Japanese releases |
| `solo` | member solo releases and sub-units |

The releases sort by date and group by year regardless of category, so a Japanese
single slots in beside the Korean releases from the same year.

The filter chips at the top of the page switch between them, with a count on each.
Picking a category also narrows the year chips to the years that category actually
has, and resets the year if the current one disappears.

Sub-units sit under `solo` — the label reads "Solo & Units" — so MISAMO is filed
there rather than under `japanese`, even though its releases are Japanese.

To add releases, copy a block from `data/release-template.json`, which documents
every field and has worked examples for a Japanese album and a solo release.

## Adding a new section

Copy `discography.html` and its data file, point `DATA_URL` in a new JS file at the
new JSON, and add a card to `index.html`. `assets/js/core.js` already gives you the
video cards and watched marks.

New pages need three things for the light/dark toggle: the one-line theme script right after the
stylesheet in `<head>`, the `#themeToggle` button at the end of `.site-nav`, and
`assets/js/theme.js` before `</body>` — copy them from `donate.html`. Until a visitor picks, the
site follows their device's setting.

Set `data-accent` on `<html>` to re-tint the page — `discography` (pink),
`shows` (purple) or `live` (mint).

## Notes

- **Watched marks** live in `localStorage` under `twice_archive_watched_v1`. They're
  per-browser, never leave the device, and clearing site data resets them. A video is
  keyed by its YouTube id, so marking it watched in one section marks it everywhere.
- **Embeds are lazy.** Cards show YouTube's own thumbnail and only build the real
  player iframe when you press play — otherwise a page with a few hundred videos
  would pull tens of megabytes of player code before you watched anything. Players
  use `youtube-nocookie.com`, so YouTube sets no tracking cookies until you play.
- **Cache busting.** GitHub Pages caches for ten minutes. Whenever you change the CSS
  or JS, bump every `?v=` in `index.html` and `discography.html` to the same new
  number, or a browser can pair new HTML with a stale script.
- Singles and collaborations are separate releases, one per entry, so each lands
  in its own year rather than being lumped together.
- Tracklists were taken from each release's own Wikipedia article, not the
  "songs recorded by Twice" list — that list covers group songs only and silently
  drops member solos and sub-unit tracks.
- Video and audio links are checked **by YouTube channel**, not by title. Fan
  reuploads routinely outrank the real thing and title themselves "Official MV".
  The trusted channels are `JYP Entertainment`, `TWICE`, `TWICE JAPAN OFFICIAL`,
  `TWICE - Topic` / `MISAMO - Topic` (the label's Art Tracks), Netflix's own
  channels for the KPop Demon Hunters material, and broadcaster channels such as
  `Mnet K-POP` for music-show stages — those are official uploads by the
  rights-holding network, just not by JYP. To re-check every link in the data at once, open youtube.com and run
  each id through `/oembed?format=json&url=...`, which returns `author_name`.
  That check has already caught two bad links that looked official.
- Some songs never got a music video. Cry for Me, for instance, has official
  audio, two choreography videos and a televised performance, but no M/V — so
  the archive files what exists rather than inventing an `mv` entry.
