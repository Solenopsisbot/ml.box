import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
varying vec2 vUv;

#define MAX_STEPS 80
#define SURF_DIST 0.002
#define MAX_DIST 15.0

float sdSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float map(vec3 p) {
  float t = uTime * 0.5;
  
  // Primary fluid core metaballs revolving around origin
  vec3 p1 = p - vec3(sin(t * 0.7) * 0.75, cos(t * 0.5) * 0.5, sin(t * 0.3) * 0.3);
  float d1 = sdSphere(p1, 0.85);

  vec3 p2 = p - vec3(cos(t * 0.8 + 1.5) * 0.95, sin(t * 0.6 + 0.5) * 0.7, cos(t * 0.4) * 0.4);
  float d2 = sdSphere(p2, 0.65);

  vec3 p3 = p - vec3(sin(t * 0.5 + 3.0) * 0.85, cos(t * 0.9 + 2.0) * 0.65, sin(t * 0.7 + 1.0) * 0.5);
  float d3 = sdSphere(p3, 0.55);

  // Interactive mouse influence metaball
  vec3 pMouse = p - vec3(uMouse.x * 2.2, uMouse.y * 1.4, 0.2);
  float dMouse = sdSphere(pMouse, 0.55);

  // Organic smooth union of metaballs
  float d = sdSmoothUnion(d1, d2, 0.55);
  d = sdSmoothUnion(d, d3, 0.5);
  d = sdSmoothUnion(d, dMouse, 0.6);

  // Dynamic surface waves ripple
  d += sin(p.x * 3.5 + t * 2.0) * cos(p.y * 3.5 + t * 1.5) * sin(p.z * 3.5 + t) * 0.035;

  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
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

    vec3 lightPos1 = vec3(2.5, 3.0, 3.0);
    vec3 lightDir1 = normalize(lightPos1 - p);
    vec3 lightPos2 = vec3(-2.5, -2.0, 2.0);
    vec3 lightDir2 = normalize(lightPos2 - p);

    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0);

    vec3 ref1 = reflect(-lightDir1, n);
    float spec1 = pow(max(dot(viewDir, ref1), 0.0), 32.0);

    vec3 ref2 = reflect(-lightDir2, n);
    float spec2 = pow(max(dot(viewDir, ref2), 0.0), 16.0);

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
    vec3 specColor = vec3(1.0, 1.0, 1.0) * spec1 + vec3(0.7, 0.85, 1.0) * spec2;

    col = matColor * (diff1 * 0.6 + diff2 * 0.3 + 0.25) + specColor * 0.8 + fresnel * chromatic * 0.6;
    col = mix(col, vec3(0.03, 0.04, 0.06), smoothstep(2.0, 4.5, dO));
  }

  col *= 1.0 - 0.3 * length(st);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);

    this.init();
    this.addEventListeners();
    this.animate(0);
  }

  init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(pixelRatio);

    this.uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
      uMouse: { value: this.mouse }
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  addEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  onPointerMove(event) {
    // Convert to normalized coordinates (-1 to 1)
    this.targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onWindowResize() {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(pixelRatio);

    this.uniforms.uResolution.value.set(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio
    );
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));

    // Linear interpolation (lerp) for silky mouse motion
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

    this.uniforms.uTime.value = timestamp * 0.001;
    this.renderer.render(this.scene, this.camera);
  }
}

