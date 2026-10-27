"""Write transcribed notes (transcribe.py output) into a new SynthV project.

Usage: python -I make_svp.py notes.json out.svp [--voice maki-eng|teto] [--origin-beat 28]
--origin-beat is the project beat where the grid's first beat (grid.npy) lands; pick it so bar
lines match the song (a multiple of 4 when the grid's first beat is a downbeat) and leave room
for a pickup. The instrumental then starts at the printed offset into the project.
English lyrics are written as SynthV expects: the word on its first note, "+" on each further
syllable, "-" on a slur.
"""
import argparse
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import svp  # noqa: E402

VOICES = {
    "maki-eng": {"name": "Tsurumaki Maki AI (ENG Lite)", "language": "english", "phoneset": "arpabet",
                 "languageOverride": "", "phonesetOverride": "", "backendType": "SVR2AI", "version": "101"},
    "teto": {"name": "Kasane Teto (Lite)", "language": "japanese", "phoneset": "romaji",
             "languageOverride": "", "phonesetOverride": "", "backendType": "SVR2AI", "version": "100"},
}
LYRIC = {"'cause": "cause", "uhh": "uh", "ohh": "oh"}   # words SynthV's dictionary doesn't know
PHONEMES = {"uh": "ah", "oh": "ow"}
PARAMS = ("pitchDelta", "vibratoEnv", "loudness", "tension", "breathiness", "voicing", "gender", "toneShift",
          "mouthOpening")


def take():
    return {"activeTakeId": 0, "takes": [{"id": 0, "seedDuration": 0, "seedPitch": 0, "seedTimbre": 0, "liked": False}]}


def blank_project(voice, bpm):
    gid = str(uuid.uuid4())
    return {
        "version": 151, "uuid": str(uuid.uuid4()),
        "time": {"meter": [{"index": 0, "numerator": 4, "denominator": 4}], "tempo": [{"position": 0, "bpm": bpm}],
                 "startTimeSeconds": 0.0},
        "library": [],
        "tracks": [{
            "name": "Lead", "dispColor": "ff7db235", "dispOrder": 0, "renderEnabled": True,
            "mixer": {"gainDecibel": 0.0, "pan": 0.0, "mute": False, "solo": False, "display": True},
            "mainGroup": {"name": "main", "uuid": gid, "vocalModes": {}, "pitchControls": [], "notes": [],
                          "parameters": {p: {"mode": "cubic", "points": []} for p in PARAMS}},
            "mainRef": {"uuid": str(uuid.uuid4()), "groupID": gid, "blickAbsoluteBegin": 0, "blickAbsoluteEnd": -1,
                        "blickOffset": 0, "pitchOffset": 0, "mute": False, "isInstrumental": False,
                        "database": dict(VOICES[voice]), "dictionary": "",
                        "voice": {"vocalModeInherited": True, "vocalModePreset": "", "vocalModeParams": {}},
                        "voicePresetName": "", "takes": take()},
            "groups": []}],
        "renderConfig": {"destination": "", "filename": "", "numChannels": 2, "aspirationFormat": "noAspiration",
                         "bitDepth": 32, "sampleRate": 48000, "exportMixDown": True, "exportPitch": False},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("notes"); ap.add_argument("out")
    ap.add_argument("--voice", default="maki-eng", choices=sorted(VOICES))
    ap.add_argument("--origin-beat", type=float, default=28)
    a = ap.parse_args()
    N = json.load(open(a.notes))
    off, per = N["off"], N["per"]
    d = blank_project(a.voice, round(60 / per, 3))
    notes = []
    for n in N["notes"]:
        lyr = LYRIC.get(n["lyric"], n["lyric"])
        notes.append({"uuid": uuid.uuid4().hex[:16], "musicalType": "singing",
                      "onset": int(round((n["b0"] + a.origin_beat) * svp.Q)),
                      "duration": int(round((n["b1"] - n["b0"]) * svp.Q)),
                      "lyrics": lyr, "phonemes": PHONEMES.get(lyr, ""), "accent": "",
                      "pitch": int(n["pitch"]), "detune": 0, "attributes": {}, "takes": take()})
    d["tracks"][0]["mainGroup"]["notes"] = notes
    svp.save(d, a.out)
    print(f"{len(notes)} notes at {60 / per:.1f} BPM; start the instrumental {a.origin_beat * per - off:.4f} s into the project")


if __name__ == "__main__":
    main()
