import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.time = 0;
    this.init();
    this.createPureWhite3DShape();
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
    this.camera.position.set(0, 0, 38);

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

  // Create a sharp, pure white circular dot texture
  createSharpWhiteDotTexture() {
    const size = 64;
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

  createPureWhite3DShape() {
    // We construct a distinct, recognizable 3D Torus Knot & Geodesic Lattice
    this.dotsCount = 900;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dotsCount * 3);

    this.baseShapeCoords = [];

    // Parametric Torus Knot (p=3, q=4) geometry + concentric orbital rings
    const p = 3;
    const q = 4;

    for (let i = 0; i < this.dotsCount; i++) {
      let x, y, z;

      if (i < 650) {
        // Primary 3D Torus Knot Shape
        const u = (i / 650) * Math.PI * 2 * p;
        const r = 13 + 4 * Math.cos(q * u / p);

        x = r * Math.cos(u);
        y = r * Math.sin(u);
        z = 7 * Math.sin(q * u / p);
      } else {
        // Outer 3D Orbital Ring
        const angle = ((i - 650) / (this.dotsCount - 650)) * Math.PI * 2;
        const radius = 22;
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle) * 0.4;
        z = radius * Math.sin(angle) * 0.9;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.baseShapeCoords.push({ x, y, z });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Pure white material with high visibility & crisp rendering
    const material = new THREE.PointsMaterial({
      size: 2.2,
      map: this.createSharpWhiteDotTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      alphaTest: 0.1,
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

    this.time += 0.012;
    const pos = this.points.geometry.attributes.position.array;

    // Organic 3D wave deformation over the rotating 3D Torus Knot
    for (let i = 0; i < this.dotsCount; i++) {
      const idx = i * 3;
      const base = this.baseShapeCoords[i];

      const wave = Math.sin(this.time * 2 + base.x * 0.1 + base.y * 0.1) * 0.6;

      pos[idx] = base.x + (base.x / 15) * wave;
      pos[idx + 1] = base.y + (base.y / 15) * wave;
      pos[idx + 2] = base.z + wave;
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // Continuous multi-axis 3D rotation so the shape motion is 100% clear
    this.group.rotation.x = this.time * 0.25;
    this.group.rotation.y = this.time * 0.45;
    this.group.rotation.z = Math.sin(this.time * 0.2) * 0.2;

    this.renderer.render(this.scene, this.camera);
  }
}
