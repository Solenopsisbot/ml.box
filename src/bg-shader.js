import * as THREE from 'three';

export class WebGLBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.mode = 'neural'; // 'neural' | 'cyber' | 'quantum'
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.fpsCallback = null;

    this.init();
    this.createNeuralMode();
    this.createCyberGridMode();
    this.createQuantumMode();
    
    this.addEventListeners();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07080c, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 40;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Groups for different modes
    this.neuralGroup = new THREE.Group();
    this.cyberGroup = new THREE.Group();
    this.quantumGroup = new THREE.Group();

    this.scene.add(this.neuralGroup);
    this.scene.add(this.cyberGroup);
    this.scene.add(this.quantumGroup);

    this.cyberGroup.visible = false;
    this.quantumGroup.visible = false;
  }

  createNeuralMode() {
    const particleCount = 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    const cyan = new THREE.Color(0x00f3ff);
    const violet = new THREE.Color(0x9d4edd);
    const pink = new THREE.Color(0xff007f);

    for (let i = 0; i < particleCount; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = (Math.random() - 0.5) * 60;
      const z = (Math.random() - 0.5) * 50;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      velocities[i * 3] = (Math.random() - 0.5) * 0.05;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

      const mix = Math.random();
      let color = cyan.clone();
      if (mix > 0.6) color = violet.clone();
      else if (mix > 0.85) color = pink.clone();

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle points texture / material
    const particleMat = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.neuralParticles = new THREE.Points(geometry, particleMat);
    this.neuralGroup.add(this.neuralParticles);
    this.neuralVelocities = velocities;
    this.neuralOriginals = originalPositions;

    // Line connections mesh
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending
    });
    const lineGeo = new THREE.BufferGeometry();
    this.neuralLines = new THREE.LineSegments(lineGeo, lineMat);
    this.neuralGroup.add(this.neuralLines);
  }

  createCyberGridMode() {
    const size = 120;
    const divisions = 40;

    const gridGeo = new THREE.PlaneGeometry(size, size, divisions, divisions);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x9d4edd,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });

    this.cyberGridMesh = new THREE.Mesh(gridGeo, gridMat);
    this.cyberGridMesh.rotation.x = -Math.PI / 2.5;
    this.cyberGridMesh.position.y = -20;

    this.cyberGroup.add(this.cyberGridMesh);

    // Floating glowing node spheres
    const sphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });

    this.cyberNodes = [];
    for (let i = 0; i < 15; i++) {
      const mesh = new THREE.Mesh(sphereGeo, sphereMat);
      mesh.position.set(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 40
      );
      this.cyberNodes.push(mesh);
      this.cyberGroup.add(mesh);
    }
  }

  createQuantumMode() {
    const count = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const radius = 5 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      positions[i * 3] = radius * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.sin(theta) * Math.cos(phi);

      const color = new THREE.Color();
      color.setHSL(0.5 + Math.random() * 0.3, 0.9, 0.6);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.quantumMesh = new THREE.Points(geometry, material);
    this.quantumGroup.add(this.quantumMesh);
  }

  setMode(modeName) {
    this.mode = modeName;
    this.neuralGroup.visible = modeName === 'neural';
    this.cyberGroup.visible = modeName === 'cyber';
    this.quantumGroup.visible = modeName === 'quantum';
  }

  addEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('click', (e) => this.onClick(e));
  }

  onMouseMove(e) {
    this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  onClick(e) {
    // Shockwave pulse on click
    if (this.mode === 'neural') {
      const positions = this.neuralParticles.geometry.attributes.position.array;
      const clickVector = new THREE.Vector3(this.mouse.x * 30, this.mouse.y * 20, 0);

      for (let i = 0; i < positions.length / 3; i++) {
        const p = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const dist = p.distanceTo(clickVector);
        if (dist < 20) {
          const pushDir = p.clone().sub(clickVector).normalize().multiplyScalar((20 - dist) * 0.4);
          this.neuralVelocities[i * 3] += pushDir.x;
          this.neuralVelocities[i * 3 + 1] += pushDir.y;
          this.neuralVelocities[i * 3 + 2] += pushDir.z;
        }
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onFpsUpdate(cb) {
    this.fpsCallback = cb;
  }

  updateNeural(time) {
    const positions = this.neuralParticles.geometry.attributes.position.array;
    const vels = this.neuralVelocities;
    const origs = this.neuralOriginals;
    const particleCount = positions.length / 3;

    for (let i = 0; i < particleCount; i++) {
      // Drifting motion
      positions[i * 3] += vels[i * 3];
      positions[i * 3 + 1] += vels[i * 3 + 1];
      positions[i * 3 + 2] += vels[i * 3 + 2];

      // Damping force towards original position
      vels[i * 3] += (origs[i * 3] - positions[i * 3]) * 0.001;
      vels[i * 3 + 1] += (origs[i * 3 + 1] - positions[i * 3 + 1]) * 0.001;
      vels[i * 3 + 2] += (origs[i * 3 + 2] - positions[i * 3 + 2]) * 0.001;

      vels[i * 3] *= 0.98;
      vels[i * 3 + 1] *= 0.98;
      vels[i * 3 + 2] *= 0.98;
    }

    this.neuralParticles.geometry.attributes.position.needsUpdate = true;

    // Connect close particles with lines
    const linePositions = [];
    const maxDist = 9;

    for (let i = 0; i < particleCount; i += 2) {
      for (let j = i + 1; j < particleCount; j += 4) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < maxDist * maxDist) {
          linePositions.push(
            positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
            positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
          );
        }
      }
    }

    this.neuralLines.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    this.neuralGroup.rotation.y = time * 0.0001;
  }

  updateCyber(time) {
    const pos = this.cyberGridMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const z = Math.sin(u * 0.1 + time * 0.002) * Math.cos(v * 0.1 + time * 0.002) * 2;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;

    this.cyberNodes.forEach((node, idx) => {
      node.position.y += Math.sin(time * 0.002 + idx) * 0.02;
      node.rotation.y += 0.01;
    });
  }

  updateQuantum(time) {
    this.quantumMesh.rotation.y = time * 0.0003;
    this.quantumMesh.rotation.x = Math.sin(time * 0.0002) * 0.2;
  }

  animate() {
    requestAnimationFrame((t) => this.animate(t));

    const now = performance.now();
    this.frameCount++;
    if (now - this.lastTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      if (this.fpsCallback) this.fpsCallback(this.fps);
      this.frameCount = 0;
      this.lastTime = now;
    }

    // Smooth mouse interpolation
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

    // Camera subtle response
    this.camera.position.x = this.mouse.x * 4;
    this.camera.position.y = this.mouse.y * 4;
    this.camera.lookAt(0, 0, 0);

    const time = now;

    if (this.mode === 'neural') this.updateNeural(time);
    else if (this.mode === 'cyber') this.updateCyber(time);
    else if (this.mode === 'quantum') this.updateQuantum(time);

    this.renderer.render(this.scene, this.camera);
  }
}
