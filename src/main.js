import { WebGLBackground } from './bg-shader.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize WebGL Render Engine
  const bg = new WebGLBackground('webgl-canvas');

  // FPS Counter Wireup
  const fpsDisplay = document.getElementById('fps-display');
  if (fpsDisplay && bg) {
    bg.onFpsUpdate((fps) => {
      fpsDisplay.textContent = `${fps} FPS`;
    });
  }

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

      // Limit max tilt angles
      const rotateX = (-mouseY / (rect.height / 2)) * 12;
      const rotateY = (mouseX / (rect.width / 2)) * 12;

      card.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(10px)`;
    });

    container.addEventListener('mouseleave', () => {
      card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    });
  }

  // 3. Shader Mode Selector Controls
  const modeButtons = document.querySelectorAll('.fx-mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const mode = btn.getAttribute('data-mode');
      if (bg && mode) {
        bg.setMode(mode);
      }
    });
  });

  // 4. PGP Key Modal Controls
  const pgpBtn = document.getElementById('pgp-btn');
  const pgpModal = document.getElementById('pgp-modal');
  const closePgp = document.getElementById('close-pgp');
  const copyPgp = document.getElementById('copy-pgp');

  if (pgpBtn && pgpModal) {
    pgpBtn.addEventListener('click', () => {
      pgpModal.showModal();
    });
  }

  if (closePgp && pgpModal) {
    closePgp.addEventListener('click', () => {
      pgpModal.close();
    });
  }

  if (pgpModal) {
    pgpModal.addEventListener('click', (e) => {
      const dialogBounds = pgpModal.getBoundingClientRect();
      if (
        e.clientX < dialogBounds.left ||
        e.clientX > dialogBounds.right ||
        e.clientY < dialogBounds.top ||
        e.clientY > dialogBounds.bottom
      ) {
        pgpModal.close();
      }
    });
  }

  if (copyPgp) {
    copyPgp.addEventListener('click', () => {
      const keyText = document.querySelector('.pgp-key-box code')?.textContent;
      if (keyText) {
        navigator.clipboard.writeText(keyText).then(() => {
          const origText = copyPgp.textContent;
          copyPgp.textContent = 'Copied!';
          copyPgp.style.background = '#00f3ff';
          setTimeout(() => {
            copyPgp.textContent = origText;
            copyPgp.style.background = 'var(--accent-cyan)';
          }, 2000);
        });
      }
    });
  }
});
