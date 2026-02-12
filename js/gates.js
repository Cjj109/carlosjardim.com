/* ============================================
   GATES.JS - Sistema de cuestionarios
   ============================================ */

let videoUrl = "";

/**
 * Cerrar el gate y resetear bombón
 */
function closeGate() {
  document.getElementById('genderGate').classList.remove('active');
  const bonbon = document.getElementById('bonbon');
  bonbon.classList.remove('biting');
  // Use requestAnimationFrame instead of forced reflow for better performance
  requestAnimationFrame(() => {
    bonbon.style.clipPath = '';
    bonbon.classList.add('breathing');
  });
}

/**
 * Mostrar un paso específico del gate
 */
function showStep(stepId) {
  const steps = [
    'gateStepGender',
    'gateStepPadel',
    'gateStepBoyfriend',
    'gateStepAge',
    'gateStepScale',
    'gateStepQuote'
  ];
  
  steps.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = (id === stepId) ? 'block' : 'none';
    }
  });
}

/**
 * Manejar selección de género
 */
function handleGender(gender) {
  if (gender === 'male') {
    showStep('gateStepPadel');
  } else {
    showStep('gateStepBoyfriend');
  }
}

/**
 * Manejar respuesta de "¿Tienes novio?"
 */
function handleBoyfriend(hasBoyfriend) {
  if (!hasBoyfriend) {
    showStep('gateStepAge');
  } else {
    showStep('gateStepScale');
  }
}

/**
 * Manejar respuesta de "¿Eres mayor de 18?" (Lado B)
 */
function handleAgeStep(isAdult) {
  if (isAdult) {
    closeGate();
    toggleMode(true);
  } else {
    closeGate();
    showUnderageOverlay();
  }
}

/**
 * Manejar puntuación de estabilidad
 */
function handleScore(score) {
  if (score <= 5) {
    closeGate();
    openVideoModal('https://youtu.be/Km4BayZykwE');
  } else {
    videoUrl = 'https://www.youtube.com/watch?v=3sIkdOqePUg';
    showStep('gateStepQuote');
  }
}

/**
 * Proceder al video final
 */
function proceedToVideo() {
  closeGate();
  openVideoModal(videoUrl);
}

/**
 * Crear botones de escala (1-10)
 */
function initializeScaleButtons() {
  const grid = document.getElementById('scaleGrid');
  if (!grid) return;
  
  for (let i = 1; i <= 10; i++) {
    const button = document.createElement('button');
    button.textContent = i;
    button.onclick = () => handleScore(i);
    grid.appendChild(button);
  }
}

// Inicializar escala al cargar
document.addEventListener('DOMContentLoaded', () => {
  initializeScaleButtons();
});