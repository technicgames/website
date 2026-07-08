#!/usr/bin/env python3
"""
Convert live <text> in an SVG logo into outlined <path>s.

    python3 tools/outline-logo.py [--in assets/logo.svg] [--font "<path to .ttf>"] [--apply]

Why this exists
---------------
An Illustrator export keeps the wordmark as a real <text> element referencing a
font by name. An SVG cannot carry that font: rendered as <img> it is an isolated
document and cannot see the page's @font-face rules, and inlined it depends on
the font being installed on the *visitor's* machine.

So the logo renders correctly on the designer's Mac and falls back to Times New
Roman for everyone else. Outlining bakes the exact glyph shapes into the file:
no font dependency, identical everywhere.

Without --apply this writes <in>.outlined.svg and changes nothing.
With --apply it backs the original up to <in>.src.svg and replaces it.

What it handles
---------------
* every <text> element, not just the first
* <tspan>s with or without a class, and with or without an explicit x
* font-size / letter-spacing declared on comma-list selectors (`.a, .b { … }`)
* kerning from the legacy `kern` table OR the GPOS `kern` feature

The parent <text>'s class moves onto the wrapping <g>, so its fill and filter
still apply to the outlined glyphs by inheritance.
"""
import argparse
import os
import re
import shutil
import sys

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svgutil import normalize_filter_regions  # noqa: E402

DEFAULT_FONT = os.path.expanduser("~/Library/Fonts/Baloo Bhaijaan Regular 400.ttf")


def style_map(svg):
    """{class -> {prop: value}}, expanding comma-list selectors like `.a, .b`."""
    m = re.search(r"<style>(.*?)</style>", svg, re.S)
    if not m:
        return {}
    out = {}
    for sel, decl in re.findall(r"([^{}]+)\{([^}]*)\}", m.group(1)):
        props = {}
        for d in decl.split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                props[k.strip()] = v.strip()
        for s in sel.split(","):
            s = s.strip()
            if s.startswith("."):
                out.setdefault(s[1:], {}).update(props)
    return out


def lookup(smap, classes, prop):
    for c in classes:
        if prop in smap.get(c, {}):
            return smap[c][prop]
    return None


def kern_fn(font):
    """Return f(left_glyph, right_glyph) -> advance adjustment in font units.

    Reads the legacy `kern` table if present, otherwise the GPOS `kern` feature.
    A font with GPOS-only kerning (most modern ones) would otherwise silently
    lose all pair adjustments.
    """
    legacy = {}
    if "kern" in font:
        for st in font["kern"].kernTables:
            legacy.update(st.kernTable)
    if legacy:
        return lambda l, r: legacy.get((l, r), 0), "kern table"

    if "GPOS" not in font:
        return (lambda l, r: 0), "none"

    gpos = font["GPOS"].table
    lookups = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            lookups.update(fr.Feature.LookupListIndex)
    if not lookups:
        return (lambda l, r: 0), "none"

    def value(l, r):
        total = 0
        for li in sorted(lookups):
            for st in gpos.LookupList.Lookup[li].SubTable:
                if getattr(st, "LookupType", None) == 9:
                    st = st.ExtSubTable
                fmt = getattr(st, "Format", None)
                cov = getattr(getattr(st, "Coverage", None), "glyphs", None)
                if not cov or l not in cov:
                    continue
                if fmt == 1 and hasattr(st, "PairSet"):
                    for rec in st.PairSet[cov.index(l)].PairValueRecord:
                        if rec.SecondGlyph == r and rec.Value1 and rec.Value1.XAdvance:
                            total += rec.Value1.XAdvance
                elif fmt == 2 and hasattr(st, "Class1Record"):
                    c1 = st.ClassDef1.classDefs.get(l, 0)
                    c2 = st.ClassDef2.classDefs.get(r, 0)
                    rec = st.Class1Record[c1].Class2Record[c2]
                    if rec.Value1 and rec.Value1.XAdvance:
                        total += rec.Value1.XAdvance
        return total

    return value, "GPOS kern feature"


