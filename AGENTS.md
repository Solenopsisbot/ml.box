# AGENTS.md — Repository Guidance for AI Agents & Developers

**ml.box** — the personal site for **solenopsisbot**. This document is the
contract for anyone (human or agent) touching this codebase.

---

## 1. Overview & Stack

- **Domain**: `ml.box`, deployed on Cloudflare Pages
- **Stack**: Vite + vanilla HTML5 / ES modules + vanilla CSS + **raw WebGL2**
- **Runtime dependencies: none.** `package.json` has an empty `dependencies`
  block and that is deliberate. Everything shipped to the browser is
  hand-written.
- **Aesthetic**: minimalist obsidian dark theme, frosted glass backdrop, static
  centered hero profile card.
- **Deploy**: Cloudflare Pages (`pages_build_output_dir = "./dist"`)

### There is no Three.js here anymore

The background used to be a Three.js `ShaderMaterial` on a `PlaneGeometry`.
That shipped **117 KB gzipped of 3D engine to draw a single rectangle**. It is
now raw WebGL2 in [src/bg-shader.js](src/bg-shader.js), drawing a single
fullscreen triangle.

| | before | after |
|---|---|---|
| JS, gzipped | 117.3 KB | **3.5 KB** |
| JS, raw | 465.6 KB | 9.3 KB |
| third-party origins | 2 (Google Fonts) | **0** |
| build time | ~1 s | ~280 ms |

**Do not reintroduce a 3D library.** If the background needs more capability,
extend the fragment shader. The entire visual is one fullscreen triangle.

---

## 2. Directory Structure

```
ml.box/
├── index.html                    # Document, meta/OG/JSON-LD, hero markup
├── vite.config.js                # Explicit build target + asset inline limit
├── wrangler.toml                 # Cloudflare Pages config
├── package.json                  # ZERO runtime deps. Keep it that way.
├── scripts/
│   ├── make-og-fonts.py          # woff2 -> static TTF instances + metrics (uv)
│   ├── gen-og.mjs                # renders og.png + all icon PNGs via resvg
│   └── smoke.mjs                 # real-Chrome smoke test of the built site
├── public/                       # copied verbatim to dist/ root
│   ├── favicon.svg               # single source of truth for the logo
│   ├── og.png                    # 1200x630 social card (GENERATED)
│   ├── apple-touch-icon.png      # 180x180 (GENERATED) — iOS ignores SVG
│   ├── favicon-32.png            # (GENERATED) legacy fallback
│   ├── icon-192.png              # (GENERATED) PWA
│   ├── icon-512.png              # (GENERATED) PWA
│   ├── manifest.webmanifest
│   ├── _headers                  # CSP + security + cache headers
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── solenopsisbot.webp        # 200x200 avatar
│   └── fonts/*.woff2             # self-hosted Outfit + JetBrains Mono
└── src/
    ├── style.css                 # @font-face, tokens, layout, components
    ├── main.js                   # entrypoint
    └── bg-shader.js              # raw WebGL2 braid shader
```

---

## 3. Hard Rules

### 3.1 The hero card is static
`.hero-card` must remain **completely static**. Do NOT add mouse parallax, tilt
transforms, or pointer-tracking to the card. This has been tried and reverted
more than once — check `git log`.

### 3.2 Zero runtime dependencies
`dependencies` in package.json stays empty. Build-time `devDependencies` are
fine. If you are about to `npm i` something that ships to the browser, stop and
justify it in the PR.

### 3.3 The page must scroll
`html`/`body` must never get `overflow: hidden`, and the hero must use
`min-height`, never a fixed `height`. The old layout locked the viewport and
made it physically impossible to add a second screen of content.

Use `100svh` (with a `100vh` fallback) — `100vh` is wrong on mobile because it
ignores dynamic browser chrome.

To add a section: append a `<section>` inside `.app-container`. It flows below
the hero automatically. No layout surgery required. `scripts/smoke.mjs` has a
regression guard for exactly this.

