"""Write a render.py project as an OpenUtau project (.ustx), one track per singer.

Usage: python -I to_ustx.py project.json out.ustx [--singer rei="足立レイ" --singer corrupt="Corrupt-Chan CV"]

Notes keep their timing on OpenUtau's 480-ticks-per-beat grid (tempo from the project), lyrics are
the kana the engine sang, and the original singer's pitch goes in as a PITD (pitch deviation, cents)
curve, so OpenUtau plays the same melody with the same slides. Singer names must match the
voicebanks' names in OpenUtau (character.txt) for it to pick them automatically.
"""
import argparse
import json

import numpy as np

RES = 480


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("out")
    ap.add_argument("--singer", action="append", default=[])
    ap.add_argument("--inst", help="instrumental audio to add as a wave track")
    ap.add_argument("--resampler", action="append", default=[],
                    help="track=resampler file in OpenUtau's Resamplers folder, e.g. corrupt=moresampler.exe")
    a = ap.parse_args()
    P = json.load(open(a.project, encoding="utf-8"))
    singers = dict(s.split("=", 1) for s in a.singer)
    resamplers = dict(s.split("=", 1) for s in a.resampler)
    bpm = P.get("bpm", 120)
    off, spb = P.get("grid", [0.0, 60 / bpm])
    # tick 0 sits whole bars before the grid's first beat (so bar lines match the song) and at
    # least one bar before the song starts; the song itself starts at tick song_tick
    part_start = off - (np.ceil(off / (4 * spb)) + 1) * 4 * spb
    song_tick = int(round(-part_start / spb * RES))

    def tick(sec):
        return int(round((sec - part_start) / spb * RES / 60)) * 60  # snap to 1/32

    L = ["name: Signaling", "comment: ''", "output_dir: Vocal", "cache_dir: UCache", "ustx_version: 0.6",
         f"resolution: {RES}", f"bpm: {bpm}", "beats_per_bar: 4", "beat_unit: 4", "expressions: {}",
         "exp_selectors: [dyn, pitd, clr, eng, vel]", "exp_primaries: {}",
         "time_signatures:", "- bar_position: 0", "  beat_per_bar: 4", "  beat_unit: 4",
         "tempos:", "- position: 0", f"  bpm: {bpm}", "tracks:"]
    for i, tr in enumerate(P["tracks"]):
        L += [f"- singer: {yaml_str(singers.get(tr['name'], tr['name']))}",
              "  phonemizer: OpenUtau.Core.DefaultPhonemizer",
              "  renderer_settings:", "    renderer: CLASSIC", f"    resampler: {resamplers.get(tr['name'], 'worldline')}",
              "    wavtool: convergence",
              f"  track_name: {yaml_str(tr['name'])}", "  mute: false", "  solo: false", "  volume: 0", "  pan: 0"]
    if a.inst:
        L += ["- singer: ''", "  phonemizer: OpenUtau.Core.DefaultPhonemizer", "  renderer_settings: {}",
              "  track_name: Instrumental", "  mute: false", "  solo: false", "  volume: 0", "  pan: 0"]
    L.append("voice_parts:")
    for i, tr in enumerate(P["tracks"]):
        notes = sorted(tr["notes"], key=lambda n: n["t0"])
        end = tick(max(n["t1"] for n in notes)) + RES * 4
        L += [f"- duration: {end}", f"  name: {yaml_str(tr['name'])}", "  comment: ''", f"  track_no: {i}",
              "  position: 0", "  notes:"]
        last_end = -1
        for n in notes:
            p0 = max(tick(n["t0"]), last_end)
            p1 = max(tick(n["t1"]), p0 + 60)
            last_end = p1
            lyr = n["lyric"] if n["lyric"] not in ("-", "+") else "+~"
            L += [f"  - position: {p0}", f"    duration: {p1 - p0}", f"    tone: {int(n['midi'])}",
                  f"    lyric: {yaml_str(lyr)}",
                  "    pitch:", "      data:", "      - {x: -25, y: 0, shape: io}", "      - {x: 25, y: 0, shape: io}",
                  "      snap_first: true",
                  "    vibrato: {length: 0, period: 175, depth: 25, in: 10, out: 10, shift: 0, drift: 0, vol_link: 0}",
                  "    phoneme_expressions: []", "    phoneme_overrides: []"]
        # pitch deviation curve (cents) = original pitch - note pitch, every 5 ms -> 1/32-ish ticks
        pc = tr.get("pitch")
        xs, ys = [], []
        if pc and pc.get("midi"):
            dt = pc["dt"]
            arr = np.array([np.nan if v is None else v for v in pc["midi"]], float)
            for n in notes:
                a0, a1 = int(n["t0"] / dt), int(n["t1"] / dt)
                for k in range(a0, min(a1, len(arr)), 2):
                    if np.isfinite(arr[k]):
                        x = int(round((k * dt - part_start) / spb * RES))
                        if not xs or x > xs[-1]:
                            xs.append(x); ys.append(int(round((arr[k] - n["midi"]) * 100)))
        L += ["  curves:"]
        if xs:
            L += ["  - xs: [" + ", ".join(map(str, xs)) + "]", "    ys: [" + ", ".join(map(str, ys)) + "]",
                  "    abbr: pitd"]
        else:
            L[-1] = "  curves: []"
    if a.inst:
        import os
        L += ["wave_parts:", f"- relative_path: {yaml_str(os.path.basename(a.inst))}",
              f"  file_path: {yaml_str(os.path.basename(a.inst))}", "  name: Instrumental", "  comment: ''",
              f"  track_no: {len(P['tracks'])}", f"  position: {song_tick}", "  skip_ms: 0", "  trim_ms: 0"]
    else:
        L.append("wave_parts: []")
    open(a.out, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"{a.out}: {len(P['tracks'])} singer tracks; the song starts at tick {song_tick} "
          f"({-part_start:.3f} s into the project)")


if __name__ == "__main__":
    main()
