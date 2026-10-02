#!/bin/sh
# Technic Games — performance budget.
#
#   sh tools/check-budget.sh
#
# Measures what a first-time visitor actually downloads on the home page, and
# fails if any bucket is over budget. Run it before every deploy.
# Text assets are measured gzipped, because GitHub Pages serves them gzipped.
#
# Two totals:
#   ABOVE THE FOLD  what the first screen needs: code, fonts, the hero.
#   WHOLE PAGE      everything the page loads as you scroll (lazy images too).
# Not counted at all: things that only download when you ask for them
# (the details sheet's screenshots, -full.webp, the trailer).

set -e
cd "$(dirname "$0")/.."

fail=0

gz() { gzip -9 -c "$1" | wc -c | tr -d ' '; }
raw() { wc -c < "$1" | tr -d ' '; }
sum() { t=0; for f in "$@"; do t=$(( t + $(raw "$f") )); done; echo "$t"; }

check() {
  name=$1; actual=$2; budget=$3
  pct=$((actual * 100 / budget))
  if [ "$actual" -gt "$budget" ]; then
    printf "  FAIL  %-30s %7d B  > budget %7d B  (%d%%)\n" "$name" "$actual" "$budget" "$pct"
    fail=1
  else
    printf "  ok    %-30s %7d B  / budget %7d B  (%d%%)\n" "$name" "$actual" "$budget" "$pct"
  fi
}

# --- above the fold ----------------------------------------------------
code=$(( $(gz index.html) + $(gz assets/styles.css) + $(gz assets/main.js) + $(gz assets/games.js) ))
fonts=$(( $(raw assets/fonts/inter-var.woff2) + $(raw assets/fonts/fredoka-var.woff2) ))

# The hero's three phone screenshots, read from the markup so a swap is
# measured automatically. The centre one is the LCP element.
hero_files=$(grep -o 'class="phone [^"]*"[^>]*><img src="[^"]*"' index.html | sed 's/.*src="//; s/"$//')
hero=$(sum $hero_files)
icons=$(sum assets/*-icon.webp)

# --- below the fold (lazy) ---------------------------------------------
# Each game card shows ONE screenshot. Which one is set in games.js
# (cardShot), so budget the largest thumbnail of every game: conservative,
# and it can't drift when you change cardShot.
cards=0
for first in assets/*-1-thumb.webp; do
  prefix=${first%-1-thumb.webp}
  max=0
  for f in "$prefix"-*-thumb.webp; do s=$(raw "$f"); [ "$s" -gt "$max" ] && max=$s; done
  cards=$(( cards + max ))
done

art=$(( $(raw assets/pl-keyart-1920.webp) + $(raw assets/pl-logo-white.webp) + $(raw assets/pl-keyart-960.webp) ))
worlds=$(sum assets/pl-world-*.webp)
footer_logo=$(gz assets/logo-on-dark.svg)

echo "Technic Games — page-weight budget (home page)"
echo
echo "Above the fold"
# 40 KB. Was 30 KB for a page with one section per game; the redesign added
# the launch banner, worlds strip, values, studio/press panels, a full footer
# and a fourth game (~+10 KB). Deliberate costs inside this bucket:
#   ~5.4 KB gz  the brand logo, inlined so its wordmark follows the theme
#   ~4 KB gz    source comments. There is no build step, so they ship.
check "HTML+CSS+JS (gzipped)" "$code" 40960            # 40 KB
check "fonts (woff2, latin)" "$fonts" 81920            # 80 KB
check "hero phones (LCP)" "$hero" 81920                # 80 KB (3 screenshots)
check "game icons" "$icons" 20480                      # 20 KB (~4 KB/game)
above=$(( code + fonts + hero + icons ))
check "TOTAL above the fold" "$above" 225280           # 220 KB

echo
echo "Below the fold (lazy-loaded as you scroll)"
check "game card screenshots" "$cards" 153600          # 150 KB (~35 KB/game)
check "Pushlings key art + logo" "$art" 81920          # 80 KB
check "worlds strip (10 tiles)" "$worlds" 102400       # 100 KB
check "footer logo (gzipped)" "$footer_logo" 8192      # 8 KB
whole=$(( above + cards + art + worlds + footer_logo ))
# Grows ~40 KB per game card. Don't raise it to silence one line; check
# the per-bucket lines first.
check "TOTAL whole page" "$whole" 573440               # 560 KB

echo
echo "Not counted (only downloaded on request):"
echo "  - details-sheet screenshots   when a game's Details sheet opens"
echo "  - assets/*-full.webp          when the lightbox opens"
echo "  - the Pushlings trailer       when someone presses play (preload=none)"
echo "  - assets/og-image.png         social crawlers only"
echo "  - pushlings-press/            the press kit is its own page"

if [ "$fail" -ne 0 ]; then
  echo
  echo "Budget exceeded. See PERFORMANCE.md before raising a number."
  exit 1
fi
echo
echo "All buckets within budget."
