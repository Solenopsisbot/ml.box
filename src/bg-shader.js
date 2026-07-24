import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.time = 0;
    this.init();
    this.createSmallSeparatedWhiteDots();
    this.addEventListeners();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 42);

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

  // Create a crisp, sharp micro-circle texture
  createMicroDotTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const radius = size / 2 - 2;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  createSmallSeparatedWhiteDots() {
    // 750 evenly spaced micro-dots to ensure clear separation without clutter
    this.dotsCount = 750;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dotsCount * 3);

    this.baseShapeCoords = [];

    const p = 3;
    const q = 4;
    const knotPointsCount = 520;

    for (let i = 0; i < this.dotsCount; i++) {
      let x, y, z;

      if (i < knotPointsCount) {
        // Evenly spaced 3D Torus Knot curve coordinates
        const u = (i / knotPointsCount) * Math.PI * 2 * p;
        const r = 16 + 5 * Math.cos((q * u) / p);

        x = r * Math.cos(u);
        y = r * Math.sin(u);
        z = 9 * Math.sin((q * u) / p);
      } else {
        // Outer concentric 3D orbital rings with wide separation
        const ringIdx = i - knotPointsCount;
        const totalRingPoints = this.dotsCount - knotPointsCount;
        const angle = (ringIdx / totalRingPoints) * Math.PI * 2;
        
        // Staggered radii to prevent overlap
        const radius = 25 + (ringIdx % 3) * 3;
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle) * 0.45;
        z = radius * Math.sin(angle) * 0.85;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.baseShapeCoords.push({ x, y, z });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Material configured for very small (0.85), pure-white, clearly separate micro-dots
    const material = new THREE.PointsMaterial({
      size: 0.85,
      map: this.createMicroDotTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      alphaTest: 0.2,
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

    this.time += 0.01;
    const pos = this.points.geometry.attributes.position.array;

    // Gentle wave propagation across the 3D shape while keeping dots separated
    for (let i = 0; i < this.dotsCount; i++) {
      const idx = i * 3;
      const base = this.baseShapeCoords[i];

      const wave = Math.sin(this.time * 1.8 + base.x * 0.08 + base.y * 0.08) * 0.5;

      pos[idx] = base.x + (base.x / 18) * wave;
      pos[idx + 1] = base.y + (base.y / 18) * wave;
      pos[idx + 2] = base.z + wave;
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // Smooth continuous multi-axis 3D rotation
    this.group.rotation.x = this.time * 0.2;
    this.group.rotation.y = this.time * 0.38;
    this.group.rotation.z = Math.sin(this.time * 0.15) * 0.15;

    this.renderer.render(this.scene, this.camera);
  }
}
