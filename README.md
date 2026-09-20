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
A `?t=90` on the end makes the player start there. Anything that isn't YouTube
(Naver, Weverse, a Drive file) still works — it becomes a link-out card instead of
an embed, and you can give it a `"thumb": "assets/img/whatever.jpg"`.

**`kind`** — sets the coloured badge. One of:

| `kind` | badge |
|---|---|
| `mv` | M/V |
| `lyric` | Lyric Video |
| `performance` | Performance |
| `dance` | Dance Practice |
| `live` | Live |
| `audio` | Audio |
| `other` | Video |

**`official`** — `true` shows a green ✓ Official, `false` shows an amber ✦ Fan.
Leave it out and it's treated as official.

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
**EP**, **Full Album**, **Single** or **Reissue**. `seq` is the free-text line
underneath it ("1st Mini Album", "Repackage"). Reissues list only their *new*
tracks, with a `note` saying what they're a reissue of.

To find links fast: turn on the **Needs links** filter, open a release, and every
song without a video shows a *Search YouTube ↗* link that runs the search for you.

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

## Adding a new section

Copy `discography.html` and its data file, point `DATA_URL` in a new JS file at the
new JSON, and add a card to `index.html`. `assets/js/core.js` already gives you the
video cards and watched marks.

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
- Video and audio links were checked by YouTube channel. Anything on
  "TWICE - Topic" is a label-uploaded Art Track; several convincing-looking
  "Official MV" uploads turned out to be fan reuploads and were left out.
