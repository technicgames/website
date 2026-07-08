# Keeping technicgames.com fast

This site has no build step and no dependencies. That is what keeps it fast, and
it is also what makes it easy to accidentally make slow — nothing will warn you.
These are the rules. There are two commands and six rules.

## The commands

```sh
# After dropping new art into assets/ (screenshots, icon):
python3 tools/optimize-assets.py

# After replacing assets/logo.svg:
python3 tools/outline-logo.py --apply   # bake the wordmark into paths
python3 tools/sync-logo.py              # regenerate the inline <svg> in all 3 pages

# Before every deploy:
sh tools/check-budget.sh     # bytes:      fails if any bucket is over
python3 tools/lint.py        # structure:  fails if any rule below is broken
```

`check-budget.sh` fails loudly if any bucket goes over. Do not raise a number to
make it pass. Find the bytes.

`lint.py` enforces Rules 1, 2, 4, 5 and 6 mechanically. It strips comments before
checking — a naive `grep -c 'transition: all' assets/styles.css` returns 2, because
it matches the two comments telling you *not* to write `transition: all`. Don't
hand-roll these greps; run the linter.

## Current first view (home page)

| Bucket | Actual | Budget |
| --- | --- | --- |
| HTML + CSS + JS, gzipped | 20.4 KB | 24 KB |
| Fonts (woff2, latin) | 76 KB | 80 KB |
| Hero image (the LCP element) | 24 KB | 40 KB |
| Logo, gzipped | 2.3 KB | 4 KB |
| Screenshot thumbnails | 89 KB | 100 KB |
| Game icon | 3.9 KB | 10 KB |
| **Total** | **215 KB** | **260 KB** |

Not counted, because a first-time visitor never downloads them: `fsm-*-full.webp`
(lightbox only), `og-image.png` (social crawlers only), `fsm-*.jpg` and
`fsm-icon.svg` (sources, never referenced).

---

## Rule 1 — Never reference a source image from the site

`assets/fsm-1.jpg` is 400 KB and gets painted into a 220 px box. Three of them
was **1.05 MB to draw three thumbnails**.

The site only ever references the derivatives that `tools/optimize-assets.py`
writes:

- `fsm-N-thumb.webp` — 440 px wide, loads with the card
- `fsm-N-full.webp` — 1080 px wide, loads *only* when the lightbox opens
- `fsm-icon.webp` — 192 px

Keep the sources committed (they are the masters), but never point `games.js` at
them. If you add a game, run the optimiser and reference its output.

**Watch out:** `fsm-icon.svg` looks like a vector but is a 1024×1024 PNG in an SVG
wrapper — 173 KB. An `.svg` extension is not a promise of smallness.

## Rule 2 — Fonts are self-hosted, and there is one file per family

`assets/fonts/inter-var.woff2` and `fredoka-var.woff2` are **variable** fonts: one
file covers every weight. Google serves the identical file for `wght@400` and
`wght@600`, so asking for more weights costs nothing — but *adding a family* costs
30–50 KB.

Do not re-add the `fonts.googleapis.com` `<link>`. It costs two DNS+TLS handshakes
to two origins plus a render-blocking stylesheet, before a single glyph downloads.

Both fonts are preloaded, and both are `font-display: swap`, so text paints
immediately in the fallback stack and swaps when the font lands.

If you add a weight, check it is inside the declared range (`300 700` for Fredoka,
`100 900` for Inter). Outside it, the browser synthesises a fake bold.

## Rule 3 — Every image gets `width`, `height`, and a loading strategy

- Above the fold (the hero): `fetchpriority="high"`, no `loading="lazy"`, and a
  `<link rel="preload" as="image">`.
- Everything else: `loading="lazy" decoding="async"`.
- Always set `width` and `height` attributes, even when CSS resizes the image.
  They reserve the box and give you a **CLS of zero**. `--shot-ratio` does the same
  job for screenshots.

Exactly one image should ever be preloaded: the LCP element. Preloading more
delays it.

## Rule 4 — One scroll listener, passive, rAF-throttled, no layout reads

`main.js` has exactly one `scroll` listener. It is `{ passive: true }`, it
coalesces into a single `requestAnimationFrame`, and it reads `scrollY` and
nothing else. It writes only when the value actually changed.

The screenshot carousel measures its geometry in `measure()` and caches it.
Scroll handlers read `scrollLeft` against the cache. **Never call `offsetLeft`,
`clientWidth`, or `getBoundingClientRect()` inside a scroll handler** — each one
forces a synchronous reflow, on every frame of a touch drag.

