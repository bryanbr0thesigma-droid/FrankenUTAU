"""The original Harlequin Contraption MV, edited for the Tsurumaki Maki cover.

    python -I mv_recolor.py --mv mv.mp4 --lut maki.cube --audio cover.wav --avatar avatar.jpg --fonts DIR --out out.mp4
        [--stills 18,83.5,...]   PNG stills instead of the video (into the folder of --out)
        [--range 80 86]          only that stretch (preview)

1. Recolour every frame to Maki's palette (maki_lut.py: pinks -> gold, purples -> greys, teal -> red).
2. YouTube section (0:15-0:32): the channel becomes @bryanbr0music with the user's avatar (name under the player,
   the "From ..." chip, the channel line under each sidebar video), and "Harlequin Contraption ft. Kasane Teto"
   becomes "... ft. Tsurumaki Maki" (player title, page title, its upside-down glitch copy, the sidebar entry).
3. Credits: "vocal Kasane Teto" -> "vocal Tsurumaki Maki", and the closing STARRING sign.
4. The three rewritten lyric lines (1:22, 2:57, 3:00): the old words are erased (found by colour, inpainted) and the
   new words drawn in a similar style, assembling and scattering when the originals do.
5. The cover's audio, delayed 70 ms to the MV's timing (measured against the instrumental).
Needs numpy, opencv (cv2), Pillow and ffmpeg.
"""
import argparse
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WID, HEI, FPS = 1920, 1080, 30
AUDIO_DELAY = 0.070
CHANNEL = "bryanbr0music"
NEW_TITLE = "Harlequin Contraption ft. Tsurumaki Maki"
CREAM, GOLD, DARK, UI_GREY = (240, 234, 218), (232, 184, 44), (40, 30, 20), (150, 150, 150)
PAGE_T = (16.0, 31.95)                 # the YouTube watch page
PAGE_REF = (128, 890)                  # where the channel name sits when the page isn't shaking


# ---------------------------------------------------------------- masks
def hsv(img):
    h = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    return h[..., 0] * 360 / 256, h[..., 1] / 255, h[..., 2] / 255


def m_light(img, thr=0.55):
    return hsv(img)[2] > thr


def m_gold(img):
    h, s, v = hsv(img)
    return (h > 34) & (h < 58) & (s > 0.45) & (v > 0.55)


def m_cream(img):
    h, s, v = hsv(img)
    return (v > 0.88) & (s < 0.2)


def m_dark(img, thr=0.33):
    return hsv(img)[2] < thr


def m_credit(img):
    """the credit's letters: cream, gold, or light grey (the K and T), never the mid-grey hands"""
    h, s, v = hsv(img)
    return ((v > 0.69) & (s < 0.14)) | m_cream(img) | m_gold(img)


def near(mask, px):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.dilate(mask.astype(np.uint8), k) > 0


def erase(frame, box, mask, grow=2, radius=5):
    """inpaint mask (box-local) inside frame[box]"""
    x0, y0, x1, y1 = box
    sub = frame[y0:y1, x0:x1]
    m = near(mask, grow).astype(np.uint8) * 255
    if m.any():
        frame[y0:y1, x0:x1] = cv2.inpaint(np.ascontiguousarray(sub), m, radius, cv2.INPAINT_TELEA)


def clip_box(b):
    x0, y0, x1, y1 = (int(round(v)) for v in b)
    return max(0, x0), max(0, y0), min(WID, x1), min(HEI, y1)


