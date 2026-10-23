"""Set where and how SynthV's Bounce to Files writes audio.

Usage: python3 -I render_config.py <in.svp> <out.svp> --dir <linux folder> --name <file prefix> [--stems]
--stems also exports each vocal track as its own file (files are <prefix>_<track name>.wav,
plus <prefix>_MixDown.wav).
"""
import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--dir", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--stems", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    env = dict(os.environ, WINEPREFIX=os.environ.get("SYNTHV_PREFIX", "/root/.wine-synthv"), WINEDEBUG="-all")
    win_dir = subprocess.run(["winepath", "-w", os.path.abspath(a.dir)], capture_output=True, text=True, env=env).stdout.strip()
    d = svp.load(a.src)
    d["renderConfig"].update(destination=win_dir, filename=a.name, exportMixDown=True)
    for t in d["tracks"]:
        t["renderEnabled"] = a.stems and not t["mainRef"].get("isInstrumental", False)
    svp.save(d, a.dst)
    print(f"{a.dst}: renders to {win_dir}\\{a.name}_*.wav")


if __name__ == "__main__":
    main()
