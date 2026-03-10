/* ============================================
   MAIN.JS - Inicialización y efectos generales
   ============================================ */

// Paleta de colores accent (se elige uno random al cargar)
const palette = [
  '#ff3b30', '#ff4d6d', '#c9184a', '#ff2e63', '#e11d48',
  '#b91c1c', '#ff6b6b', '#f97316', '#d946ef', '#7c3aed'
];

// Frases micro debajo del bombón
const microLines = [
  'Hay un botón que no es un botón.',
  'Lo simple también filtra.',
  'Si te dio curiosidad, ya sabes.',
  'Tócalo. O no.',
  'No todo se explica.',
  'El orden importa.',
  'A veces es solo un detalle.'
];

/**
 * Convierte hex a RGB
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Aplica color accent random y frase micro
 */
function applyRandomness() {
  const bb = document.getElementById('bonbon');
  
  // Color random
  const color = palette[Math.floor(Math.random() * palette.length)];
  const { r, g, b } = hexToRgb(color);
  
  // Actualizar CSS variables
  bb.style.background = color;
  document.documentElement.style.setProperty('--accent-red', color);
  document.documentElement.style.setProperty('--accent-r', r);
  document.documentElement.style.setProperty('--accent-g', g);
  document.documentElement.style.setProperty('--accent-b', b);
  
  // Frase random
  const line = microLines[Math.floor(Math.random() * microLines.length)];
  const micro = document.getElementById('microLine');
  if (micro) {
    micro.textContent = `"${line}"`;
    requestAnimationFrame(() => micro.classList.add('visible'));
  }
  
  // Activar respiración
  bb.classList.add('breathing');
}

/**
 * Auto-hide del hint arrow después de unos segundos (FIX: más tiempo en mobile)
 */
function setupHintBehavior() {
  const hint = document.getElementById('hintArrow');
  // Use matchMedia instead of window.innerWidth to avoid forced reflow
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const delay = isMobile ? 15000 : 12000; // 15s en mobile, 12s en desktop
  setTimeout(() => hint?.classList.add('hidden'), delay);
}

/**
 * Parallax suave con mouse/touch (FIX: con throttle para mejor rendimiento)
 */
