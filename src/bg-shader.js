import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.time = 0;
    this.init();
    this.createRoundWhiteDots();
    this.addEventListeners();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050608, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 42;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  // Create a soft round white dot texture programmatically
  createCircleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  createRoundWhiteDots() {
    this.particleCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const scales = new Float32Array(this.particleCount);

    // Parametric attributes for 3D trajectory math
    this.params = [];

    for (let i = 0; i < this.particleCount; i++) {
      // Trajectory mathematical constants for complex 3D orbital dynamics
      const a = 12 + Math.random() * 26;
      const b = 10 + Math.random() * 22;
      const c = 8 + Math.random() * 20;

      const freqX = 0.5 + Math.random() * 1.5;
      const freqY = 0.5 + Math.random() * 1.5;
      const freqZ = 0.5 + Math.random() * 1.5;

      const phaseX = Math.random() * Math.PI * 2;
      const phaseY = Math.random() * Math.PI * 2;
      const phaseZ = Math.random() * Math.PI * 2;

      const speed = 0.15 + Math.random() * 0.35;

      this.params.push({ a, b, c, freqX, freqY, freqZ, phaseX, phaseY, phaseZ, speed });

      // Initial positions
      positions[i * 3] = a * Math.sin(phaseX);
      positions[i * 3 + 1] = b * Math.cos(phaseY);
      positions[i * 3 + 2] = c * Math.sin(phaseZ);

      scales[i] = 0.6 + Math.random() * 0.8;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 1.2,
      map: this.createCircleTexture(),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
  }

  addEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.008;
    const positions = this.points.geometry.attributes.position.array;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const p = this.params[i];

      const t = this.time * p.speed;

      // Complex 3D Lissajous & Torus knot orbital motion equations
      const x = p.a * Math.sin(t * p.freqX + p.phaseX) + 6 * Math.sin(t * 0.5 + p.phaseY);
      const y = p.b * Math.cos(t * p.freqY + p.phaseY) + 5 * Math.sin(t * 0.7 + p.phaseZ);
      const z = p.c * Math.sin(t * p.freqZ + p.phaseZ) * Math.cos(t * 0.4 + p.phaseX);

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // Slow elegant rotation of the entire particle cloud
    this.group.rotation.y = this.time * 0.05;
    this.group.rotation.x = Math.sin(this.time * 0.03) * 0.15;

    this.renderer.render(this.scene, this.camera);
  }
}
