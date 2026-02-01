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

    // Create touch element
    const touchElement = document.createElement('div');
    touchElement.className = 'finger-touch';
    const color = touchColors[usedColorIndex % touchColors.length];
    usedColorIndex++;
    touchElement.style.backgroundColor = color;
    touchElement.style.left = touch.pageX + 'px';
    touchElement.style.top = touch.pageY + 'px';

    document.getElementById('fingerCanvas').appendChild(touchElement);

    // Store touch data
    activeTouches.set(touchId, {
      element: touchElement,
      color: color,
      x: touch.pageX,
      y: touch.pageY
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
      touchData.element.style.left = touch.pageX + 'px';
      touchData.element.style.top = touch.pageY + 'px';
      touchData.x = touch.pageX;
      touchData.y = touch.pageY;
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

  const touchElement = document.createElement('div');
  touchElement.className = 'finger-touch';
  const color = touchColors[usedColorIndex % touchColors.length];
  usedColorIndex++;
  touchElement.style.backgroundColor = color;
  touchElement.style.left = e.pageX + 'px';
  touchElement.style.top = e.pageY + 'px';

  document.getElementById('fingerCanvas').appendChild(touchElement);

  mouseTouch = {
    element: touchElement,
    color: color,
    x: e.pageX,
    y: e.pageY
  };

  activeTouches.set('mouse', mouseTouch);
  updateFingerUI();
}

function handleMouseMove(e) {
  if (isChoosingInProgress) return;
  if (!mouseTouch) return;

  mouseTouch.element.style.left = e.pageX + 'px';
  mouseTouch.element.style.top = e.pageY + 'px';
  mouseTouch.x = e.pageX;
  mouseTouch.y = e.pageY;
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
 * Choose finger - eliminate random touches
 */
function chooseFinger() {
  if (activeTouches.size < 2) return;
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
  const touchArray = Array.from(activeTouches.values());

  // Determine how many to eliminate (usually 1, sometimes 2)
  const eliminateCount = Math.random() < 0.8 ? 1 : Math.min(2, touchArray.length - 1);

  // Shuffle and pick random ones to eliminate
  const shuffled = touchArray.sort(() => Math.random() - 0.5);
  const toEliminate = shuffled.slice(0, eliminateCount);

  // Update instructions
  const instructions = document.getElementById('fingerInstructions');
  instructions.textContent = '🎲 Eligiendo...';

  // Phase 1: Make all circles grow for suspense (300ms)
  activeTouches.forEach(touchData => {
    touchData.element.classList.add('suspense');
  });

  setTimeout(() => {
    // Phase 2: Add pre-explode animation to selected circles (500ms)
    toEliminate.forEach(touchData => {
      touchData.element.classList.remove('suspense');
      touchData.element.classList.add('about-to-explode');
    });

    if (eliminateCount === 1) {
      instructions.textContent = '🎯 Eliminando...';
    } else {
      instructions.textContent = `🎯 Eliminando ${eliminateCount}...`;
    }

    setTimeout(() => {
      // Phase 3: Final explosion (600ms)
      toEliminate.forEach(touchData => {
        touchData.element.classList.remove('about-to-explode');
        touchData.element.classList.add('eliminated');
      });

      // Show result after explosion animation
      setTimeout(() => {
        const remaining = activeTouches.size - eliminateCount;
        if (remaining === 1) {
          instructions.textContent = '✅ ¡Esta persona SALE del padel!';
        } else {
          instructions.textContent = `✅ ${remaining} personas siguen - ¡Juegan padel!`;
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
