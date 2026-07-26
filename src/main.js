import './style.css';
import { WebGLBackground } from './bg-shader.js';

function boot() {
	// The background is pure decoration. If it throws, the page must not care.
	try {
		window.__mlboxBg = new WebGLBackground('webgl-canvas');
	} catch (err) {
		console.error('[main] background failed to init:', err);
		const canvas = document.getElementById('webgl-canvas');
		if (canvas) canvas.style.display = 'none';
	}

	// Reveal content only once we're mounted, so there's no flash of unstyled
	// card. Kept in JS so a no-JS visitor still sees everything (see the
	// <noscript> rule in style.css).
	document.documentElement.classList.add('is-ready');
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}
