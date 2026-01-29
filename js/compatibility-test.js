/* ============================================
   COMPATIBILITY TEST - Match scoring system
   ============================================ */

// Database de perfiles
const profiles = {
  carlos: {
    name: "Carlos Jardim",
    instagram: "@cjj109",
    answers: ["blanco", "portugues", "liso", "gym"],
    taken: false,
    description: "Economista amante del gym. Constancia > Ruido. Si no está analizando datos, está levantando hierro."
  },
  anthonny: {
    name: "Anthonny Baladi",
    instagram: "@anthonny.123",
    answers: ["blanco", "arabe", "calvo", "videojuegos"],
    taken: true,
    description: "Gamer árabe sin cabello. Experto en rage quits y combos imposibles."
  },
  zachiro: {
    name: "Zachiro",
    instagram: "@zachiroj",
    answers: ["blanco", "venezolano", "liso", "videojuegos"],
    taken: false,
    description: "Fanático máximo de los RPGs. Si tiene más de 100 horas de gameplay, Zachiro ya lo platinó."
  },
  ricardo: {
    name: "Ricardo de Sousa",
    instagram: "@radsl",
    answers: ["blanco", "portugues", "catire", "pollo"],
    taken: false,
    description: "Portugués rubio obsesionado con el pollo. Probablemente esté en Cabo Kenedy ahora mismo."
  },
  miguel: {
    name: "Miguel Acosta",
    instagram: "@miguex94",
    answers: ["caribeño", "español", "afro", "moteles"],
    taken: true,
    description: "Crítico profesional de moteles. Si tiene espejo en el techo, él ya estuvo ahí."
  }
};

// Preguntas del test
const questions = [
  {
    id: 1,
    text: "¿Qué te atrae más?",
    options: [
      { value: "negro", emoji: "👨🏿", label: "Negro" },
      { value: "blanco", emoji: "👨🏻", label: "Blanco" },
      { value: "asiatico", emoji: "🧑", label: "Asiático" },
      { value: "caribeño", emoji: "👨🏽", label: "Caribeño" }
    ]
  },
  {
    id: 2,
    text: "Nacionalidad ideal",
    options: [
      { value: "arabe", emoji: "🇦🇪", label: "Árabe" },
      { value: "portugues", emoji: "🇵🇹", label: "Portugués" },
      { value: "chino", emoji: "🇨🇳", label: "Chino" },
      { value: "venezolano", emoji: "🇻🇪", label: "Venezolano" },
      { value: "español", emoji: "🇪🇸", label: "Español" }
    ]
  },
  {
    id: 3,
    text: "Estilo de cabello preferido",
    options: [
      { value: "liso", emoji: "💇‍♂️", label: "Corto liso" },
      { value: "calvo", emoji: "🦲", label: "Sin cabello" },
      { value: "afro", emoji: "👨‍🦱", label: "Semi-afro" },
      { value: "catire", emoji: "👱‍♂️", label: "Rubio" }
    ]
  },
  {
    id: 4,
    text: "Plan ideal de sábado",
    options: [
      { value: "moteles", emoji: "🏨", label: "Review de moteles" },
      { value: "pollo", emoji: "🍗", label: "Comer pollo" },
      { value: "videojuegos", emoji: "🎮", label: "Videojuegos" },
      { value: "gym", emoji: "💪", label: "Gym" }
    ]
  }
];

// Estado del test
let currentQuestion = 0;
let userAnswers = [];

/**
 * Abrir el test
 */
function openCompatibilityTest() {
  const modal = document.getElementById('compatTestModal');
  if (!modal) return;

  // Reset state
  currentQuestion = 0;
  userAnswers = [];

  // Limpiar resultados anteriores
  const resultsContainer = document.getElementById('compatResults');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }

  // Mostrar modal
  modal.classList.add('active');
  document.body.classList.add('compat-test-open');

  // Renderizar primera pregunta
  renderQuestion();
  updateProgress();
}

/**
 * Cerrar el test
 */
