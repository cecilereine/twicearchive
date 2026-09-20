# TWICE Content Archive

A fan-made archive that gathers links to TWICE videos and audio, sorted by era and
category. Nothing is hosted here — every entry points at its original source.

Plain HTML, CSS and JavaScript with JSON data files. No build step, no dependencies,
no API keys. Drop it on GitHub Pages and it runs.

```
index.html            hub — one card per section
discography.html      Korean discography
data/
  discography-kr.json all the release/track/video data
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

Open `data/discography-kr.json`, find the track, and add an entry to its `videos` array:

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
| `other` | Video |

**`official`** — `true` shows a green ✓ Official, `false` shows an amber ✦ Fan.
Leave it out and it's treated as official.

**`label`** — optional; overrides the badge text as the card's caption, e.g.
`"Choreography Video (Moving Ver.)"`.

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

## Adding cover art

YouTube thumbnails come for free, but album covers don't. Drop an image in
`assets/img/covers/` and name it in the release's `cover` field:

```json
"cover": "assets/img/covers/feel-special.jpg"
```

Without one you get a coloured tile with the release's initials, which is a
perfectly fine placeholder.

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
- Release and track data came from Wikipedia; the video links in the initial commit
  were checked against the JYP Entertainment YouTube channel.
