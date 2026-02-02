/* ============================================
   UTILITIES MENU & FINGER CHOOSER
   ============================================ */

/**
 * Open utilities menu
 */
function openUtilitiesMenu() {
  const modal = document.getElementById('utilitiesModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('utilities-open');
}

/**
 * Close utilities menu
 */
function closeUtilitiesMenu() {
  const modal = document.getElementById('utilitiesModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('utilities-open');
}

/**
 * Open BCV calculator from utilities menu
 */
function openBCVFromUtilities() {
  // Close utilities menu first
  closeUtilitiesMenu();

  // Small delay to allow menu to close smoothly
  setTimeout(() => {
    openBCVCalculator();
  }, 100);
}

/**
 * Open monetary indicators from utilities menu
 */
function openMonetaryFromUtilities() {
  // Close utilities menu first
  closeUtilitiesMenu();

  // Small delay to allow menu to close smoothly
  setTimeout(() => {
    openMonetaryIndicators();
  }, 100);
}

/**
 * Open finger chooser from utilities menu
 */
function openFingerChooser() {
  // Close utilities menu first
  closeUtilitiesMenu();

  // Open finger chooser
  const modal = document.getElementById('fingerChooserModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('finger-chooser-open');

  // Reset state
  resetFingerChooser();
}

/**
 * Close finger chooser
 */
function closeFingerChooser() {
  const modal = document.getElementById('fingerChooserModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('finger-chooser-open');

  // Clean up
  resetFingerChooser();
}

// ============================================
// FINGER CHOOSER LOGIC
// ============================================

let activeTouches = new Map();
let touchColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
let usedColorIndex = 0;
let isChoosingInProgress = false;
let autoChooseTimer = null;

/**
 * Initialize finger chooser event listeners
 */
function initFingerChooser() {
  const canvas = document.getElementById('fingerCanvas');
  if (!canvas) return;

  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Mouse events (for desktop testing)
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
}

/**
 * Get touch position relative to canvas
 */
function getTouchPositionRelativeToCanvas(touch) {
  const canvas = document.getElementById('fingerCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top
  };
}

/**
 * Handle touch start
 */
function handleTouchStart(e) {
  e.preventDefault();
  if (isChoosingInProgress) return;

  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const touchId = touch.identifier;

    // Skip if already tracked
    if (activeTouches.has(touchId)) continue;

    // Get position relative to canvas
    const pos = getTouchPositionRelativeToCanvas(touch);

    // Create touch element
    const touchElement = document.createElement('div');
    touchElement.className = 'finger-touch';
    const color = touchColors[usedColorIndex % touchColors.length];
    usedColorIndex++;
    touchElement.style.backgroundColor = color;
    touchElement.style.left = pos.x + 'px';
    touchElement.style.top = pos.y + 'px';

    document.getElementById('fingerCanvas').appendChild(touchElement);

    // Store touch data
    activeTouches.set(touchId, {
      element: touchElement,
      color: color,
      x: pos.x,
      y: pos.y
    });
  }

  updateFingerUI();
}

/**
 * Handle touch move
 */
function handleTouchMove(e) {
  e.preventDefault();
  if (isChoosingInProgress) return;

  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const touchId = touch.identifier;
    const touchData = activeTouches.get(touchId);

    if (touchData) {
      const pos = getTouchPositionRelativeToCanvas(touch);
      touchData.element.style.left = pos.x + 'px';
      touchData.element.style.top = pos.y + 'px';
      touchData.x = pos.x;
      touchData.y = pos.y;
    }
  }
}

/**
 * Handle touch end
 */
function handleTouchEnd(e) {
  e.preventDefault();
  if (isChoosingInProgress) return;

  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const touchId = touch.identifier;
    const touchData = activeTouches.get(touchId);

    if (touchData) {
      touchData.element.remove();
      activeTouches.delete(touchId);
    }
  }

  updateFingerUI();
}

// Mouse event handlers for desktop testing
let mouseTouch = null;

function handleMouseDown(e) {
  if (isChoosingInProgress) return;

  const canvas = document.getElementById('fingerCanvas');
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const touchElement = document.createElement('div');
  touchElement.className = 'finger-touch';
  const color = touchColors[usedColorIndex % touchColors.length];
  usedColorIndex++;
  touchElement.style.backgroundColor = color;
  touchElement.style.left = x + 'px';
  touchElement.style.top = y + 'px';

  canvas.appendChild(touchElement);

  mouseTouch = {
    element: touchElement,
    color: color,
    x: x,
    y: y
  };

  activeTouches.set('mouse', mouseTouch);
  updateFingerUI();
}

function handleMouseMove(e) {
  if (isChoosingInProgress) return;
  if (!mouseTouch) return;

  const canvas = document.getElementById('fingerCanvas');
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mouseTouch.element.style.left = x + 'px';
  mouseTouch.element.style.top = y + 'px';
  mouseTouch.x = x;
  mouseTouch.y = y;
}

function handleMouseUp(e) {
  if (isChoosingInProgress) return;
  if (!mouseTouch) return;

  mouseTouch.element.remove();
  activeTouches.delete('mouse');
  mouseTouch = null;
  updateFingerUI();
}

/**
 * Update finger chooser UI
 */
function updateFingerUI() {
  const count = activeTouches.size;
  const instructions = document.getElementById('fingerInstructions');

  // Clear any existing timer
  if (autoChooseTimer) {
    clearTimeout(autoChooseTimer);
    autoChooseTimer = null;
  }

  // Remove suspense class from all touches
  activeTouches.forEach(touchData => {
    touchData.element.classList.remove('suspense');
  });

  if (count === 0) {
    instructions.textContent = 'Esperando dedos... (0)';
  } else if (count === 1) {
    instructions.textContent = '1 dedo detectado - Necesitas al menos 2';
  } else {
    // Add suspense animation to all circles
    activeTouches.forEach(touchData => {
      touchData.element.classList.add('suspense');
    });

    // Show countdown
    let secondsLeft = 3;
    instructions.textContent = `${count} dedos detectados - Eligiendo en ${secondsLeft}...`;

    // Countdown timer
    const countdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        instructions.textContent = `${count} dedos detectados - Eligiendo en ${secondsLeft}...`;
      }
    }, 1000);

    // Auto-choose after 3 seconds
    autoChooseTimer = setTimeout(() => {
      clearInterval(countdownInterval);
      // Verify we still have 2+ fingers before choosing
      if (activeTouches.size >= 2 && !isChoosingInProgress) {
        chooseFinger();
      }
    }, 3000);
  }
}

