/* ============================================
   NEW FEATURES - Zodiac, Instagram Choice, Phone Exit
   ============================================ */

// My zodiac sign
const MY_SIGN = 'tauro'; // ♉ Tauro

/**
 * Open Instagram choice modal
 */
function openInstagramChoice() {
  const modal = document.getElementById('instagramChoiceModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('instagram-choice-open');
}

/**
 * Close Instagram choice modal
 */
function closeInstagramChoice() {
  const modal = document.getElementById('instagramChoiceModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('instagram-choice-open');
}

/**
 * Open zodiac compatibility modal
 */
function openZodiacCompatibility() {
  const modal = document.getElementById('zodiacModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('zodiac-open');

  // Reset to selection view
  const selection = document.getElementById('zodiacSelection');
  const result = document.getElementById('zodiacResult');
  if (selection) selection.style.display = 'block';
  if (result) result.style.display = 'none';
}

/**
 * Close zodiac compatibility modal
 */
function closeZodiacCompatibility() {
  const modal = document.getElementById('zodiacModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('zodiac-open');
}

/**
 * Check zodiac compatibility
 */
function checkZodiacCompatibility(selectedSign) {
  const selection = document.getElementById('zodiacSelection');
  const result = document.getElementById('zodiacResult');

  if (!selection || !result) return;

  // Hide selection, show result
  selection.style.display = 'none';
  result.style.display = 'block';

  // Check compatibility
  const isCompatible = checkSignCompatibility(MY_SIGN, selectedSign);

  // Render result
  renderZodiacResult(selectedSign, isCompatible);
}

/**
 * Check if two signs are compatible
 */
function checkSignCompatibility(sign1, sign2) {
  const compatibility = {
    tauro: ['virgo', 'capricornio', 'cancer', 'piscis', 'tauro'],
    aries: ['leo', 'sagitario', 'geminis', 'acuario', 'aries'],
    geminis: ['libra', 'acuario', 'aries', 'leo', 'geminis'],
    cancer: ['escorpio', 'piscis', 'tauro', 'virgo', 'cancer'],
    leo: ['aries', 'sagitario', 'geminis', 'libra', 'leo'],
    virgo: ['tauro', 'capricornio', 'cancer', 'escorpio', 'virgo'],
    libra: ['geminis', 'acuario', 'leo', 'sagitario', 'libra'],
    escorpio: ['cancer', 'piscis', 'virgo', 'capricornio', 'escorpio'],
    sagitario: ['aries', 'leo', 'libra', 'acuario', 'sagitario'],
    capricornio: ['tauro', 'virgo', 'escorpio', 'piscis', 'capricornio'],
    acuario: ['geminis', 'libra', 'aries', 'sagitario', 'acuario'],
    piscis: ['cancer', 'escorpio', 'tauro', 'capricornio', 'piscis']
  };

  return compatibility[sign1]?.includes(sign2) || false;
}

/**
 * Render zodiac result
 */
function renderZodiacResult(selectedSign, isCompatible) {
  const result = document.getElementById('zodiacResult');
  if (!result) return;

  const signNames = {
    aries: 'Aries ♈',
    tauro: 'Tauro ♉',
    geminis: 'Géminis ♊',
    cancer: 'Cáncer ♋',
    leo: 'Leo ♌',
    virgo: 'Virgo ♍',
    libra: 'Libra ♎',
    escorpio: 'Escorpio ♏',
    sagitario: 'Sagitario ♐',
    capricornio: 'Capricornio ♑',
    acuario: 'Acuario ♒',
    piscis: 'Piscis ♓'
  };

  const compatibleMessages = [
    "¡Las estrellas se alinean! Según la astrología, tenemos una conexión cósmica perfecta. Nuestra energía fluye en armonía.",
    "El universo sonríe ante nuestra combinación. Los astros predicen una química especial entre nosotros.",
    "¡Compatibilidad estelar confirmada! Nuestros signos crean una sinergia única según las estrellas."
  ];

  const randomCompatibleMessage = compatibleMessages[Math.floor(Math.random() * compatibleMessages.length)];

  if (isCompatible) {
    result.innerHTML = `
      <div class="zodiac-result-icon">✨</div>
      <div class="zodiac-result-title">¡Somos compatibles!</div>
      <div class="zodiac-result-signs">${signNames[MY_SIGN]} + ${signNames[selectedSign]}</div>
      <div class="zodiac-result-description">
        ${randomCompatibleMessage}
      </div>
      <div class="zodiac-result-actions">
        <a href="https://instagram.com/cjj109" target="_blank" rel="noopener noreferrer" class="zodiac-result-btn">
          📸 Conversemos en Instagram
        </a>
        <button onclick="closeZodiacCompatibility()" class="zodiac-result-btn secondary">
          Probar otro signo
        </button>
      </div>
    `;
  } else {
    result.innerHTML = `
      <div class="zodiac-result-icon">💫</div>
      <div class="zodiac-result-title">Según las estrellas...</div>
      <div class="zodiac-result-signs">${signNames[MY_SIGN]} + ${signNames[selectedSign]}</div>
      <div class="zodiac-result-description">
        No somos compatibles según la astrología... pero yo no creo en el horóscopo.
        <br><br>
        La química real no la determinan las estrellas, la determinamos nosotros.
      </div>
      <div class="zodiac-result-actions">
        <a href="https://instagram.com/cjj109" target="_blank" rel="noopener noreferrer" class="zodiac-result-btn">
          📸 Hablemos de todas formas
        </a>
        <button onclick="closeZodiacCompatibility()" class="zodiac-result-btn secondary">
          Probar otro signo
        </button>
      </div>
    `;
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Instagram choice modal
  const instagramModal = document.getElementById('instagramChoiceModal');
  if (instagramModal) {
    // Close with click outside
    instagramModal.addEventListener('click', (e) => {
      if (e.target === instagramModal) {
        closeInstagramChoice();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && instagramModal.classList.contains('active')) {
        closeInstagramChoice();
      }
    });
  }

  // Zodiac modal
  const zodiacModal = document.getElementById('zodiacModal');
  if (zodiacModal) {
    // Close with click outside
    zodiacModal.addEventListener('click', (e) => {
      if (e.target === zodiacModal) {
        closeZodiacCompatibility();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && zodiacModal.classList.contains('active')) {
        closeZodiacCompatibility();
      }
    });
  }
});
