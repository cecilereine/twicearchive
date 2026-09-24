#!/usr/bin/env python3
"""Add YouTube links to a release by pasting bare URLs — no labelling needed.

    python3 tools/add-links.py <album-id> < links.txt
    python3 tools/add-links.py <album-id> URL URL URL
    python3 tools/add-links.py <album-id> --dry-run < links.txt

For each URL it asks YouTube's oEmbed endpoint for the video's real title and
channel, then works out on its own:

  * which track it belongs to  — by finding the track name in the video title
  * what kind of video it is   — mv / lyric / dance / dance-performance /
                                 performance / live / audio
  * whether it is official     — from the channel, never from the title, because
                                 fan reuploads routinely call themselves
                                 "Official MV" and channels like "TWICE World"
                                 are not official despite the name
  * a caption                  — tidied from the video title

Anything it cannot place is listed at the end and left alone, so a typo or an
unrelated video never quietly lands on the wrong track.
"""

import json, re, sys, os, urllib.parse, urllib.request

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "discography.json")

# Uploads from these channels are official:
#   - the label and the group (JYP, TWICE, TWICE JAPAN, "- Topic" channels)
#   - broadcasters and outlets whose shows the stages come from: Mnet/M2, KBS
#     (incl. Cool FM), SBS, MBC (incl. MBC WORLD and it's Live), JTBC, tvN,
#     KOCOWA (the three networks' streaming service), Genius (Open Mic),
#     Billboard, MTV, The Tonight Show, Prime Video (Amazon Music Live), IU's
#     own channel (IU's Palette), dingo japan (MOVE REC.) and dingo music
#     (Korea, @DingoMusic — the Killing Voice studio sessions), MUSIC AWARDS JAPAN
#     and Cinema Today (film studios' promos)
#   - CJ ENM's STUDIO CHOOM and STONE MUSIC, YG PLUS's SEOUL MUSIC, KT's GENIE
#     MUSIC, MOSTCONTENTS, VLENDING and YAMYAM Entertainment, which put out OSTs
#   - Netflix and Sony Pictures Animation for KPop Demon Hunters
#   - a member's own channel (Nayeon's IM NAYEON, @IM_NAYEON_0922)
#   - the other artist's own channel on a collaboration (League of Legends for
#     K/DA, Kobukuro, Coco & Clair Clair, Coldplay, Saweetie, Corbyn Besson, RedOne,
#     FANDOM)
#   - any VEVO channel: VEVO only hosts labels' own uploads (Disney's Beyond)
# Everything else is treated as fan-made.
OFFICIAL = re.compile(r"""^(
    JYP\ Entertainment | TWICE | TWICE\ JAPAN\ OFFICIAL\ YouTube\ Channel | IM\ NAYEON |
    .*\ -\ Topic | Mnet\ K-POP | KBS\ Kpop | KBS\ WORLD\ TV | KBS\ CoolFM | SBS\ KPOP |
    SBSKPOP.* | SBS\ Entertainment | MBCentertainment | KBS\ StarTV.* |
    MBCkpop | MBC\ every1 | MBC\ WORLD | Mwave | M2 | 1theK.* | Netflix.* | Sony\ Pictures.* | 이지금.* |
    Still\ Watching\ Netflix | Arirang\ K-Pop | 東宝MOVIEチャンネル | TOHO.*|
    JTBC\ Entertainment | JTBC.* | tvN\ D.* | Golden\ Disc | MAMA\ AWARDS | Melon\ Music\ Awards | The\ Fact\ Music\ Awards |
    SBS\ Awards | KBS\ Song\ Festival | MBC\ Music\ Festival | STUDIO\ CHOOM.* |
    it's\ Live | dingo\ japan | 딩고\ 뮤직\ /\ dingo\ music | MUSIC\ AWARDS\ JAPAN.* |
    League\ of\ Legends | コブクロ\ 公式チャンネル | Genius | STONE\ MUSIC |
    coco\ &\ clair\ clair | Coldplay | Official\ Saweetie | Corbyn\ Besson | RedOne | FANDOM | .*VEVO | 모스트콘텐츠.* | シネマトゥデイ | VLENDING.* |
    KOCOWA\ TV | SEOUL\ MUSIC.* | SBS\ Catch | MTV | GENIE\ MUSIC | .*YAMYAM\ ENTERTAINMENT |
    Billboard | The\ Tonight\ Show.* | Prime\ Video.*
)$""", re.I | re.X)

