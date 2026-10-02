# Keeping technicgames.com fast

This site has no build step and no dependencies. That is what keeps it fast, and
it is also what makes it easy to accidentally make slow — nothing will warn you.
These are the rules. There are two commands and six rules.

## The commands

```sh
# After dropping new art into assets/ (screenshots, icon), or replacing
# anything in the Pushlings press kit (pushlings-press/images/):
python3 tools/optimize-assets.py

# After replacing assets/logo.svg:
python3 tools/outline-logo.py --apply   # bake the wordmark into paths
python3 tools/sync-logo.py              # regenerate the inline <svg> in all 3 pages + the footer logo

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

## Current page weight (home page)

Above the fold — what the first screen needs:

| Bucket | Actual | Budget |
| --- | --- | --- |
| HTML + CSS + JS, gzipped | 37 KB | 40 KB |
| Fonts (woff2, latin) | 76 KB | 80 KB |
| Hero phones (3 screenshots; the centre one is the LCP) | 58 KB | 80 KB |
| Game icons | 13 KB | 20 KB |
| **Total above the fold** | **185 KB** | **220 KB** |

Below the fold — lazy, loads as you scroll:

| Bucket | Actual | Budget |
| --- | --- | --- |
| Game card screenshots (one per game) | 85 KB | 150 KB |
| Pushlings key art + logo | 66 KB | 80 KB |
| Worlds strip (10 tiles) | 80 KB | 100 KB |
| Footer logo, gzipped | 5 KB | 8 KB |
| **Total whole page** | **421 KB** | **560 KB** |

The code bucket was raised from 30 KB to 40 KB, deliberately, for the 2026
redesign (launch banner, worlds strip, values, studio/press panels, full footer,
a fourth game). Every other number came *down* for the first screen: the old
hero image is gone and the details-sheet screenshots no longer load up front.

Not counted, because a visitor only downloads them on request: the details
sheet's screenshots (when it opens), `*-full.webp` (lightbox), the trailer
(`preload="none"`), `og-image.png` (social crawlers), and the press kit, which is
its own page. Sources (`*.jpg`, `fsm-icon.svg`, `assets/lbs/`, `assets/pnd/`,
`pushlings-press/images/`) are never referenced by the home page.

---

## Rule 1 — Never reference a source image from the site

`assets/fsm-1.jpg` is 400 KB and gets painted into a 220 px box. Three of them
was **1.05 MB to draw three thumbnails**.

The site only ever references the derivatives that `tools/optimize-assets.py`
writes:

- `fsm-N-thumb.webp` — 440 px wide, loads with the card
- `fsm-N-full.webp` — 1080 px wide, loads *only* when the lightbox opens
- `fsm-icon.webp` — 192 px

Pushlings is the same, except its masters live in the press kit
(`pushlings-press/images/`), which is served as-is at `/pushlings-press/`. The
optimiser reads them from there and writes `pl-*.webp` (screenshots, icon, key
art, logo, worlds). Never point the home page at the press kit's JPGs.

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

- Above the fold (the hero phones): no `loading="lazy"`. The centre phone is
  the LCP element, so it alone gets `fetchpriority="high"` and a
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

Two things on the page run on a clock. Both stop when you can't see them:

- **The launch countdown** ticks once a second, writes a digit only when it
  changes, and stops entirely while the banner is off screen (an
  IntersectionObserver starts and stops the interval).
- **The worlds strip** is a CSS `transform` animation, paused off screen, on
  hover, and by its Pause button (moving content must be stoppable, WCAG 2.2.2).

The hero parallax caches the stage's rect on pointer-enter and resize, so a
pointer move does no layout reads, and it writes in one rAF per frame.

## Rule 5 — Animate `transform` and `opacity`. Never `transition: all`

`transition: all` animates layout properties you did not intend, and forces
reflow. Name the properties.

Everything that moves lives in one block at the bottom of `styles.css`, inside
`@media (prefers-reduced-motion: no-preference)`, so `prefers-reduced-motion: reduce`
yields a page with no leftover transitions at all. `tools/lint.py` verifies both
halves of this.

The only layout property we animate is the 9 px → 24 px carousel dot, on a
handful of elements, deliberately.

With Reduce Motion on, there is no reveal, no parallax, no floating chips, and
the worlds strip is a plain swipeable row.

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

The footer is dark in both themes, so its logo does not need to follow the
theme: it is `assets/logo-on-dark.svg`, a plain lazy `<img>`, and
`sync-logo.py` generates it from the same master. A second inline copy would
cost ~5 KB gzipped per page and duplicate every id.

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
Watch three numbers: **LCP** (the centre hero phone), **CLS** (must be 0 — every image
has explicit dimensions), and **TBT** (there is almost no JS on the main thread).