Prefer `IntersectionObserver` (scrollspy, reveal) and `ResizeObserver` (carousel
re-measure) over scroll maths. They run off the main thread's critical path.

## Rule 5 — Animate `transform` and `opacity`. Never `transition: all`

`transition: all` animates layout properties you did not intend, and forces
reflow. Name the properties.

Everything that moves lives in one block at the bottom of `styles.css`, inside
`@media (prefers-reduced-motion: no-preference)`, so `prefers-reduced-motion: reduce`
yields a page with no leftover transitions at all. `tools/lint.py` verifies both
halves of this.

The only layout property we animate is the 9 px → 24 px carousel dot, on three
elements, deliberately.

`backdrop-filter` on the sticky header re-blurs on every scroll frame. It is one
small strip and worth it. Do not add a second one to anything that scrolls.

## Rule 6b — Replacing assets/logo.svg is not enough. Run the two logo commands

The header logo is an **inline `<svg>`, generated from `assets/logo.svg`**. It is
inlined so its wordmark can be `currentColor` and follow the theme (an `<img>`'d
SVG is an isolated document; page CSS cannot reach inside it), and because that
costs zero HTTP requests.

The consequence: **dropping a new file into `assets/` changes nothing on the
page.** Run `outline-logo.py --apply` then `sync-logo.py`. `tools/lint.py` fails
if the pages are out of sync, so this cannot rot silently.

Two things a fresh Illustrator export will do to you, both caught by the lint:

1. **Live `<text>`.** An SVG cannot carry a font. Rendered anywhere but the
   designer's Mac, the wordmark falls back to Times New Roman. `outline-logo.py`
   bakes the glyphs into `<path>`s.

2. **`filterUnits="userSpaceOnUse"` with no region.** The drop-shadow's default
   region resolves against the *viewport* but is positioned in the element's
   *local* space. A wordmark translated to its baseline has glyphs at negative
   `y`, so the region's top edge slices off the top third of every letter. The
   tools rewrite such filters to `objectBoundingBox`, whose region follows the
   element it shadows.

`assets/logo.svg` stays on disk as the outlined, repaired master — it is what the
JSON-LD `logo` points at and what you hand to press. Your untouched original is
kept at `assets/logo.src.svg`.

Path coordinates are written at **one decimal place**. The logo is a 1920-unit
viewBox rendered into a 126px mark: one unit is 0.066px, so two decimals encodes
0.0007px of precision — invisible, and long digit strings defeat gzip. At the
header size, 1dp vs 2dp differs by **zero pixels**.

## Rule 6 — The theme costs nothing at runtime

No component hard-codes a colour. Every colour is a custom property defined once
under `:root` and overridden once under `:root[data-theme="dark"]`. Switching
themes is one attribute write; the browser restyles, it does not re-layout.

The inline `<script>` in each `<head>` resolves the theme **before first paint**,
which is why there is no flash. It must stay **above** the stylesheet link — a
script placed after a `<link rel=stylesheet>` blocks on that CSS download, which
would reintroduce the flash it exists to prevent.

Adding a component means adding a token, not a second colour block.

---

## Things deliberately not done

- **No minifier.** Source comments ship (~3.4 KB gzipped). In a repo with no build
  step, code that explains itself is worth more than 3 KB. If you ever add a build,
  the code bucket drops to ~17 KB.
- **No `content-visibility: auto`.** It would skip rendering off-screen cards, but
  it also returns `0` for `offsetWidth` on skipped subtrees, which breaks the
  carousel's `measure()`, and it complicates in-page anchor scrolling. The page is
  short. Not worth the bugs.
- **No dark theme without JS.** The toggle needs JS, and a no-JS visitor gets the
  light theme even if their OS is dark. Supporting CSS-only system-dark means
  duplicating the whole token block under `@media (prefers-color-scheme: dark)`.
  If you want it, that is the trade.

## Verifying

GitHub Pages sets its own cache headers; you cannot control them. What you *can*
control is what you ship.

```sh
sh tools/check-budget.sh     # bytes
python3 tools/lint.py        # structure
```

Then, on the deployed URL, run Lighthouse in Chrome DevTools (mobile preset).
Watch three numbers: **LCP** (the hero image), **CLS** (must be 0 — every image
has explicit dimensions), and **TBT** (there is almost no JS on the main thread).
