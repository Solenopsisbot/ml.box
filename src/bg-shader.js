/**
 * Liquid Chrome SDF background — raw WebGL2, zero dependencies.
 *
 * Renders a fullscreen triangle and raymarches smooth-union metaballs in the
 * fragment shader. Visually identical to the previous Three.js implementation
 * at ~1/80th the payload.
 *
 * Perf guards:
 *   - device pixel ratio capped (see DPR_CAP) — this is a blurred backdrop,
 *     it does not need to be retina-sharp
 *   - internal resolution scaled by RENDER_SCALE
 *   - framerate capped to TARGET_FPS (motion is deliberately slow)
 *   - fully paused while the tab is hidden
 *   - honours prefers-reduced-motion by drawing a single static frame
 *   - recovers from GPU context loss
 */

const DPR_CAP = 1.5;
const RENDER_SCALE = 0.75;
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

#define MAX_STEPS 64
#define SURF_DIST 0.003
#define MAX_DIST  15.0

float sdSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float map(vec3 p) {
  float t = uTime * 0.5;

  // Primary fluid core metaballs revolving around the origin
  vec3 p1 = p - vec3(sin(t * 0.7) * 0.75, cos(t * 0.5) * 0.5, sin(t * 0.3) * 0.3);
  float d1 = sdSphere(p1, 0.85);

  vec3 p2 = p - vec3(cos(t * 0.8 + 1.5) * 0.95, sin(t * 0.6 + 0.5) * 0.7, cos(t * 0.4) * 0.4);
  float d2 = sdSphere(p2, 0.65);

  vec3 p3 = p - vec3(sin(t * 0.5 + 3.0) * 0.85, cos(t * 0.9 + 2.0) * 0.65, sin(t * 0.7 + 1.0) * 0.5);
  float d3 = sdSphere(p3, 0.55);

  // Interactive mouse influence metaball
  vec3 pMouse = p - vec3(uMouse.x * 2.2, uMouse.y * 1.4, 0.2);
  float dMouse = sdSphere(pMouse, 0.55);

  // Organic smooth union
  float d = sdSmoothUnion(d1, d2, 0.55);
  d = sdSmoothUnion(d, d3, 0.5);
  d = sdSmoothUnion(d, dMouse, 0.6);

  // Surface ripple
  d += sin(p.x * 3.5 + t * 2.0) * cos(p.y * 3.5 + t * 1.5) * sin(p.z * 3.5 + t) * 0.035;

  return d;
}

/* Forward-difference normal: 4 map() calls instead of the 6 a central
   difference needs. Indistinguishable once the frosted layer lands on top. */
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0025, 0.0);
  float d = map(p);
  return normalize(vec3(
    map(p + e.xyy) - d,
    map(p + e.yxy) - d,
    map(p + e.yyx) - d
  ));
}

void main() {
  vec2 st = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(st, -1.4));

  float dO = 0.0;
  float dS = 0.0;
  vec3 p = ro;

  for (int i = 0; i < MAX_STEPS; i++) {
    p = ro + rd * dO;
    dS = map(p);
    dO += dS;
    if (dS < SURF_DIST || dO > MAX_DIST) break;
  }

  // Ambient obsidian glow background
  vec3 col = mix(vec3(0.02, 0.03, 0.05), vec3(0.06, 0.08, 0.12), length(st) * 0.8);

  if (dS < SURF_DIST) {
    vec3 n = calcNormal(p);
    vec3 viewDir = -rd;

    vec3 lightDir1 = normalize(vec3(2.5, 3.0, 3.0) - p);
    vec3 lightDir2 = normalize(vec3(-2.5, -2.0, 2.0) - p);

    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0);

    float spec1 = pow(max(dot(viewDir, reflect(-lightDir1, n)), 0.0), 32.0);
    float spec2 = pow(max(dot(viewDir, reflect(-lightDir2, n)), 0.0), 16.0);

    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);

    // Chromatic dispersion (RGB spectral shift)
    vec3 chromatic = vec3(
      dot(n, vec3(0.3, 0.6, 0.8)),
      dot(n, vec3(0.5, 0.7, 0.4)),
      dot(n, vec3(0.8, 0.4, 0.9))
    );
    chromatic = 0.5 + 0.5 * sin(chromatic * 4.0 + uTime * 0.5);

    vec3 baseChrome = vec3(0.85, 0.90, 0.95);
    vec3 matColor = mix(baseChrome, chromatic, 0.35);
    vec3 specColor = vec3(1.0) * spec1 + vec3(0.7, 0.85, 1.0) * spec2;

    col = matColor * (diff1 * 0.6 + diff2 * 0.3 + 0.25) + specColor * 0.8 + fresnel * chromatic * 0.6;
    col = mix(col, vec3(0.03, 0.04, 0.06), smoothstep(2.0, 4.5, dO));
  }

  col *= 1.0 - 0.3 * length(st);
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
			// No WebGL2 — the CSS gradient on <body> is the fallback. Hide the canvas.
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
			antialias: false, // pointless for a raymarched fullscreen pass
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
		// metaball is direct manipulation, so it stays responsive.
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
		this.draw(2.4);
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
