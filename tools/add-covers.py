#!/usr/bin/env python3
"""File cover videos into data/covers.json from pasted YouTube links.

    python3 tools/add-covers.py < links.txt
    python3 tools/add-covers.py --dry-run < links.txt

Paste bare links, one per line. For each one the tool asks YouTube for the
video's real title, channel and publish date, and works the rest out:

  * the song and its original artist  — from the quoted part of the title,
                                         "Snowman (Sia)"
  * the members                        — member names found in the title
                                         ("Cover by DAHYUN and CHAEYOUNG")
  * the series                         — "Melody Project" or "Performance
                                         Project" in the title, else an
                                         ordinary cover
  * what kind of video                 — "Behind" → behind the scenes,
                                         "Live" → live clip, else the cover
                                         itself; teasers are left out
  * whether it is official             — from the channel, never the title
  * the date                           — the day YouTube says it was published

Links to the same song by the same members land on one entry, so the cover,
its behind-the-scenes and a live clip pasted together become one card with
three videos.

A line that isn't a link is a heading for the links beneath it, and it wins
over whatever the title says. Use one whenever the title doesn't carry the
song — the 2016 videos are just "TWICE(트와이스) MINA MELODY PROJECT" — as

    Good Person (Toy) — Mina
    https://www.youtube.com/watch?v=...

The " — Member" part is optional, and so is the "(Artist)".
"""
import importlib.util
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data", "covers.json")

# The link tool already knows how to read a video and which channels are
# official; borrow that rather than keep two lists.
_spec = importlib.util.spec_from_file_location("add_links", os.path.join(HERE, "add-links.py"))
_links = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_links)
lookup, video_id, is_official, norm = _links.lookup, _links.video_id, _links.is_official, _links.norm

# Either curly quote can open or close: titles have been typed with the pair
# the wrong way round ("…“).
QUOTED = re.compile(r"[“”\"「『](.+?)[“”\"」』]")
FEAT   = re.compile(r"\((?:feat|ft)\.?\s*([^)]+)\)", re.I)
SLUG   = lambda s: re.sub(r"-+", "-", re.sub(r"[^a-z0-9가-힣]+", "-", s.lower())).strip("-")


def published(vid):
    """The day YouTube lists the video as published — it isn't in oEmbed, so
       read it off the watch page. Returns "" if it can't be found."""
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}",
                                 headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode("utf-8", "replace")
    except Exception:
        return ""
    m = (re.search(r'"publishDate":"(\d{4}-\d{2}-\d{2})', html)
         or re.search(r'itemprop="datePublished" content="(\d{4}-\d{2}-\d{2})', html)
         or re.search(r'"uploadDate":"(\d{4}-\d{2}-\d{2})', html))
    return m.group(1) if m else ""


def split_song(text):
    """'Snowman (Sia)' → ('Snowman', 'Sia'); a trailing bracket is the original
       artist, anything else is left on the song."""
    m = re.fullmatch(r"(.+?)\s*\(([^()]+)\)", text.strip())
    return (m.group(1).strip(), m.group(2).strip()) if m else (text.strip(), "")


def parse_title(title, members):
    """What the title says about the song, the artist, the members and the
       kind of video. Members are matched by name against the data file's list
       (outside the quoted song), in that list's order."""
    q = QUOTED.search(title)
    song, artist = split_song(q.group(1)) if q else ("", "")
    rest = QUOTED.sub(" ", title)
    who = [m for m in members if re.search(rf"\b{re.escape(m)}\b", rest, re.I)]
    feat = FEAT.search(title)
    series = ("melody-project" if re.search(r"melody\s*project", title, re.I)
              else "performance-project" if re.search(r"performance\s*project", title, re.I)
              else "cover")
    low = title.lower()
    if "teaser" in low:
        kind, label = None, "teaser"
    elif "behind" in low or "making" in low or "메이킹" in low or "비하인드" in low:
        kind, label = "special", "Behind the Scenes"
    elif "lyric" in low:
        kind, label = "lyric", "Lyric Video"
    elif re.search(r"\blive\b", low):
        kind, label = "live", "Live Clip"
    else:
        kind, label = "mv", "Cover"
    return dict(song=song, artist=artist, members=who, series=series, kind=kind,
                label=label, feat=feat.group(1).strip() if feat else "")


