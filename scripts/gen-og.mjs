/**
 * Generate raster social/icon assets from public/favicon.svg.
 *
 * Outputs (all into public/, all committed — they are served assets):
 *   og.png                1200x630  social share card (Discord, X, Slack, iMessage)
 *   apple-touch-icon.png  180x180   iOS home screen. iOS ignores SVG, so this is required.
 *   favicon-32.png        32x32     legacy fallback for clients with no SVG favicon support
 *   icon-192.png          192x192   PWA manifest
 *   icon-512.png          512x512   PWA manifest
 *
 * Requires static TTFs from scripts/make-og-fonts.py — resvg cannot read woff2.
 *
 * Run via:  npm run og
 */

import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const FONT_DIR = join(ROOT, '.cache', 'fonts-ttf');

/* ---------------------------------------------------------------- content --
   Edit these two lines when the branding copy changes, then `npm run og`. */
const WORDMARK = 'ml.box';
const EYEBROW = 'SOLENOPSISBOT';
const TAGLINE = 'Developer & researcher — machine learning, systems, and the web.';
/* -------------------------------------------------------------------------- */

const BRAND = {
	bgFrom: '#0c0f17',
	bgTo: '#050608',
	cyan: '#38bdf8',
	indigo: '#818cf8',
	violet: '#c084fc',
	text: '#f8fafc',
	muted: '#94a3b8',
	dim: '#64748b',
};

function requireFonts() {
	const needed = ['OgOutfitBold.ttf', 'OgOutfitRegular.ttf', 'OgMonoSemi.ttf', 'metrics.json'];
	const missing = needed.filter((f) => !existsSync(join(FONT_DIR, f)));
	if (missing.length) {
		console.error(`\nMissing build artefacts in .cache/fonts-ttf: ${missing.join(', ')}`);
		console.error('resvg cannot read woff2, so these must be generated first.\n');
		console.error('Run the whole pipeline instead:  npm run og\n');
		process.exit(1);
	}
	return JSON.parse(readFileSync(join(FONT_DIR, 'metrics.json'), 'utf8'));
}

/** Exact advance width in px, using metrics from the instanced font. */
function measure(metrics, str, family, fontSize, letterSpacing = 0) {
	const m = metrics[family];
	if (!m) throw new Error(`no metrics for family ${family}`);
	let units = 0;
	for (const ch of str) {
		const cp = ch.codePointAt(0);
		// Fall back to the space advance for anything outside measured ASCII.
		units += m.widths[cp] ?? m.widths[32] ?? 0;
	}
	return (units / m.unitsPerEm) * fontSize + letterSpacing * Math.max(0, [...str].length - 1);
}

/** Greedy word wrap to a hard pixel limit. SVG 1.1 cannot do this for us. */
function wrap(metrics, text, family, fontSize, maxWidth) {
	const lines = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && measure(metrics, candidate, family, fontSize) > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** Pull the inner markup out of favicon.svg so the logo stays a single source of truth. */
function loadLogoBody() {
	const raw = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
	const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
	if (!match) throw new Error('could not parse public/favicon.svg');
	return match[1];
}

/**
 * XML-escape text destined for SVG. Without this an ampersand in the tagline
 * produces a hard parse error in resvg rather than a warning.
 */
function esc(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function render(svg, width, outName) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: width },
		font: { fontDirs: [FONT_DIR], loadSystemFonts: false },
		background: BRAND.bgTo, // guarantees a fully opaque result
	});
	const img = resvg.render();
	const png = img.asPng();
	const dest = join(PUBLIC, outName);
	writeFileSync(dest, png);
	console.log(
		`  ${outName.padEnd(22)} ${String(img.width).padStart(4)}x${String(img.height).padEnd(4)}  ${(png.length / 1024).toFixed(1)} KB`,
	);
	return png.length;
}

