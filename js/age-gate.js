/* ============================================
   AGE GATE 18+ - Chocolatería y Lado B
   ============================================ */

let ageGateCallback = null; // Callback cuando responde Sí
let ageGateContext = null;  // 'chocolate' | 'sideB'

function showAgeGate(context, onVerified) {
  ageGateContext = context;
  ageGateCallback = onVerified;
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.add('active');
}

function hideAgeGate() {
  const modal = document.getElementById('ageGateModal');
  if (modal) modal.classList.remove('active');
  ageGateCallback = null;
  ageGateContext = null;
}

function handleAgeGateResponse(isAdult) {
  hideAgeGate();

  if (isAdult) {
    if (ageGateCallback) ageGateCallback();
  } else {
    showPoliceArrest();
  }
}

function showPoliceArrest() {
  const overlay = document.getElementById('policeArrestOverlay');
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.classList.add('sirens-active');

  // Auto-cerrar después de 4 segundos
  setTimeout(() => {
    overlay.classList.remove('sirens-active');
    overlay.classList.remove('active');
  }, 4000);
}