def ntos(v):
    """Coordinate -> string, at 1 decimal place.

    The logo is a 1920-unit viewBox rendered into a 126px header mark, so one
    user unit is 0.066 px. Two decimals encodes 0.0007 px of precision — pure
    noise that also compresses badly, since long random digit strings defeat
    gzip. One decimal is still 0.1 px at the logo's full 1920 px size.
    """
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def outline_run(font, kern, text, size, start_x, tracking_px):
    """(svg path data, end x) for `text` laid out from x=start_x."""
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    scale = size / upem

    pen = SVGPathPen(gs, ntos=ntos)
    x = start_x
    prev = None
    for ch in text:
        if ord(ch) not in cmap:
            sys.exit(f"glyph missing from font: {ch!r}")
        gname = cmap[ord(ch)]
        if prev is not None:
            x += kern(prev, gname) * scale + tracking_px
        # y is flipped: SVG grows downward, font units grow upward
        gs[gname].draw(TransformPen(pen, Transform().translate(x, 0).scale(scale, -scale)))
        x += hmtx[gname][0] * scale
        prev = gname
    return pen.getCommands(), x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="assets/logo.svg")
    ap.add_argument("--font", default=DEFAULT_FONT)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    svg = open(args.src, encoding="utf-8").read()

    if "<text" not in svg:
        # Already outlined — but it may still carry region-less filters that
        # clip the glyphs. Repair those rather than reporting "nothing to do".
        repaired, n = normalize_filter_regions(svg)
        if not n:
            print(f"  {args.src}: no <text>, no unbounded filters — nothing to do.")
            return
        print(f"  {args.src}: already outlined; repairing {n} unbounded filter region(s)")
        if args.apply:
            shutil.copy2(args.src, re.sub(r"\.svg$", ".src.svg", args.src))
            open(args.src, "w", encoding="utf-8").write(repaired)
            print(f"  written -> {args.src}")
        else:
            out = re.sub(r"\.svg$", ".outlined.svg", args.src)
            open(out, "w", encoding="utf-8").write(repaired)
            print(f"  preview -> {out}   (re-run with --apply)")
        return

    if not os.path.exists(args.font):
        sys.exit(f"font not found: {args.font}\n"
                 f"Point --font at the .ttf the logo was designed with.")
    font = TTFont(args.font)
    kern, kern_src = kern_fn(font)
    smap = style_map(svg)
    print(f"  font: {os.path.basename(args.font)}   kerning source: {kern_src}")

    out_svg = svg
    texts = re.findall(r"<text\b.*?</text>", svg, re.S)
    print(f"  <text> elements: {len(texts)}")

    for text_el in texts:
        cls_attr = re.search(r'class="([^"]+)"', text_el)
        text_classes = cls_attr.group(1).split() if cls_attr else []

        size = lookup(smap, text_classes, "font-size")
        if not size:
            sys.exit(f"no font-size resolvable for classes {text_classes}")
        size = float(re.match(r"([\d.]+)", size).group(1))

        tm = re.search(r'transform="translate\(([\d.eE-]+)[\s,]+([\d.eE-]+)\)"', text_el)
        tx, ty = (tm.group(1), tm.group(2)) if tm else ("0", "0")

        spans = re.findall(r"<tspan\b([^>]*)>([^<]*)</tspan>", text_el)
        if not spans:
            spans = [("", re.sub(r"<[^>]+>", "", text_el))]

        paths = []
        cursor = 0.0
        for attrs, content in spans:
            if not content:
                continue
            scls = re.search(r'class="([^"]+)"', attrs)
            span_classes = scls.group(1).split() if scls else []
            xm = re.search(r'\bx="([\d.eE-]+)"', attrs)
            start = float(xm.group(1)) if xm else cursor

            tracking = lookup(smap, span_classes, "letter-spacing")
            tracking_px = 0.0
            if tracking:
                v = float(re.match(r"(-?[\d.]+)", tracking).group(1))
                tracking_px = v * size if tracking.endswith("em") else v

            d, cursor = outline_run(font, kern, content, size, start, tracking_px)

            # Tracking is now baked into the path geometry, so a class carrying
            # nothing but letter-spacing is dead weight. Drop it; keep classes
            # that also carry a fill or filter.
            keep = [c for c in span_classes
                    if set(smap.get(c, {})) - {"letter-spacing"}]
            cls = f' class="{" ".join(keep)}"' if keep else ""
            paths.append(f'      <path{cls} d="{d}"/>')
            print(f"    outlined {content!r:10} class={' '.join(span_classes) or '-':8} "
                  f"x={start:8.2f} -> {cursor:8.2f}")

        tcls = f' class="{" ".join(text_classes)}"' if text_classes else ""
        group = (f'    <g{tcls} transform="translate({tx} {ty})">\n'
                 + "\n".join(paths) + "\n    </g>")
        out_svg = out_svg.replace(text_el, group)

    # font-family / font-size / letter-spacing are now baked into the outlines.
    out_svg = re.sub(r"\s*font-family:[^;]+;", "", out_svg)
    out_svg = re.sub(r"\s*font-size:[^;]+;", "", out_svg)
    out_svg = re.sub(r"\s*letter-spacing:[^;]+;", "", out_svg)
    # ...which can leave rules with no declarations at all.
    out_svg = re.sub(r"\s*\.[\w-]+(?:\s*,\s*\.[\w-]+)*\s*\{\s*\}", "", out_svg)

    # An Illustrator drop shadow with no filter region slices the wordmark.
    out_svg, n_filters = normalize_filter_regions(out_svg)
    if n_filters:
        print(f"  repaired {n_filters} unbounded filter region(s) "
              f"(they were clipping the glyphs)")

    remaining = out_svg.count("<text")
    if remaining:
        sys.exit(f"  {remaining} <text> element(s) survived — refusing to write.")

    if args.apply:
        backup = re.sub(r"\.svg$", ".src.svg", args.src)
        shutil.copy2(args.src, backup)
        open(args.src, "w", encoding="utf-8").write(out_svg)
        print(f"\n  original backed up -> {backup}")
        print(f"  outlined written   -> {args.src}")
    else:
        out = re.sub(r"\.svg$", ".outlined.svg", args.src)
        open(out, "w", encoding="utf-8").write(out_svg)
        print(f"\n  preview written -> {out}   (re-run with --apply to replace {args.src})")

    print(f"  size: {len(svg):,} -> {len(out_svg):,} bytes")
    print(f"  <text> elements remaining: {remaining}")


if __name__ == "__main__":
    main()
