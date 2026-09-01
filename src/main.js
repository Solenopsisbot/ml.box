import './style.css';
import { WebGLBackground } from './bg-shader.js';

/**
 * Hide the scroll cue as soon as the visitor has started scrolling. Uses a
 * sentinel + IntersectionObserver rather than a scroll listener so it costs
 * nothing per frame.
 */
function initScrollCue() {
	const cue = document.querySelector('.scroll-cue');
	if (!cue) return;

	const sentinel = document.createElement('div');
	sentinel.setAttribute('aria-hidden', 'true');
	sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:80px;pointer-events:none';
	document.querySelector('.hero')?.appendChild(sentinel);

	if (!('IntersectionObserver' in window)) return;

	new IntersectionObserver(
		([entry]) => {
			document.documentElement.classList.toggle('is-scrolled', !entry.isIntersecting);
		},
		{ threshold: 0 },
	).observe(sentinel);
}

/**
 * Fade each content section up as it enters the viewport.
 *
 * Three guards, because a reveal that fails closed hides the whole site:
 *   - the `is-observed` class is added by JS, so the CSS that sets opacity: 0
 *     can only ever apply to elements this function has already registered
 *   - IntersectionObserver missing => nothing is registered, nothing hides
 *   - prefers-reduced-motion => we never register at all (the stylesheet also
 *     neutralises the rule, but bailing here saves the observer entirely)
 *
 * The observer unregisters each section once revealed: this is a one-shot
 * entrance, not a scrub-linked effect, so there is nothing to watch afterwards.
 */
function initSectionReveal() {
	if (!('IntersectionObserver' in window)) return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	const sections = document.querySelectorAll('.app-container > .section');
	if (!sections.length) return;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add('is-revealed');
				observer.unobserve(entry.target);
			}
		},
		// Bottom -12%: fire slightly before the section's top edge reaches the
		// fold, so the animation is already finishing by the time it is
		// properly in view.
		//
		// Top +9999px: anything scrolled *past* still counts as intersecting.
		// Without it, a jump — a #anchor link, a restored scroll position, a
		// trackpad fling — lands below sections that were never sampled, and
		// they stay stuck at opacity 0 above the viewport forever.
		{ rootMargin: '9999px 0px -12% 0px', threshold: 0 },
	);

	// Anything already on screen when the module runs is left untouched. The
	// script is deferred, so those sections may well have painted already —
	// hiding them now would animate them *out* before animating them back in.
	const fold = window.innerHeight;
	for (const section of sections) {
		if (section.getBoundingClientRect().top < fold) continue;
		section.classList.add('is-observed');
		observer.observe(section);
	}
}

/**
 * Progressive enhancement for copy-to-clipboard. The button ships with the
 * `hidden` attribute set and is only revealed once we know the API exists, so
 * a visitor without it never sees a dead control — the handle is plain
 * selectable text either way.
 */
function initCopyButtons() {
	if (!navigator.clipboard?.writeText) return;

	for (const btn of document.querySelectorAll('.copy-btn[data-copy]')) {
		btn.hidden = false;
		const label = btn.querySelector('.copy-btn-label') ?? btn;
		const original = label.textContent;

		btn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(btn.dataset.copy);
				label.textContent = 'Copied';
				btn.classList.add('is-copied');
				clearTimeout(btn._resetTimer);
				btn._resetTimer = setTimeout(() => {
					label.textContent = original;
					btn.classList.remove('is-copied');
				}, 1600);
			} catch {
				// Clipboard can be blocked by permissions policy; say so rather
				// than silently doing nothing.
				label.textContent = 'Failed';
				setTimeout(() => {
					label.textContent = original;
				}, 1600);
			}
		});
	}
}

function boot() {
	// The background is pure decoration. If it throws, the page must not care.
	try {
		window.__mlboxBg = new WebGLBackground('webgl-canvas');
	} catch (err) {
		console.error('[main] background failed to init:', err);
		const canvas = document.getElementById('webgl-canvas');
		if (canvas) canvas.style.display = 'none';
	}

	initScrollCue();
	initSectionReveal();
	initCopyButtons();

	// Gates the card entrance animation. A no-JS visitor never gets this class,
	// so nothing is ever hidden from them.
	document.documentElement.classList.add('is-ready');
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}
