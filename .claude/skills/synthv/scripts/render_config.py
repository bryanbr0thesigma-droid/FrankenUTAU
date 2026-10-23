"""Set where and how SynthV's Bounce to Files writes audio.

Usage: python3 -I render_config.py <in.svp> <out.svp> --dir <linux folder> --name <file prefix> [--stems] [--tracks 0,1,2]
--stems also exports each vocal track as its own file (files are <prefix>_<track name>.wav,
plus <prefix>_MixDown.wav). Output is always stereo 32-bit float 48 kHz, which boost.py and
mix.py expect. SynthV Basic only loads the first 3 tracks of a project; for more, render in
passes with --tracks (keeps only those track indices) and add the stems up with sum_stems.py.
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
    ap.add_argument("--tracks", help="comma-separated track indices to keep")
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    env = dict(os.environ, WINEPREFIX=os.environ.get("SYNTHV_PREFIX", "/root/.wine-synthv"), WINEDEBUG="-all")
    win_dir = subprocess.run(["winepath", "-w", os.path.abspath(a.dir)], capture_output=True, text=True, env=env).stdout.strip()
    d = svp.load(a.src)
    if a.tracks:
        d["tracks"] = [d["tracks"][int(i)] for i in a.tracks.split(",")]
    if len(d["tracks"]) > 3:
        print(f"warning: {len(d['tracks'])} tracks; SynthV Basic renders only the first 3 (use --tracks)")
    d["renderConfig"].update(destination=win_dir, filename=a.name, exportMixDown=True,
                             numChannels=2, bitDepth=32, sampleRate=48000)
    for t in d["tracks"]:
        t["renderEnabled"] = a.stems and not t["mainRef"].get("isInstrumental", False)
    svp.save(d, a.dst)
    print(f"{a.dst}: renders to {win_dir}\\{a.name}_*.wav")


if __name__ == "__main__":
    main()
