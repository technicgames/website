#!/usr/bin/env python3
"""
Technic Games — asset optimiser.

NOT part of the site build. The site has no build step; this is a one-off you
run by hand whenever you drop new source art in for a game.

    python3 tools/optimize-assets.py            # all games + the Pushlings banner art
    python3 tools/optimize-assets.py lbs         # just one game (by prefix)
    python3 tools/optimize-assets.py art         # just the banner art (see ART)

For each game it writes the exact files assets/games.js references:

    assets/<prefix>-icon.webp        192w   the card icon (2x of its 84px box)
    assets/<prefix>-N-thumb.webp     440w   the card thumbnail (2x of 220px)
    assets/<prefix>-N-full.webp     1080w   loaded only when the lightbox opens

Why: a raw store screenshot is ~250-350 KB at 1284x2778 and gets painted into a
220px box. The thumbnails are what load on the home page; -full loads on demand.

ADD A GAME
----------
1. Drop the sources anywhere under assets/ (a subfolder like assets/lbs/ keeps
   them tidy). Icon can be PNG/JPG, or an SVG that wraps a raster.
2. Add an entry to GAMES below: the prefix must match assets/games.js, and the
   screenshot order is the order they appear in the card. Only list as many
   screenshots as games.js references (3 here).
3. Run this. Commit the generated assets/<prefix>-*.webp AND the sources.
"""
import base64
import io
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")

# prefix must match the asset names in assets/games.js. `icon` and each
# `screenshots` entry is a path relative to assets/. Screenshot order is the
# order shown on the card (screenshot[0] -> <prefix>-1-*, and so on).
GAMES = [
    {
        "prefix": "fsm",
        # The new jars-of-fruit icon and the iPhone 6.9" store screenshots
        # (store set 01, 02, 03, 05, 07), from the game project's
        # MarketingVideos/store_assets/out/.
        "icon": "fsm/Icon.png",
        "screenshots": ["fsm/Shot 1.png", "fsm/Shot 2.png", "fsm/Shot 3.png",
                        "fsm/Shot 4.png", "fsm/Shot 5.png"],
    },
    {
        "prefix": "lbs",
        "icon": "lbs/Icon.png",
        # Artboards 4-6 are extra marketing shots; games.js shows only three.
        "screenshots": ["lbs/Artboard 1.png", "lbs/Artboard 2.jpg", "lbs/Artboard 3.jpg"],
    },
    {
        "prefix": "pnd",
        "icon": "pnd/Icon.png",
        # The App Store slides, which carry their own captions. The store set has
        # five; these are the three that tell the whole story on their own.
        "screenshots": ["pnd/Shot 1.png", "pnd/Shot 2.png", "pnd/Shot 3.png"],
    },
    {
        # Pushlings' masters live in its press kit (pushlings-press/), which is
        # served as-is at /pushlings-press/. Read from there; never copy them.
        "prefix": "pl",
        "icon": "../pushlings-press/images/logo/Pushlings_Icon_1024.png",
        "screenshots": [
            "../pushlings-press/images/screenshots/Pushlings_Screenshot_01.jpg",
            "../pushlings-press/images/screenshots/Pushlings_Screenshot_02.jpg",
            "../pushlings-press/images/screenshots/Pushlings_Screenshot_04.jpg",
            "../pushlings-press/images/screenshots/Pushlings_Screenshot_05.jpg",
        ],
    },
]

# One-off art for the home page's featured-launch banner. Same rules: the site
# references only these outputs, never the multi-megabyte masters.
#   (source relative to assets/, output name, max width, mode)
PL = "../pushlings-press/images/"
ART = [
    (PL + "keyart/Pushlings_KeyArt_3840x2160_NoLogo.jpg", "pl-keyart-1920.webp", 1920, "RGB"),
    (PL + "keyart/Pushlings_KeyArt_3840x2160_NoLogo.jpg", "pl-keyart-960.webp", 960, "RGB"),
    (PL + "logo/Pushlings_Logo_White.png", "pl-logo-white.webp", 900, "RGBA"),
] + [
    # worlds strip: 220 CSS px wide on desktop, 2x
    (PL + f"worlds/Pushlings_World_{w}.jpg", f"pl-world-{w.lower().replace('_', '-')}.webp", 440, "RGB")
    for w in ("Meadow", "Sakura_Garden", "Coral_Lagoon", "Autumn_Grove", "Jungle_Ruins",
              "Snowy_Peaks", "Crystal_Caverns", "Desert_Oasis", "Ember_Isle", "Neon_Circuit")
]

