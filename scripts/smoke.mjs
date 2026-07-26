/**
 * Smoke test: load the built site in real Chrome and assert it actually works.
 *
 * Checks:
 *   - no console errors, no failed network requests
 *   - WebGL2 context acquired and the shader program links
 *   - the canvas is drawing non-uniform output (i.e. the raymarch produced an image)
 *   - the document scrolls (regression guard on the old overflow:hidden bug)
 *   - reduced-motion path renders without animating
 *   - writes screenshots to .cache/screens/
 *
 * Usage:  npm run smoke      (expects `npm run preview` reachable on PORT)
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.cache', 'screens');
const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const CHROME =
	process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const failures = [];
function check(name, ok, detail = '') {
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures.push(name);
}

async function newPage(browser, { reducedMotion = false } = {}) {
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
	if (reducedMotion) {
		await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
	}
	const errors = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
	return { page, errors };
}

const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	args: [
		'--hide-scrollbars',
		'--enable-unsafe-swiftshader', // headless has no real GPU; allow software GL
		'--use-gl=angle',
	],
});

try {
	mkdirSync(OUT, { recursive: true });
	console.log(`smoke testing ${URL}`);

	/* ---------------------------------------------------------- normal load */
	const { page, errors } = await newPage(browser);
	await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
	// Let the shader run a few frames.
	await new Promise((r) => setTimeout(r, 1200));

	check('no console errors / failed requests', errors.length === 0, errors.join(' | '));

	const webgl = await page.evaluate(() => {
		const c = document.getElementById('webgl-canvas');
		if (!c) return { ok: false, why: 'canvas missing' };
		const gl = c.getContext('webgl2');
		if (!gl) return { ok: false, why: 'no webgl2 context' };
		return {
			ok: true,
			w: c.width,
			h: c.height,
			cssW: c.clientWidth,
			vendor: gl.getParameter(gl.VERSION),
		};
	});
	check('WebGL2 context present', webgl.ok, webgl.why ?? webgl.vendor);
	check(
		'canvas renders below CSS resolution (DPR/scale caps active)',
		webgl.ok && webgl.w < webgl.cssW * 2,
		webgl.ok ? `${webgl.w}px buffer for ${webgl.cssW}px css` : '',
	);

	// Sample the canvas. This must draw and read back inside a single task:
	// the drawing buffer is cleared once it has been composited, and calling
	// getContext() again cannot retroactively set preserveDrawingBuffer.
	const variance = await page.evaluate(() => {
		const bg = window.__mlboxBg;
		if (!bg?.gl) return { ok: false, why: 'no background instance' };
		const gl = bg.gl;
		bg.draw(2.4);
		const w = gl.drawingBufferWidth;
		const h = gl.drawingBufferHeight;
		const px = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
		let min = 255;
		let max = 0;
		for (let i = 0; i < px.length; i += 4) {
			const l = px[i];
			if (l < min) min = l;
			if (l > max) max = l;
		}
		return { ok: true, spread: max - min, glError: gl.getError() };
	});
	check(
		'shader produced a non-uniform image',
		variance.ok && variance.spread > 8,
		variance.ok ? `luma spread ${variance.spread}, glError ${variance.glError}` : variance.why,
	);

	const scroll = await page.evaluate(() => ({
		overflowY: getComputedStyle(document.body).overflowY,
		htmlOverflow: getComputedStyle(document.documentElement).overflowY,
		heroMin: getComputedStyle(document.querySelector('.hero')).minHeight,
	}));
	check(
		'body does not clip vertical overflow (scroll regression guard)',
		scroll.overflowY !== 'hidden' && scroll.htmlOverflow !== 'hidden',
		`body=${scroll.overflowY} html=${scroll.htmlOverflow}`,
	);

	// The old bug: height:100vh + overflow:hidden made added content unreachable.
	// Note the explicit behavior:'instant' — the stylesheet sets scroll-behavior:
	// smooth, which makes a plain scrollTo() animate and read back as 0.
	const canGrow = await page.evaluate(() => {
		const probe = document.createElement('section');
		probe.style.height = '800px';
		document.querySelector('.app-container').appendChild(probe);
		const scrollable = document.documentElement.scrollHeight > window.innerHeight + 400;
		window.scrollTo({ top: 600, behavior: 'instant' });
		const moved = window.scrollY > 300;
		const reached = window.scrollY;
		probe.remove();
		window.scrollTo({ top: 0, behavior: 'instant' });
		return { scrollable, moved, reached };
	});
	check(
		'appended section makes the page scrollable',
		canGrow.scrollable && canGrow.moved,
		`scrollable=${canGrow.scrollable} scrollY=${canGrow.reached}`,
	);

	const fonts = await page.evaluate(async () => {
		await document.fonts.ready;
		return {
			outfit: document.fonts.check('800 1rem Outfit'),
			mono: document.fonts.check('600 1rem "JetBrains Mono"'),
		};
	});
	check('self-hosted Outfit loaded', fonts.outfit);
	check('self-hosted JetBrains Mono loaded', fonts.mono);

	const thirdParty = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.map((e) => new globalThis.URL(e.name).host)
			.filter((h) => h !== globalThis.location.host),
	);
	check('zero third-party requests', thirdParty.length === 0, thirdParty.join(', '));

	await page.screenshot({ path: join(OUT, 'hero.png') });
	await page.close();

	/* -------------------------------------------------------- reduced motion */
	const { page: rmPage, errors: rmErrors } = await newPage(browser, { reducedMotion: true });
	await rmPage.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
	await new Promise((r) => setTimeout(r, 800));
	check('reduced-motion loads cleanly', rmErrors.length === 0, rmErrors.join(' | '));

	const paused = await rmPage.evaluate(() => window.__mlboxBg?.running === false);
	check('animation loop is not running under prefers-reduced-motion', paused === true);

	await rmPage.screenshot({ path: join(OUT, 'hero-reduced-motion.png') });
	await rmPage.close();

	/* ------------------------------------------------------------- mobile */
	const { page: mPage, errors: mErrors } = await newPage(browser);
	await mPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
	await mPage.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
	await new Promise((r) => setTimeout(r, 800));
	check('mobile viewport loads cleanly', mErrors.length === 0, mErrors.join(' | '));

	const overflow = await mPage.evaluate(
		() => document.documentElement.scrollWidth <= window.innerWidth + 1,
	);
	check('no horizontal overflow at 390px', overflow);

	await mPage.screenshot({ path: join(OUT, 'hero-mobile.png') });
	await mPage.close();
} finally {
	await browser.close();
}

console.log(`\nscreenshots -> ${OUT}`);
if (failures.length) {
	console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
	process.exit(1);
}
console.log('all checks passed');
