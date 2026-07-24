import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);
    this.time = 0;

    this.init();
    this.createComplexFlowField();
    this.addEventListeners();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x06070a, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 45;

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

  createComplexFlowField() {
    this.particleCount = 550;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);

    this.velocities = new Float32Array(this.particleCount * 3);
    this.initialPositions = new Float32Array(this.particleCount * 3);

    // Subtle, elegant color palette (deep slate cyan & subtle indigo violet)
    const colorCyan = new THREE.Color(0x38bdf8);
    const colorViolet = new THREE.Color(0x818cf8);
    const colorSlate = new THREE.Color(0x94a3b8);

    for (let i = 0; i < this.particleCount; i++) {
      const x = (Math.random() - 0.5) * 90;
      const y = (Math.random() - 0.5) * 70;
      const z = (Math.random() - 0.5) * 60;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.initialPositions[i * 3] = x;
      this.initialPositions[i * 3 + 1] = y;
      this.initialPositions[i * 3 + 2] = z;

      this.velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

      // Color distribution: mostly slate/indigo with hints of soft cyan
      const r = Math.random();
      let c = colorSlate;
      if (r > 0.5) c = colorViolet;
      if (r > 0.85) c = colorCyan;

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.75,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geometry, particleMaterial);
    this.group.add(this.points);

    // Subtle connection lines geometry
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending
    });

    const lineGeometry = new THREE.BufferGeometry();
    this.linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.group.add(this.linesMesh);
  }

  addEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onMouseMove(e) {
    this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.005;

    // Smooth mouse interpolation
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

    // Subtle camera orbit based on mouse
    this.camera.position.x = this.mouse.x * 6;
    this.camera.position.y = this.mouse.y * 4;
    this.camera.lookAt(0, 0, 0);

    // 3D Vector field simulation
    const pos = this.points.geometry.attributes.position.array;
    const vels = this.velocities;
    const inits = this.initialPositions;

    const mouseWorld = new THREE.Vector3(this.mouse.x * 35, this.mouse.y * 25, 0);

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      // Calculate curl noise field components
      const px = pos[idx];
      const py = pos[idx + 1];
      const pz = pos[idx + 2];

      const flowX = Math.sin(py * 0.08 + this.time) * Math.cos(pz * 0.08 + this.time);
      const flowY = Math.cos(px * 0.08 + this.time) * Math.sin(pz * 0.08 + this.time);
      const flowZ = Math.sin(px * 0.08 + this.time) * Math.cos(py * 0.08 + this.time);

      vels[idx] += flowX * 0.002;
      vels[idx + 1] += flowY * 0.002;
      vels[idx + 2] += flowZ * 0.002;

      // Gentle mouse gravity attraction
      const currentPos = new THREE.Vector3(px, py, pz);
      const distToMouse = currentPos.distanceTo(mouseWorld);
      if (distToMouse < 25) {
        const force = (25 - distToMouse) * 0.0004;
        const dir = currentPos.clone().sub(mouseWorld).normalize();
        vels[idx] += dir.x * force;
        vels[idx + 1] += dir.y * force;
        vels[idx + 2] += dir.z * force;
      }

      // Restoring tether force to initial bounds
      vels[idx] += (inits[idx] - px) * 0.0003;
      vels[idx + 1] += (inits[idx + 1] - py) * 0.0003;
      vels[idx + 2] += (inits[idx + 2] - pz) * 0.0003;

      // Velocity damping
      vels[idx] *= 0.96;
      vels[idx + 1] *= 0.96;
      vels[idx + 2] *= 0.96;

      pos[idx] += vels[idx];
      pos[idx + 1] += vels[idx + 1];
      pos[idx + 2] += vels[idx + 2];
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // Dynamic line connections between nearby particles
    const linePositions = [];
    const maxConnectDistSq = 8 * 8;

    for (let i = 0; i < this.particleCount; i += 3) {
      for (let j = i + 1; j < this.particleCount; j += 4) {
        const dx = pos[i * 3] - pos[j * 3];
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < maxConnectDistSq) {
          linePositions.push(
            pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
            pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]
          );
        }
      }
    }

    this.linesMesh.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    this.group.rotation.y = this.time * 0.03;

    this.renderer.render(this.scene, this.camera);
  }
}