THUMB_W = 440    # card: 220 CSS px box, 2x
FULL_W = 1080    # lightbox: ~308-540 CSS px box depending on viewport height
ICON_W = 192     # icon: 84 CSS px box, 2x (+ a little headroom)

QUALITY = 80
METHOD = 6       # slowest/best webp encode; this runs offline, so who cares


def save_webp(im, path, width, mode):
    if im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    im.convert(mode).save(path, "WEBP", quality=QUALITY, method=METHOD)
    return os.path.getsize(path), im.size


def load_image(rel):
    """Open a source under assets/. An .svg is a raster-in-SVG wrapper
    (Illustrator / RealFaviconGenerator export) — pull the embedded bitmap out."""
    path = os.path.join(A, rel)
    if not os.path.exists(path):
        sys.exit(f"missing source: {path}")
    if path.lower().endswith(".svg"):
        svg = open(path, encoding="utf-8").read()
        import re
        m = re.search(r'(?:xlink:)?href="data:image/(?:png|jpeg);base64,([^"]+)"', svg)
        if not m:
            sys.exit(f"{rel}: no embedded raster found in the SVG")
        return path, Image.open(io.BytesIO(base64.b64decode(m.group(1))))
    return path, Image.open(path)


def process(game):
    prefix = game["prefix"]
    before = after = 0
    rows = []

    src, im = load_image(game["icon"])
    before += os.path.getsize(src)
    size, dims = save_webp(im, os.path.join(A, f"{prefix}-icon.webp"), ICON_W, "RGBA")
    after += size
    rows.append((f"{prefix}-icon.webp", dims, size))

    for i, shot in enumerate(game["screenshots"], start=1):
        src, im = load_image(shot)
        before += os.path.getsize(src)
        for suffix, w in (("thumb", THUMB_W), ("full", FULL_W)):
            out = os.path.join(A, f"{prefix}-{i}-{suffix}.webp")
            size, dims = save_webp(im.copy(), out, w, "RGB")
            after += size if suffix == "thumb" else 0  # only thumbs load up-front
            rows.append((f"{prefix}-{i}-{suffix}.webp", dims, size))

    return before, after, rows


def process_art():
    before = after = 0
    rows = []
    for rel, name, width, mode in ART:
        src, im = load_image(rel)
        before += os.path.getsize(src)
        size, dims = save_webp(im, os.path.join(A, name), width, mode)
        after += size
        rows.append((name, dims, size))
    return before, after, rows


def main():
    wanted = sys.argv[1:]
    games = [g for g in GAMES if not wanted or g["prefix"] in wanted]
    do_art = not wanted or "art" in wanted
    if wanted and not games and not do_art:
        sys.exit(f"no game with prefix {wanted}; known: {[g['prefix'] for g in GAMES]} or 'art'")

    total_before = total_after = 0
    all_rows = []
    for game in games:
        before, after, rows = process(game)
        total_before += before
        total_after += after
        all_rows.extend(rows)
    if do_art:
        before, after, rows = process_art()
        total_before += before
        total_after += after
        all_rows.extend(rows)

    width = max(len(r[0]) for r in all_rows)
    for name, dims, size in all_rows:
        print(f"  {name:<{width}}  {dims[0]:>4}x{dims[1]:<4}  {size:>7,} bytes")

    print(f"\n  sources:            {total_before:>9,} bytes")
    pct = 100 - total_after * 100 // total_before if total_before else 0
    print(f"  loaded on page view:{total_after:>9,} bytes   ({pct}% smaller)")
    print("  (the -full.webp files download only when the lightbox opens)")


if __name__ == "__main__":
    main()