# ---------------------------------------------------------------- text
class TextBlock:
    """lines of text as separate letter tiles, so they can wobble, assemble and scatter"""

    def __init__(self, lines, font, size, fill, stroke=None, stroke_w=0, shadow=None, shadow_off=(0, 0),
                 line_gap=1.0, wobble=0.0, rot=0.0, seed=1, arc=0.0, max_w=None, align="center"):
        self.font = ImageFont.truetype(font, size)
        if max_w:
            while size > 8 and max(self.font.getlength(l) for l in lines) > max_w:
                size -= 1
                self.font = ImageFont.truetype(font, size)
        self.size, self.fill, self.stroke, self.stroke_w = size, fill, stroke, stroke_w
        self.shadow, self.shadow_off = shadow, shadow_off
        rng = np.random.default_rng(seed)
        asc, desc = self.font.getmetrics()
        lh = (asc + desc) * line_gap
        self.letters = []
        widths = [self.font.getlength(l) for l in lines]
        bw = max(widths)
        for li, line in enumerate(lines):
            x = {"center": (bw - widths[li]) / 2, "left": 0}[align]
            for ch in line:
                adv = self.font.getlength(ch)
                if ch != " ":
                    cx = x + adv / 2
                    u = (cx / max(bw, 1)) - 0.5
                    dy = -arc * (1 - 4 * u * u) * size + rng.normal(0, wobble) * size
                    self.letters.append({"tile": self._tile(ch), "x": cx - bw / 2, "y": li * lh + asc / 2 + dy - (len(lines) * lh) / 2,
                                         "rot": rng.normal(0, rot), "dir": rng.uniform(0, 2 * np.pi), "far": rng.uniform(0.6, 1.4)})
                x += adv
        self.w, self.h = bw, len(lines) * lh

    def _tile(self, ch):
        pad = self.stroke_w + max(abs(self.shadow_off[0]), abs(self.shadow_off[1])) + 4
        w = int(self.font.getlength(ch)) + 2 * pad + 4
        asc, desc = self.font.getmetrics()
        h = asc + desc + 2 * pad
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        if self.shadow:
            d.text((pad + self.shadow_off[0], pad + self.shadow_off[1]), ch, font=self.font, fill=self.shadow,
                   stroke_width=self.stroke_w, stroke_fill=self.shadow)
        d.text((pad, pad), ch, font=self.font, fill=self.fill, stroke_width=self.stroke_w,
               stroke_fill=self.stroke if self.stroke else self.fill)
        return im

    def layer(self, a=1.0, spread=300.0, t=0.0, jitter=0.0):
        """RGBA image of the block, centre at its middle; a<1 scatters the letters"""
        a = float(np.clip(a, 0, 1))
        static = a >= 1 and jitter == 0
        if static and getattr(self, "_cache", None) is not None:
            return self._cache
        margin = int(spread * 1.6 + self.size * 2)
        W, H = int(self.w + 2 * margin), int(self.h + 2 * margin)
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for i, L in enumerate(self.letters):
            k = (1 - a) ** 1.5
            dx = np.cos(L["dir"]) * spread * L["far"] * k + np.sin(t * 9 + i) * jitter
            dy = np.sin(L["dir"]) * spread * L["far"] * k + np.cos(t * 11 + i * 2) * jitter
            tile = L["tile"].rotate(np.degrees(L["rot"] + 1.5 * (L["dir"] - np.pi) * k), resample=Image.BICUBIC, expand=True)
            if a < 1:
                al = np.clip(a * 1.6, 0, 1)
                tile.putalpha(tile.getchannel("A").point(lambda v: int(v * al)))
            x = W / 2 + L["x"] + dx - tile.width / 2
            y = H / 2 + L["y"] + dy - tile.height / 2
            out.alpha_composite(tile, (int(round(x)), int(round(y))))
        if static:
            self._cache = out
        return out


def paste(frame, layer, center, flip_v=False):
    if flip_v:
        layer = layer.transpose(Image.FLIP_TOP_BOTTOM)
    x = int(round(center[0] - layer.width / 2))
    y = int(round(center[1] - layer.height / 2))
    x0, y0, x1, y1 = max(0, x), max(0, y), min(WID, x + layer.width), min(HEI, y + layer.height)
    if x1 <= x0 or y1 <= y0:
        return
    sub = Image.fromarray(frame[y0:y1, x0:x1]).convert("RGBA")
    sub.alpha_composite(layer.crop((x0 - x, y0 - y, x1 - x, y1 - y)))
    frame[y0:y1, x0:x1] = np.asarray(sub.convert("RGB"))


# ---------------------------------------------------------------- frames
def frames(mv, lut, t0, t1):
    t0 = round(t0 * FPS) / FPS                       # stay on the frame grid, so frame numbers never collide
    n = int(round((t1 - t0) * FPS))
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t0:.4f}", "-i", mv, "-frames:v", str(n), "-vf", f"lut3d={lut}",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    i = 0
    while True:
        buf = p.stdout.read(WID * HEI * 3)
        if len(buf) < WID * HEI * 3:
            break
        yield t0 + i / FPS, np.frombuffer(buf, np.uint8).reshape(HEI, WID, 3).copy()
        i += 1
    p.wait()