RULES = [
    ("audio",       r"official audio"),
    # Dingo's studio sessions — they really are singing, so these file as
    # performances rather than the "special" bucket that holds making-ofs.
    ("performance", r"killing ?voice|킬링\s*보이스"),
    # "M/V Reaction" is the members watching the video, not the video itself
    ("special",     r"reaction"),
    ("mv",        r"\bM/V\b|Music Video|\bMV\b"),
    # a live performance at an anniversary event is still a live performance
    ("live",        r"special live"),
    ("special",     r"anniversary|\bspecial video\b|document video|기념|주년|cheering guide|응원법"
                    r"|fan ?chant|掛け声"
                    r"|selfie (?:movie|mv)|behind the scenes|recording (?:video|film)|レコーディング|메이킹"
                    r"|happy holidays"),
    ("lyric",       r"lyric"),
    ("dance-performance", r"relay ?dance|릴레이 ?댄스|be original|studio choom original|frame dance"),
    ("dance",       r"dance (practice|video)|choreography|dance ver"),
    ("performance", r"comeback stage|music bank|show champion|inkigayo|music ?core"
                    r"|m ?countdown|show! ?music|special stage|debut stage|kpop tv show"
                    r"|meet ?& ?greet|performs|stage ?mix|교차편집|뮤직뱅크|음악중심|쇼챔"
                    r"|golden ?disc|골든디스크|mama|awards|가요대전|가요대축제|시상식"
                    r"|song festival|music festival|late show|tonight show|kimmel"
                    r"|good morning america|\bgma\d?\b|time ?100|ellen degeneres"
                    r"|ellen show|open mic|music day|music station|\bmtv\b|performance video"
                    r"|today ?show"
                    r"|엠카운트다운|\b(?:MBC|KBS|SBS|Mnet) ?\d{6} ?방송"),
    ("live",        r"live|fancam|concert|tour|encore|fanmeet|showcase|begins"
                    r"|stadium|dome|직캠|@ |^\d{6}\b"
                    r"|twiceland|twicelights|fantasy park|ready to be|이지리스닝|fan ?meeting"),
]

norm = lambda s: re.sub(r"[^a-z0-9가-힣]", "", (s or "").lower())

# Lyric videos always sort to the end of a track's list.
VIDEO_ORDER = {"mv": 0, "special": 1, "dance": 2, "dance-performance": 2.5,
               "performance": 3, "live": 4, "other": 5, "lyric": 6}


def start_at(url):
    """A ?t= on a link means "the good bit starts here" — keep it, the page
       reads it back off the stored URL when it opens the video."""
    m = re.search(r"[?&](?:t|start)=(\d+)", url or "")
    return int(m.group(1)) if m else 0


def video_id(url):
    url = url.strip()
    if re.fullmatch(r"[\w-]{11}", url):
        return url
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/embed/|/live/)([\w-]{11})", url)
    return m.group(1) if m else None


