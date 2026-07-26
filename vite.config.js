import { defineConfig } from 'vite';

export default defineConfig({
	build: {
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
