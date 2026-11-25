"""The original Harlequin Contraption MV, edited for the Tsurumaki Maki cover.

    python -I mv_recolor.py --mv mv.mp4 --lut maki.cube --audio cover.wav --avatar avatar.jpg --fonts DIR --thumbs DIR --clips DIR --out out.mp4
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


def erase(frame, box, mask, grow=2, radius=5, grain=True):
    """inpaint mask (box-local) inside frame[box]; add back the paper grain the inpainting smooths away"""
    x0, y0, x1, y1 = box
    sub = np.ascontiguousarray(frame[y0:y1, x0:x1])
    m = near(mask, grow).astype(np.uint8) * 255
    if not m.any():
        return
    out = cv2.inpaint(sub, m, radius, cv2.INPAINT_TELEA)
    if grain:
        g = cv2.cvtColor(sub, cv2.COLOR_RGB2GRAY).astype(np.float32)
        hp = g - cv2.GaussianBlur(g, (0, 0), 2)
        keep = m == 0
        sigma = float(np.clip(1.4826 * np.median(np.abs(hp[keep])), 0, 9)) if keep.any() else 0.0
        if sigma > 0.3:
            noise = cv2.GaussianBlur(np.random.default_rng().normal(0, sigma * 1.3, g.shape).astype(np.float32), (0, 0), 0.7)
            hole = m > 0
            o = out.astype(np.float32)
            o[hole] += noise[hole][:, None]
            out = np.clip(o, 0, 255).astype(np.uint8)
    frame[y0:y1, x0:x1] = out


def thin_lines(mask, k):
    """the thin strokes of a mask (blobs wider than k removed), without the rims of those blobs"""
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blobs = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, ker) > 0
    return mask & ~blobs & ~near(blobs, 4)


def m_goldish(img, s0=0.3, v0=0.35, h0=30, h1=62):
    h, s, v = hsv(img)
    return (h > h0) & (h < h1) & (s > s0) & (v > v0)


def wrap(text, font, width):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if font.getlength(t) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + ([cur] if cur else [])


def draw_lines(frame, x, y, items):
    """items: (text, font, colour, line height); draws left-aligned lines from (x, y) downwards"""
    h = int(sum(it[3] for it in items)) + 8
    x0, y0 = max(0, int(x) - 2), max(0, int(y) - 4)
    x1, y1 = WID, min(HEI, y0 + h + 8)
    if y1 <= y0:
        return
    im = Image.fromarray(frame[y0:y1, x0:x1])
    d = ImageDraw.Draw(im)
    yy = y - y0
    for text, font, col, lh in items:
        d.text((x - x0, yy), text, font=font, fill=col)
        yy += lh
    frame[y0:y1, x0:x1] = np.asarray(im)


def easeOutBack(t):
    """0..1 with a little overshoot, for things popping in"""
    t = min(1.0, max(0.0, t))
    return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2


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



# ---------------------------------------------------------------- the sidebar
def row_runs(flags, gap):
    """(start, end) of runs of True, bridging gaps up to `gap`"""
    out, start, last = [], None, None
    for i, v in enumerate(flags):
        if v:
            if start is None:
                start = i
            last = i
        elif start is not None and i - last > gap:
            out.append((start, last))
            start = None
    if start is not None:
        out.append((start, last))
    return out


def side_text_blocks(fr, y_lo=150, y_hi=1080):
    """the text blocks of the sidebar videos: rows of light, unsaturated text in the text column"""
    h, s, v = hsv(fr[y_lo:y_hi, 1726:1918])
    rows = ((v > 0.45) & (s < 0.3)).sum(1) > 2
    return [(a + y_lo, b + y_lo) for a, b in row_runs(rows, 16) if b - a > 18]


def side_thumbs(fr):
    """vertical extents of the sidebar thumbnails"""
    rows = hsv(fr[150:1080, 1365:1705])[2].mean(1) > 0.2
    return [(a + 150, b + 150) for a, b in row_runs(rows, 3) if b - a > 120]


def cartoon(img):
    """a thumbnail drawn like the MV: flat colours, inked edges"""
    a = img
    for _ in range(2):
        a = cv2.bilateralFilter(a, 9, 60, 9)
    z = a.reshape(-1, 3).astype(np.float32)
    _, lab, cen = cv2.kmeans(z, 10, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 3,
                             cv2.KMEANS_PP_CENTERS)
    a = cen[lab.flatten()].reshape(a.shape).astype(np.uint8)
    edges = cv2.adaptiveThreshold(cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), 5), 255,
                                  cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 4)
    a[edges == 0] = (24, 20, 18)
    return a


def boil(img, phase, amp=1.4):
    """hand-drawn boil: a small smooth wobble that changes every phase"""
    h, w = img.shape[:2]
    rng = np.random.default_rng(1000 + phase)
    dx = cv2.resize(rng.normal(0, amp, (6, 10)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    dy = cv2.resize(rng.normal(0, amp, (6, 10)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    xx, yy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def put_thumb(fr, y0, y1, img, phase):
    """Replace the sidebar thumbnail between rows y0..y1 with img. Each row is filled between the original
    thumbnail's own left and right edge in that row, so the new picture keeps the original's rough paper edge and,
    in the glitch frames, its torn rows (rows that jump sideways move the new picture with them)."""
    Y0, Y1, X0, X1 = max(0, y0 - 14), min(HEI, y1 + 14), 1338, 1726
    sub = fr[Y0:Y1, X0:X1]
    h, s, v = hsv(sub)
    # orange drawn over the page (light rays, the lyric's flying letters) must stay on top of the new picture
    XO = X0 - 1000
    hw, sw, vw = hsv(fr[Y0:Y1, 1000:X1])
    orange_w = (hw > 15) & (hw < 45) & (sw > 0.6) & (vw > 0.7)
    orange = orange_w[:, XO:]
    chunky = cv2.morphologyEx(orange_w[:, :XO].astype(np.uint8), cv2.MORPH_OPEN,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    lrow = cv2.dilate((chunky.sum(1) > 12).astype(np.uint8)[:, None], np.ones((91, 1), np.uint8))[:, 0] > 0
    # the thumbnail's silhouette: its light pixels, with the dark parts inside it closed up (sideways first, so the
    # row edges, and with them any glitch tearing, stay where they are)
    m = cv2.morphologyEx((v > 0.2).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((1, 81), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((31, 1), np.uint8))
    rows = np.nonzero(m.sum(1) > 150)[0]
    rows = rows[(rows >= y0 - Y0 - 8) & (rows <= y1 - Y0 + 8)]
    if len(rows) < 80:
        return
    xl = np.full(len(sub), -1)
    xr = np.full(len(sub), -1)
    for r in rows:
        xs = np.nonzero(m[r])[0]
        xl[r], xr[r] = xs[0], xs[-1] + 1
    base_l, base_r = int(np.median(xl[rows])), int(np.median(xr[rows]))
    top, bot = int(rows[0]), int(rows[-1])
    W_, H_ = base_r - base_l, bot - top + 1
    if W_ < 200 or H_ < 100:
        return
    rng = np.random.default_rng(2000 + phase)
    pic = boil(cv2.resize(img, (W_, H_), interpolation=cv2.INTER_AREA), phase)
    pic = np.clip(pic.astype(np.float32) + rng.normal(0, 3.5, pic.shape[:2])[..., None], 0, 255).astype(np.uint8)
    region = np.zeros(sub.shape[:2], bool)
    canvas = sub.copy()
    for r in range(top, bot + 1):
        if xl[r] < 0:
            continue
        shift = xl[r] - base_l if abs(xl[r] - base_l) > 4 else 0           # torn rows move sideways
        a_, b_ = max(0, xl[r]), min(sub.shape[1], xr[r])
        src = np.arange(a_, b_) - base_l - shift
        ok = (src >= 0) & (src < W_)
        canvas[r, a_:b_][ok] = pic[r - top, src[ok]]
        region[r, a_:b_] = True
    # which orange shapes are overlays: they reach outside the thumbnail (the light rays at 0:17; the lyric letters are
    # erased before this, see erase_lyrics)
    n, lab, st, _ = cv2.connectedComponentsWithStats(orange_w.astype(np.uint8), connectivity=8)
    inside = np.zeros(orange_w.shape, bool)
    inside[:, XO:] = near(region, 10)
    outside_px = np.bincount(lab[~inside & (lab > 0)], minlength=n)
    keep = outside_px > 30
    keep[0] = False
    letters = near(keep[lab][:, XO:], 2)
    # cover what is left of the original around it (its rim and dark outline) with the page background
    cover = near(region, 6) & ~region & ~letters
    bg = np.median(sub[(v < 0.2) & ~near(region, 10)], axis=0) if ((v < 0.2) & ~near(region, 10)).any() else np.array([26, 22, 20])
    noise = rng.normal(0, 3.0, sub.shape[:2])[..., None]
    canvas[cover] = np.clip(bg + noise[cover], 0, 255).astype(np.uint8)
    edge = region & ~cv2.erode(region.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))).astype(bool)
    canvas[edge] = (20, 16, 14)                                          # inked rim
    canvas[letters] = sub[letters]
    fr[Y0:Y1, X0:X1] = canvas



# ---------------------------------------------------------------- the player
def lemonade_card(w, h, phase, jp_font, mood=None):
    """an animated title card for LEMONADE (no video of it here): lemon slices turning, bubbles rising.
    mood 0/1: the slices get faces and notice the thumbnails flipping (0 shocked, 1 panicking)"""
    y = np.linspace(0, 1, h)[:, None, None]
    im = Image.fromarray((np.array([255, 226, 96]) * (1 - y) + np.array([246, 170, 36]) * y).repeat(w, 1).astype(np.uint8))
    d = ImageDraw.Draw(im)
    ink = (60, 36, 10)
    rng = np.random.default_rng(7)
    for k in range(18):                                                   # bubbles
        bx = rng.uniform(0, w)
        by = (rng.uniform(0, h) - phase * rng.uniform(4, 9)) % (h + 60) - 30
        r = rng.uniform(6, 18)
        d.ellipse((bx - r, by - r, bx + r, by + r), outline=(255, 250, 225), width=3)
    jr = np.random.default_rng(900 + phase)
    shake = lambda amp: (jr.uniform(-amp, amp), jr.uniform(-amp, amp)) if mood is not None else (0, 0)
    for n, (cx, cy, r, sp) in enumerate(((0.82, 0.68, 0.36, 2.0), (0.14, 0.2, 0.22, -3.0), (0.1, 0.9, 0.16, 4.0))):
        sx, sy = shake(5 if mood == 0 else 12)
        cx, cy, r = cx * w + sx, cy * h + sy, r * h
        a0 = np.radians(phase * sp) if mood is None else np.radians(phase * sp * 0.2)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 246, 186), outline=ink, width=5)
        d.ellipse((cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86), outline=(242, 196, 50), width=7)
        for j in range(8):
            a = a0 + j * np.pi / 4
            d.line((cx, cy, cx + np.cos(a) * r * 0.8, cy + np.sin(a) * r * 0.8), fill=(240, 200, 60), width=6)
        if mood is not None:                                             # a face, eyes turned to the sidebar (right)
            look = r * 0.06
            for ex in (-0.32, 0.32):
                X, Y, er = cx + ex * r, cy - 0.1 * r, 0.2 * r
                d.ellipse((X - er, Y - er * 1.15, X + er, Y + er * 1.15), fill=(255, 255, 255), outline=ink, width=5)
                pr = er * (0.22 if mood == 0 else 0.3)
                px = X + look + (jr.uniform(-2, 2) if mood == 1 else 0)
                d.ellipse((px - pr, Y - pr, px + pr, Y + pr), fill=ink)
            mw, mh = 0.16 * r, (0.22 if mood == 0 else 0.3) * r
            d.ellipse((cx - mw, cy + 0.35 * r - mh / 2, cx + mw, cy + 0.35 * r + mh / 2), fill=(120, 30, 30), outline=ink, width=4)
            if mood == 1:                                                # sweat
                for k in range(2):
                    X, Y, q = cx + r * (0.75 + 0.15 * k), cy - r * (0.55 - 0.3 * k), r * 0.09
                    d.polygon([(X, Y - q * 2.2), (X - q, Y), (X + q, Y)], fill=(150, 210, 255), outline=ink)
                    d.ellipse((X - q, Y - q, X + q, Y + q), fill=(150, 210, 255), outline=ink, width=3)
    f = ImageFont.truetype(jp_font, int(h * 0.26))
    bob = 6 * np.sin(phase * 0.4)
    tx, ty = shake(6 if mood == 0 else 14)
    d.text((w / 2 + tx, h / 2 + bob + ty), "レモネード", font=f, anchor="mm", fill=(255, 255, 255), stroke_width=12, stroke_fill=ink)
    if mood is not None:                                                 # "!!" toward the sidebar
        fb = ImageFont.truetype(jp_font, int(h * (0.2 if mood == 0 else 0.26)))
        d.text((w * 0.9 + tx, h * 0.18 + ty), "!" if mood == 0 else "!!", font=fb, anchor="mm", fill=(230, 50, 40),
               stroke_width=8, stroke_fill=ink)
    return np.asarray(im)


# ---------------------------------------------------------------- reactions
# when the thumbnails start flipping (0:24.6-0:27.9) the characters in the player notice, like the original's do;
# each song's appearances escalate (from the title under the player, frame by frame)
REACT_SEGS = [(24.63, 25.13, "signaling", 0), (25.13, 25.63, "wtti", 0), (25.63, 26.03, "lemonade", 0),
              (26.03, 26.53, "signaling", 1), (26.53, 26.97, "wtti", 1), (26.97, 27.47, "lemonade", 1),
              (27.47, 27.95, "signaling", 2)]


def shock_marks(d, x, y, s, col=(255, 255, 255), ink=(30, 20, 20)):
    """three short strokes fanning out from a point (manga shock lines)"""
    for a in (-0.9, -0.45, 0.0):
        x0, y0 = x + np.sin(a) * s * 0.5, y - np.cos(a) * s * 0.5
        x1, y1 = x + np.sin(a) * s * 1.3, y - np.cos(a) * s * 1.3
        d.line((x0, y0, x1, y1), fill=ink, width=12)
        d.line((x0, y0, x1, y1), fill=col, width=6)


def signaling_react(w, h, k, local, cels, phase):
    """Rei (orange panel) and Corrupt-Chan (purple panel), as in the Signaling MV, reacting to the flipping"""
    navy, orange, purple = (22, 18, 46), (240, 138, 42), (132, 74, 236)
    im = Image.new("RGB", (w, h), navy)
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(700 + phase)
    def panel(x0, x1, col, name, mark):
        d.rectangle((x0, 0, x1, h), fill=col)
        cx = (x0 + x1) / 2
        lite = tuple(min(255, int(c * 1.18 + 20)) for c in col)
        for rr in (0.22, 0.38, 0.56):
            d.ellipse((cx - rr * h, h * 0.55 - rr * h, cx + rr * h, h * 0.55 + rr * h), outline=lite, width=3)
        for (ax, ay, bx, by) in ((x0 + 14, 14, x0 + 70, 14), (x0 + 14, 14, x0 + 14, 70), (x1 - 14, h - 14, x1 - 70, h - 14),
                                 (x1 - 14, h - 14, x1 - 14, h - 70)):
            d.line((ax, ay, bx, by), fill=(255, 255, 255), width=3)
        c = cels[name]
        sc = h * 1.04 / c.height
        cw, ch = int(c.width * sc), int(c.height * sc)
        sx, sy = rng.uniform(-9, 9), rng.uniform(-5, 5)                      # the shock jolts her
        im.paste(c.resize((cw, ch), Image.LANCZOS), (int(cx - cw / 2 + sx), int(h - ch + 20 + sy)), c.resize((cw, ch), Image.LANCZOS))
        if mark:
            shock_marks(d, cx + cw * 0.3 + sx, h * 0.16 + sy, 60)
    if k == 0:
        panel(300, 900, orange, "rei_mouth" if local < 0.27 else "rei_startle", True)
    elif k == 1:
        panel(300, 900, purple, "cc_startle" if local < 0.25 else "cc_mouth", True)
    else:
        panel(30, 590, orange, "rei_cheeks", True)
        panel(607, 1167, purple, "cc_head" if local < 0.24 else "cc_cheeks", True)
    return np.asarray(im)


PIX = {"!": ["1", "1", "1", "0", "1"], "?": ["111", "001", "011", "000", "010"]}


def wtti_react(w, h, k, local, sprite, phase, font_path):
    """pixel Teto (the Welcome To The Internet MV's sprite) notices: an RPG emote balloon, a hop or a shake"""
    y = np.linspace(0, 1, h)[:, None, None]
    im = Image.fromarray((np.array([96, 22, 34]) * (1 - y) + np.array([40, 8, 16]) * y).repeat(w, 1).astype(np.uint8))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(31)
    f = ImageFont.truetype(font_path, 54)
    for n in range(10):                                                  # the MV's "wwww" spam drifting by
        col = [(240, 90, 200), (90, 230, 90), (90, 150, 255), (250, 230, 80)][n % 4]
        x = (rng.uniform(-200, w) + phase * rng.uniform(6, 14)) % (w + 300) - 250
        d.text((x, rng.uniform(0, h - 60)), "w" * int(rng.integers(4, 9)), font=f, fill=col)
    C = 13                                                               # screen pixels per sprite pixel
    sw, sh = sprite.width, sprite.height
    big = sprite.resize((sw * C, sh * C), Image.NEAREST)
    x0, y0 = w // 2 - sw * C // 2, h - sh * C - 26
    if k == 0:                                                           # a hop on the "!"
        y0 -= C * (3 if local < 0.1 else 2 if local < 0.18 else 1 if local < 0.24 else 0)
    else:                                                                # shaking on "?!"
        x0 += C * (1 if (phase % 2) else -1)
    im.paste(big, (x0, y0), big)
    glyphs = "!" if k == 0 else "?!"
    gw = sum(len(PIX[g][0]) for g in glyphs) + (len(glyphs) - 1)
    bw, bh = gw + 4, 9                                                   # the balloon, in sprite pixels
    bx, by = x0 + (sw - 4) * C, y0 - (bh + 1) * C
    for j in range(bh):
        for i in range(bw):
            edge = i in (0, bw - 1) or j in (0, bh - 1)
            corner = (i in (0, bw - 1)) and (j in (0, bh - 1))
            if corner:
                continue
            d.rectangle((bx + i * C, by + j * C, bx + (i + 1) * C - 1, by + (j + 1) * C - 1),
                        fill=(20, 16, 20) if edge else (255, 255, 255))
    for i in range(2):                                                   # tail toward her head
        d.rectangle((bx + (1 + i) * C, by + (bh + i) * C, bx + (2 + i) * C - 1, by + (bh + 1 + i) * C - 1), fill=(20, 16, 20))
    gx = bx + 2 * C
    for g in glyphs:
        for j, row in enumerate(PIX[g]):
            for i, ch in enumerate(row):
                if ch == "1":
                    d.rectangle((gx + i * C, by + (2 + j) * C, gx + (i + 1) * C - 1, by + (3 + j) * C - 1), fill=(220, 30, 40))
        gx += (len(PIX[g][0]) + 1) * C
    if k == 1:                                                           # a sweat drop by her head
        for (i, j) in ((1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2), (1, 3)):
            d.rectangle((x0 - 3 * C + i * C, y0 + 8 * C + j * C, x0 - 2 * C + i * C - 1, y0 + 9 * C + j * C - 1), fill=(130, 200, 255))
    return np.asarray(im)


def find_bubbles(sub):
    """speech bubbles in the original player: big cream shapes with writing inside; their boxes"""
    h, s, v = hsv(sub)
    cream = ((v > 0.85) & (s < 0.25)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cream)
    out = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 4000:
            continue
        cnts, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled = np.zeros(cream.shape, np.uint8)
        cv2.drawContours(filled, cnts, -1, 1, -1)
        if ((filled > 0) & (lab != i) & (v < 0.35)).sum() > 300:
            x, y, bw, bh = cv2.boundingRect(filled)
            out.append((x, y, x + bw, y + bh, filled > 0))
    return sorted(out, key=lambda b: b[1])


def cartoon_fast(img):
    """cartoon() at half size, back up: same look, a quarter of the work"""
    h, w = img.shape[:2]
    return cv2.resize(cartoon(cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)), (w, h),
                      interpolation=cv2.INTER_LINEAR)


