/* ============================================
   AGE GATE 18+ - Solo Chocolatería
   ============================================ */

let ageGateCallback = null;
let ageGateRejectCallback = null;
let ageGateRejectData = null;

function showAgeGate(context, onVerified, onRejected, rejectData) {
  ageGateCallback = onVerified;
  ageGateRejectCallback = onRejected || null;
  ageGateRejectData = rejectData !== undefined ? rejectData : null;
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.add('active');
}

function closeAgeGateModal() {
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.remove('active');
  ageGateCallback = null;
  ageGateRejectCallback = null;
  ageGateRejectData = null;
}

function handleAgeGateResponse(isAdult) {
  const callback = ageGateCallback;
  const rejectCb = ageGateRejectCallback;
  const rejectData = ageGateRejectData;
  closeAgeGateModal();

  if (isAdult && callback) {
    callback();
  } else {
    if (rejectCb) rejectCb(rejectData);
    showPoliceArrest();
  }
}

let policeArrestTimer = null;

function showPoliceArrest() {
  const overlay = document.getElementById('policeArrestOverlay');
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.classList.add('sirens-active');

  // Sirenas se apagan después de 1.5s, pero el overlay queda visible
  clearTimeout(policeArrestTimer);
  policeArrestTimer = setTimeout(() => {
    overlay.classList.remove('sirens-active');
  }, 1500);
}

function closePoliceArrest() {
  const overlay = document.getElementById('policeArrestOverlay');
  if (!overlay) return;

  clearTimeout(policeArrestTimer);
  overlay.classList.remove('sirens-active');
  overlay.classList.remove('active');
}

/* Side B: menor de edad (mensaje simple, no chocolate) */
function showUnderageOverlay() {
  const overlay = document.getElementById('underageOverlay');
  if (overlay) overlay.classList.add('active');
}

function closeUnderageOverlay() {
  const overlay = document.getElementById('underageOverlay');
  if (overlay) overlay.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  const ageGateModal = document.getElementById('ageGateModal');
  const underageOverlay = document.getElementById('underageOverlay');
  const policeOverlay = document.getElementById('policeArrestOverlay');
  const closeButtons = document.querySelectorAll('.close-gate[role="button"]');

  closeButtons.forEach((button) => {
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (policeOverlay && policeOverlay.classList.contains('active')) {
      closePoliceArrest();
      return;
    }

    if (ageGateModal && ageGateModal.classList.contains('active')) {
      closeAgeGateModal();
      return;
    }

    if (underageOverlay && underageOverlay.classList.contains('active')) {
      closeUnderageOverlay();
    }
  });
});
