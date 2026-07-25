import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.time = 0;
    this.init();
    this.createCentralOrbitalDots();
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
    this.camera.position.set(0, 0, 45);

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

  // Create a soft glowing white orb texture for gorgeous frosted blur effect
  createSoftGlowingOrbTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  createCentralOrbitalDots() {
    this.dotsCount = 450;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dotsCount * 3);

    this.orbitalParams = [];

    // Distribute orbs into concentric 3D orbital planes revolving around center (0,0,0)
    for (let i = 0; i < this.dotsCount; i++) {
      // Concentric orbital radii layers
      const layer = i % 5;
      const radius = 10 + layer * 6 + Math.random() * 3;

      // Base orbital angle around center
      const angle = (i / this.dotsCount) * Math.PI * 2 * 3 + Math.random() * 0.5;

      // Inclination angle for 3D tilt of each orbital plane
      const tiltX = ((layer * 36 - 45) * Math.PI) / 180;
      const tiltY = ((layer * 25) * Math.PI) / 180;

      // Slow orbital velocity
      const speed = (0.08 + Math.random() * 0.12) * (i % 2 === 0 ? 1 : -1);

      this.orbitalParams.push({
        radius,
        angle,
        tiltX,
        tiltY,
        speed,
        verticalPhase: Math.random() * Math.PI * 2
      });

      // Initial positions
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle) * Math.cos(tiltX);
      const z = radius * Math.sin(angle) * Math.sin(tiltX);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Pure white glowing orbs
    const material = new THREE.PointsMaterial({
      size: 1.5,
      map: this.createSoftGlowingOrbTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
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

    // Slow, serene animation time step
    this.time += 0.0025;
    const pos = this.points.geometry.attributes.position.array;

    for (let i = 0; i < this.dotsCount; i++) {
      const idx = i * 3;
      const orb = this.orbitalParams[i];

      // Smooth central revolution around origin (0,0,0)
      const currentAngle = orb.angle + this.time * orb.speed * 2;
      const wave = Math.sin(this.time * 1.5 + orb.verticalPhase) * 1.5;

      const px = (orb.radius + wave) * Math.cos(currentAngle);
      const py = (orb.radius + wave) * Math.sin(currentAngle) * Math.cos(orb.tiltX);
      const pz = (orb.radius + wave) * Math.sin(currentAngle) * Math.sin(orb.tiltX) + Math.cos(currentAngle) * Math.sin(orb.tiltY) * 6;

      pos[idx] = px;
      pos[idx + 1] = py;
      pos[idx + 2] = pz;
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // Slow orbital rotation of the overall central system
    this.group.rotation.y = this.time * 0.08;
    this.group.rotation.x = Math.sin(this.time * 0.05) * 0.1;

    this.renderer.render(this.scene, this.camera);
  }
}