/**
 * Choose finger - eliminate exactly ONE random touch
 */
function chooseFinger() {
  const currentSize = activeTouches.size;
  if (currentSize < 2) return;
  if (isChoosingInProgress) return;

  isChoosingInProgress = true;

  // Clear any active timer
  if (autoChooseTimer) {
    clearTimeout(autoChooseTimer);
    autoChooseTimer = null;
  }

  // Remove suspense class from all touches
  activeTouches.forEach(touchData => {
    touchData.element.classList.remove('suspense');
  });

  // Get all touches as array
  const touchArray = Array.from(activeTouches.entries());

  // ALWAYS eliminate exactly 1 person to ensure at least 1 remains
  const eliminateCount = 1;

  // Pick a random one to eliminate
  const randomIndex = Math.floor(Math.random() * touchArray.length);
  const [eliminatedKey, eliminatedData] = touchArray[randomIndex];

  // Update instructions
  const instructions = document.getElementById('fingerInstructions');
  instructions.textContent = '🎲 Eligiendo...';

  // Phase 1: Make all circles grow for suspense (300ms)
  activeTouches.forEach(touchData => {
    touchData.element.classList.add('suspense');
  });

  setTimeout(() => {
    // Check if still valid
    if (!activeTouches.has(eliminatedKey)) {
      instructions.textContent = '⚠️ Alguien levantó el dedo - Intenta de nuevo';
      isChoosingInProgress = false;
      return;
    }

    // Phase 2: Add pre-explode animation to selected circle (500ms)
    eliminatedData.element.classList.remove('suspense');
    eliminatedData.element.classList.add('about-to-explode');
    instructions.textContent = '🎯 Eliminando...';

    setTimeout(() => {
      // Phase 3: Final explosion (600ms)
      eliminatedData.element.classList.remove('about-to-explode');
      eliminatedData.element.classList.add('eliminated');

      // Show result after explosion animation
      setTimeout(() => {
        const remaining = currentSize - eliminateCount;
        if (remaining === 1) {
          instructions.textContent = '💥 ¡El dedo explotado SALE del padel!';
        } else {
          instructions.textContent = `💥 Eliminado 1 - Quedan ${remaining} para jugar padel`;
        }

        isChoosingInProgress = false;
      }, 600);
    }, 500);
  }, 300);
}

/**
 * Reset finger chooser
 */
function resetFingerChooser() {
  // Clear timer
  if (autoChooseTimer) {
    clearTimeout(autoChooseTimer);
    autoChooseTimer = null;
  }

  // Clear all touches
  activeTouches.forEach(touchData => {
    if (touchData.element && touchData.element.parentNode) {
      touchData.element.remove();
    }
  });
  activeTouches.clear();
  mouseTouch = null;
  usedColorIndex = 0;
  isChoosingInProgress = false;

  // Reset UI
  updateFingerUI();
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize finger chooser
  initFingerChooser();

  // Close utilities menu with click outside
  const utilitiesModal = document.getElementById('utilitiesModal');
  if (utilitiesModal) {
    utilitiesModal.addEventListener('click', (e) => {
      if (e.target === utilitiesModal) {
        closeUtilitiesMenu();
      }
    });
  }

  // Close finger chooser with ESC
  document.addEventListener('keydown', (e) => {
    const fingerModal = document.getElementById('fingerChooserModal');
    if (e.key === 'Escape' && fingerModal && fingerModal.classList.contains('active')) {
      closeFingerChooser();
    }
  });

  // Close utilities menu with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && utilitiesModal && utilitiesModal.classList.contains('active')) {
      closeUtilitiesMenu();
    }
  });
});
