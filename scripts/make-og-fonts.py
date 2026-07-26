"""
Build static TTF instances of the site's variable webfonts for OG image rendering.

Why this exists:
  resvg (used by scripts/gen-og.mjs) cannot read woff2, and its variable-font
  support is not reliable enough to trust. Outfit's `wght` axis defaults to 100,
  so handing resvg the variable font yields a Thin wordmark no matter what
  font-weight the SVG asks for.

  So: decompress woff2 -> instance the wght axis at the exact weights we need ->
  give each result a unique family name resvg can match unambiguously.

Also emits metrics.json (per-family unitsPerEm + ASCII advance widths) so that
gen-og.mjs can wrap text to an exact pixel width. SVG 1.1 has no auto-wrap and
resvg will happily run a tagline straight off the edge of the canvas.

Output lands in .cache/fonts-ttf/ (gitignored). These are build-time artefacts
only; the browser is still served the woff2 files from public/fonts/.

Run via:  npm run og
"""

import json
import pathlib
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "fonts"
OUT = ROOT / ".cache" / "fonts-ttf"

# (source woff2, weight on the wght axis, unique family name for resvg)
TARGETS = [
    ("outfit-latin.woff2", 800, "OgOutfitBold"),
    ("outfit-latin.woff2", 400, "OgOutfitRegular"),
    ("jetbrains-mono-latin.woff2", 600, "OgMonoSemi"),
]

# Windows(3,1,0x409) and Mac(1,0,0) name records, so any shaper agrees on the family.
NAME_IDS = (1, 3, 4, 6, 16, 17)
PLATFORMS = ((3, 1, 0x409), (1, 0, 0))


def build(woff_name: str, weight: int, family: str) -> dict:
    src = SRC / woff_name
    if not src.is_file():
        sys.exit(f"missing source font: {src}")

    font = TTFont(src)
    if "fvar" not in font:
        sys.exit(f"{woff_name} is not a variable font; cannot instance it")

    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
    if "wght" not in axes:
        sys.exit(f"{woff_name} has no wght axis (found {sorted(axes)})")

    lo, hi = axes["wght"]
    if not lo <= weight <= hi:
        sys.exit(f"{woff_name}: weight {weight} outside available range {lo}-{hi}")

    inst = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=False)

    names = inst["name"]
    for nid in NAME_IDS:
        for platform_id, encoding_id, lang_id in PLATFORMS:
            names.setName(family, nid, platform_id, encoding_id, lang_id)

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{family}.ttf"
    inst.flavor = None  # emit plain TTF, not woff/woff2
    inst.save(dest)

    resolved = TTFont(dest)["name"].getDebugName(1)
    if resolved != family:
        sys.exit(f"family rename failed for {dest.name}: got {resolved!r}")

    print(f"  {woff_name} @ wght {weight} -> {dest.name} ({dest.stat().st_size:,} bytes)")

    # Advance widths for printable ASCII, taken from the *instanced* font so the
    # numbers match the weight actually being rendered.
    hmtx = inst["hmtx"]
    cmap = inst.getBestCmap()
    widths = {}
    for cp in range(32, 127):
        glyph = cmap.get(cp)
        if glyph is not None and glyph in hmtx.metrics:
            widths[str(cp)] = hmtx[glyph][0]

    return {"unitsPerEm": inst["head"].unitsPerEm, "widths": widths}


def main() -> None:
    print("building static TTF instances for OG rendering:")
    metrics = {}
    for woff_name, weight, family in TARGETS:
        metrics[family] = build(woff_name, weight, family)

    metrics_path = OUT / "metrics.json"
    metrics_path.write_text(json.dumps(metrics), encoding="utf-8")
    print(f"  metrics.json ({metrics_path.stat().st_size:,} bytes)")
    print(f"done -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
