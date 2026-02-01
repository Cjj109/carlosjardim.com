/* ============================================
   GYM WIDGET - Display Hevy workout data
   ============================================ */

/**
 * Open gym widget modal
 */
async function openGymWidget() {
  const modal = document.getElementById('gymWidgetModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('gym-widget-open');

  // Load and display workout data
  await loadGymData();
}

/**
 * Close gym widget modal
 */
function closeGymWidget() {
  const modal = document.getElementById('gymWidgetModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('gym-widget-open');
}

// Global variable to track current workout index and data
let gymData = null;
let currentWorkoutIndex = 0;

/**
 * Load gym data from JSON file
 */
async function loadGymData() {
  const container = document.getElementById('gymWidgetContent');
  if (!container) return;

  // Show loading state
  container.innerHTML = '<div class="gym-loading">Cargando datos del gym...</div>';

  try {
    // Fetch data
    const response = await fetch('data/gym-data.json?' + new Date().getTime());

    if (!response.ok) {
      throw new Error('Failed to fetch gym data');
    }

    gymData = await response.json();
    currentWorkoutIndex = 0; // Always start with latest workout

    // Render data
    renderWorkoutData();

  } catch (error) {
    console.error('Error loading gym data:', error);
    container.innerHTML = `
      <div class="gym-error">
        Error cargando datos del gym.<br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

/**
 * Render workout data
 */
function renderWorkoutData() {
  const container = document.getElementById('gymWidgetContent');
  if (!container || !gymData) return;

  try {
    // Get the workout to display based on current index
    const workout = currentWorkoutIndex === 0
      ? gymData.last_workout
      : gymData.previous_workouts[currentWorkoutIndex - 1];

    if (!workout) {
      container.innerHTML = '<div class="gym-error">No hay datos de entrenamiento disponibles</div>';
      return;
    }

  // Check if there are previous workouts
  const hasPreviousWorkouts = gymData.previous_workouts && gymData.previous_workouts.length > 0;
  const totalWorkouts = 1 + (gymData.previous_workouts?.length || 0);
  const canGoPrevious = currentWorkoutIndex > 0;
  const canGoNext = currentWorkoutIndex < totalWorkouts - 1;

  const exercisesHTML = workout.exercises.map(exercise => `
    <div class="gym-exercise">
      <div class="gym-exercise-name">${exercise.name}</div>
      <div class="gym-sets">
        ${exercise.sets.map((set, index) => `
          <div class="gym-set">
            <div class="gym-set-number">Serie ${index + 1}</div>
            <div class="gym-set-value">${set.reps} reps × ${set.weight}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Navigation buttons HTML (only show if there are previous workouts)
  const navigationHTML = hasPreviousWorkouts ? `
    <div class="gym-navigation">
      <button
        class="gym-nav-btn ${!canGoPrevious ? 'disabled' : ''}"
        onclick="navigateWorkout(-1)"
        ${!canGoPrevious ? 'disabled' : ''}>
        ← Anterior
      </button>
      <div class="gym-nav-indicator">
        ${currentWorkoutIndex === 0 ? '🔥 Más Reciente' : `Entrenamiento ${currentWorkoutIndex + 1} de ${totalWorkouts}`}
      </div>
      <button
        class="gym-nav-btn ${!canGoNext ? 'disabled' : ''}"
        onclick="navigateWorkout(1)"
        ${!canGoNext ? 'disabled' : ''}>
        Siguiente →
      </button>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="gym-workout-name">${workout.name}</div>

    <div class="gym-workout-meta">
      <div class="gym-meta-item">
        <div class="gym-meta-label">Fecha</div>
        <div class="gym-meta-value">${formatGymDate(workout.date)}</div>
      </div>
      <div class="gym-meta-item">
        <div class="gym-meta-label">Duración</div>
        <div class="gym-meta-value">${workout.duration}</div>
      </div>
      <div class="gym-meta-item">
        <div class="gym-meta-label">Volumen</div>
        <div class="gym-meta-value">${workout.volume}</div>
      </div>
    </div>

    ${navigationHTML}

    <div class="gym-exercises">
      <div class="gym-exercises-title">💪 Ejercicios Realizados</div>
      ${exercisesHTML}
    </div>

    <div style="text-align: center;">
      <a href="${gymData.profile_url}" target="_blank" rel="noopener noreferrer" class="gym-link">
        Ver Perfil Completo en Hevy →
      </a>
    </div>

    <div style="text-align: center; margin-top: 16px; font-size: 11px; color: rgba(255,255,255,0.3); font-family: var(--mono);">
      Última actualización: ${formatGymDateTime(gymData.last_updated)}
    </div>
  `;
  } catch (error) {
    console.error('Error rendering workout data:', error);
    container.innerHTML = `
      <div class="gym-error">
        Error mostrando datos del entrenamiento.<br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

/**
 * Navigate between workouts
 */
function navigateWorkout(direction) {
  if (!gymData) return;

  const totalWorkouts = 1 + (gymData.previous_workouts?.length || 0);
  const newIndex = currentWorkoutIndex + direction;

  // Check bounds
  if (newIndex >= 0 && newIndex < totalWorkouts) {
    currentWorkoutIndex = newIndex;
    renderWorkoutData();
  }
}

/**
 * Format date - Format as "DD Mes YYYY" like Hevy
 */
function formatGymDate(dateString) {
  try {
    if (!dateString) return 'Fecha no disponible';

    // Parse the date string (YYYY-MM-DD format)
    const parts = String(dateString).split('-');
    if (parts.length !== 3) return String(dateString);

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    // Spanish month names (short form)
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthIndex = parseInt(month, 10) - 1;

    if (monthIndex < 0 || monthIndex > 11) return String(dateString);

    // Format as "DD Mes YYYY" (e.g., "31 Ene 2026")
    return `${parseInt(day, 10)} ${months[monthIndex]} ${year}`;
  } catch (error) {
    console.error('Error formatting date:', error, dateString);
    return 'Fecha no disponible';
  }
}

/**
 * Format datetime - Simple version to avoid formatting errors
 */
function formatGymDateTime(dateTimeString) {
  try {
    if (!dateTimeString) return 'Fecha no disponible';
    // Just return a simplified version without complex formatting
    return String(dateTimeString).split('T')[0] || String(dateTimeString);
  } catch (error) {
    console.error('Error formatting datetime:', error, dateTimeString);
    return 'Fecha no disponible';
  }
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  const gymModal = document.getElementById('gymWidgetModal');

  if (gymModal) {
    // Close with click outside
    gymModal.addEventListener('click', (e) => {
      if (e.target === gymModal) {
        closeGymWidget();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && gymModal.classList.contains('active')) {
        closeGymWidget();
      }
    });
  }
});
