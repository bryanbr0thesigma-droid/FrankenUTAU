"""Read a UTAU voicebank folder: every oto.ini (in any subfolder), prefix.map and character.txt.

Usage: python -I voicebank.py <voicebank-dir> [lyric ...]    (prints a summary / looks lyrics up)
"""
import os
import re
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kana  # noqa: E402

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(midi):
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def read_text(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp932", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass


class Entry:
    def __init__(self, wav, alias, offset, consonant, cutoff, preutter, overlap):
        self.wav, self.alias = wav, alias
        self.offset, self.consonant, self.cutoff = offset, consonant, cutoff      # ms, as in oto.ini
        self.preutter, self.overlap = preutter, overlap

    def __repr__(self):
        return (f"{self.alias!r} {os.path.basename(self.wav)} off={self.offset} con={self.consonant} "
                f"cut={self.cutoff} pre={self.preutter} ovl={self.overlap}")


class Voicebank:
    def __init__(self, root):
        self.root = root
        self.entries = {}          # alias -> Entry (first one found wins)
        self.prefix = {}           # midi -> (prefix, suffix)
        self.name = os.path.basename(root.rstrip("/"))
        for d, _dirs, files in sorted(os.walk(root)):
            low = {f.lower(): f for f in files}
            if "oto.ini" in low:
                self._read_oto(d, os.path.join(d, low["oto.ini"]))
            if d == root and "prefix.map" in low:
                self._read_prefix(os.path.join(d, low["prefix.map"]))
            if d == root and "character.txt" in low:
                m = re.search(r"^name=(.*)$", read_text(os.path.join(d, low["character.txt"])), re.M)
                if m and m.group(1).strip():
                    self.name = m.group(1).strip()
        if not self.entries:
            raise SystemExit(f"no oto.ini entries under {root}")

    def _read_oto(self, d, path):
        for line in read_text(path).splitlines():
            if "=" not in line:
                continue
            fname, rest = line.split("=", 1)
            parts = rest.split(",")
            if len(parts) < 6:
                continue
            alias = parts[0].strip() or os.path.splitext(fname)[0]
            try:
                nums = [float(p or 0) for p in parts[1:6]]
            except ValueError:
                continue
            wav = os.path.join(d, fname)
            if not os.path.exists(wav):
                continue
            self.entries.setdefault(alias, Entry(wav, alias, *nums))

    def _read_prefix(self, path):
        for line in read_text(path).splitlines():
            parts = line.split("\t")
            if len(parts) >= 3 and re.fullmatch(r"[A-G]#?-?\d", parts[0]):
                name = parts[0]
                n = NOTE_NAMES.index(name[:-1] if not name[-2].isdigit() or name[-2] == "-" else name[:-1])
                octave = int(name[len(NOTE_NAMES[n]):])
                self.prefix[(octave + 1) * 12 + n] = (parts[1], parts[2])

    def candidates(self, mora, prev_vowel=None):
        """Alias spellings to try for a sung mora, best first. prev_vowel=None means phrase start."""
        r = kana.roma(mora)
        base = [mora, r]
        out = []
        if prev_vowel is not None:
            pv = kana.VOWEL_KANA.get(prev_vowel, "")
            out += [f"{prev_vowel} {mora}", f"{prev_vowel} {r}", f"{pv} {mora}"]   # VCV
        else:
            out += [f"- {mora}", f"- {r}"]
        return out + base

    def lookup(self, mora, midi, prev_vowel=None):
        """Entry for a mora sung at a MIDI note; None if the bank has nothing for it."""
        pre, suf = self.prefix.get(midi, ("", ""))
        for alias in self.candidates(mora, prev_vowel):
            for a in (f"{pre}{alias}{suf}", alias):
                if a in self.entries:
                    return self.entries[a]
        return None


def wav_info(path):
    with wave.open(path) as w:
        return w.getframerate(), w.getnchannels(), w.getnframes() / w.getframerate()


if __name__ == "__main__":
    vb = Voicebank(sys.argv[1])
    print(f"{vb.name}: {len(vb.entries)} aliases, prefix.map {'yes' if vb.prefix else 'no'}"
          f" ({sorted(set(v for v in vb.prefix.values()))[:6]})")
    vcv = sum(1 for a in vb.entries if re.match(r"^[aiueon-] ", a))
    print(f"VCV-style aliases: {vcv}")
    some = list(vb.entries.values())[:3]
    for e in some:
        print(" ", e, wav_info(e.wav))
    prev = None
    for text in sys.argv[2:]:
        for m in kana.moras(text):
            e = vb.lookup(m, 64, prev)
            print(f"{m}: {e}")
            prev = kana.vowel(m)
