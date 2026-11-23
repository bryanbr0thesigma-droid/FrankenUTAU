"""Lyric video for the Harlequin Contraption cover: text on black, nothing else.

    python3 -I lyric_video.py <lyrics.json> <cover.wav> <out.mp4>

lyrics.json comes from tools/lyric_times.py (every line timed to the project's notes). Karaoke style: each word
turns gold as Maki sings it, the next line shows smaller below, and the whispered lines are lilac and italic. A
disclaimer about the changed lyrics opens the video and is repeated in the credits. The subtitles are burned in with
ffmpeg's libass.
"""
import json
import os
import subprocess
import sys

FONTS = "/usr/share/fonts/truetype/dejavu"
GOLD, WHITE, LILAC, LILAC_SUNG, GREY = "&H006BC9F2", "&H00FFFFFF", "&H00FFCDDC", "&H00FFA0C4", "&H00808080"


def ts(s):
    s = max(0.0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def style(name, size, primary, secondary, bold=1, italic=0, outline=3):
    return (f"Style: {name},DejaVu Sans,{size},{primary},{secondary},&H00000000,&H00000000,{-bold},{-italic},0,0,"
            f"100,100,0,0,1,{outline},0,5,60,60,0,1")


def karaoke(words, start):
    """\\k tags: each word turns from the secondary to the primary colour when it is sung"""
    out, done = [], round(start * 100)
    lead = round(words[0]["t0"] * 100) - done
    if lead > 0:
        out.append(f"{{\\k{lead}}}")
        done += lead
    for i, w in enumerate(words):
        end = words[i + 1]["t0"] if i + 1 < len(words) else w["t1"]
        cs = max(1, round(end * 100) - done)
        out.append(f"{{\\k{cs}}}{w['w']}" + (" " if i + 1 < len(words) else ""))
        done += cs
    return "".join(out)


def main(lyr, audio, out):
    lines = json.load(open(lyr, encoding="utf-8"))["lines"]
    main_lines = [l for l in lines if not l["words"][0]["w"].startswith("(")]
    echoes = [l for l in lines if l["words"][0]["w"].startswith("(")]
    ev = []
    for i, L in enumerate(main_lines):
        nxt = main_lines[i + 1] if i + 1 < len(main_lines) else None
        start = L["t0"] - 0.25
        end = min(nxt["t0"] - 0.25 if nxt else 1e9, L["t1"] + 1.2)
        st = "Whisper" if L["part"] == "Whisper" else "Lyric"
        if L["words"][0]["w"].startswith("Ah"):          # the last note sinks an octave, so does its word
            pos = f"\\move(640,340,640,420,{round((192.6 - start) * 1000)},{round((199.45 - start) * 1000)})"
        else:
            pos = "\\pos(640,340)"
        ev.append((start, end, st, f"{{{pos}\\fad(120,200)}}" + karaoke(L["words"], start)))
        if nxt and nxt["t0"] - 0.25 > start:             # preview of the next line
            ps = max(start, nxt["t0"] - 3.2)
            if ps < nxt["t0"] - 0.3:
                text = " ".join(w["w"] for w in nxt["words"])
                ev.append((ps, nxt["t0"] - 0.25, "Next", f"{{\\pos(640,450)\\fad(200,0)}}{text}"))
    for L in echoes:
        ev.append((L["t0"] - 0.25, L["t1"] + 0.6, "Echo", "{\\pos(640,255)\\fad(120,200)}" + karaoke(L["words"], L["t0"] - 0.25)))
    ev += [
        (0.3, 5.4, "Head", "{\\pos(640,280)\\fad(400,400)}DISCLAIMER"),
        (0.3, 5.4, "Body", "{\\pos(640,380)\\fad(400,400)}I changed some of the lyrics in this cover\\Nfor religious reasons."),
        (6.0, 15.6, "Title", "{\\pos(640,300)\\fad(600,600)}Harlequin Contraption"),
        (6.0, 15.6, "Body", "{\\pos(640,390)\\fad(600,600)}Tsurumaki Maki cover"),
        (6.0, 15.6, "Small", "{\\pos(640,445)\\fad(600,600)}original song by Vane Lily"),
        (200.6, 208.4, "Head", "{\\pos(640,250)\\fad(600,600)}Tsurumaki Maki AI (ENG Lite)"),
        (200.6, 208.4, "Small", "{\\pos(640,315)\\fad(600,600)}Synthesizer V Studio Basic"),
        (200.6, 208.4, "Small", "{\\pos(640,390)\\fad(600,600)}original song: Harlequin Contraption – Vane Lily"),
        (200.6, 208.4, "SmallGold", "{\\pos(640,450)\\fad(600,600)}Some lyrics were changed for religious reasons."),
    ]
    ass = "\n".join([
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1280", "PlayResY: 720", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, "
        "StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        style("Lyric", 54, GOLD, WHITE), style("Whisper", 54, LILAC_SUNG, LILAC, italic=1), style("Echo", 38, GOLD, WHITE, italic=1),
        style("Next", 30, GREY, GREY, bold=0, outline=0), style("Head", 60, GOLD, GOLD), style("Title", 72, GOLD, GOLD),
        style("Body", 40, WHITE, WHITE), style("Small", 30, WHITE, WHITE, bold=0, outline=0),
        style("SmallGold", 30, GOLD, GOLD, bold=0, outline=0), "",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        *[f"Dialogue: 0,{ts(a)},{ts(b)},{s},,0,0,0,,{t}" for a, b, s, t in sorted(ev)],
    ]) + "\n"
    ass_path = os.path.splitext(out)[0] + ".ass"
    open(ass_path, "w", encoding="utf-8").write(ass)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=30", "-i", audio,
                    "-vf", f"ass={ass_path}:fontsdir={FONTS}", "-map", "0:v", "-map", "1:a",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    print(f"{out}: {os.path.getsize(out) / 1e6:.1f} MB, {len(ev)} subtitle events ({ass_path})")


if __name__ == "__main__":
    main(*sys.argv[1:4])
