# AGENTS.md — Repository Guidance for AI Agents & Developers

Welcome to **ml.box**, the personal landing page for **solenopsisbot**. This document outlines the project architecture, design constraints, file structure, build workflows, and deployment procedures for AI coding agents and human contributors working in this codebase.

---

## 1. Overview & Stack

- **Site Domain**: `ml.box` (deployed on Cloudflare Pages)
- **Primary Tech Stack**: Vite + Vanilla HTML5 / ES Modules + Vanilla CSS + Three.js (WebGL)
- **Design Aesthetic**: Minimalist obsidian dark theme with a frosted glass backdrop and a centered static hero profile card.
- **Deployment Platform**: Cloudflare Pages (`pages_build_output_dir = "./dist"`).

---

## 2. Directory Structure

```
ml.box/
├── index.html           # Main HTML5 document structure & semantic card layout
├── package.json         # Project dependencies (three, vite, wrangler)
├── wrangler.toml        # Cloudflare Pages deployment configuration
├── .gitignore           # Git ignore policy (ignores node_modules, dist, logs)
├── public/
│   ├── favicon.svg      # Custom AI Box SVG icon
│   └── solenopsisbot.webp # Profile avatar image
└── src/
    ├── style.css        # Core design system tokens, typography, glass UI, & frosted layer
    ├── main.js          # Main app entrypoint (initializes WebGL engine)
    └── bg-shader.js     # Three.js 3D WebGL engine rendering slow central orbital orbs
```

---

## 3. Key Design Rules & Constraints

When modifying this repository, strictly adhere to the following architectural guidelines:

1. **Static Hero Card**:
   - The `.hero-card` element in [index.html](file:///Users/solenopsisbot/coding/websites/ml.box/index.html) must remain **completely static**. Do NOT re-add 3D mouse parallax or tilt transform listeners to the card.

2. **Frosted Background Engine**:
   - The background is rendered via Three.js inside `#webgl-canvas`.
   - The canvas is covered by `.frosted-backdrop` in [style.css](file:///Users/solenopsisbot/coding/websites/ml.box/src/style.css), applying `backdrop-filter: blur(16px)` so that the white orbs float as soft, glowing ambient light nodes behind frosted glass.
   - Background movement should remain slow, serene, and centered around `(0, 0, 0)`.

3. **Styling & CSS Conventions**:
   - Use Vanilla CSS inside [src/style.css](file:///Users/solenopsisbot/coding/websites/ml.box/src/style.css).
   - Use CSS custom properties (`:root` tokens) for color palettes, spacing, and border radiuses.
   - Do NOT introduce utility-first frameworks like Tailwind unless explicitly requested by the maintainer.

4. **Brand Assets & Content**:
   - Profile avatar: [public/solenopsisbot.webp](file:///Users/solenopsisbot/coding/websites/ml.box/public/solenopsisbot.webp)
   - Favicon: [public/favicon.svg](file:///Users/solenopsisbot/coding/websites/ml.box/public/favicon.svg) (Custom isometric 3D AI Box vector)
   - GitHub handle: `Solenopsisbot` (`https://github.com/Solenopsisbot`)

---

## 4. Development & Build Workflows

### Install Dependencies
```bash
npm install
```

### Local Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```
*Outputs bundled HTML, CSS, JavaScript, and static assets to `./dist`.*

### Deployment to Cloudflare Pages
```bash
CLOUDFLARE_ACCOUNT_ID="7ce2ff65bcdfde3b27345384c3de0d8c" npx wrangler pages deploy dist --project-name ml-box
```
*Note: Pushing commits to `main` branch on GitHub repository `Solenopsisbot/ml.box` auto-triggers deployment.*

---

## 5. Verification Checklist

Before declaring any change complete:
1. Run `npm run build` and ensure it compiles without errors in `< 1.5s`.
2. Confirm `./dist` contains `index.html`, `favicon.svg`, and CSS/JS assets.
3. Ensure git working tree is clean and pushed to `origin/main`.