/** 1200x630 share card: logo tile on the left, type block on the right. */
function ogCard(logoBody, metrics) {
	const W = 1200;
	const H = 630;
	const PAD = 80;

	// favicon.svg is a 512-unit square; map it into a fixed-size tile.
	const TILE = 300;
	const scale = TILE / 512;
	const tileX = PAD;
	const tileY = (H - TILE) / 2;

	const textX = tileX + TILE + 60;
	const textMax = W - textX - PAD;

	const EYEBROW_SIZE = 24;
	const EYEBROW_LS = 4.5;
	const WORD_SIZE = 100;
	const TAG_SIZE = 26;
	const TAG_LEADING = 36;

	const tagLines = wrap(metrics, TAGLINE, 'OgOutfitRegular', TAG_SIZE, textMax);

	// Lay the block out relative to the eyebrow baseline, then centre it optically.
	const dWord = 104; // eyebrow baseline -> wordmark baseline
	const dRule = 136; // eyebrow baseline -> accent rule top
	const dTag = 190; // eyebrow baseline -> first tagline baseline

	const topExtent = EYEBROW_SIZE; // ascent above eyebrow baseline
	const bottomExtent = dTag + (tagLines.length - 1) * TAG_LEADING + 8;
	const y0 = Math.round((H - (topExtent + bottomExtent)) / 2 + topExtent);

	const wordWidth = measure(metrics, WORDMARK, 'OgOutfitBold', WORD_SIZE);
	if (wordWidth > textMax) {
		console.warn(`  ! wordmark overflows: ${wordWidth.toFixed(0)}px > ${textMax}px`);
	}

	const tagSvg = tagLines
		.map(
			(line, i) =>
				`  <text x="${textX}" y="${y0 + dTag + i * TAG_LEADING}" font-family="OgOutfitRegular" font-size="${TAG_SIZE}" fill="${BRAND.muted}">${esc(line)}</text>`,
		)
		.join('\n');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="og-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND.bgFrom}"/>
      <stop offset="100%" stop-color="${BRAND.bgTo}"/>
    </linearGradient>
    <radialGradient id="og-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${BRAND.indigo}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${BRAND.indigo}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="og-rule" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.cyan}"/>
      <stop offset="50%" stop-color="${BRAND.indigo}"/>
      <stop offset="100%" stop-color="${BRAND.violet}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#og-bg)"/>
  <ellipse cx="${tileX + TILE / 2}" cy="${H / 2}" rx="400" ry="320" fill="url(#og-glow)"/>

  <g transform="translate(${tileX}, ${tileY}) scale(${scale})">
${logoBody}
  </g>

  <text x="${textX}" y="${y0}" font-family="OgMonoSemi" font-size="${EYEBROW_SIZE}" letter-spacing="${EYEBROW_LS}" fill="${BRAND.dim}">${esc(EYEBROW)}</text>
  <text x="${textX}" y="${y0 + dWord}" font-family="OgOutfitBold" font-size="${WORD_SIZE}" fill="${BRAND.text}">${esc(WORDMARK)}</text>
  <rect x="${textX}" y="${y0 + dRule}" width="128" height="5" rx="2.5" fill="url(#og-rule)"/>
${tagSvg}
</svg>`;
}

/**
 * Full-bleed square icon. iOS applies its own rounded mask to apple-touch-icon,
 * so the artwork must reach the edges — the favicon's own rx=100 corners would
 * otherwise leave dark wedges outside Apple's mask.
 */
function squareIcon(logoBody) {
	// Drop the favicon's outer rounded container; keep the cube group only.
	const cubeOnly = logoBody.replace(/<rect\b[^>]*\/>/, '');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="ic-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND.bgFrom}"/>
      <stop offset="100%" stop-color="${BRAND.bgTo}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#ic-bg)"/>
${cubeOnly}
</svg>`;
}

function main() {
	const metrics = requireFonts();
	mkdirSync(PUBLIC, { recursive: true });

	const logoBody = loadLogoBody();
	console.log('generating social + icon assets:');

	render(ogCard(logoBody, metrics), 1200, 'og.png');

	const icon = squareIcon(logoBody);
	render(icon, 180, 'apple-touch-icon.png');
	render(icon, 32, 'favicon-32.png');
	render(icon, 192, 'icon-192.png');
	render(icon, 512, 'icon-512.png');

	console.log(`done -> ${relative(ROOT, PUBLIC)}/`);
}

main();