def lyric_letters(sub):
    """the MV's lyric letters in the player: orange-gold shapes, letter sized, several in a row.
    Returns (all orange-gold pixels, the sure letters, how many letters)."""
    h, s, v = hsv(sub)
    col = ((h > 12) & (h < 62) & (s > 0.5) & (v > 0.55)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(col)
    H, W, A = st[:, cv2.CC_STAT_HEIGHT], st[:, cv2.CC_STAT_WIDTH], st[:, cv2.CC_STAT_AREA]
    cand = np.nonzero((H >= 12) & (H <= 90) & (W <= 140) & (A >= 30) & (A <= 6000))[0]
    cand = cand[cand > 0]
    cy = st[cand, cv2.CC_STAT_TOP] + H[cand] / 2
    line = [c for c, y in zip(cand, cy) if (np.abs(cy - y) < 30).sum() >= 5]   # letters sit in a row
    return col.astype(bool), np.isin(lab, line), len(line)


def player_overlays(sub, bubbles, band_fill=True, letters=True):
    """what the MV draws over the video in the player: its lyric lines (and, optionally, speech bubbles).
    band_fill: also keep orange right next to the letters (letters touching the art). letters=False: leave the lyric
    letters out (they're shown in a speech bubble instead)."""
    h, s, v = hsv(sub)
    keep = np.zeros(sub.shape[:2], bool)
    if bubbles:
        for *_, shape in find_bubbles(sub):                               # the bubble itself and its dark outline
            keep |= near(shape, 7)
    col, sure, n = lyric_letters(sub)
    if n and letters:
        ys = np.nonzero(sure.any(1))[0]
        band = np.zeros(col.shape, bool)
        band[max(0, ys.min() - 8):ys.max() + 9] = True
        keep |= near(sure | ((col & band & near(sure, 40)) if band_fill else False), 4)
    return keep


def erase_lyrics(fr, pbox, hold):
    """the MV's orange lyric line over the YouTube page (it is shown in a speech bubble in the player instead): its
    letters and their dark outline are erased outside the player (the player is replaced without them) and outside
    the sidebar thumbnails (replaced too). hold: the last line's rows, for frames where it can't be read"""
    y0, y1 = 100, 1000
    col, sure, n = lyric_letters(fr[y0:y1])
    if n:
        ys = np.nonzero(sure.any(1))[0]
        hold.update(rows=(ys.min() + y0, ys.max() + y0))
    if not hold.get("rows"):
        return
    r0, r1 = hold["rows"]
    box = clip_box((pbox[2] - 6, r0 - 14, WID, r1 + 16))                 # right of the player: page, sidebar text
    sub = fr[box[1]:box[3], box[0]:box[2]]
    h, s, v = hsv(sub)
    letters = (h > 12) & (h < 62) & (s > 0.5) & (v > 0.55)
    for u0, u1 in side_thumbs(fr):                                        # thumbnails are replaced whole
        letters[max(0, u0 - box[1] - 6):max(0, u1 - box[1] + 6), max(0, 1345 - box[0]):max(0, 1726 - box[0])] = False
    erase(fr, box, letters | (m_dark(sub, 0.3) & near(letters, 6)), grow=2, radius=5)


def fill_smooth(fr, box, mask, exclude=None, scales=(12, 40, 120)):
    """fill mask (box-local) with the surrounding colours spread smoothly into it (normalised blur at two scales), plus
    paper grain: no streaks or blotches like inpainting leaves over big areas"""
    x0, y0, x1, y1 = box
    sub = fr[y0:y1, x0:x1]
    if not mask.any():
        return
    src = sub.astype(np.float32)
    valid = (~mask & (~exclude if exclude is not None else True)).astype(np.float32)
    est = np.zeros_like(src)
    have = np.zeros(mask.shape, bool)
    for sg in scales:
        num = cv2.GaussianBlur(src * valid[..., None], (0, 0), sg)
        den = cv2.GaussianBlur(valid, (0, 0), sg)
        ok = (den > 0.08) & ~have
        est[ok] = num[ok] / den[ok][:, None]
        have |= ok
    if not have.all():                                                   # nothing near enough: the average colour
        est[~have] = np.median(src[valid > 0], axis=0) if (valid > 0).any() else src[~mask].mean(0)
    g = cv2.cvtColor(sub, cv2.COLOR_RGB2GRAY).astype(np.float32)
    hp = g - cv2.GaussianBlur(g, (0, 0), 2)
    sigma = float(np.clip(1.4826 * np.median(np.abs(hp[~mask])), 0.5, 8)) if (~mask).any() else 2.0
    noise = cv2.GaussianBlur(np.random.default_rng().normal(0, sigma * 1.3, g.shape).astype(np.float32), (0, 0), 0.7)
    out = np.clip(est + noise[..., None], 0, 255).astype(np.uint8)
    sub[mask] = out[mask]


def dehorn(fr, t):
    """Teto's masquerade mask (1:34-1:41) has two horns on its top, sometimes drawn as part of the mask and sometimes as
    shapes of their own: cut them off. The mask is the biggest light, unsaturated shape; it's levelled by the line through
    its eye holes when both show (else the image's up). Going down from the top, the mask's body starts at the first row
    as wide as half the mask: anything light above that row near the head is a horn. From behind (1:39) the small light
    shapes on the head are the horn tips (1:37.5 too). The horns go with their outline, the gap is filled from the hair and
    background around it, and the mask's new top edge is inked."""
    h, s, v = hsv(fr)
    L = (v > 0.6) & (s < 0.25)
    n, lab, st, cen = cv2.connectedComponentsWithStats(L.astype(np.uint8))
    if n < 2:
        return
    areas = st[:, cv2.CC_STAT_AREA].copy()
    areas[0] = 0
    i = int(np.argmax(areas))
    horns, edge = None, None
    if areas[i] >= 6000:
        x0, y0, bw, bh = st[i, :4]
        X0, Y0, X1, Y1 = clip_box((x0 - bw * 0.6, y0 - bh * 1.2, x0 + bw * 1.6, y0 + bh * 1.1))
        Lc = L[Y0:Y1, X0:X1]
        labc = lab[Y0:Y1, X0:X1]
        M = labc == i
        rel = [j for j in np.unique(labc) if j and areas[j] >= 80]
        R = np.isin(labc, rel)                                            # the mask and light shapes around it
        pad = cv2.copyMakeBorder(M.astype(np.uint8), 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        ff = pad.copy()
        cv2.floodFill(ff, None, (0, 0), 2)
        filled = ff[1:-1, 1:-1] != 2
        holes = (filled & ~M).astype(np.uint8)
        nh, labh, sth, cenh = cv2.connectedComponentsWithStats(holes)
        eyes = sorted(range(1, nh), key=lambda j: -sth[j, cv2.CC_STAT_AREA])[:2]
        ang = 0.0
        if len(eyes) == 2 and sth[eyes[1], cv2.CC_STAT_AREA] > 0.003 * filled.sum():
            d_ = cenh[eyes[1]] - cenh[eyes[0]]
            if abs(d_[0]) > 20:
                a_ = np.arctan2(d_[1], d_[0])
                if a_ > np.pi / 2:
                    a_ -= np.pi
                if a_ < -np.pi / 2:
                    a_ += np.pi
                if abs(a_) < np.radians(45):
                    ang = a_
        yy, xx = np.mgrid[0:Y1 - Y0, 0:X1 - X0].astype(np.float32)
        cy_, cx_ = cen[i][1] - Y0, cen[i][0] - X0
        U = -((xx - cx_) * -np.sin(ang) + (yy - cy_) * np.cos(ang))     # up, in the mask's frame
        Ui = np.round(U).astype(int)
        lo = Ui[R].min()
        width = np.bincount(Ui[filled] - lo, minlength=Ui[R].max() - lo + 1)
        wmax = width.max()
        rows = np.nonzero(width >= 0.5 * wmax)[0]
        top = rows.max() + lo                                             # the body's top row
        hc = Lc & (Ui > top + 2)
        if hc.sum() > 60:
            horns = np.zeros(L.shape, bool)
            horns[Y0:Y1, X0:X1] = hc
            above = np.zeros(L.shape, bool)
            above[Y0:Y1, X0:X1] = Ui > top - 3
            e_ = np.zeros(L.shape, bool)
            e_[Y0:Y1, X0:X1] = filled & (Ui > top - 6) & (Ui <= top + 2)
            edge = e_
    elif 97.4 <= t < 97.85 or 99.0 <= t < 99.75:                          # from behind: the horn tips on her head
        horns = np.zeros(L.shape, bool)
        for j in range(1, n):
            if 80 <= areas[j] <= 5000 and cen[j][1] < 0.6 * HEI:
                horns |= lab == j
        above = np.ones(L.shape, bool)
    if horns is None or horns.sum() < 60:
        return
    red = ((h < 25) | (h > 335)) & (s > 0.35) & (v > 0.25)                 # the red line art
    cut = (near(horns, 7) | (red & near(horns, 13))) & above
    ys, xs = np.nonzero(cut)
    bx = clip_box((xs.min() - 150, ys.min() - 150, xs.max() + 150, ys.max() + 150))
    excl = (near(L, 2) | near(red, 2))[bx[1]:bx[3], bx[0]:bx[2]]          # fill from hair and background only
    fill_smooth(fr, bx, cut[bx[1]:bx[3], bx[0]:bx[2]], exclude=excl)
    if edge is not None:
        fr[edge & near(cut, 4)] = (22, 16, 14)


def speech_bubble(lines, font_path, size, phase, aim=(1.0, 0.0), tail_len=70):
    """a speech bubble like the MV's own: cream, a thick dark wobbly outline, hand-lettered capitals (RGBA). Its tail
    points along aim (dx, dy); the image is centred on the bubble, so paste() puts the bubble at the given point."""
    blk = TextBlock(lines, font_path, size, (30, 24, 22), line_gap=1.05, wobble=0.035, rot=0.05, seed=50 + len(lines))
    lay = blk.layer(1.0, 0)
    tw, th = blk.w, blk.h
    bw, bh = int(tw * 1.28 + 60), int(th * 1.45 + 46)
    pad = tail_len + 30
    W_, H_ = bw + 2 * pad, bh + 2 * pad
    im = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink, cream = (24, 18, 16, 255), (244, 238, 224, 255)
    cx, cy = W_ / 2, H_ / 2
    ux, uy = aim
    n_ = max(1e-6, (ux * ux + uy * uy) ** 0.5)
    ux, uy = ux / n_, uy / n_
    # where the aim leaves the ellipse, a tail base across it, and the tip beyond
    k = 1 / ((ux / (bw / 2)) ** 2 + (uy / (bh / 2)) ** 2) ** 0.5
    ex, ey = cx + ux * k * 0.86, cy + uy * k * 0.86
    px, py = -uy, ux
    tip = (cx + ux * (k + tail_len), cy + uy * (k + tail_len))
    d.polygon([(ex + px * 34, ey + py * 34), (ex - px * 34, ey - py * 34), tip], fill=ink)
    d.ellipse((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), fill=ink)
    tip_in = (cx + ux * (k + tail_len - 16), cy + uy * (k + tail_len - 16))
    d.polygon([(ex + px * 24 - ux * 6, ey + py * 24 - uy * 6), (ex - px * 24 - ux * 6, ey - py * 24 - uy * 6), tip_in], fill=cream)
    d.ellipse((cx - bw / 2 + 8, cy - bh / 2 + 8, cx + bw / 2 - 8, cy + bh / 2 - 8), fill=cream)
    im.alpha_composite(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2)))
    return Image.fromarray(boil(np.asarray(im), phase, 1.6)), (bw, bh)


