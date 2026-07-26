/**
 * Braid background — raw WebGL2, zero dependencies.
 *
 * Renders a fullscreen triangle and draws six interwoven glowing strands in the
 * fragment shader. Each strand's depth comes from the quadrature of its own
 * phase, so strands genuinely pass over and under one another.
 *
 * Why this and not the old raymarcher: the background sits behind a
 * backdrop-filter blur, which annihilates high-frequency detail. The previous
 * shader spent ~68 map() calls per fragment (64 march steps + 4 normal taps) on
 * specular and fresnel detail that the blur then deleted, and the only thing
 * that survived was a full-spectrum hue cycle producing greens and olives that
 * appear nowhere in the brand palette.
 *
 * This is built for what survives a blur instead: large low-frequency
 * structure, the cyan -> indigo -> violet ramp taken straight from the design
 * tokens, low luminance and high chroma. It needs no marching and no noise, so
 * it is roughly an order of magnitude less arithmetic per fragment — which is
 * what pays for rendering at full resolution.
 *
 * Perf guards:
 *   - device pixel ratio capped (DPR_CAP)
 *   - framerate capped to TARGET_FPS (the drift is slow; the strands are soft
 *     glows with no hard edges, so 30 is indistinguishable from 60 here)
 *   - fully paused while the tab is hidden
 *   - honours prefers-reduced-motion by drawing a single static frame
 *   - recovers from GPU context loss
 */

const DPR_CAP = 2.0;
const RENDER_SCALE = 1.0;
const TARGET_FPS = 30;
const FRAME_BUDGET = 1000 / TARGET_FPS;

/* A single triangle covering clip space beats a quad: 1 primitive, no indices,
   and no diagonal seam for the rasteriser to straddle. */
const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(
    float((gl_VertexID << 1) & 2) * 2.0 - 1.0,
    float(gl_VertexID & 2) * 2.0 - 1.0
  );
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;

out vec4 fragColor;

#define STRANDS 6

// Brand palette, straight from the CSS design tokens.
const vec3 C_CYAN   = vec3(0.220, 0.741, 0.973); // #38bdf8
const vec3 C_INDIGO = vec3(0.506, 0.549, 0.973); // #818cf8
const vec3 C_VIOLET = vec3(0.753, 0.518, 0.988); // #c084fc
const vec3 C_BASE   = vec3(0.016, 0.020, 0.028);

vec3 brandRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5
    ? mix(C_CYAN, C_INDIGO, t * 2.0)
    : mix(C_INDIGO, C_VIOLET, (t - 0.5) * 2.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

  // Gentle rotation stops the weave reading as a flat audio equaliser.
  const float a = 0.20;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;

  float t = uTime * 0.11;
  vec3 col = C_BASE;

  for (int i = 0; i < STRANDS; i++) {
    float fi = float(i) / float(STRANDS - 1);
    float phase = fi * 6.2831853;
    float arg = uv.x * 2.3 + phase + t * 1.5;

    // Centre line, plus a small static offset so the weave has width.
    float y = sin(arg) * 0.30 + (fi - 0.5) * 0.14;

    // Quadrature of the same phase = depth. The strand is in front when z > 0,
    // which is what makes the strands appear to interleave rather than merely
    // overlap.
    float z = cos(arg);

    float d = abs(uv.y - y);
    float w = 0.028 + 0.013 * z;         // thicker when nearer
    float glow = pow(w / (d + w), 2.6);
    float bright = 0.5 + 0.5 * z;        // dimmer when behind

    col += brandRamp(fi * 0.85 + 0.07) * glow * bright * 0.6;
  }

  // The pointer adds a soft bloom rather than dragging an object around.
  col += brandRamp(0.5) * 0.07 * exp(-6.0 * length(uv - uMouse * vec2(1.1, 0.7)));

  col *= 1.0 - 0.34 * length(uv);
  fragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(sh);
		gl.deleteShader(sh);
		throw new Error(`shader compile failed: ${log}`);
	}
	return sh;
}

export class WebGLBackground {
	constructor(canvasId) {
		this.canvas = document.getElementById(canvasId);
		if (!this.canvas) return;

		this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		this.mouse = { x: 0, y: 0 };
		this.targetMouse = { x: 0, y: 0 };
		this.rafId = null;
		this.lastFrame = 0;
		this.clock = 0;
		this.running = false;

		this.onResize = this.onResize.bind(this);
		this.onPointerMove = this.onPointerMove.bind(this);
		this.onVisibility = this.onVisibility.bind(this);
		this.onMotionChange = this.onMotionChange.bind(this);
		this.onContextLost = this.onContextLost.bind(this);
		this.onContextRestored = this.onContextRestored.bind(this);
		this.tick = this.tick.bind(this);

		if (!this.initGL()) {
			// No WebGL2 — the CSS background colour is the fallback. Hide the canvas.
			this.canvas.style.display = 'none';
			return;
		}

		this.bindEvents();
		this.resize();

		if (this.motionQuery.matches) this.renderStatic();
		else this.start();
	}