# ---------------------------------------------------------------- the edits
class Lyric:
    """an animated lyric line: erase the old words (by colour inside a region), draw the new ones in their place"""

    def __init__(self, t0, t1, region, core, block, spread=320, settled=None, near_dark=8, grow=3,
                 angle=0.0, exclude=None, offset=(0, 0)):
        self.t0, self.t1, self.region, self.core, self.block = t0, t1, region, core, block
        self.spread, self.settled, self.near_dark, self.grow = spread, settled, near_dark, grow
        self.angle, self.exclude, self.offset = angle, exclude, offset
        self.stats = {}

    def mask(self, frame, t):
        box = clip_box(self.region(t))
        sub = frame[box[1]:box[3], box[0]:box[2]]
        core = self.core(sub)
        if self.exclude is not None:
            yy, xx = np.mgrid[box[1]:box[3], box[0]:box[2]]
            core &= ~self.exclude(t, xx, yy)
        full = core | (m_dark(sub) & near(core, self.near_dark))
        return box, core, full

    def measure(self, t, frame):
        box, core, _ = self.mask(frame, t)
        ys, xs = np.nonzero(core)
        if len(xs) < 50:
            self.stats[round(t * FPS)] = (0, None)
            return
        cx = (np.percentile(xs, 3) + np.percentile(xs, 97)) / 2 + box[0]
        cy = (np.percentile(ys, 3) + np.percentile(ys, 97)) / 2 + box[1]
        self.stats[round(t * FPS)] = (len(xs), (cx, cy))

    def finish(self):
        """assembly per frame (area / settled area) and a smoothed centre held through the fly-in and fly-out"""
        ks = sorted(self.stats)
        if not ks:
            self.a, self.cen = {}, {}
            return
        areas = np.array([self.stats[k][0] for k in ks], float)
        if self.settled:
            sel = [i for i, k in enumerate(ks) if self.settled[0] <= k / FPS <= self.settled[1]]
            ref = np.median(areas[sel]) if sel else areas.max()
        else:
            ref = np.percentile(areas, 80)
        a = np.clip(areas / max(ref, 1), 0, 1)
        a = np.convolve(np.pad(a, 2, mode="edge"), np.ones(5) / 5, "valid")
        cs = [self.stats[k][1] for k in ks]
        good = [i for i in range(len(ks)) if cs[i] is not None and a[i] > 0.85]
        cen = []
        for i in range(len(ks)):
            j = min(good, key=lambda g: abs(g - i)) if good else None
            if j is None:
                cen.append(None)
                continue
            win = [cs[g] for g in good if abs(g - i) <= 3 and abs(g - j) <= 6] or [cs[j]]
            cen.append((float(np.median([c[0] for c in win])), float(np.median([c[1] for c in win]))))
        self.a = dict(zip(ks, a))
        self.cen = dict(zip(ks, cen))

    def apply(self, t, frame):
        k = round(t * FPS)
        box, _, full = self.mask(frame, t)
        erase(frame, box, full, grow=self.grow)
        a, c = self.a.get(k, 0), self.cen.get(k)
        if c is not None and a > 0.03:
            lay = self.block.layer(a, self.spread, t, jitter=1.0)
            if self.angle:
                lay = lay.rotate(self.angle, resample=Image.BICUBIC, expand=True)
            paste(frame, lay, (c[0] + self.offset[0], c[1] + self.offset[1]))