### 3.4 Motion is opt-out
Any new animation must be gated behind `prefers-reduced-motion`. The shader
already handles this itself (renders one static frame, never starts the RAF
loop). The CSS has a global reduced-motion block — extend it, don't bypass it.

### 3.5 Never overwrite a file in public/fonts/
`_headers` serves `/fonts/*` as `immutable` with a one-year max-age. Replacing a
font at an existing path means clients keep the stale bytes for up to a year.
**To change a font, add a new filename** and update the `@font-face` `src`.

### 3.6 Absolute URLs in social meta
`og:image` and `twitter:image` must be absolute (`https://ml.box/og.png`).
Discord, X and Slack all reject relative paths. This was a real bug.

### 3.7 Styling conventions
- Vanilla CSS in [src/style.css](src/style.css), tabs for indentation
- Colors/spacing/radii go through `:root` custom properties
- No Tailwind or utility-first framework unless the maintainer asks

---

## 4. Workflows

```bash
npm install          # install dev dependencies
npm run dev          # vite dev server
npm run build        # production build -> ./dist
npm run preview      # serve ./dist on :4173
npm run smoke        # real-Chrome smoke test (needs preview running)
npm run og           # regenerate og.png + all icon PNGs
```

### Regenerating social/icon assets

```bash
npm run og
```