	initGL() {
		const gl = this.canvas.getContext('webgl2', {
			alpha: false,
			antialias: false, // pointless for a fullscreen procedural pass
			depth: false,
			stencil: false,
			powerPreference: 'low-power',
			failIfMajorPerformanceCaveat: false,
		});
		if (!gl) return false;
		this.gl = gl;

		let vs;
		let fs;
		try {
			vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
			fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
		} catch (err) {
			console.error('[bg-shader]', err);
			return false;
		}

		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		gl.deleteShader(vs);
		gl.deleteShader(fs);

		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error('[bg-shader] link failed:', gl.getProgramInfoLog(prog));
			return false;
		}

		this.program = prog;
		gl.useProgram(prog);

		this.u = {
			time: gl.getUniformLocation(prog, 'uTime'),
			resolution: gl.getUniformLocation(prog, 'uResolution'),
			mouse: gl.getUniformLocation(prog, 'uMouse'),
		};

		// Required by spec even though the vertex shader sources no attributes.
		this.vao = gl.createVertexArray();
		gl.bindVertexArray(this.vao);

		return true;
	}

	bindEvents() {
		window.addEventListener('resize', this.onResize, { passive: true });
		window.addEventListener('pointermove', this.onPointerMove, { passive: true });
		document.addEventListener('visibilitychange', this.onVisibility);
		this.canvas.addEventListener('webglcontextlost', this.onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

		if (typeof this.motionQuery.addEventListener === 'function') {
			this.motionQuery.addEventListener('change', this.onMotionChange);
		}
	}

	onResize() {
		clearTimeout(this._resizeTimer);
		this._resizeTimer = setTimeout(() => {
			this.resize();
			if (!this.running) this.renderStatic();
		}, 120);
	}

	resize() {
		const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
		const w = Math.max(1, Math.round(window.innerWidth * dpr * RENDER_SCALE));
		const h = Math.max(1, Math.round(window.innerHeight * dpr * RENDER_SCALE));

		if (this.canvas.width === w && this.canvas.height === h) return;

		this.canvas.width = w;
		this.canvas.height = h;
		this.gl.viewport(0, 0, w, h);
		this.gl.uniform2f(this.u.resolution, w, h);
	}

	onPointerMove(e) {
		this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
		this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
		// A reduced-motion visitor gets no drifting animation, but the pointer
		// bloom is direct manipulation, so it stays responsive.
		if (!this.running && this.motionQuery.matches) this.scheduleStaticFrame();
	}

	onVisibility() {
		if (document.hidden) this.stop();
		else if (!this.motionQuery.matches) this.start();
	}

	onMotionChange() {
		if (this.motionQuery.matches) {
			this.stop();
			this.renderStatic();
		} else {
			this.start();
		}
	}

	onContextLost(e) {
		e.preventDefault();
		this.stop();
	}

	onContextRestored() {
		if (this.initGL()) {
			this.resize();
			if (this.motionQuery.matches) this.renderStatic();
			else this.start();
		}
	}

	start() {
		if (this.running || !this.gl) return;
		this.running = true;
		this.lastFrame = performance.now();
		this.rafId = requestAnimationFrame(this.tick);
	}

	stop() {
		this.running = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	scheduleStaticFrame() {
		if (this._staticQueued) return;
		this._staticQueued = true;
		requestAnimationFrame(() => {
			this._staticQueued = false;
			this.renderStatic();
		});
	}

	renderStatic() {
		if (!this.gl) return;
		// Fixed, pleasant-looking pose. No time advance, so nothing moves.
		this.mouse.x = this.targetMouse.x;
		this.mouse.y = this.targetMouse.y;
		this.draw(6.0);
	}

	tick(now) {
		if (!this.running) return;
		this.rafId = requestAnimationFrame(this.tick);

		const delta = now - this.lastFrame;
		if (delta < FRAME_BUDGET) return;
		this.lastFrame = now - (delta % FRAME_BUDGET);

		this.clock += delta * 0.001;

		// Lerp toward the pointer, normalised so the feel is framerate-independent.
		const ease = 1 - Math.pow(0.001, delta * 0.001);
		this.mouse.x += (this.targetMouse.x - this.mouse.x) * ease;
		this.mouse.y += (this.targetMouse.y - this.mouse.y) * ease;

		this.draw(this.clock);
	}

	draw(time) {
		const gl = this.gl;
		if (!gl || gl.isContextLost()) return;
		gl.uniform1f(this.u.time, time);
		gl.uniform2f(this.u.mouse, this.mouse.x, this.mouse.y);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	destroy() {
		this.stop();
		window.removeEventListener('resize', this.onResize);
		window.removeEventListener('pointermove', this.onPointerMove);
		document.removeEventListener('visibilitychange', this.onVisibility);
		if (typeof this.motionQuery.removeEventListener === 'function') {
			this.motionQuery.removeEventListener('change', this.onMotionChange);
		}
		if (this.canvas) {
			this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
			this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
		}
		if (this.gl) {
			this.gl.getExtension('WEBGL_lose_context')?.loseContext();
			this.gl = null;
		}
	}
}
