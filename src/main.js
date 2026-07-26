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
