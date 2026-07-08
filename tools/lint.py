#!/usr/bin/env python3
"""
Technic Games — structural lint. Run before every deploy:

    python3 tools/lint.py

Enforces the invariants in PERFORMANCE.md. Every check strips comments first:
a naive `grep -c 'transition: all'` matches the comment that tells you not to
write `transition: all`, and reports a violation that isn't there.
"""
import re
import subprocess
import sys

CSS = "assets/styles.css"
JS = "assets/main.js"

fails = []


def strip_css_comments(s):
    return re.sub(r"/\*.*?\*/", "", s, flags=re.S)


def strip_js_comments(s):
    """Block comments, plus whole-line // comments. Deliberately does NOT
    touch trailing comments, so `https://` inside a string is never mangled."""
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"^[ \t]*//.*$", "", s, flags=re.M)


def call_source(text, start):
    """Return the full `foo(...)` call text beginning at `start`, by matching
    parentheses. A regex stopping at the first `;` would stop inside a callback
    body and miss the trailing options object."""
    i = text.index("(", start)
    depth = 0
    for k in range(i, len(text)):
        if text[k] == "(":
            depth += 1
        elif text[k] == ")":
            depth -= 1
            if depth == 0:
                return text[start:k + 1]
    return text[start:]


def strip_block(text, selector):
    """Remove one brace-matched block beginning at `selector`."""
    i = text.index(selector)
    j = text.index("{", i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return text[:i] + text[k + 1:]
    raise ValueError(f"unbalanced braces after {selector!r}")


def extract_block(text, selector):
    i = text.index(selector)
    j = text.index("{", i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return text[i:k + 1], text[:i] + text[k + 1:]
    raise ValueError(f"unbalanced braces after {selector!r}")


css = strip_css_comments(open(CSS).read())
js = open(JS).read()

# --- Rule 5a: no `transition: all` -------------------------------------
n = len(re.findall(r"transition\s*:\s*all", css))
if n:
    fails.append(f"{CSS}: {n}x `transition: all` (animates layout properties)")

# --- Rule 5b: all motion inside the reduced-motion gate ------------------
GATE = "@media (prefers-reduced-motion: no-preference)"
if css.count(GATE) != 1:
    fails.append(f"{CSS}: expected exactly 1 reduced-motion gate, found {css.count(GATE)}")
else:
    gate, outside = extract_block(css, GATE)
    motion = re.compile(r"(\btransition\s*:|\banimation\s*:|\bscroll-behavior\s*:)")
    stray = [l.strip() for l in outside.splitlines() if motion.search(l)]
    for s in stray:
        fails.append(f"{CSS}: motion outside the reduced-motion gate -> {s}")
    inside_count = len(motion.findall(gate))

# --- Rule 6: no raw colours in component CSS ----------------------------
body = strip_block(css, ":root {")
body = strip_block(body, ':root[data-theme="dark"] {')
raw_hex = re.findall(r"#[0-9a-fA-F]{3,8}\b", body)
raw_rgb = re.findall(r"rgba?\([^)]*\)", body)
for c in sorted(set(raw_hex)) + sorted(set(raw_rgb)):
    fails.append(f"{CSS}: raw colour {c} outside the token blocks (add a token)")

# --- Rule 4: exactly one scroll listener, passive ------------------------
starts = [m.start() for m in re.finditer(r'addEventListener\(\s*"scroll"', js)]
if len(starts) != 2:  # window scroll + the carousel viewport
    fails.append(f"{JS}: expected 2 scroll listeners (window + carousel), found {len(starts)}")
for s in starts:
    if "passive: true" not in call_source(js, s):
        fails.append(f"{JS}: a scroll listener is not passive")

# --- Rule 4b: no layout reads inside the window scroll handler ----------
frame = re.search(r"function frame\(\) \{(.*?)\n    \}", js, re.S)
if not frame:
    fails.append(f"{JS}: could not find the rAF `frame()` handler to audit")
else:
    for bad in ("offsetLeft", "offsetWidth", "clientWidth", "getBoundingClientRect", "scrollWidth"):
        if bad in frame.group(1):
            fails.append(f"{JS}: `{bad}` inside the scroll frame handler forces reflow")

# --- Rule 1: the site must never reference a source image ---------------
for page in ("index.html", "privacy.html", "support.html", "assets/games.js"):
    src = open(page).read()
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    if page.endswith(".js"):
        src = strip_js_comments(src)
    for bad in (".jpg", "fsm-icon.svg"):
        if bad in src:
            fails.append(f"{page}: references unoptimised source `{bad}` (run tools/optimize-assets.py)")

# --- Rule 2: no third-party font origin ---------------------------------
for page in ("index.html", "privacy.html", "support.html"):
    if "fonts.googleapis.com" in open(page).read():
        fails.append(f"{page}: re-added the Google Fonts origin")

# --- Rule 7: the inlined logo must match assets/logo.svg ----------------
# The header logo is generated from the file. Once, it was inlined by hand:
# the file silently stopped being what the page rendered, and replacing
# assets/logo.svg changed nothing. This check makes that impossible.
logo_svg = open("assets/logo.svg", encoding="utf-8").read()

if "<text" in logo_svg:
    # An SVG's <text> depends on a font installed on the *visitor's* machine.
    fails.append("assets/logo.svg: contains live <text> — will render in a fallback font "
                 "for visitors without it. Run: python3 tools/outline-logo.py --apply")
else:
    r = subprocess.run([sys.executable, "tools/sync-logo.py", "--check"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        for line in r.stdout.strip().splitlines():
            fails.append(f"logo out of sync: {line.strip()}")

# --- Rule 8: no filter may clip the thing it shadows ---------------------
# Illustrator exports drop shadows as filterUnits="userSpaceOnUse" with no
# region. The default region then resolves against the viewport but is placed
# in the element's LOCAL space — so a wordmark translated to its baseline (with
# glyphs at negative y) gets its top third sliced off. Seen in the wild.
sys.path.insert(0, "tools")
from svgutil import unbounded_filters  # noqa: E402

bad_filters = unbounded_filters(logo_svg)
if bad_filters:
    fails.append(f"assets/logo.svg: filter(s) {bad_filters} are userSpaceOnUse with no region — "
                 f"they will clip the glyphs. Run: python3 tools/outline-logo.py --apply")

for page in ("index.html", "privacy.html", "support.html"):
    bad = unbounded_filters(open(page, encoding="utf-8").read())
    if bad:
        fails.append(f"{page}: inline logo has unbounded filter(s) {bad} (run tools/sync-logo.py)")

for page in ("index.html", "privacy.html", "support.html"):
    src = open(page, encoding="utf-8").read()
    m = re.search(r'<a class="logo".*?</a>', src, re.S)
    if not m:
        fails.append(f"{page}: no .logo element found")
        continue
    block = m.group(0)
    svg_attrs = re.search(r"<svg[^>]*>", block)
    if not svg_attrs:
        fails.append(f"{page}: logo is not an inline <svg> (run tools/sync-logo.py)")
        continue
    w = re.search(r'width="([\d.]+)"', svg_attrs.group(0))
    h = re.search(r'height="([\d.]+)"', svg_attrs.group(0))
    vb = re.search(r'viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"', svg_attrs.group(0))
    if not (w and h and vb):
        fails.append(f"{page}: logo <svg> missing width/height/viewBox (layout shift)")
    else:
        attr_aspect = float(w.group(1)) / float(h.group(1))
        vb_aspect = float(vb.group(1)) / float(vb.group(2))
        if abs(attr_aspect - vb_aspect) / vb_aspect > 0.01:
            fails.append(f"{page}: logo width/height ratio {attr_aspect:.3f} != "
                         f"viewBox ratio {vb_aspect:.3f} (layout shift)")
    # an inline <style> is document-global; every selector must be scoped
    st = re.search(r"<style>(.*?)</style>", block, re.S)
    if st:
        for sel, _decl in re.findall(r"([^{}]+)\{([^}]*)\}", st.group(1)):
            for part in sel.split(","):
                part = part.strip()
                if part and not part.startswith(".logo "):
                    fails.append(f"{page}: inline logo style `{part}` is not scoped to .logo (leaks into the page)")

# --- Rule 6: the theme script must precede every stylesheet -------------
# A <script> placed after a <link rel=stylesheet> blocks on that CSS download,
# which reintroduces the theme flash the script exists to prevent.
for page in ("index.html", "privacy.html", "support.html"):
    src = open(page).read()
    if "tg-theme" not in src:
        fails.append(f"{page}: missing the pre-paint theme script")
        continue
    script_at = src.index("tg-theme")
    sheets = [m.start() for m in re.finditer(r'<link[^>]+rel="stylesheet"', src)]
    if sheets and script_at > min(sheets):
        fails.append(f"{page}: theme script sits after a stylesheet link (causes a flash)")
    body_at = src.index("<body")
    if script_at > body_at:
        fails.append(f"{page}: theme script sits after <body> (causes a flash)")

print("Technic Games — structural lint\n")
if fails:
    for f in fails:
        print(f"  FAIL  {f}")
    print(f"\n{len(fails)} problem(s).")
    sys.exit(1)

print(f"  ok    no `transition: all`")
print(f"  ok    all {inside_count} motion declarations inside the reduced-motion gate")
print(f"  ok    no raw colours outside the token blocks")
print(f"  ok    scroll listeners passive; no layout reads in the rAF handler")
print(f"  ok    no unoptimised source images referenced")
print(f"  ok    no third-party font origin")
print(f"  ok    theme script runs before any stylesheet, on all 3 pages")
print(f"  ok    logo is a file reference with a matching aspect ratio, and is font-independent")
print("\nAll structural rules hold.")
