/* ============================================
   AGE GATE 18+ - Solo Chocolatería
   ============================================ */

let ageGateCallback = null;

function showAgeGate(context, onVerified) {
  ageGateCallback = onVerified;
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.add('active');
}

function closeAgeGateModal() {
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.remove('active');
  ageGateCallback = null;
}

function handleAgeGateResponse(isAdult) {
  const callback = ageGateCallback;
  closeAgeGateModal();

  if (isAdult && callback) {
    callback();
  } else {
    showPoliceArrest();
  }
}

function showPoliceArrest() {
  const overlay = document.getElementById('policeArrestOverlay');
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.classList.add('sirens-active');

  setTimeout(() => {
    overlay.classList.remove('sirens-active');
    overlay.classList.remove('active');
  }, 4000);
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
