#!/usr/bin/env python3
"""
Technic Games — asset optimiser.

NOT part of the site build. The site itself has no build step; this is a
one-off you run by hand whenever you drop new source art into assets/.

    python3 tools/optimize-assets.py

Sources (committed, never served):
    assets/fsm-1.jpg .. fsm-3.jpg   full-res store screenshots
    assets/fsm-icon.svg             the RealFaviconGenerator icon (raster in an SVG wrapper)

Outputs (served):
    assets/fsm-N-thumb.webp   440w  — the card thumbnail (2x of its 220px box)
    assets/fsm-N-full.webp   1080w  — loaded only when the lightbox opens
    assets/fsm-icon.webp      192w  — 2x of the 84px icon box

Why: the raw screenshots are ~350 KB each at 1284x2778, rendered into a 220px
box. That is ~1.05 MB of bytes to paint 3 thumbnails.
"""
import base64
import io
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")

THUMB_W = 440    # card: 220 CSS px box, 2x
FULL_W = 1080    # lightbox: ~308-540 CSS px box depending on viewport height
ICON_W = 192     # icon: 84 CSS px box, 2x (+ a little headroom)

QUALITY = 80
METHOD = 6       # slowest/best webp encode; this runs offline, so who cares


def save_webp(im, path, width):
    if im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    im.save(path, "WEBP", quality=QUALITY, method=METHOD)
    return os.path.getsize(path), im.size


def raster_from_svg(path):
    """Pull the embedded base64 raster out of an SVG wrapper."""
    svg = open(path, encoding="utf-8").read()
    m = re.search(r'xlink:href="data:image/(png|jpeg);base64,([^"]+)"', svg) or \
        re.search(r'href="data:image/(png|jpeg);base64,([^"]+)"', svg)
    if not m:
        return None
    return Image.open(io.BytesIO(base64.b64decode(m.group(2))))


def main():
    before = after = 0
    rows = []

    for n in (1, 2, 3):
        src = os.path.join(A, f"fsm-{n}.jpg")
        if not os.path.exists(src):
            sys.exit(f"missing source: {src}")
        before += os.path.getsize(src)
        im = Image.open(src).convert("RGB")

        for suffix, w in (("thumb", THUMB_W), ("full", FULL_W)):
            out = os.path.join(A, f"fsm-{n}-{suffix}.webp")
            size, dims = save_webp(im.copy(), out, w)
            after += size if suffix == "thumb" else 0  # only thumbs load up-front
            rows.append((f"fsm-{n}-{suffix}.webp", dims, size))

    icon_src = os.path.join(A, "fsm-icon.svg")
    if os.path.exists(icon_src):
        raster = raster_from_svg(icon_src)
        if raster:
            before += os.path.getsize(icon_src)
            out = os.path.join(A, "fsm-icon.webp")
            size, dims = save_webp(raster.convert("RGBA"), out, ICON_W)
            after += size
            rows.append(("fsm-icon.webp", dims, size))

    width = max(len(r[0]) for r in rows)
    for name, dims, size in rows:
        print(f"  {name:<{width}}  {dims[0]:>4}x{dims[1]:<4}  {size:>7,} bytes")

    print(f"\n  sources:            {before:>9,} bytes")
    print(f"  loaded on page view:{after:>9,} bytes   ({100 - after * 100 // before}% smaller)")
    print("  (the -full.webp files download only when the lightbox opens)")


if __name__ == "__main__":
    main()
