"""Reference voices for voiceid.py: Deezer's public 30 s previews of solo songs by each singer.

    python fetch_refs.py refs/      (then isolate the vocals, e.g. audio-separator refs/*.mp3 -m Kim_Vocal_2.onnx --single_stem Vocals)
"""
import json, re, sys, urllib.parse, urllib.request
from pathlib import Path

SONGS = {
    "sza": ("SZA", ["Kill Bill", "Good Days", "Snooze", "Saturn", "The Weekend", "Nobody Gets Me"]),
    "parker": ("Tame Impala", ["The Less I Know The Better", "Let It Happen", "Borderline", "Feels Like We Only Go Backwards",
                               "Lost In Yesterday", "Eventually"]),
    "gizz": ("King Gizzard & The Lizard Wizard", ["Hot Water", "Robot Stop", "Gila Monster", "Work This Time"]),  # control
}
out = Path(sys.argv[1] if len(sys.argv) > 1 else "refs")
out.mkdir(parents=True, exist_ok=True)
for who, (artist, titles) in SONGS.items():
    for title in titles:
        q = urllib.parse.quote(f"{artist} {title}")
        d = json.load(urllib.request.urlopen(f"https://api.deezer.com/search?q={q}&limit=10", timeout=20)).get("data", [])
        d = [x for x in d if x["artist"]["name"].lower() == artist.lower() and x.get("preview") and title.lower() in x["title"].lower()]
        if not d:
            print("not found:", artist, title)
            continue
        fn = out / f"{who}_{re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')}.mp3"
        urllib.request.urlretrieve(d[0]["preview"], fn)
        print(who, d[0]["title"], "->", fn)
