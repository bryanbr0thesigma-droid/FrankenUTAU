"""Make a SynthV Studio 2 project openable in SynthV Basic 1.x and sung by an installed voice.

Usage: python3 -I for_basic.py <in.svp> <out.svp> [--voice "Kasane Teto (Lite)"]
Basic 1.10 refuses projects saved by newer versions; the note data is compatible, so this
lowers the format version and swaps every assigned voice for the given one. Language
overrides are kept (Basic ignores them; cross-lingual singing needs Pro).
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
        for ref in [t["mainRef"]] + t.get("groups", []):
            if ref["database"].get("name"):
                ref["database"].update(VOICES[a.voice])
                swapped += 1
    svp.save(d, a.dst)
    print(f"{a.dst}: version 151, {swapped} voice assignments -> {a.voice}")


if __name__ == "__main__":
    main()