def lookup(vid):
    """Title and channel straight from YouTube, so nothing is guessed.

    Returns (title, channel, handle, embeddable). oEmbed answers 401 when the uploader
    has turned embedding off — the video is fine, it just cannot play inside the
    page — so fall back to reading the watch page and flag it, rather than
    dropping a perfectly good link."""
    api = ("https://www.youtube.com/oembed?format=json&url="
           + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}", safe=""))
    try:
        with urllib.request.urlopen(api, timeout=15) as r:
            d = json.load(r)
        return d["title"], d["author_name"], handle(d.get("author_url")), True
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403):
            raise
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}",
                                 headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        html = r.read().decode("utf-8", "replace")
    title = re.search(r'<meta name="title" content="([^"]{1,200})"', html)
    chan = re.search(r'"ownerChannelName":"((?:[^"\\]|\\.){1,100})"', html)
    base = re.search(r'"canonicalBaseUrl":"(/@[^"]+)"', html)
    if not title:
        raise RuntimeError("embedding disabled and title not found")
    unescape = lambda x: x.encode().decode("unicode_escape") if "\\u" in x else x
    return (unescape(title.group(1)), unescape(chan.group(1)) if chan else "",
            handle(base.group(1) if base else None), False)


def handle(url):
    m = re.search(r"/(@[^/?]+)", url or "")
    return m.group(1) if m else ""


# A fan channel can give itself one of these names too (@twice2379 calls itself
# "TWICE"), so for them the handle decides rather than the name.
OFFICIAL_HANDLE = {"twice": "@twice", "im nayeon": "@im_nayeon_0922",
                   "딩고 뮤직 / dingo music": "@dingomusic"}


def is_official(channel, handle):
    want = OFFICIAL_HANDLE.get(channel.strip().lower())
    if want:
        return handle.lower() == want
    return bool(OFFICIAL.match(channel))


def classify(title, channel, handle=""):
    official = is_official(channel, handle)
    if channel.endswith(" - Topic"):
        kind = "audio"
    else:
        kind = next((k for k, pat in RULES if re.search(pat, title, re.I)), None)
        if kind is None:
            kind = "live" if official else "other"
    return kind, official


