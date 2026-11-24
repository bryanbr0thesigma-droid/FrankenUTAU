"""3D colour lookup table that turns the Harlequin Contraption MV's Teto palette into Tsurumaki Maki's.

    python3 -I maki_lut.py out.cube [size]       then: ffmpeg -i mv.mp4 -vf lut3d=out.cube ...

Maki's colours (from her official model's textures): golden-blonde hair, a grey/black/white outfit, red accents.
The MV is mostly purple, magenta-pink, orange and some teal. Each colour is classified by hue (soft edges) and moved,
keeping its perceived lightness (OKLab L) so every shape and line still reads:
  pink/magenta -> gold (lifted, so it reads as gold rather than mustard)
  purple/blue  -> neutral greys, faintly warm; light lavender -> cream
  teal/cyan    -> Maki's red
  red          -> red;  orange -> amber (nearly unchanged)
Near-greys (low saturation) are left mostly alone.
"""
import sys

import numpy as np


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def rgb_to_oklab(rgb):
    l = srgb_to_lin(rgb)
    lms = l @ np.array([[0.4122214708, 0.2119034982, 0.0883024619],
                        [0.5363325363, 0.6806995451, 0.2817188376],
                        [0.0514459929, 0.1073969566, 0.6299787005]])
    lms = np.cbrt(lms)
    return lms @ np.array([[0.2104542553, 1.9779984951, 0.0259040371],
                           [0.7936177850, -2.4285922050, 0.7827717662],
                           [-0.0040720468, 0.4505937099, -0.8086757660]])


def oklab_to_rgb(lab):
    lms = lab @ np.array([[1.0, 1.0, 1.0],
                          [0.3963377774, -0.1055613458, -0.0894841775],
                          [0.2158037573, -0.0638541728, -1.2914855480]])
    lms = lms ** 3
    l = lms @ np.array([[4.0767416621, -1.2684380046, -0.0041960863],
                        [-3.3077115913, 2.6097574011, -0.7034186147],
                        [0.2309699292, -0.3413193965, 1.7076147010]])
    return l


def in_gamut(lab):
    l = oklab_to_rgb(lab)
    return np.all((l >= -1e-4) & (l <= 1 + 1e-4), axis=-1)


def lch(L, C, h):
    return np.stack([L, C * np.cos(np.radians(h)), C * np.sin(np.radians(h))], -1)


def fit(L, C, h):
    """reduce chroma until the colour fits in sRGB"""
    lo, hi = np.zeros_like(C), C.copy()
    ok = in_gamut(lch(L, C, h))
    for _ in range(18):
        mid = (lo + hi) / 2
        g = in_gamut(lch(L, mid, h))
        lo = np.where(g, mid, lo)
        hi = np.where(g, hi, mid)
    return np.where(ok, C, lo)


def band(h, a, b, soft=12.0):
    """weight 1 inside hue range [a, b] (degrees, may wrap), fading over `soft` degrees"""
    def d(x, y):
        return (x - y + 180) % 360 - 180
    width = (b - a) % 360
    centre = (a + width / 2) % 360
    dist = np.abs(d(h, centre)) - width / 2
    return np.clip(1 - dist / soft, 0, 1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def remap(rgb):
    lab = rgb_to_oklab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    mx, mn = rgb.max(-1), rgb.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0)        # HSV saturation and hue for classing
    d = np.maximum(mx - mn, 1e-9)
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hh = np.where(mx == r, ((g - bl) / d) % 6, np.where(mx == g, (bl - r) / d + 2, (r - g) / d + 4)) * 60
    w_sat = smoothstep(0.03, 0.16, s)

    targets = []                                                      # (weight, L, C, h)
    # pink / magenta -> gold
    Lg = np.minimum(0.95, L * 1.15 + 0.14)
    targets.append((band(hh, 298, 343, 10), Lg, np.minimum(C * 0.9, 0.15), np.full_like(L, 90.0)))
    # purple / blue -> warm neutral grey, light lavender -> cream
    cream = smoothstep(0.78, 0.92, L)
    targets.append((band(hh, 205, 296, 10), L, 0.010 + 0.030 * cream, np.full_like(L, 92.0)))
    # teal / cyan -> red
    targets.append((band(hh, 145, 203, 10), L * 0.72, np.maximum(C, 0.17), np.full_like(L, 27.0)))
    # red stays red
    targets.append((band(hh, 345, 12, 6), L, C, np.full_like(L, 27.0)))
    # orange / yellow -> amber
    targets.append((band(hh, 14, 60, 8), L, C, np.full_like(L, 62.0)))
    # green (rare) -> leave
    W = sum(t[0] for t in targets) + 1e-9
    out = np.zeros_like(lab)
    for w, Lt, Ct, ht in targets:
        Ct = fit(Lt, np.broadcast_to(Ct, L.shape).copy(), ht)
        out += (w / W)[..., None] * lch(Lt, Ct, ht)
    cover = np.clip(W, 0, 1) * w_sat
    lab2 = lab * (1 - cover[..., None]) + out * cover[..., None]
    # near-greys that are faintly purple (lavender whites, purple-blacks): neutralise their tint a little
    faint = (1 - w_sat) * band(hh, 205, 296, 20)
    lab2[..., 1:] *= (1 - 0.7 * faint)[..., None]
    return np.clip(lin_to_srgb(oklab_to_rgb(lab2)), 0, 1)


def main(out, size=65):
    size = int(size)
    g = np.linspace(0, 1, size)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")                  # .cube order: red changes fastest
    rgb = np.stack([r, gg, b], -1).reshape(-1, 3)
    res = remap(rgb)
    with open(out, "w") as f:
        f.write(f'TITLE "Harlequin Contraption: Teto palette to Maki"\nLUT_3D_SIZE {size}\n')
        np.savetxt(f, res, fmt="%.6f")
    print(f"{out}: {size}^3")


if __name__ == "__main__":
    main(*sys.argv[1:3])