Requires [`uv`](https://docs.astral.sh/uv/) on PATH. The pipeline is two stages
for a non-obvious reason:

1. `scripts/make-og-fonts.py` — resvg **cannot read woff2**, and it cannot be
   trusted with variable-font axes. Outfit's `wght` axis *defaults to 100*, so
   handing resvg the variable font silently yields a Thin wordmark regardless of
   the `font-weight` in the SVG. This script decompresses woff2, instances the
   axis at the exact weights needed, gives each a unique family name, and dumps
   advance-width metrics to JSON.
2. `scripts/gen-og.mjs` — composes the card SVG (reusing `favicon.svg` as the
   single source of truth for the logo) and rasterizes it. Uses the metrics for
   exact-width text wrapping, because SVG 1.1 has no auto-wrap and resvg will
   happily run text straight off the canvas edge.

Edit the copy at the top of `gen-og.mjs` (`WORDMARK`, `EYEBROW`, `TAGLINE`) then
re-run. Commit the resulting PNGs — they are served assets.

### Running the smoke test

```bash
npm run build && npm run preview &   # then:
npm run smoke
```

Drives your installed Chrome via `puppeteer-core` (no browser download).
Override with `CHROME_PATH=/path/to/chrome` on non-macOS. Screenshots land in
`.cache/screens/`.

It asserts: no console errors, WebGL2 context + shader actually producing a
non-uniform image, resolution caps active, the page scrolls when a section is
appended, both self-hosted fonts loaded, **zero third-party requests**, the
reduced-motion path does not start the animation loop, and no horizontal
overflow at 390px.

### Deploy

```bash
CLOUDFLARE_ACCOUNT_ID="7ce2ff65bcdfde3b27345384c3de0d8c" \
  npx wrangler pages deploy dist --project-name ml-box
```

Pushing to `main` on `Solenopsisbot/ml.box` also auto-deploys.

---

## 5. The background shader

`src/bg-shader.js` draws six interwoven glowing strands. Each strand takes its
depth from the **quadrature** of its own phase (`sin` for the centre line,
`cos` for depth), which is what makes the strands genuinely interleave rather
than merely overlap. Thematically deliberate: the maintainer's architecture
project is called Braid.

### Design constraint: it lives behind a blur

Anything high-frequency is destroyed by `backdrop-filter`. The previous version
was an SDF raymarcher spending ~68 `map()` calls per fragment (64 march steps +
4 normal taps) on specular, fresnel and metaball topology — all of which the
blur deleted. What survived was a full-spectrum hue cycle
(`0.5 + 0.5*sin(chromatic*4.0 + uTime*0.5)`) that produced **greens and olives
appearing nowhere in the brand palette**. That was the source of the "weird"
look.

So: build large, low-frequency structure in the cyan -> indigo -> violet ramp,
keep luminance low and chroma high. The palette constants in the shader mirror
the CSS design tokens — keep them in sync.

The braid needs no marching and no noise: six iterations of `sin`/`cos`. That is
roughly an order of magnitude less arithmetic per fragment than the raymarcher,
which is what pays for rendering at full resolution.

### Current guards

- `DPR_CAP = 2.0`, `RENDER_SCALE = 1.0` — full resolution, affordable only
  because the shader is cheap. If you make the shader more expensive, lower
  these before anything else.
- `TARGET_FPS = 30` — the drift is slow and the strands are soft glows with no
  hard edges, so 30 is indistinguishable from 60 here.
- Fully paused on `visibilitychange`. A backgrounded tab does zero GPU work.
- `powerPreference: 'low-power'`, `antialias: false`, `depth: false`.
- Recovers from `webglcontextlost`.
- `prefers-reduced-motion` draws a single static frame and never starts the RAF
  loop. The pointer bloom stays responsive because that is direct manipulation.

`scripts/smoke.mjs` asserts the buffer matches `RENDER_SCALE` at
deviceScaleFactor 2 **and** that `DPR_CAP` actually binds at deviceScaleFactor 3.
Change the constants and those two checks must be updated together.

### Blur and vignette are tuned to the shader

`.frosted-backdrop` is `blur(11px)` and `.vignette` clears `40%`. These were
previously `blur(16px)` and `25%`, which hid the background almost entirely —
and since a 25% clear window is ~424px wide on a 1440x900 viewport while
`.hero-card` is 440px, the single unvignetted region was exactly the region the
card covered.

Text contrast does not depend on the vignette: every content panel carries its
own `backdrop-filter` and semi-opaque background. If you make the shader
brighter, keep luminance low rather than compensating with the vignette.

---

## 6. Security & Headers

[public/_headers](public/_headers) is the source of truth, applied by Cloudflare
Pages. It sets a strict CSP (`default-src 'self'`, no `unsafe-inline`), HSTS,
`nosniff`, `frame-ancestors 'none'`, and a restrictive `Permissions-Policy`.

The inline `application/ld+json` block is **not** blocked by `script-src 'self'`
— non-executable script types are data blocks, not scripts. This has been
verified in Chrome against the real policy.

If you add inline JS or an external origin, the CSP must be updated or the
feature will silently break in production but work fine in `npm run dev` (Vite
does not apply `_headers`).

---

## 7. Verification Checklist

Before declaring a change complete:

1. `npm run build` succeeds in under ~1.5 s
2. `dist/` contains `index.html`, `_headers`, `og.png`, `fonts/`, and hashed
   `assets/`
3. `npm run smoke` passes every check
4. Gzipped JS is still single-digit KB — if it jumped, something pulled in a
   dependency
5. Git tree clean and pushed to `origin/main`

---

## 8. Roadmap: growing past one card

The foundation now supports expansion; the content does not exist yet. When
adding it:

- **Sections**: append `<section>` inside `.app-container`. Give each an
  `aria-labelledby` pointing at its heading. Reuse `.section-heading`.
- **Multi-page**: Vite needs each entry declared in
  `build.rollupOptions.input`. Prefer real pages over a client-side router —
  there is no framework here and adding one to serve a handful of static pages
  would be a poor trade.
- **Writing/blog**: parse Markdown at **build time**, not in the browser.
  Shipping a Markdown parser to visitors would undo the entire point of §1.
- **Per-page OG images**: `scripts/gen-og.mjs` is already parameterised — pass
  the title/tagline in rather than duplicating the script.
- **sitemap.xml**: currently hand-written with a single URL. Generate it once
  there is more than one page.
- **Keep the hero card static.** See §3.1.