function closeCompatibilityTest() {
  const modal = document.getElementById('compatTestModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('compat-test-open');

  // Reset
  currentQuestion = 0;
  userAnswers = [];
}

/**
 * Renderizar pregunta actual
 */
function renderQuestion() {
  const container = document.getElementById('compatQuestions');
  if (!container) return;

  const question = questions[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;

  // Determinar grid columns basado en cantidad de opciones
  const gridCols = question.options.length <= 4 ? 2 : 2;

  container.innerHTML = `
    <div class="compat-test-question active">
      <div class="question-number">PREGUNTA ${currentQuestion + 1}/${questions.length}</div>
      <div class="question-text">${question.text}</div>
      <div class="options-grid" style="grid-template-columns: repeat(${gridCols}, 1fr);">
        ${question.options.map(option => `
          <div class="option-card" onclick="selectOption('${option.value}')">
            <span class="option-emoji">${option.emoji}</span>
            <div class="option-label">${option.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Seleccionar una opción
 */
function selectOption(value) {
  // Guardar respuesta
  userAnswers[currentQuestion] = value;

  // Highlight visual temporal
  const cards = document.querySelectorAll('.option-card');
  cards.forEach(card => {
    if (card.textContent.toLowerCase().includes(value)) {
      card.classList.add('selected');
    }
  });

  // Esperar un poco antes de avanzar
  setTimeout(() => {
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
      renderQuestion();
      updateProgress();
    } else {
      showResults();
    }
  }, 300);
}

/**
 * Actualizar barra de progreso
 */
function updateProgress() {
  const progressBar = document.querySelector('.compat-test-progress-bar');
  if (!progressBar) return;

  const progress = ((currentQuestion + 1) / questions.length) * 100;
  progressBar.style.width = `${progress}%`;
}

/**
 * Calcular match score con cada perfil
 */
function calculateMatches() {
  const matches = [];

  Object.keys(profiles).forEach(key => {
    const profile = profiles[key];
    let score = 0;

    // Comparar cada respuesta
    userAnswers.forEach((answer, index) => {
      if (profile.answers[index] === answer) {
        score += 25; // 25 puntos por cada match (100/4 preguntas)
      }
    });

    matches.push({
      key: key,
      score: score,
      ...profile
    });
  });

  // Ordenar por score descendente
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Mostrar resultados
 */
function showResults() {
  const matches = calculateMatches();
  const topMatch = matches[0];

  const questionsContainer = document.getElementById('compatQuestions');
  const resultsContainer = document.getElementById('compatResults');

  if (!questionsContainer || !resultsContainer) return;

  // Ocultar preguntas
  questionsContainer.innerHTML = '';

  // Determinar veredicto
  let verdict = "";
  if (topMatch.score === 100) {
    verdict = "¡MATCH PERFECTO! 🎯";
  } else if (topMatch.score >= 75) {
    verdict = "Altamente compatible ✨";
  } else if (topMatch.score >= 50) {
    verdict = "Hay química 🔥";
  } else {
    verdict = "Interesante... 🤔";
  }

  // Mensaje si está apartado
  const takenBadge = topMatch.taken
    ? '<div class="result-status">⚠️ ACTUALMENTE APARTADO</div>'
    : '';

  // Renderizar resultados
  resultsContainer.innerHTML = `
    <div class="compat-test-results active">
      <div class="result-match-score">${topMatch.score}%</div>
      <div class="result-verdict">${verdict}</div>

      <div class="result-profile">
        <div class="result-name">${topMatch.name}</div>
        <div class="result-instagram">${topMatch.instagram}</div>
        ${takenBadge}
        <div class="result-description">${topMatch.description}</div>
      </div>

      <div class="result-actions">
        <a href="https://instagram.com/${topMatch.instagram.replace('@', '')}"
           target="_blank"
           rel="noopener noreferrer"
           class="result-btn">
          VER PERFIL
        </a>
        <button onclick="closeCompatibilityTest()" class="result-btn secondary">
          CERRAR
        </button>
        <button onclick="openCompatibilityTest()" class="result-btn secondary">
          REPETIR TEST
        </button>
      </div>
    </div>
  `;

  // Actualizar progreso a 100%
  updateProgress();
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('compatTestModal');

  if (modal) {
    // Cerrar con click fuera
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeCompatibilityTest();
      }
    });

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeCompatibilityTest();
      }
    });
  }
});