def caption(title, kind, channel=""):
    """A short caption. Strips the group name, then tidies up what that leaves
       behind — an empty "()" where "(트와이스)" used to be, stray quote marks
       and the ♪ that music shows put on the end."""
    t = re.sub(r"^\s*(?:\bTWICE\b\s*\((?:트와이스|トゥワイス)\)|트와이스\s*\(TWICE\)"
               r"|\bTWICE\b\s*트와이스|\bTWICE\b|트와이스|\bMISAMO\b\s*\(미사모\)|\bMISAMO\b)\s*",
               "", title, flags=re.I)
    t = re.sub(r"[\"\u201c\u201d'\u2018\u2019\u2032]", "", t)
    t = re.sub(r"\(\s*\)|\[\s*\]", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -\u2013\u2014|\u00b7,\u266a")
    t = re.sub(r"^[-\u2013\u2014|\u00b7,\s]+", "", t)
    # lyric channels often sign the title: "… Lyrics [Color Coded] | ShadowByYoongi"
    if channel and t.lower().endswith("| " + channel.lower()):
        t = t[: -len(channel) - 2].rstrip(" |")
    return t[:70] or {"mv": "M/V", "lyric": "Lyric Video", "dance": "Dance Practice",
                      "dance-performance": "Dance Performance",
                      "performance": "Performance", "live": "Live",
                      "audio": "Official Audio"}.get(kind, "Video")


JP_VER = re.compile(r"japanese\s*ver|-japanese|日本語", re.I)


def match_track(album, title):
    """Longest track name occurring in the video title wins, so 'The Feels'
       never beats a longer title that contains it."""
    n = norm(title)
    jp = bool(JP_VER.search(title))
    best, best_len = None, -1
    for t in album["tracks"]:
        for cand in (t["title"], t.get("titleKo")):
            k = norm(cand)
            if not k or k not in n:
                continue
            # A "-Japanese ver.-" upload belongs on the Japanese-version track
            # where a release carries both, and vice versa.
            note_jp = bool(JP_VER.search(t.get("note") or ""))
            score = len(k) * 2 + (1 if note_jp == jp else 0)
            if score > best_len:
                best, best_len = t, score
    return best


def best_album(data, title):
    """With id 'auto', pick the release whose track name matches most of the
       video title. A song on several releases lands on the earliest one."""
    best = (None, None, 0)
    for a in data["albums"]:
        t = match_track(a, title)
        if t is None:
            continue
        n = max(len(norm(t["title"])), len(norm(t.get("titleKo") or "")))
        if n > best[2]:
            best = (a, t, n)
    return best[0], best[1]


def main():
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry = "--dry-run" in sys.argv
    if not args:
        sys.exit(__doc__)
    album_id, urls = args[0], [(u, None) for u in args[1:]]
    if not urls:
        # A line that isn't a link is a heading ("TT", "girls like us"). It
        # applies to the links beneath it, and is used to place them — see
        # below — rather than thrown away.
        urls, heading = [], None
        for ln in sys.stdin:
            ln = ln.split("#")[0].strip()
            if not ln:
                continue
            # Only a real YouTube address counts as a link here: an 11-letter
            # heading ("Marshmallow") is otherwise indistinguishable from a bare id.
            if "youtu" in ln and video_id(ln):
                urls.append((ln, heading))
            else:
                heading = ln.rstrip(":").strip()

    data = json.load(open(DATA))
    auto = album_id == "auto"
    album = None
    if not auto:
        album = next((a for a in data["albums"] if a["id"] == album_id), None)
        if album is None:
            sys.exit(f"no release with id {album_id!r}")


    added, skipped = [], []
    for url, heading in urls:
        vid = video_id(url)
        if not vid:
            skipped.append((url, "not a YouTube link")); continue
        try:
            title, channel, chandle, embeddable = lookup(vid)
        except Exception as e:
            skipped.append((url, f"lookup failed ({e})")); continue
        target = track = None
        # the heading wins: it's what you meant, and for a showcase or medley
        # the video title names some other song entirely
        if heading:
            for a in ([album] if album else data["albums"]):
                t = next((t for t in a["tracks"] if norm(t["title"]) == norm(heading)
                          or (t.get("titleKo") and norm(t["titleKo"]) == norm(heading))), None)
                if t:
                    target, track = a, t
                    break
        if track is None:
            if auto:
                target, track = best_album(data, title)
            else:
                target, track = album, match_track(album, title)
        if track is None:
            skipped.append((url, f"no track matches — {title[:60]}")); continue
        if any(video_id(v["url"]) == vid for v in track["videos"]):
            skipped.append((url, f"already on {track['title']}")); continue
        kind, official = classify(title, channel, chandle)
        t = start_at(url)
        entry = {"kind": kind,
                 "url": f"https://www.youtube.com/watch?v={vid}&t={t}" if t else vid,
                 "label": caption(title, kind, channel), "official": official}
        if not embeddable:
            entry["noEmbed"] = True
        if re.search(r"fancam|fan cam|직캠", title, re.I):
            entry["fancam"] = True
        track["videos"].append(entry)
        # pinned first, then official before fan, then by kind
        track["videos"].sort(key=lambda v: (0 if v.get("pin") else 1,
                                            0 if v.get("official", True) else 1,
                                            VIDEO_ORDER.get(v.get("kind"), 4)))
        added.append((target["title"], track["title"], kind, official, channel,
                      entry["label"] + ("  [no-embed]" if not embeddable else "")))

    for al, tr, kind, off, ch, lab in added:
        print(f"  {'OFFICIAL' if off else 'fan     '}  {kind:<11}  {al[:20]:<20}  {tr:<20}  {lab[:38]:<38}  {ch[:18]}")
    if skipped:
        print("\n  not added:")
        for url, why in skipped:
            print(f"    {url[:46]:<46} {why}")

    if dry:
        print(f"\n  dry run — {len(added)} would be added, nothing written")
    elif added:
        json.dump(data, open(DATA, "w"), indent=2, ensure_ascii=False)
        open(DATA, "a").write("\n")
        print(f"\n  wrote {len(added)} to data/discography.json")
    else:
        print("\n  nothing to add")


if __name__ == "__main__":
    main()
