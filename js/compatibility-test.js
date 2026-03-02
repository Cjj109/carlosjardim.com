/* ============================================
   COMPATIBILITY TEST - Match scoring system
   ============================================ */

// Database de perfiles (todos los chocolates de la chocolatería)
const profiles = {
  jesus: {
    name: "Jesús",
    instagram: "@elyizus",
    answers: ["blanco", "venezolano", "liso", "videojuegos"],
    taken: true,
    description: "Dulce en fase beta. Vive tranquilo comiendo perros calientes y jugando LoL. Extremadamente apartado."
  },
  miguel: {
    name: "Miguel Acosta",
    instagram: "@miguex94",
    answers: ["caribeño", "español", "afro", "moteles"],
    taken: true,
    description: "En su momento fue el terror de cierto sitio. Hoy su vida gira alrededor de la iglesia y la fe. Un hombre totalmente cambiado."
  },
  zachiro: {
    name: "Zachiro",
    instagram: "@zachiroj",
    answers: ["asiatico", "chino", "liso", "videojuegos"],
    taken: false,
    description: "El primer asiático nacido de dos padres venezolanos. Fanático de los videojuegos. Cuenta con una moto y un tatuaje."
  },
  anthonny: {
    name: "Anthonny",
    instagram: "@anthonny.123",
    answers: ["blanco", "arabe", "calvo", "videojuegos"],
    taken: true,
    description: "El Benjamín Button del cabello. Ya a los 13 años tenía barba. Este es un dulce tipo Di Caprio (no apto para mayores de 23)."
  },
  ricardo: {
    name: "Ricardo",
    instagram: "@radsl",
    answers: ["blanco", "portugues", "catire", "pollo"],
    taken: false,
    description: "Este caramelo es conocido por partir. Con ligero sabor y olor a pollo a la brasa. Prohibición de venta en Tanaguarenas."
  },
  mike: {
    name: "Miguel Angelo",
    instagram: "@miguel267",
    answers: ["caribeño", "venezolano", "liso", "ice"],
    taken: false,
    description: "De fabricación venezolana, actualmente en el mercado estadounidense. Cuenta con un legendario movimiento de caderas (Magic Mike)."
  },
  david: {
    name: "David Pereira",
    instagram: "@davidapereiraf",
    answers: ["blanco", "portugues", "liso", "iglesia"],
    taken: false,
    description: "Chocolate que se doró en Los Caracas. Busca alemana que disfrute su sabor. Hoy está más cerca del lado oscuro."
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
      { value: "iglesia", emoji: "⛪", label: "Ir a la iglesia" },
      { value: "pollo", emoji: "🍗", label: "Comer pollo" },
      { value: "videojuegos", emoji: "🎮", label: "Videojuegos" },
      { value: "ice", emoji: "🧊", label: "Escapar del ICE" },
      { value: "moteles", emoji: "🏨", label: "Review de moteles" }
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

  // Limpiar y mostrar contenedor de preguntas
  const questionsContainer = document.getElementById('compatQuestions');
  if (questionsContainer) {
    questionsContainer.innerHTML = '';
    questionsContainer.style.opacity = '1';
    questionsContainer.style.display = 'block';
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
    // Excluir a Jesus del test (extremadamente apartado)
    if (key === 'jesus') {
      return;
    }

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

  // Ocultar preguntas con fade out
  questionsContainer.style.opacity = '0';
  questionsContainer.style.transition = 'opacity 0.3s ease';

  setTimeout(() => {
    questionsContainer.innerHTML = '';

    // Obtener datos del chocolate desde la base de datos
    const chocolate = window.chocolates ? window.chocolates[topMatch.key] : null;

    if (!chocolate) {
      // Fallback si no se encuentra el chocolate
      closeCompatibilityTest();
      return;
    }

    // Renderizar el detalle del chocolate directamente en el modal del test
    const statusBadge = chocolate.status
      ? `<div class="detail-status ${chocolate.status === 'extremadamente apartado' ? 'extreme' : ''}">
           ${chocolate.status === 'extremadamente apartado' ? '🚨 EXTREMADAMENTE APARTADO' : '⚠️ APARTADO'}
         </div>`
      : '';

    resultsContainer.innerHTML = `
      <div class="chocolate-detail active" style="animation: fadeIn 0.5s ease;">
        <div style="font-size: 48px; margin-bottom: 20px;">🎯</div>
        <div style="font-size: 18px; color: #ffd700; margin-bottom: 30px; font-family: var(--mono); letter-spacing: 2px;">
          TU MATCH PERFECTO
        </div>

        <img src="${chocolate.image}" alt="${chocolate.name}" class="detail-img" loading="lazy" decoding="async" onerror="this.src='images/placeholder.png'">
        <div class="detail-name">${chocolate.name}</div>
        ${statusBadge}
        <div class="detail-description">${chocolate.description}</div>

        <div class="detail-actions">
          <a href="https://instagram.com/${chocolate.instagram.replace('@', '')}"
             target="_blank"
             rel="noopener noreferrer"
             class="detail-btn">
            Ver Perfil
          </a>
          <button onclick="viewAllChocolates()" class="detail-btn secondary">
            Ver Otros Chocolates
          </button>
          <button onclick="closeCompatibilityTest()" class="detail-btn secondary">
            Cerrar
          </button>
        </div>
      </div>
    `;

    // Actualizar progreso a 100%
    const progressBar = document.querySelector('.compat-test-progress-bar');
    if (progressBar) {
      progressBar.style.width = '100%';
    }
  }, 300);
}

/**
 * Ver todos los chocolates desde el resultado del test
 */
function viewAllChocolates() {
  closeCompatibilityTest();
  setTimeout(() => {
    openChocolateShop();
  }, 300);
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
  }
  // ESC handling is in the global handler (main.js)
});
