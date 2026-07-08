#!/bin/sh
# Technic Games — performance budget.
#
#   sh tools/check-budget.sh
#
# Measures what a first-time visitor actually downloads to see the home page,
# and fails if any bucket is over budget. Run it before every deploy.
# Text assets are measured gzipped, because GitHub Pages serves them gzipped.

set -e
cd "$(dirname "$0")/.."

fail=0

gz() { gzip -9 -c "$1" | wc -c | tr -d ' '; }
raw() { wc -c < "$1" | tr -d ' '; }

check() {
  name=$1; actual=$2; budget=$3
  pct=$((actual * 100 / budget))
  if [ "$actual" -gt "$budget" ]; then
    printf "  FAIL  %-26s %7d B  > budget %7d B  (%d%%)\n" "$name" "$actual" "$budget" "$pct"
    fail=1
  else
    printf "  ok    %-26s %7d B  / budget %7d B  (%d%%)\n" "$name" "$actual" "$budget" "$pct"
  fi
}

# --- render-blocking / critical path -----------------------------------
code=$(( $(gz index.html) + $(gz assets/styles.css) + $(gz assets/main.js) + $(gz assets/games.js) ))
fonts=$(( $(raw assets/fonts/inter-var.woff2) + $(raw assets/fonts/fredoka-var.woff2) ))
hero=$(raw assets/hero.webp)

# --- lazy, but still on the page ---------------------------------------
thumbs=0
for f in assets/fsm-*-thumb.webp; do thumbs=$(( thumbs + $(raw "$f") )); done
icon=$(raw assets/fsm-icon.webp)

echo "Technic Games — first-view budget (home page)"
echo
# 30 KB. Two named, deliberate costs live in this bucket:
#   ~5.3 KB gz  the brand logo, inlined into every page. Inlining is what lets
#               its wordmark use currentColor and follow the theme, at zero
#               HTTP requests. Serving it as <img> would need a second dark
#               variant and 1-2 requests, and move the bytes to another bucket.
#   ~3.4 KB gz  source comments. There is no build step, so they ship. In a
#               no-build repo, code that explains itself is worth 3 KB.
# Minify + externalise the logo and this bucket drops to ~17 KB.
check "HTML+CSS+JS (gzipped)" "$code"   30720    # 30 KB
check "fonts (woff2, latin)"  "$fonts"  81920    # 80 KB
check "hero image (LCP)"      "$hero"   40960    # 40 KB
check "screenshot thumbnails" "$thumbs" 102400   # 100 KB
check "game icon"             "$icon"    10240   # 10 KB

total=$(( code + fonts + hero + thumbs + icon ))
echo
check "TOTAL first view"      "$total"  266240   # 260 KB

echo
echo "Not counted (correctly excluded from first view):"
echo "  - assets/fsm-*-full.webp   fetched only when the lightbox opens"
echo "  - assets/og-image.png      fetched only by social crawlers"
echo "  - assets/fsm-*.jpg         sources; never referenced by the site"
echo "  - assets/fsm-icon.svg      source; never referenced by the site"
echo "  - assets/logo.svg          inlined into the HTML; kept for JSON-LD + press"

if [ "$fail" -ne 0 ]; then
  echo
  echo "Budget exceeded. See PERFORMANCE.md before raising a number."
  exit 1
fi
echo
echo "All buckets within budget."
