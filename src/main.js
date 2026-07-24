import { WebGLBackground } from './bg-shader.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize WebGL Background Engine
  new WebGLBackground('webgl-canvas');

  // 2. Interactive 3D Card Tilt Effect
  const card = document.getElementById('hero-card');
  const container = document.querySelector('.app-container');

  if (card && container) {
    container.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;

      const mouseX = e.clientX - cardCenterX;
      const mouseY = e.clientY - cardCenterY;

      // Subtle 3D tilt calculation
      const rotateX = (-mouseY / (rect.height / 2)) * 8;
      const rotateY = (mouseX / (rect.width / 2)) * 8;

      card.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(8px)`;
    });

    container.addEventListener('mouseleave', () => {
      card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    });
  }
});
