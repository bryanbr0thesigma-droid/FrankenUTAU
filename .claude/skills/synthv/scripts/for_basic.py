"""Make a SynthV Studio 2 project openable in SynthV Basic 1.x and sung by an installed voice.

Usage: python3 -I for_basic.py <in.svp> <out.svp> [--voice "Kasane Teto (Lite)"]
Basic 1.10 refuses projects saved by newer versions; the note data is compatible, so this
lowers the format version and gives every track that has a voice the given one. SynthV 2 can
assign voices per note group; Basic takes the voice from the track, so the voice goes on the
track and its groups inherit it. Language overrides are kept (Basic ignores them;
cross-lingual singing needs Pro).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402

VOICES = {
    "Kasane Teto (Lite)": {"name": "Kasane Teto (Lite)", "language": "japanese", "phoneset": "romaji",
                           "backendType": "SVR2AI", "version": "100"},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--voice", default="Kasane Teto (Lite)", choices=sorted(VOICES))
    a = ap.parse_args()
    d = svp.load(a.src)
    d["version"] = 151
    swapped = 0
    for t in d["tracks"]:
        groups = t.get("groups", [])
        if not any(ref["database"].get("name") for ref in [t["mainRef"]] + groups):
            continue
        t["mainRef"]["database"].update(VOICES[a.voice])
        for ref in groups:
            ref["database"].update(name="", language="", phoneset="", backendType="", version="-2")
        swapped += 1
    svp.save(d, a.dst)
    print(f"{a.dst}: version 151, {swapped} tracks -> {a.voice}")


if __name__ == "__main__":
    main()