def run(args):
    F = args.fonts
    font = {k: os.path.join(F, f"{k}.ttf") for k in ("luckiest-guy", "chewy", "pirata-one", "m-plus-rounded-1c")}
    avatar = Image.open(args.avatar).convert("RGB").resize((76, 76), Image.LANCZOS)
    circ = Image.new("L", (76, 76), 0)
    ImageDraw.Draw(circ).ellipse((0, 0, 75, 75), fill=255)
    avatar.putalpha(circ)

    ui = lambda txt, size, col=CREAM, max_w=None: TextBlock([txt], font["m-plus-rounded-1c"], size, col, max_w=max_w, align="left")
    t_name = ui(CHANNEL, 31, max_w=212)
    t_chip = ui("From " + CHANNEL, 24, max_w=300)
    t_side = ui(CHANNEL, 17, UI_GREY, max_w=150)
    t_side_title = ui("Tsurumaki Maki", 18, max_w=150)
    t_title = ui(NEW_TITLE, 34, max_w=700)
    t_title_fs = ui(NEW_TITLE, 44, max_w=1150)
    t_credit = TextBlock(["Tsurumaki Maki"], font["pirata-one"], 128, CREAM, (16, 12, 12), 7, GOLD, (7, 9), rot=0.05, wobble=0.04, seed=4)
    t_credit_small = TextBlock(["Tsurumaki Maki"], font["pirata-one"], 66, CREAM, (16, 12, 12), 4, GOLD, (3, 4), rot=0.05, wobble=0.04, seed=4)

    lyrics = [
        Lyric(82.40, 84.62, lambda t: (480, 330, 1440, 960), m_gold,
              TextBlock(["INVITE THIS CROWD", "TO DANCE TONIGHT"], font["luckiest-guy"], 92, GOLD, None, 0, DARK, (5, 6),
                        line_gap=1.05, wobble=0.05, rot=0.09, arc=0.25, seed=11),
              spread=300, settled=(83.2, 84.2)),
        Lyric(177.40, 180.95, lambda t: (190, 150, 1160, 580), lambda s: m_cream(s) | m_gold(s),
              TextBlock(["Free thy body and", "thy mind"], font["chewy"], 100, CREAM, GOLD, 4,
                        line_gap=1.0, wobble=0.06, rot=0.1, seed=12),
              spread=260, settled=(178.2, 180.2), near_dark=0, grow=3),
        Lyric(180.55, 182.62, lambda t: (470, 360, 1430, 780), lambda s: m_cream(s) | m_gold(s),
              TextBlock(["Lift up this soul", "into the light"], font["chewy"], 100, CREAM, GOLD, 4,
                        line_gap=1.0, wobble=0.06, rot=0.1, seed=13),
              spread=260, settled=(181.2, 182.2), near_dark=0, grow=3),
        # the "vocal Kasane Teto" credit, full screen and in the page's player
        Lyric(13.40, 16.00, lambda t: (470, 525, 1500, 700), m_credit,
              t_credit, spread=0, settled=(14.0, 15.5), near_dark=10, grow=3, offset=(0, 10)),
        # the closing STARRING sign: "KASANE / TETO" (its cross is the T) -> "TSURUMAKI / MAKI", tilted like the sign.
        # From 3:25 Maki leans in from the right: keep off her hair.
        Lyric(203.55, 206.95, lambda t: (380, 380, 1030, 700) if t < 205.0 else (380, 400, 1015, 770),
              lambda s: m_dark(s, 0.3),
              TextBlock(["TSURUMAKI", "MAKI"], font["luckiest-guy"], 82, (46, 42, 40), line_gap=0.92, rot=0.05, wobble=0.03, seed=6),
              spread=0, settled=(203.8, 204.8), near_dark=0, grow=3, angle=-13,
              exclude=lambda t, xx, yy: (xx > 905 + (yy - 400) * 0.45) if t >= 205.0 else np.zeros(xx.shape, bool)),
    ]
    if args.stills:
        times = [float(x) for x in args.stills.split(",")]
        t_lo, t_hi = min(times) - 0.5, max(times) + 0.5
    elif args.range:
        t_lo, t_hi = args.range
    else:
        t_lo, t_hi = 0.0, 208.98

    # pass 1: where and how complete each old lyric is, frame by frame
    for L in lyrics:
        a, b = max(L.t0, t_lo - 1), min(L.t1, t_hi + 1)
        if a < b:
            for t, fr in frames(args.mv, args.lut, a, b):
                L.measure(t, fr)
            L.finish()

    ref = next(frames(args.mv, args.lut, 18.0, 18.0 + 1 / FPS))[1]   # templates cut from the page at 0:18
    name_tpl = ref[890:938, 128:305].copy()                          # "Vane Lily" under the player
    side_tpl = ref[309:331, 1735:1843].copy()                        # "Vane Lily" under a sidebar video
    harl_tpl = ref[222:302, 1735:1880].copy()                        # "Harlequin / Contraption ft / Kasane Teto"
    last_off = [0, 0]

    def page_offset(fr):
        x0, y0 = PAGE_REF[0] - 50, PAGE_REF[1] - 40
        win = fr[y0:y0 + name_tpl.shape[0] + 80, x0:x0 + name_tpl.shape[1] + 100]
        r = cv2.matchTemplate(win, name_tpl, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx > 0.45:
            last_off[:] = [x0 + loc[0] - PAGE_REF[0], y0 + loc[1] - PAGE_REF[1]]
        return last_off

    def ui_replace(fr, box, block, color_thr=0.55, anchor="left", flip=False):
        box = clip_box(box)
        sub = fr[box[1]:box[3], box[0]:box[2]]
        erase(fr, box, m_light(sub, color_thr), grow=2, radius=4)
        lay = block.layer(spread=0)
        if anchor == "left":
            c = (box[0] + 4 + block.w / 2, (box[1] + box[3]) / 2)
            c = (c[0], c[1])
        paste(fr, lay, c, flip_v=flip)

    def edit(t, fr):
        for L in lyrics:
            if L.t0 <= t < L.t1:
                L.apply(t, fr)
        if 14.70 <= t < 16.0:                                    # full-screen player title
            ui_replace(fr, (60, 22, 1200, 112), t_title_fs, 0.6)
        if PAGE_T[0] <= t < PAGE_T[1]:
            dx, dy = page_offset(fr)
            # avatar and channel name
            cx, cy = 84 + dx, 916 + dy
            fr_av = Image.fromarray(fr[cy - 40:cy + 40, cx - 40:cx + 40]).convert("RGBA")
            ring = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
            ImageDraw.Draw(ring).ellipse((1, 1, 78, 78), fill=(24, 24, 24, 255))
            fr_av.alpha_composite(ring)
            fr_av.alpha_composite(avatar, (2, 2))
            fr[cy - 40:cy + 40, cx - 40:cx + 40] = np.asarray(fr_av.convert("RGB"))
            ui_replace(fr, (124 + dx, 886 + dy, 312 + dx, 942 + dy), t_name)
            ui_replace(fr, (1380 + dx, 131 + dy, 1600 + dx, 172 + dy), t_chip, 0.5)
            if t < 16.95:                                         # the page's title for this video
                ui_replace(fr, (54 + dx, 818 + dy, 742 + dx, 874 + dy), t_title)
            if 27.9 <= t:                                         # its upside-down glitch copy
                ui_replace(fr, (54 + dx, 808 + dy, 742 + dx, 876 + dy), t_title, flip=True)
            if 16.0 <= t < 16.95:                                 # the credit in the page's small player
                box = clip_box((360 + dx, 452 + dy, 975 + dx, 545 + dy))
                sub = fr[box[1]:box[3], box[0]:box[2]]
                core = m_credit(sub)
                erase(fr, box, core | (m_dark(sub) & near(core, 6)), grow=2)
                paste(fr, t_credit_small.layer(spread=0), ((box[0] + box[2]) / 2 + 6, (box[1] + box[3]) / 2 + 2))
            # sidebar: the channel line under each video, and our song's entry
            sx0, sy0, sx1, sy1 = clip_box((1700 + dx, 150 + dy, 1920, 1080))
            col = fr[sy0:sy1, sx0:sx1]
            r = cv2.matchTemplate(col, side_tpl, cv2.TM_CCOEFF_NORMED)
            th, tw = side_tpl.shape[:2]
            for _ in range(8):
                _, mx, _, loc = cv2.minMaxLoc(r)
                if mx < 0.38:
                    break
                # block this line and the grey "... ago" line under it
                r[max(0, loc[1] - th):loc[1] + 40, max(0, loc[0] - tw):loc[0] + tw] = -1
                x, y = sx0 + loc[0], sy0 + loc[1]
                patch = fr[y:y + th, x:x + tw]
                v = hsv(patch)[2]
                bright = v[v > 0.4]
                if len(bright) < 20 or not (0.45 < np.median(bright) < 0.78):   # channel lines are grey, titles cream
                    continue
                ui_replace(fr, (x - 3, y - 3, x + tw + 8, y + th + 3), t_side, 0.45)
            r = cv2.matchTemplate(col, harl_tpl, cv2.TM_CCOEFF_NORMED)
            _, mx, _, loc = cv2.minMaxLoc(r)
            if mx > 0.40:                                         # third line of "Harlequin / Contraption ft / Kasane Teto"
                x, y = sx0 + loc[0], sy0 + loc[1] + harl_tpl.shape[0] - 20
                ui_replace(fr, (x - 3, y - 2, x + 150, y + 21), t_side_title, 0.5)

    if args.stills:
        outdir = os.path.dirname(os.path.abspath(args.out))
        for ts in times:
            fr = next(frames(args.mv, args.lut, ts, ts + 1 / FPS))[1]
            edit(ts, fr)
            Image.fromarray(fr).save(os.path.join(outdir, f"edit-{ts:.2f}.png"))
            print("still", ts)
        return
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WID}x{HEI}",
                            "-r", str(FPS), "-i", "-", "-ss", f"{t_lo:.4f}", "-t", f"{t_hi - t_lo:.4f}", "-i", args.audio,
                            "-af", f"adelay={int(AUDIO_DELAY * 1000)}:all=1", "-map", "0:v", "-map", "1:a",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", args.out], stdin=subprocess.PIPE)
    n = 0
    for t, fr in frames(args.mv, args.lut, t_lo, t_hi):
        edit(t, fr)
        enc.stdin.write(fr.tobytes())
        n += 1
        if n % 600 == 0:
            print(f"{t:.1f} s")
    enc.stdin.close()
    enc.wait()
    print(f"{args.out}: {n} frames")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for k in ("mv", "lut", "audio", "avatar", "fonts", "out"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--stills")
    ap.add_argument("--range", nargs=2, type=float)
    run(ap.parse_args())
