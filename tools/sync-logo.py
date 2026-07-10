#!/usr/bin/env python3
"""
Inline assets/logo.svg into the header of every page, theme-aware.

    python3 tools/sync-logo.py            # rewrite the pages
    python3 tools/sync-logo.py --check    # exit 1 if the pages are stale

Why inline at all
-----------------
An <img>'d SVG is an isolated document: page CSS cannot reach inside it. The
logo's wordmark is #4d4d4d and its gamepad is `gray` — both disappear on the
dark header. `filter: invert()` would also invert the pink brand colour.
Inlining lets those two paints become `currentColor` / `var(--muted)` and
follow the theme, at zero extra HTTP requests.

Why a tool
----------
Inlining once, by hand, made assets/logo.svg stop being what the page renders —
replacing the file changed nothing, silently. So the inline block is GENERATED
from the file, and `tools/lint.py` fails if a page is out of sync. Replace
logo.svg, run this (or optimize-assets.py, which calls it), and you're done.

The file itself stays on disk: it's what the JSON-LD `logo` points at, and what
you hand to press.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svgutil import normalize_filter_regions  # noqa: E402

SRC = "assets/logo.svg"
PAGES = ("index.html", "privacy.html", "support.html")
PREFIX = "tglogo-"
HEIGHT = 40  # keep in step with --logo-height in assets/styles.css

START = "<!-- LOGO:START — generated from assets/logo.svg by tools/sync-logo.py. Do not edit by hand. -->"
END = "<!-- LOGO:END -->"

# Paints that must follow the theme instead of being fixed.
#   the wordmark ink  -> currentColor, driven by `.logo { color: var(--ink) }`
#   the gamepad grey  -> var(--muted), which is legible on paper and on plum
REPAINT = {
    "#4d4d4d": "currentColor",
    "gray": "var(--muted)",
}


def build():
    svg = open(SRC, encoding="utf-8").read()

    if "<text" in svg:
        sys.exit(f"{SRC} still contains live <text>. Run: python3 tools/outline-logo.py --apply")

    # Belt and braces: outline-logo.py already repairs these, but an
    # already-outlined export dropped straight into assets/ would skip it.
    svg, _ = normalize_filter_regions(svg)

    vb = re.search(r'viewBox="([\d.\s-]+)"', svg).group(1).split()
    vw, vh = float(vb[2]), float(vb[3])

    # 1. Drop any full-canvas background rect (an artboard leftover). Remember
    #    its class so we can delete the now-dead style rule too.
    plate_classes = set()

    def drop_plate(m):
        attrs = m.group(0)
        w = re.search(r'width="([\d.]+)"', attrs)
        h = re.search(r'height="([\d.]+)"', attrs)
        if w and h and float(w.group(1)) >= vw * 0.99 and float(h.group(1)) >= vh * 0.99:
            cls = re.search(r'class="([^"]+)"', attrs)
            if cls:
                plate_classes.update(cls.group(1).split())
            return ""
        return attrs

    svg = re.sub(r"<rect\b[^>]*/>", drop_plate, svg)

    # 1b. Delete the plate's now-dead style rules. This MUST happen before
    #     namespacing: the rect is already gone, so its class no longer appears
    #     in any class="" attribute and would never get a prefix — leaving an
    #     unprefixed `.cls-12` rule inside a document-global <style>.
    for cls in plate_classes:
        svg = re.sub(rf"\.{re.escape(cls)}\s*\{{[^}}]*\}}", "", svg)

    # 2. Namespace every id, and every url(#id) that points at one.
    ids = re.findall(r'id="([^"]+)"', svg)
    for i in ids:
        svg = svg.replace(f'id="{i}"', f'id="{PREFIX}{i}"')
        svg = svg.replace(f"url(#{i})", f"url(#{PREFIX}{i})")

    # 3. Namespace every class. An inline <style> is document-global, so an
    #    unprefixed `.cls-1` would style the whole page.
    classes = sorted({c for a in re.findall(r'class="([^"]+)"', svg) for c in a.split()},
                     key=len, reverse=True)
    for c in classes:
        svg = re.sub(rf'(?<![\w-]){re.escape(c)}(?![\w-])', f"{PREFIX}{c}", svg)

    # 4. Rewrite the theme-dependent paints, drop the dead plate rule, and
    #    scope every selector under .logo as belt and braces.
    style = re.search(r"<style>(.*?)</style>", svg, re.S)
    css = style.group(1)
    for old, new in REPAINT.items():
        css = re.sub(rf"(fill|stroke):\s*{re.escape(old)}\s*;", rf"\1: {new};", css)

    # Rebuild the rules with every selector scoped under .logo. An inline
    # <style> is document-global; the prefix makes collisions impossible and
    # the scope makes it obvious.
    rules = re.findall(r"([^{}]+)\{([^}]*)\}", css)
    scoped = []
    for sel, decl in rules:
        sel = " ".join(sel.split())
        decl = " ".join(decl.split())
        if not sel or not decl:
            continue
        sel = ", ".join(f".logo {s.strip()}" for s in sel.split(","))
        scoped.append(f"        {sel} {{ {decl} }}")
    css = "\n" + "\n".join(scoped) + "\n      "
    svg = svg[:style.start(1)] + css + svg[style.end(1):]

    # 5. Strip the root <svg> chrome and rebuild it.
    inner = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    inner = re.sub(r"</svg>\s*$", "", inner).strip()
    inner = "\n".join("      " + l.strip() for l in inner.splitlines() if l.strip())

    width = round(HEIGHT * vw / vh)
    return (
        f"{START}\n"
        f'    <a class="logo" href="index.html" aria-label="Technic Games — home">\n'
        f'      <svg viewBox="0 0 {vw:g} {vh:g}" width="{width}" height="{HEIGHT}" '
        f'aria-hidden="true" focusable="false">\n'
        f"{inner}\n"
        f"      </svg>\n"
        f"    </a>\n"
        f"    {END}"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    block = build()
    stale = []

    for page in PAGES:
        src = open(page, encoding="utf-8").read()
        pat = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)

        if pat.search(src):
            new = pat.sub(lambda _: block, src)
        else:
            # first run: replace whatever <a class="logo">…</a> is there
            m = re.search(r'[ \t]*<a class="logo".*?</a>', src, re.S)
            if not m:
                sys.exit(f"{page}: no .logo element to replace")
            new = src[:m.start()] + "    " + block + src[m.end():]

        if new != src:
            stale.append(page)
            if not args.check:
                open(page, "w", encoding="utf-8").write(new)

    if args.check:
        if stale:
            print("  STALE: " + ", ".join(stale))
            print("  assets/logo.svg changed but the pages weren't regenerated.")
            print("  Run: python3 tools/sync-logo.py")
            sys.exit(1)
        print("  logo in sync across all pages")
        return

    if stale:
        for p in stale:
            print(f"  synced {p}")
    else:
        print("  already in sync")


if __name__ == "__main__":
    main()
