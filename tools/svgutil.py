"""Shared SVG fixes, used by both outline-logo.py and sync-logo.py."""
import re

FILTER_TAG = re.compile(r"<filter\b[^>]*>")

# Enough headroom for a dy=7 offset blurred at stdDeviation=5 (~22 user units)
# on a wordmark whose ink box is ~146 units tall.
REGION = 'x="-20%" y="-20%" width="140%" height="150%"'


def normalize_filter_regions(svg):
    """Give region-less `filterUnits="userSpaceOnUse"` filters a bbox-relative region.

    Illustrator exports drop shadows as:

        <filter id="drop-shadow-1" filterUnits="userSpaceOnUse"> … </filter>

    With no x/y/width/height, the filter region falls back to the spec default
    of (-10%, -10%, 120%, 120%). Under `userSpaceOnUse` those percentages
    resolve against the VIEWPORT, but the region is positioned in the *local*
    user space of the element that references the filter.

    A wordmark <g> translated down to its baseline therefore has its glyphs at
    NEGATIVE y (roughly -145 .. +3), while the region's top edge sits at
    y = -10% x viewport height = -45.77. Everything above that is clipped, and
    the wordmark loses its top third — a clean horizontal slice.

    Switching to `objectBoundingBox` makes the region follow the element's own
    bounding box, so it cannot slice the thing it is supposed to shadow.
    Filters that already declare an explicit region are left alone.

    Returns (svg, number_of_filters_fixed).
    """
    fixed = 0

    def repair(m):
        nonlocal fixed
        tag = m.group(0)
        if 'filterUnits="userSpaceOnUse"' not in tag:
            return tag
        if re.search(r'\s(x|y|width|height)=', tag):
            return tag  # an explicit region: the designer meant it
        fixed += 1
        return tag.replace('filterUnits="userSpaceOnUse"',
                           f'filterUnits="objectBoundingBox" {REGION}')

    return FILTER_TAG.sub(repair, svg), fixed


def unbounded_filters(svg):
    """Ids of filters that are userSpaceOnUse with no explicit region."""
    out = []
    for m in FILTER_TAG.finditer(svg):
        tag = m.group(0)
        if 'filterUnits="userSpaceOnUse"' in tag and not re.search(r'\s(x|y|width|height)=', tag):
            fid = re.search(r'id="([^"]+)"', tag)
            out.append(fid.group(1) if fid else "?")
    return out