def parse_heading(text, members):
    """'Good Person (Toy) — Mina, Dahyun' → song, artist, [members]. The member
       part only counts if every name in it is a member."""
    song_part, who = text, []
    m = re.match(r"(.+?)\s+[—–-]\s+(.+)$", text)
    if m:
        names = [n.strip() for n in re.split(r",|&|\band\b", m.group(2)) if n.strip()]
        canon = [next((x for x in members if x.lower() == n.lower()), None) for n in names]
        if names and all(canon):
            song_part, who = m.group(1), canon
    song, artist = split_song(song_part)
    return song, artist, who


def main():
    dry = "--dry-run" in sys.argv
    data = json.load(open(DATA))
    members = list((data.get("memberColors") or {}).keys())

    # Links, each with the heading above it (if any).
    urls, heading = [], None
    for ln in sys.stdin:
        ln = ln.split("#")[0].strip()
        if not ln:
            continue
        if "youtu" in ln and video_id(ln):
            urls.append((ln, heading))
        else:
            heading = ln.rstrip(":").strip()
    if not urls:
        sys.exit("no links found on stdin\n" + __doc__)

    have = {video_id(v["url"]) for c in data["covers"] for v in c.get("videos", [])}
    added, skipped = [], []

    for url, head in urls:
        vid = video_id(url)
        if vid in have:
            skipped.append((url, "already filed"))
            continue
        try:
            title, channel, handle, _ = lookup(vid)
        except Exception as e:
            skipped.append((url, f"couldn't read it ({e})"))
            continue
        info = parse_title(title, members)
        if info["kind"] is None:
            skipped.append((url, "teaser — not filed"))
            continue
        if head:
            song, artist, who = parse_heading(head, members)
            info["song"] = song or info["song"]
            info["artist"] = artist or info["artist"]
            info["members"] = who or info["members"]
        if not info["song"]:
            skipped.append((url, f"no song in the title — add a heading above it: {title!r}"))
            continue
        official = is_official(channel, handle)
        who = ", ".join(info["members"])

        # One entry per song + members; more links to it become more videos.
        entry = next((c for c in data["covers"]
                      if norm(c["song"]) == norm(info["song"]) and norm(c.get("members", "")) == norm(who)), None)
        status = "add"
        if entry is None:
            date = published(vid)
            base = SLUG(info["song"]) + ("-" + SLUG(who.split(",")[0]) if who else "")
            eid, n = base, 2
            while any(c["id"] == eid for c in data["covers"]):
                eid, n = f"{base}-{n}", n + 1
            entry = {"id": eid, "song": info["song"], "originalArtist": info["artist"],
                     "members": who, "series": info["series"], "released": date,
                     "note": f"Feat. {info['feat']}" if info["feat"] else "", "videos": []}
            at = next((i for i, c in enumerate(data["covers"]) if (c.get("released") or "") > date),
                      len(data["covers"]))
            data["covers"].insert(at, entry)
            status = "NEW"
        entry["videos"].append({"kind": info["kind"], "url": vid, "label": info["label"],
                                "official": official})
        have.add(vid)
        added.append((status, official, info["kind"], entry["song"], entry["originalArtist"],
                      who or "?", entry["released"] or "????-??-??", channel))

    for st, off, kind, song, artist, who, date, ch in added:
        what = f"{song} ({artist})" if artist else song
        print(f"  {st:<3} {'OFFICIAL' if off else 'fan     '}  {kind:<8} {what[:34]:<34} {who[:20]:<20} {date}  {ch[:22]}")
    for url, why in skipped:
        print(f"  --  {url}  →  {why}")
    if not added:
        print("\n  nothing to add")
        return
    if dry:
        print(f"\n  dry run — {len(added)} would be added, nothing written")
        return
    with open(DATA, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\n  wrote {len(added)} to {os.path.relpath(DATA)}")


if __name__ == "__main__":
    main()
