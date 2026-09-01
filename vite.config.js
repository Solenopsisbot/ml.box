import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
	build: {
		// Every HTML entry has to be declared here — Vite only walks index.html
		// by default, so a second page added to the repo root silently never
		// gets built. 404.html is what Cloudflare Pages serves for unmatched
		// paths; it shares the same JS and CSS chunks as the front page.
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, 'index.html'),
				notFound: resolve(import.meta.dirname, '404.html'),
			},
		},
		// Baseline that supports WebGL2, backdrop-filter, and CSS custom props.
		target: 'es2020',
		cssTarget: 'chrome90',
		assetsInlineLimit: 4096,
		reportCompressedSize: true,
		sourcemap: false,
	},
	server: {
		port: 5173,
		open: false,
	},
});
