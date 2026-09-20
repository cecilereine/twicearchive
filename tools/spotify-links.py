#!/usr/bin/env python3
"""Fill in the Spotify album link for every release that hasn't got one.

    export SPOTIFY_CLIENT_ID=...
    export SPOTIFY_CLIENT_SECRET=...
    python3 tools/spotify-links.py            # fill the gaps
    python3 tools/spotify-links.py --dry-run  # show what it would pick
    python3 tools/spotify-links.py --all      # also re-check ones already set

Credentials are read from the environment and never written anywhere. Don't put
them in a file inside the repo.

Get them at https://developer.spotify.com/dashboard — create an app, then
"Settings" shows the Client ID and a "View client secret" link.

The form demands a redirect URI even though this never uses one (the Client
Credentials flow doesn't redirect anywhere). Spotify no longer accepts
"localhost" there: a loopback address has to be the literal IP, so use
http://127.0.0.1:8790 — or any https:// URL.
"""

import base64, getpass, json, os, re, sys, time, urllib.parse, urllib.request

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "discography.json")
norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())


def token():
    """Credentials come from the environment, or are typed in when they aren't
       set. The secret is read with getpass, so it isn't echoed to the screen and
       doesn't end up in shell history."""
    cid = os.environ.get("SPOTIFY_CLIENT_ID") or ""
    sec = os.environ.get("SPOTIFY_CLIENT_SECRET") or ""
    if cid.strip(".") == "" or sec.strip(".") == "":
        print("Spotify credentials (from developer.spotify.com/dashboard "
              "-> your app -> Settings)\n")
        cid = input("  Client ID     : ").strip()
        sec = getpass.getpass("  Client secret : ").strip()
        print()
    if not cid or not sec:
        sys.exit("no credentials given")

    body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token", data=body,
        headers={"Authorization": "Basic " + auth,
                 "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.load(e).get("error_description") or ""
        except Exception:
            pass
        if e.code == 400:
            sys.exit(f"Spotify rejected the credentials ({detail or 'invalid client'}).\n"
                     "Check the Client ID and secret are the real values from the "
                     "dashboard, not placeholders.")
        raise


def search(tok, q, limit=8):
    url = ("https://api.spotify.com/v1/search?type=album&limit=%d&q=%s"
           % (limit, urllib.parse.quote(q)))
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["albums"]["items"]


def pick(items, artist, title):
    """Prefer an exact name match by the right artist. Japanese and remix
       editions share a name with the original, so an exact match wins over a
       merely-contains one."""
    want, exact, loose = norm(title), None, None
    for it in items:
        names = norm(" ".join(a["name"] for a in it["artists"]))
        if norm(artist) not in names:
            continue
        n = norm(it["name"])
        if n == want and exact is None:
            exact = it
        elif (want in n or n in want) and loose is None:
            loose = it
    return exact or loose


def main():
    dry = "--dry-run" in sys.argv
    every = "--all" in sys.argv
    data = json.load(open(DATA))
    targets = [a for a in data["albums"]
               if every or not a["links"].get("spotify")]
    if not targets:
        sys.exit("every release already has a Spotify link")

    tok = token()
    print(f"looking up {len(targets)} releases\n")
    ok = bad = 0
    for a in targets:
        artist = "MISAMO" if (a.get("artist") or "") == "MISAMO" else "TWICE"
        hit = None
        for q in (f'artist:{artist} album:"{a["title"]}"',
                  f'{artist} {a["title"]}'):
            hit = pick(search(tok, q), artist, a["title"])
            if hit:
                break
            time.sleep(.2)
        if hit:
            a["links"]["spotify"] = hit["external_urls"]["spotify"]
            ok += 1
            print(f"  OK   {a['title'][:26]:<26} {a['seq'][:18]:<18} {hit['name'][:34]}")
        else:
            bad += 1
            print(f"  --   {a['title'][:26]:<26} {a['seq'][:18]:<18} (no confident match)")
        time.sleep(.15)

    if dry:
        print(f"\n  dry run — {ok} would be set, nothing written")
    else:
        json.dump(data, open(DATA, "w"), indent=2, ensure_ascii=False)
        open(DATA, "a").write("\n")
        print(f"\n  set {ok}, unmatched {bad} — written to data/discography.json")


if __name__ == "__main__":
    main()
