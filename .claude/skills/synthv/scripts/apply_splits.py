"""Apply a lyrics module's SPLITS to a project, before apply_lyrics.py.

Usage: python3 -I apply_splits.py <in.svp> <lyrics.py> <out.svp>
SPLITS = [(group-prefixes, phrase, note, first-16ths), ...] are applied in order with
split_note.py (see there); list every group that sings a line so their notes stay identical.
"""
import importlib.util
import os
import shutil
import subprocess
import sys


def main(src, lyrics, dst):
    spec = importlib.util.spec_from_file_location("lyrics_module", lyrics)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    splits = getattr(mod, "SPLITS", [])
    shutil.copy(src, dst)
    here = os.path.dirname(os.path.abspath(__file__))
    for groups, phrase, note, first in splits:
        r = subprocess.run([sys.executable, "-I", os.path.join(here, "split_note.py"), dst, dst, groups,
                            str(phrase), str(note), str(first)], capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"split {groups} {phrase} {note}: {(r.stderr or r.stdout).strip()}")
    print(f"{dst}: {len(splits)} splits applied")


if __name__ == "__main__":
    main(*sys.argv[1:])