function setupParallax() {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const setParallax = (x, y) => {
    document.documentElement.style.setProperty('--px', `${x}px`);
    document.documentElement.style.setProperty('--py', `${y}px`);
  };

  const handleMovement = (clientX, clientY) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = clamp(clientX - cx, -160, 160);
    const dy = clamp(clientY - cy, -160, 160);
    // Suavizar el movimiento
    setParallax(dx * 0.35, dy * 0.35);
  };

  // FIX: Throttle helper (limitar ejecución a cada 16ms ≈ 60fps)
  let rafId = null;
  const throttledHandle = (clientX, clientY) => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      handleMovement(clientX, clientY);
      rafId = null;
    });
  };

  // Mouse
  window.addEventListener('mousemove', (e) => {
    throttledHandle(e.clientX, e.clientY);
  }, { passive: true });

  // Touch
  window.addEventListener('touchmove', (e) => {
    if (!e.touches || !e.touches[0]) return;
    throttledHandle(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // Reset al salir
  window.addEventListener('mouseleave', () => setParallax(0, 0), { passive: true });
  window.addEventListener('touchend', () => setParallax(0, 0), { passive: true });
}

/**
 * Toggle entre Lado A y Lado B
 */
function toggleMode(activate) {
  if (activate) {
    document.body.classList.add('alt-active');
  } else {
    document.body.classList.remove('alt-active');
    closeGate();
  }
  window.scrollTo(0, 0);
}

/**
 * Secuencia de mordida del bombón
 */
function startBiteSequence() {
  const bonbon = document.getElementById('bonbon');
  bonbon.classList.remove('breathing');
  bonbon.classList.add('biting');
  
  setTimeout(() => {
    document.getElementById('genderGate').classList.add('active');
    showStep('gateStepGender');
  }, 500);
}

/**
 * Global ESC key handler - single listener for all modals
 * Replaces individual keydown listeners across all JS files
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // Modal/overlay ID -> close function name (resolved at call time via window[fn])
  // Order matters: overlays first (higher z-index), then modals
  const modalCloseMap = [
    ['closetOverlay', 'closeCloset'],
    ['policeArrestOverlay', 'closePoliceArrest'],
    ['underageOverlay', 'closeUnderageOverlay'],
    ['ageGateModal', 'closeAgeGateModal'],
    ['videoModal', 'closeVideoModal'],
    ['bcvCalculatorModal', 'closeBCVCalculator'],
    ['monetaryModal', 'closeMonetaryIndicators'],
    ['commoditiesModal', 'closeCommodities'],
    ['gymWidgetModal', 'closeGymWidget'],
    ['chocolateShopModal', 'closeChocolateShop'],
    ['timelineModal', 'closeAcademicTimeline'],
    ['heightScaleModal', 'closeHeightScale'],
    ['valentineFlowersModal', 'closeValentineFlowers'],
    ['zodiacModal', 'closeZodiacCompatibility'],
    ['fingerChooserModal', 'closeFingerChooser'],
    ['utilitiesModal', 'closeUtilitiesMenu'],
    ['compatTestModal', 'closeCompatibilityTest'],
    ['skillTreeModal', 'closeSkillTree'],
  ];

  for (const [modalId, closeFn] of modalCloseMap) {
    const modal = document.getElementById(modalId);
    if (modal && modal.classList.contains('active') && typeof window[closeFn] === 'function') {
      window[closeFn]();
      return;
    }
  }
});

/**
 * Skill Tree — Portafolio (modal)
 */
const SKILL_STORAGE = 'portfolio-unlocked';

function updateSkillBadge() {
  const badge = document.getElementById('skillTreeBadge');
  if (!badge) return;
  const saved = JSON.parse(localStorage.getItem(SKILL_STORAGE) || '[]');
  badge.textContent = saved.length + '/3';
}

function unlockRoot() {
  const root = document.getElementById('skillRoot');
  if (root && !root.classList.contains('unlocked')) {
    root.classList.add('unlocked');
  }
}

function restoreBranch(col) {
  const branch = col.dataset.branch;
  col.classList.add('unlocked');

  // Light root line for this column
  const colIndex = Array.from(col.parentElement.children).indexOf(col);
  const rootLine = document.querySelector('.skill-root-line[data-col="' + colIndex + '"]');
  if (rootLine) rootLine.classList.add('lit');

  // Unlock all prereqs and final instantly
  col.querySelectorAll('.skill-prereq, .skill-final').forEach(node => {
    node.classList.add('unlocked');
  });
}

function cascadeUnlock(col) {
  if (col.classList.contains('unlocked')) return;

  const branch = col.dataset.branch;
  const nodes = col.querySelectorAll('.skill-prereq, .skill-final');
  const colIndex = Array.from(col.parentElement.children).indexOf(col);

  // Light root line
  const rootLine = document.querySelector('.skill-root-line[data-col="' + colIndex + '"]');
  if (rootLine) rootLine.classList.add('lit');

  // Cascade: unlock each node with staggered delay
  nodes.forEach((node, i) => {
    setTimeout(() => {
      node.classList.add('unlocking');
      setTimeout(() => {
        node.classList.remove('unlocking');
        node.classList.add('unlocked');
      }, 500);
    }, i * 250);
  });

  // Mark column as unlocked after all nodes finish
  setTimeout(() => {
    col.classList.add('unlocked');

    // Save
    const current = JSON.parse(localStorage.getItem(SKILL_STORAGE) || '[]');
    if (!current.includes(branch)) {
      current.push(branch);
      localStorage.setItem(SKILL_STORAGE, JSON.stringify(current));
    }
    updateSkillBadge();
    unlockRoot();
  }, nodes.length * 250 + 500);
}

function openSkillTree() {
  const overlay = document.getElementById('skillTreeModal');
  if (!overlay) return;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Restore previously unlocked branches instantly
  const saved = JSON.parse(localStorage.getItem(SKILL_STORAGE) || '[]');
  overlay.querySelectorAll('.skill-column').forEach(col => {
    if (saved.includes(col.dataset.branch)) {
      restoreBranch(col);
    }
  });

  if (saved.length > 0) unlockRoot();

  // Staggered column entrance
  const columns = overlay.querySelectorAll('.skill-column');
  columns.forEach((col, i) => {
    col.classList.remove('visible');
    setTimeout(() => col.classList.add('visible'), 150 + i * 120);
  });
}
window.openSkillTree = openSkillTree;

function closeSkillTree() {
  const overlay = document.getElementById('skillTreeModal');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}
window.closeSkillTree = closeSkillTree;

function setupSkillTree() {
  updateSkillBadge();

  // Click overlay background to close
  const overlay = document.getElementById('skillTreeModal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSkillTree();
    });
  }

  // Column click to cascade unlock
  document.querySelectorAll('#skillTreeModal .skill-column').forEach(col => {
    col.addEventListener('click', (e) => {
      if (col.classList.contains('unlocked')) return;
      if (e.target.closest('.skill-visit')) return;
      cascadeUnlock(col);
    });
  });
}

/**
 * Inicialización al cargar el DOM
 */
document.addEventListener('DOMContentLoaded', () => {
  applyRandomness();
  setupHintBehavior();
  setupParallax();
  setupSkillTree();
});