#!/usr/bin/env python3
"""Keep every copy of the same video consistent across releases.

    python3 tools/sync-videos.py             # reconcile
    python3 tools/sync-videos.py --dry-run   # show what would change

A song that appears on a single and again on its album has the same videos filed
twice. Adding a link fills both, but *reclassifying* one — marking a making-of as
the music video, say — only touches the copy you edited, and the two drift apart.

This picks the best-described copy of each video and applies it everywhere:
the most specific kind wins (an mv beats an unlabelled "other"), then a pin,
then the longer caption. It does not move videos between tracks or invent any.
"""

import json, os, sys
from collections import defaultdict

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "discography.json")
ORDER = {"mv": 0, "special": 1, "dance": 2, "dance-performance": 2.5,
         "performance": 3, "live": 4, "other": 5, "lyric": 6}


def rank(v):
    """Lower is better-described."""
    return (ORDER.get(v.get("kind"), 4),
            0 if v.get("pin") else 1,
            -len(v.get("label") or ""))


def main():
    dry = "--dry-run" in sys.argv
    data = json.load(open(DATA))

    copies = defaultdict(list)
    for album in data["albums"]:
        for track in album["tracks"]:
            for v in track["videos"]:
                copies[v["url"]].append((album, track, v))

    changed = []
    for url, rows in copies.items():
        if len(rows) < 2:
            continue
        best = min((v for _, _, v in rows), key=rank)
        for album, track, v in rows:
            diff = {k: (v.get(k), best.get(k)) for k in ("kind", "label", "official", "pin", "noEmbed", "fancam")
                    if v.get(k) != best.get(k)}
            if not diff:
                continue
            changed.append((album["title"], album["seq"], track["title"], url, diff))
            for k in ("kind", "label", "official", "noEmbed", "pin", "fancam"):
                if k in best:
                    v[k] = best[k]
                else:
                    v.pop(k, None)

    for album in data["albums"]:
        for track in album["tracks"]:
            track["videos"].sort(key=lambda v: (0 if v.get("pin") else 1,
                                                0 if v.get("official", True) else 1,
                                                ORDER.get(v.get("kind"), 4)))

    for title, seq, track, url, diff in changed:
        bits = ", ".join(f"{k}: {a!r} -> {b!r}" for k, (a, b) in diff.items())
        print(f"  {title[:20]:<20} {seq[:16]:<16} {track[:18]:<18} {bits}")

    if dry:
        print(f"\n  dry run — {len(changed)} copies would change")
    elif changed:
        json.dump(data, open(DATA, "w"), indent=2, ensure_ascii=False)
        open(DATA, "a").write("\n")
        print(f"\n  reconciled {len(changed)} copies")
    else:
        print("  every copy already agrees")


if __name__ == "__main__":
    main()
