#!/usr/bin/env python3
"""Fill in the Apple Music link for every release that hasn't got one.

    python3 tools/itunes-links.py              # fill the gaps
    python3 tools/itunes-links.py --dry-run    # show the picks, write nothing
    python3 tools/itunes-links.py --all        # re-check ones already set

No credentials needed — Apple's search API is public.

It searches as whoever the release is actually credited to, not always Twice: a
solo record is the member's, and a collaboration is often the other act's. It
also tries several storefronts, because some releases only exist in one — the
Japanese best albums and What's Twice? are absent from every storefront except
Japan's.
"""

import json, os, re, sys, time, urllib.parse, urllib.request

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "discography.json")
STOREFRONTS = ["ph", "us", "jp", "kr", "gb"]
MEMBERS = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina",
           "Dahyun", "Chaeyoung", "Tzuyu"]
STOP = {"with", "feat", "twice", "remix", "from", "version", "the"}

norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())


def credited(album):
    """Who to search as, and whose name counts as a match."""
    cred = album.get("artist") or ""
    low = cred.lower()
    if "misamo" in low:
        return "MISAMO", {"misamo"}
    members = [m for m in MEMBERS if m.lower() in low]
    others = [w for w in re.split(r"[^\w'&]+", cred)
              if len(w) > 3 and w.lower() not in {m.lower() for m in MEMBERS}
              and w.lower() not in STOP]
    accept = {m.lower() for m in members} | {o.lower() for o in others}
    if album.get("category") == "solo":
        lead = members[0] if members else (others[0] if others else "Twice")
        return lead, (accept or {"twice"})
    return "Twice", accept | {"twice"}


def search(term, entity, country):
    url = ("https://itunes.apple.com/search?entity=%s&limit=12&country=%s&term=%s"
           % (entity, country, urllib.parse.quote(term)))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r).get("results", [])
    except Exception:
        return []


def pick(results, accept, title):
    """An exact title match by an accepted artist beats a partial one, so
       "Signal" doesn't pick up "SIGNAL (Japanese ver.)"."""
    want, exact, loose = norm(title), None, None
    for r in results:
        names = norm(r.get("artistName", ""))
        if accept and not any(norm(a) in names for a in accept):
            continue
        nm = norm(r.get("trackName") or r.get("collectionName") or "")
        if not nm:
            continue
        url = (r.get("trackViewUrl") or r.get("collectionViewUrl") or "").split("?")[0]
        if not url:
            continue
        if nm == want and exact is None:
            exact = (url, r.get("trackName") or r.get("collectionName"))
        elif (want in nm or nm in want) and loose is None:
            loose = (url, r.get("trackName") or r.get("collectionName"))
    return exact or loose


def main():
    dry = "--dry-run" in sys.argv
    every = "--all" in sys.argv
    data = json.load(open(DATA))
    targets = [a for a in data["albums"]
               if every or not a["links"].get("appleMusic")]
    if not targets:
        sys.exit("every release already has an Apple Music link")

    print("looking up %d releases\n" % len(targets))
    ok = bad = 0
    for a in targets:
        artist, accept = credited(a)
        hit = None
        for country in STOREFRONTS:
            for entity in ("album", "song"):
                hit = pick(search(f"{artist} {a['title']}", entity, country),
                           accept, a["title"])
                if hit:
                    break
                time.sleep(1.1)
            if hit:
                break
        if hit:
            a["links"]["appleMusic"] = hit[0]
            ok += 1
            print("  OK   %-28s %-10s %s" % (a["title"][:28], artist[:10], hit[1][:36]))
        else:
            bad += 1
            print("  --   %-28s %-10s (no confident match)" % (a["title"][:28], artist[:10]))

    if dry:
        print("\n  dry run — %d would be set, nothing written" % ok)
    else:
        json.dump(data, open(DATA, "w"), indent=2, ensure_ascii=False)
        open(DATA, "a").write("\n")
        print("\n  set %d, unmatched %d — written to data/discography.json" % (ok, bad))


if __name__ == "__main__":
    main()
