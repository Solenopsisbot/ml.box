/**
 * Smoke test: load the built site in real Chrome and assert it actually works.
 *
 * Checks:
 *   - no console errors, no failed network requests
 *   - WebGL2 context acquired and the shader program links
 *   - the canvas is drawing non-uniform output (i.e. the raymarch produced an image)
 *   - the document scrolls (regression guard on the old overflow:hidden bug)
 *   - every project card links out and is described
 *   - contact rows: mailto, copy buttons, no <button> nested inside an <a>
 *   - section reveal fails open (nothing is left at opacity 0)
 *   - 404.html builds, is styled, and is noindex
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
	// DPR_CAP 2.0 x RENDER_SCALE 1.0, and this page runs at deviceScaleFactor 2,
	// so the cap is not binding here and the buffer should be exactly 2x CSS.
	check(
		'canvas buffer matches configured render scale',
		webgl.ok && Math.abs(webgl.w - webgl.cssW * 2) <= 2,
		webgl.ok ? `${webgl.w}px buffer for ${webgl.cssW}px css (expected ${webgl.cssW * 2})` : '',
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

	// Every section heading must be reachable and labelled.
	const sections = await page.evaluate(() =>
		[...document.querySelectorAll('.section[aria-labelledby]')].map((s) => ({
			id: s.id,
			labelled: !!document.getElementById(s.getAttribute('aria-labelledby')),
		})),
	);
	check(
		'content sections present and aria-labelled',
		sections.length >= 3 && sections.every((s) => s.id && s.labelled),
		sections.map((s) => s.id).join(', '),
	);

	// Scroll cue is load-bearing: the hero fills the viewport.
	const cue = await page.evaluate(async () => {
		const el = document.querySelector('.scroll-cue');
		if (!el) return { ok: false };
		const before = getComputedStyle(el).opacity;
		window.scrollTo({ top: 400, behavior: 'instant' });
		await new Promise((r) => setTimeout(r, 300));
		const after = getComputedStyle(el).opacity;
		window.scrollTo({ top: 0, behavior: 'instant' });
		return { ok: true, before: +before, after: +after };
	});
	check(
		'scroll cue visible at top, hidden after scrolling',
		cue.ok && cue.before > 0.9 && cue.after < 0.1,
		cue.ok ? `opacity ${cue.before} -> ${cue.after}` : 'cue missing',
	);

	// Both contact rows now carry one — email and Discord.
	const copyBtns = await page.evaluate(() =>
		[...document.querySelectorAll('.copy-btn[data-copy]')].map((b) => ({
			revealed: !b.hidden,
			value: b.dataset.copy,
		})),
	);
	check(
		'clipboard buttons revealed by progressive enhancement',
		copyBtns.length >= 2 && copyBtns.every((b) => b.revealed && b.value),
		copyBtns.map((b) => b.value).join(', '),
	);

	// mailto must survive the HTML-entity encoding of the @ sign, and the copy
	// button must be handing out the same string the link points at.
	const mailto = await page.evaluate(() => {
		const a = document.querySelector('a[href^="mailto:"]');
		const btn = a?.closest('.contact-row')?.querySelector('.copy-btn[data-copy]');
		return { href: a?.getAttribute('href'), text: a?.textContent.trim(), copy: btn?.dataset.copy };
	});
	check(
		'mailto href decodes correctly',
		/^mailto:[^@\s]+@[^@\s]+\.[a-z]+$/i.test(mailto.href ?? ''),
		mailto.href,
	);
	check(
		'email link, visible text and copy value all agree',
		mailto.href === `mailto:${mailto.text}` && mailto.copy === mailto.text,
		`${mailto.href} / ${mailto.text} / ${mailto.copy}`,
	);

	// A <button> inside an <a> is invalid HTML and Chrome will not deliver the
	// click to it. The row uses a stretched ::after instead — this guards the
	// regression where someone "simplifies" it back into a nested button.
	const nested = await page.evaluate(
		() => document.querySelectorAll('a .copy-btn, a button').length,
	);
	check('no button nested inside a link', nested === 0, `${nested} found`);

	// Every project card must point somewhere absolute and carry a description.
	const projects = await page.evaluate(() =>
		[...document.querySelectorAll('.project')].map((a) => ({
			href: a.getAttribute('href'),
			name: a.querySelector('.project-name')?.textContent.trim(),
			desc: a.querySelector('.project-desc')?.textContent.trim(),
		})),
	);
	check(
		'every project links out and is described',
		projects.length >= 3 &&
			projects.every((p) => /^https:\/\//.test(p.href ?? '') && p.name && p.desc),
		projects.map((p) => p.name).join(', '),
	);
	check(
		'revel.chat listed',
		projects.some((p) => p.href === 'https://revel.chat'),
		projects.map((p) => p.href).join(', '),
	);

	// The reveal must fail open: a section JS never reached is still readable.
	const revealed = await page.evaluate(async () => {
		window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
		await new Promise((r) => setTimeout(r, 900));
		const hidden = [...document.querySelectorAll('.app-container > .section')].filter(
			(el) => +getComputedStyle(el).opacity < 0.99,
		);
		window.scrollTo({ top: 0, behavior: 'instant' });
		return hidden.map((el) => el.id);
	});
	check(
		'all sections fully revealed after scrolling through',
		revealed.length === 0,
		revealed.join(', '),
	);

	await page.screenshot({ path: join(OUT, 'hero.png') });
	await page.screenshot({ path: join(OUT, 'full.png'), fullPage: true });
	await page.close();

	/* ------------------------------------------------------------------- 404 */
	// Declared as a second rollup input; if that wiring breaks, the file simply
	// is not in dist/ and this 404s for real.
	const { page: nfPage, errors: nfErrors } = await newPage(browser);
	const nfResponse = await nfPage.goto(new globalThis.URL('/404.html', URL).href, {
		waitUntil: 'networkidle0',
		timeout: 30000,
	});
	check('404 page builds and loads cleanly', nfResponse?.ok() && nfErrors.length === 0, nfErrors.join(' | '));

	const nf = await nfPage.evaluate(() => ({
		hasCard: !!document.querySelector('.error-card'),
		home: document.querySelector('.link-btn')?.getAttribute('href'),
		noindex: document.querySelector('meta[name="robots"]')?.content,
		styled: getComputedStyle(document.body).backgroundColor,
	}));
	check(
		'404 shares the design system and offers a way home',
		nf.hasCard && nf.home === '/' && nf.styled === 'rgb(5, 6, 8)',
		`home=${nf.home} bg=${nf.styled}`,
	);
	check('404 is noindex', nf.noindex === 'noindex', nf.noindex);

	await nfPage.screenshot({ path: join(OUT, '404.png') });
	await nfPage.close();

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

	// This viewport is deviceScaleFactor 3, so DPR_CAP 2.0 must actually bind:
	// an uncapped buffer would be 3x the CSS width.
	const capped = await mPage.evaluate(() => {
		const c = document.getElementById('webgl-canvas');
		return { w: c.width, cssW: c.clientWidth, dpr: window.devicePixelRatio };
	});
	check(
		'DPR cap clamps the buffer below device pixel ratio',
		capped.w <= capped.cssW * 2 + 2 && capped.dpr > 2,
		`dpr ${capped.dpr}, ${capped.w}px buffer for ${capped.cssW}px css (uncapped would be ${capped.cssW * capped.dpr})`,
	);

	await mPage.screenshot({ path: join(OUT, 'hero-mobile.png') });

	// 320px is the real narrow edge (iPhone SE). The email address is the
	// longest unbreakable-ish string on the page, so this is where it shows.
	for (const width of [320, 360]) {
		await mPage.setViewport({ width, height: 700, deviceScaleFactor: 2, isMobile: true });
		await mPage.reload({ waitUntil: 'networkidle0' });
		await new Promise((r) => setTimeout(r, 500));
		const narrow = await mPage.evaluate(() => {
			// The anchor *is* the value now — the copy button lives beside it.
			const v = document.querySelector('a[href^="mailto:"]');
			return {
				overflow: document.documentElement.scrollWidth - window.innerWidth,
				emailFits: v.scrollWidth <= v.clientWidth + 1,
			};
		});
		check(
			`no horizontal overflow at ${width}px, email not clipped`,
			narrow.overflow <= 1 && narrow.emailFits,
			`overflow ${narrow.overflow}px`,
		);
	}

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