def put_player(fr, box, img, phase, keep_fn):
    """the video in the player: img inside a rough hand-drawn rectangle, the MV's overlays left on top"""
    x0, y0, x1, y1 = box
    M = 12
    X0, Y0, X1, Y1 = clip_box((x0 - M, y0 - M, x1 + M, y1 + M))
    sub = fr[Y0:Y1, X0:X1]
    keep = keep_fn(sub)
    H, W = sub.shape[:2]
    rng = np.random.default_rng(5000 + phase)
    edge = lambda n: cv2.resize(rng.normal(0, 2.0, (1, max(3, n // 45))).astype(np.float32), (n, 1),
                                interpolation=cv2.INTER_CUBIC)[0]
    yy, xx = np.mgrid[0:H, 0:W]
    rect = ((yy >= (y0 - Y0) + edge(W)[None, :]) & (yy < (y1 - Y0) + edge(W)[None, :]) &
            (xx >= (x0 - X0) + edge(H)[:, None]) & (xx < (x1 - X0) + edge(H)[:, None]))
    ih, iw = img.shape[:2]                                                # fill the box, cropping the overflow
    sc = max((x1 - x0) / iw, (y1 - y0) / ih)
    big = cv2.resize(img, (int(np.ceil(iw * sc)), int(np.ceil(ih * sc))), interpolation=cv2.INTER_AREA)
    oy, ox = (big.shape[0] - (y1 - y0)) // 2, (big.shape[1] - (x1 - x0)) // 2
    pic = boil(big[oy:oy + y1 - y0, ox:ox + x1 - x0], phase)
    pic = np.clip(pic.astype(np.float32) + rng.normal(0, 3.5, pic.shape[:2])[..., None], 0, 255).astype(np.uint8)
    canvas = sub.copy()
    bg = np.array([26, 22, 20], np.float32)
    canvas[~rect] = np.clip(bg + rng.normal(0, 3.0, ((~rect).sum(), 1)), 0, 255).astype(np.uint8)
    full = np.zeros_like(sub)
    full[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = pic
    canvas[rect] = full[rect]
    ink = rect & ~cv2.erode(rect.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))).astype(bool)
    canvas[ink] = (20, 16, 14)
    canvas[keep] = sub[keep]
    fr[Y0:Y1, X0:X1] = canvas

# ---------------------------------------------------------------- frames
def frames(mv, lut, t0, t1):
    t0 = round(t0 * FPS) / FPS                       # stay on the frame grid, so frame numbers never collide
    n = max(1, int(round((t1 - t0) * FPS)))
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
                 angle=0.0, exclude=None, offset=(0, 0), shadow=None):
        self.t0, self.t1, self.region, self.core, self.block = t0, t1, region, core, block
        self.spread, self.settled, self.near_dark, self.grow = spread, settled, near_dark, grow
        self.angle, self.exclude, self.offset, self.shadow = angle, exclude, offset, shadow
        self.stats = {}

    def mask(self, frame, t):
        box = clip_box(self.region(t))
        sub = frame[box[1]:box[3], box[0]:box[2]]
        core = self.core(sub)
        if self.exclude is not None:
            yy, xx = np.mgrid[box[1]:box[3], box[0]:box[2]]
            core &= ~self.exclude(t, xx, yy)
        full = core | (m_dark(sub) & near(core, self.near_dark))
        if self.shadow is not None:                      # coloured shadows of the old letters (brown/red), near them
            full |= self.shadow(sub) & near(core, self.near_dark + 6)
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
    t_credit = TextBlock(["Tsurumaki Maki"], font["pirata-one"], 148, CREAM, (16, 12, 12), 7, GOLD, (7, 9), rot=0.05, wobble=0.04, seed=4)
    t_credit_small = TextBlock(["Tsurumaki Maki"], font["pirata-one"], 76, CREAM, (16, 12, 12), 4, GOLD, (3, 4), rot=0.05, wobble=0.04, seed=4)

    lyrics = [
        Lyric(82.40, 84.62, lambda t: (480, 330, 1440, 960), m_gold,
              TextBlock(["INVITE THIS CROWD", "TO DANCE TONIGHT"], font["luckiest-guy"], 92, GOLD, None, 0, DARK, (5, 6),
                        line_gap=1.05, wobble=0.05, rot=0.09, arc=0.25, seed=11),
              spread=300, settled=(83.2, 84.2), near_dark=8, shadow=lambda s: m_goldish(s, 0.3, 0.12, -1, 40)),
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
              TextBlock(["TSURUMAKI", "MAKI"], font["luckiest-guy"], 100, (46, 42, 40), line_gap=0.92, rot=0.05, wobble=0.03, seed=6),
              spread=0, settled=(203.8, 204.8), near_dark=0, grow=3, angle=-13,
              exclude=lambda t, xx, yy: (xx > 905 + (yy - 400) * 0.45) if t >= 205.0 else np.zeros(xx.shape, bool)),
    ]
    # the user's own songs in place of the original channel's videos (sidebar and the titles under the player)
    JP = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
    SONGS = {"wtti": "Welcome To The Internet (Feat. Kasane Teto)", "lemonade": "レモネード",
             "signaling": "Signaling Remix (feat. Adachi Rei & Corrupt-Chan)"}
    SWAP = {"lose": "wtti", "lovebug": "lemonade", "fire": "signaling", "laugh": "wtti", "collared": "signaling"}
    LINES = {"lose": 3, "lovebug": 3, "fire": 5, "laugh": 3, "collared": 2}      # title lines + extra channel lines
    AGE = {"lose": "11 months ago", "lovebug": "2 months ago", "fire": "10 months ago", "laugh": "3 months ago",
           "collared": "11 months ago"}
    thumbs = {k: Image.open(os.path.join(args.thumbs, f"{k}.png")).convert("RGB") for k in SONGS}
    fnt = lambda k, size: ImageFont.truetype(JP if k == "lemonade" else font["m-plus-rounded-1c"], size)
    f_side_ch = ImageFont.truetype(font["m-plus-rounded-1c"], 18)
    t_main = {k: TextBlock([v], JP if k == "lemonade" else font["m-plus-rounded-1c"], 34, CREAM, max_w=880, align="left")
              for k, v in SONGS.items()}
    def lut_img(im):                                     # the thumbnails get Maki's palette like everything else
        raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{im.width}x{im.height}",
                              "-i", "-", "-vf", f"lut3d={args.lut}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             input=np.asarray(im).tobytes(), capture_output=True, check=True).stdout
        return np.frombuffer(raw, np.uint8).reshape(im.height, im.width, 3).copy()
    thumb_art = {k: cartoon(lut_img(im)) for k, im in thumbs.items()}
    LAYOUTS = {"A": (16.5, ["lose", "lovebug", "fire"]), "B": (18.0, ["harl", "laugh", "collared"]),
               "C": (25.2, ["harl", "collared", "lovebug"]), "D": (26.5, ["harl", "lovebug", "laugh"]),
               "E": (27.5, ["harl", "lovebug", "laugh"])}
    RELEASED = {"lemonade": "1 month ago", "wtti": "Unreleased", "signaling": "Unreleased"}
    ENTRY = {"harl": ("harl", "1 day ago")} | {k: (SWAP[k], RELEASED[SWAP[k]]) for k in SWAP}
    FLIPPED = [(k, RELEASED[k]) for k in ("wtti", "signaling", "lemonade")]
    # the player plays the user's songs: clips from their own MVs, LEMONADE as an animated card
    # source times chosen so the glitchy stretch (0:24.6-0:27.9) lands on pixel Teto (WTTI 3:54) and Corrupt-Chan
    # dancing (Signaling 0:52); the player shows source time base + (t - 16.95)
    CLIP = {"wtti": (os.path.join(args.clips, "wtti.mp4"), 225.85), "signaling": (os.path.join(args.clips, "signaling.mp4"), 43.85)}
    PBOX = (46, 132, 1243, 790)
    clip_cache = {}

    react_cels = {os.path.splitext(n)[0]: Image.open(os.path.join(args.clips, "react", n)).convert("RGBA")
                  for n in os.listdir(os.path.join(args.clips, "react")) if n.endswith(".png")}
    teto_sprite = Image.open(os.path.join(args.clips, "teto_sprite.png")).convert("RGBA")
    react_cache = {}

    def player_img(song, t):
        idx = int(t * 15)                                                  # on twos, like the drawings
        for a, b, sg, k in REACT_SEGS:
            if a <= t < b and sg == song:
                if (song, k, idx) not in react_cache:
                    W_, H_ = PBOX[2] - PBOX[0], PBOX[3] - PBOX[1]
                    if song == "signaling":
                        im = cartoon_fast(lut_img(Image.fromarray(signaling_react(W_, H_, k, t - a, react_cels, idx))))
                    elif song == "wtti":
                        im = lut_img(Image.fromarray(wtti_react(W_, H_, k, t - a, teto_sprite, idx, font["luckiest-guy"])))
                    else:
                        im = lemonade_card(W_, H_, idx, JP, mood=k)
                    react_cache[(song, k, idx)] = im
                return react_cache[(song, k, idx)]
        if (song, idx) not in clip_cache:
            if song == "lemonade":
                img = lemonade_card(PBOX[2] - PBOX[0], PBOX[3] - PBOX[1], idx, JP)
            else:
                path, base = CLIP[song]
                raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{base + idx / 15 - 16.95:.3f}", "-i", path,
                                      "-frames:v", "1", "-vf", f"scale=1280:720,lut3d={args.lut}", "-f", "rawvideo",
                                      "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
                img = cartoon_fast(np.frombuffer(raw, np.uint8).reshape(720, 1280, 3).copy())
            clip_cache[(song, idx)] = img
        return clip_cache[(song, idx)]
    playing = {"key": None}
    # the lyric lines sung over the YouTube page (lyrics.json), shown in a speech bubble in the player
    PAGE_LYRICS = [(20.35, 24.1, "THIRSTING FOR A HIGH BEHIND THE FICKLE LIES"), (24.1, 25.6, "SO DON'T BE COY"),
                   (25.6, 27.62, "THERE'S WHIMSY TO ENJOY!"), (27.62, 27.95, "JUST BLOCK OUT ALL THE NOISE")]
    lyric_hold = {}
    bubble_cache = {}

    def lyric_bubble(text, phase, aim_deg):
        k = (text, phase % 2, aim_deg)
        if k not in bubble_cache:
            f = ImageFont.truetype(font["luckiest-guy"], 46)
            a = np.radians(aim_deg)
            bubble_cache[k] = speech_bubble(wrap(text, f, 380), font["luckiest-guy"], 46, phase % 2, (np.cos(a), np.sin(a)))
        return bubble_cache[k]

    def bubble_size(text):
        return lyric_bubble(text, 0, 0)[1]
    f_title = {k: fnt(k, 21) for k in SONGS}
    f_title["harl"] = ImageFont.truetype(font["m-plus-rounded-1c"], 21)
    TITLE_OF = dict(SONGS) | {"harl": NEW_TITLE}

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
    chip_tpl = ref[134:170, 1378:1595].copy()                        # "From Vane Lily"
    side_col = lambda f: cv2.cvtColor(f[60:1080, 1360:1920], cv2.COLOR_RGB2GRAY)[::4, ::4].astype(np.float32)
    layout_ref = {k: side_col(next(frames(args.mv, args.lut, tt, tt + 1 / FPS))[1])[10:-10, 10:-10] for k, (tt, _) in LAYOUTS.items()}
    held = {"layout": None, "t": -9, "dy": 0}
    layout_geom = {}
    for k, (tt, _) in LAYOUTS.items():                       # each layout's text blocks and thumbnails, from its reference
        rf = next(frames(args.mv, args.lut, tt, tt + 1 / FPS))[1]
        layout_geom[k] = (side_text_blocks(rf), side_thumbs(rf))
        assert len(layout_geom[k][0]) == 3 and len(layout_geom[k][1]) == 3, (k, layout_geom[k])

    def which_layout(fr, t):
        """(layout, vertical offset) of the sidebar on screen; holds the last one through unreadable frames"""
        c = side_col(fr)
        best = (-1, None, 0)
        for k, r in layout_ref.items():
            _, mx, _, loc = cv2.minMaxLoc(cv2.matchTemplate(c, r, cv2.TM_CCOEFF_NORMED))
            if mx > best[0]:
                best = (mx, k, (loc[1] - 10) * 4)
        if best[0] >= 0.5:
            held.update(layout=best[1], t=t, dy=best[2])
            return best[1], best[2]
        return (held["layout"], held["dy"]) if t - held["t"] < 0.3 else (None, 0)

    def slots(found, ref, dy):
        """use the blocks found in this frame when they line up with the layout, else the layout's own (shifted)"""
        if len(found) == 3 and all(abs(f[0] - (r[0] + dy)) < 40 for f, r in zip(found, ref)):
            return found
        return [(a + dy, b + dy) for a, b in ref]

    def entry_text(key, song, age, x, top, phase, flip=False, height=None):
        f = f_title[song if song in f_title else key]
        lines = wrap(TITLE_OF[song], f, 182)
        while len(lines) > 3:
            f = ImageFont.truetype(f.path, f.size - 1)
            lines = wrap(TITLE_OF[song], f, 182)
        items = [(l, f, CREAM, 28) for l in lines] + [(CHANNEL, f_side_ch, UI_GREY, 28), (age, f_side_ch, UI_GREY, 28)]
        rng = np.random.default_rng(3000 + phase + top)
        jx, jy = int(rng.integers(-1, 2)), int(rng.integers(-1, 2))
        if not flip:
            fr = fr_cur[0]
            H = int(sum(it[3] for it in items)) + 10
            X, Y = int(x + jx) - 4, int(top - 3 + jy) - 4
            im = Image.new("L", (200, H + 8), 0)
            col = Image.new("RGB", (200, H + 8), (0, 0, 0))
            d, dc = ImageDraw.Draw(im), ImageDraw.Draw(col)
            yy = 4
            for text, ff, cc, lh in items:
                d.text((4, yy), text, font=ff, fill=255)
                dc.text((4, yy), text, font=ff, fill=cc)
                yy += lh
            a_ = boil(np.asarray(im), phase, 0.7)                           # a little hand-drawn wobble, like the page
            c_ = boil(np.asarray(col), phase, 0.7)
            Y1_, X1_ = min(HEI, Y + a_.shape[0]), min(WID, X + a_.shape[1])
            al = (a_[:Y1_ - Y, :X1_ - X].astype(np.float32) / 255)[..., None]
            fr[Y:Y1_, X:X1_] = (fr[Y:Y1_, X:X1_] * (1 - al) + c_[:Y1_ - Y, :X1_ - X] * al).astype(np.uint8)
            return
        H = int(sum(it[3] for it in items)) + 6                             # the glitch copy: drawn upside down
        im = Image.new("RGB", (192, H), (0, 0, 0))
        mk = Image.new("L", (192, H), 0)
        d, dm = ImageDraw.Draw(im), ImageDraw.Draw(mk)
        yy = 0
        for text, ff, col, lh in items:
            d.text((0, yy), text, font=ff, fill=col)
            dm.text((0, yy), text, font=ff, fill=255)
            yy += lh
        if height:
            sc = min(1.0, height / H)
            im = im.resize((int(192 * sc), int(H * sc)), Image.LANCZOS)
            mk = mk.resize(im.size, Image.LANCZOS)
        im, mk = im.transpose(Image.FLIP_TOP_BOTTOM), mk.transpose(Image.FLIP_TOP_BOTTOM)
        fr = fr_cur[0]
        X, Y = int(x + jx), int(top + jy)
        sub = Image.fromarray(fr[Y:Y + im.height, X:X + im.width])
        sub.paste(im.crop((0, 0, sub.width, sub.height)), (0, 0), mk.crop((0, 0, sub.width, sub.height)))
        fr[Y:Y + im.height, X:X + im.width] = np.asarray(sub)

    def erase_text(fr, y0, y1):
        box = clip_box((1718, y0 - 6, 1920, y1 + 8))
        sub = fr[box[1]:box[3], box[0]:box[2]]
        h, s, v = hsv(sub)
        erase(fr, box, (v > 0.4) & (s < 0.3), grow=2, radius=4)
    fr_cur = [None]
    plate = []

    def flash_plate():
        if not plate:
            plate.append(next(frames(args.mv, args.lut, 161.70, 161.70 + 1 / FPS))[1])
        return plate[0]

    def tight(fr, box, thr=0.72):
        """crop of the cream text inside box (the first title line of a sidebar video, or a title under the player)"""
        x0, y0, x1, y1 = box
        m = hsv(fr[y0:y1, x0:x1])[2] > thr
        ys, xs = np.nonzero(m)
        return fr[y0 + ys.min() - 2:y0 + ys.max() + 3, x0 + xs.min() - 2:x0 + xs.max() + 3].copy()
    r165 = next(frames(args.mv, args.lut, 16.5, 16.5 + 1 / FPS))[1]
    r252 = next(frames(args.mv, args.lut, 25.2, 25.2 + 1 / FPS))[1]
    r265 = next(frames(args.mv, args.lut, 26.5, 26.5 + 1 / FPS))[1]
    side_titles = {"lose": tight(r165, (1730, 216, 1856, 252)), "lovebug": tight(r165, (1730, 486, 1840, 522)),
                   "fire": tight(r165, (1730, 772, 1910, 808)), "laugh": tight(ref, (1724, 497, 1896, 532)),
                   "collared": tight(ref, (1728, 772, 1860, 808))}
    main_titles = {"lovebug": tight(ref, (54, 818, 1000, 874)), "laugh": tight(r252, (54, 818, 1000, 874)),
                   "collared": tight(r265, (54, 818, 1000, 874))}
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
        if 161.75 <= t < 162.05:                                 # a pentagram flashing in a glitch: hold the clean
            fr[:] = flash_plate()                                  # "keep dancin'" frame between its flashes instead
        if 173.55 <= t < 175.35:                                 # pentagram under Teto ("encore's end"): its thin lines
            box = (250, 200, 1880, 1060)
            sub = fr[box[1]:box[3], box[0]:box[2]]
            m = thin_lines(m_goldish(sub), 31) & ~near(m_cream(sub), 8)
            erase(fr, box, m, grow=6, radius=6)
        if 201.58 <= t < 203.58:                                 # pentagram on the stage floor (candles stay)
            box = (0, 440, 1920, 1080)
            sub = fr[box[1]:box[3], box[0]:box[2]]
            strict = m_goldish(sub, 0.3, 0.35, 24, 68)
            soft = m_goldish(sub, 0.06, 0.2, 18, 75) & near(strict, 14)          # lines, their glow and smears
            h_, s_, v_ = hsv(sub)
            wax = (v_ > 0.75) & (s_ < 0.3)
            candle = near(wax, 3) | (near(wax, 30) & (v_ < 0.16))                  # wax and flames, with their holders
            gold = m_goldish(sub, 0.22, 0.25, 15, 80)                               # (the floor is a warm grey)
            fill_smooth(fr, box, near(strict | soft, 6) & ~candle,                 # filled from the plain floor only
                        exclude=near(gold, 3) | near(wax, 4), scales=(30, 90, 200))
        if 93.75 <= t < 101.0:                                   # the masquerade mask's horns
            dehorn(fr, t)
        if 14.70 <= t < 16.0:                                    # full-screen player title
            ui_replace(fr, (60, 22, 1200, 112), t_title_fs, 0.6)
        if PAGE_T[0] <= t < PAGE_T[1]:
            dx, dy = page_offset(fr)
            if 20.2 <= t < 27.95:
                erase_lyrics(fr, (PBOX[0] + dx, PBOX[1] + dy, PBOX[2] + dx, PBOX[3] + dy), lyric_hold)
            # avatar and channel name
            cx, cy = 84 + dx, 916 + dy
            fr_av = Image.fromarray(fr[cy - 40:cy + 40, cx - 40:cx + 40]).convert("RGBA")
            ring = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
            ImageDraw.Draw(ring).ellipse((1, 1, 78, 78), fill=(24, 24, 24, 255))
            fr_av.alpha_composite(ring)
            fr_av.alpha_composite(avatar, (2, 2))
            fr[cy - 40:cy + 40, cx - 40:cx + 40] = np.asarray(fr_av.convert("RGB"))
            ui_replace(fr, (124 + dx, 886 + dy, 312 + dx, 942 + dy), t_name)
            cw = fr[100:210, 1300:1760]
            _, cmx, _, cl = cv2.minMaxLoc(cv2.matchTemplate(cw, chip_tpl, cv2.TM_CCOEFF_NORMED))
            if cmx > 0.4:                                         # the chip moves on its own in the glitches
                cx0, cy0 = 1300 + cl[0], 100 + cl[1]
                ui_replace(fr, (cx0 - 8, cy0 - 6, cx0 + chip_tpl.shape[1] + 90, cy0 + chip_tpl.shape[0] + 6), t_chip, 0.5)
            else:
                ui_replace(fr, (1352 + dx, 128 + dy, 1700 + dx, 176 + dy), t_chip, 0.5)
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
            if 16.95 <= t < 27.9:                                 # the title of the video playing: the user's song
                wx0, wy0, wx1, wy1 = clip_box((40 + dx, 805 + dy, 1040 + dx, 885 + dy))
                win = fr[wy0:wy1, wx0:wx1]
                best = max(((cv2.minMaxLoc(cv2.matchTemplate(win, tp, cv2.TM_CCOEFF_NORMED))[1], k)
                            for k, tp in main_titles.items()), default=(0, None))
                if best[0] > 0.55:
                    playing["key"] = best[1]
                    ui_replace(fr, (54 + dx, 816 + dy, 1000 + dx, 874 + dy), t_main[SWAP[best[1]]])
                key = playing["key"]
                pv = hsv(fr[150:770, 70:1220])
                loading = ((pv[2] > 0.85) & (pv[1] < 0.25)).mean() > 0.55          # the white "loading" screen stays
                if key and not loading:
                    bx0, by0 = PBOX[0] + dx, PBOX[1] + dy
                    old_bubbles = find_bubbles(fr[by0:PBOX[3] + dy, bx0:PBOX[2] + dx]) if key == "lovebug" and t < 24.6 else []
                    put_player(fr, (PBOX[0] + dx, PBOX[1] + dy, PBOX[2] + dx, PBOX[3] + dy),
                               player_img(SWAP[key], t), int(t * 15),
                               lambda sub, k=key: player_overlays(sub, bubbles=(k == "lovebug" and t < 24.6), letters=False))
                    # the lyric line in a speech bubble, popping in when it's sung (after the old video's own bubbles).
                    # The singer is the harlequin in the top sidebar thumbnail, like the MV's own bubbles: the tail
                    # points at her, the bubble sits in the player's top right next to her
                    for a, b, text in PAGE_LYRICS:
                        if a <= t < b and not old_bubbles:
                            W_, H_ = PBOX[2] - PBOX[0], PBOX[3] - PBOX[1]
                            bw, bh = bubble_size(text)
                            low = 27.47 <= t                                  # both characters fill the top: go low
                            cx = PBOX[2] + dx - bw / 2 - 70
                            cy = PBOX[1] + dy + (H_ - bh / 2 - 40 if low else bh / 2 + 34)
                            lay_ = held.get("layout")
                            if lay_ in layout_geom:                           # the harlequin's thumbnail (first slot)
                                u0, u1 = layout_geom[lay_][1][0]
                                tgt = (1530, (u0 + u1) / 2 + held.get("dy", 0))
                            else:
                                tgt = (1530, 316)
                            aim = int(round(np.degrees(np.arctan2(tgt[1] - cy, tgt[0] - cx)) / 5) * 5)
                            bub, _ = lyric_bubble(text, int(t * 15), aim)
                            pop = easeOutBack(min(1.0, (t - a) / 0.13))
                            if pop < 0.999:
                                bub = bub.resize((max(1, int(bub.width * pop)), max(1, int(bub.height * pop))), Image.LANCZOS)
                            jx = np.random.default_rng(round(t * 15)).uniform(-6, 6) if t >= 24.63 else 0   # the chaos shakes it
                            paste(fr, bub, (cx + jx, cy))
            # the sidebar: every frame, each slot's video by the layout on screen, positions found in the frame itself
            fr_cur[0] = fr
            phase = int(t * 15)                                       # the drawings boil on twos
            if t < 27.9:
                lay, ldy = which_layout(fr, t)
                if lay:
                    tb = slots(side_text_blocks(fr), layout_geom[lay][0], ldy)
                    th = slots(side_thumbs(fr), layout_geom[lay][1], ldy)
                    erase_text(fr, 186, 1072)                          # every original title in the column, wherever it is
                    for key, (y0, y1), (u0, u1) in zip(LAYOUTS[lay][1], tb, th):
                        song, age = ENTRY[key]
                        entry_text(key, song, age, 1736, y0, phase)
                        if key != "harl":
                            put_thumb(fr, u0, u1, thumb_art[song], phase)
            else:                                                    # the upside-down glitch copy of the sidebar
                for (song, age), (y0, y1) in zip(FLIPPED, side_text_blocks(fr)[:3]):
                    erase_text(fr, y0, y1)
                    entry_text(song, song, age, 1734, y0, phase, flip=True, height=y1 - y0 + 4)

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
    for k in ("mv", "lut", "audio", "avatar", "fonts", "thumbs", "clips", "out"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--stills")
    ap.add_argument("--range", nargs=2, type=float)
    run(ap.parse_args())
