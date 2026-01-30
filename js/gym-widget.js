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

    const data = await response.json();

    // Render data
    renderWorkoutData(data);

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
function renderWorkoutData(data) {
  const container = document.getElementById('gymWidgetContent');
  if (!container) return;

  const workout = data.last_workout;

  const exercisesHTML = workout.exercises.map(exercise => `
    <div class="gym-exercise">
      <div class="gym-exercise-name">${exercise.name}</div>
      <div class="gym-sets">
        ${exercise.sets.map((set, index) => `
          <div class="gym-set">
            <div class="gym-set-number">Set ${index + 1}</div>
            <div class="gym-set-value">${set.reps}x${set.weight}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="gym-workout-name">${workout.name}</div>

    <div class="gym-workout-meta">
      <div class="gym-meta-item">
        <div class="gym-meta-label">Fecha</div>
        <div class="gym-meta-value">${formatDate(workout.date)}</div>
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

    <div class="gym-exercises">
      ${exercisesHTML}
    </div>

    <div style="text-align: center;">
      <a href="${data.profile_url}" target="_blank" rel="noopener noreferrer" class="gym-link">
        Ver Perfil Completo en Hevy →
      </a>
    </div>

    <div style="text-align: center; margin-top: 16px; font-size: 11px; color: rgba(255,255,255,0.3); font-family: var(--mono);">
      Última actualización: ${formatDateTime(data.last_updated)}
    </div>
  `;
}

/**
 * Format date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('es-ES', options);
}

/**
 * Format datetime
 */
function formatDateTime(dateTimeString) {
  const date = new Date(dateTimeString);
  const options = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString('es-ES', options);
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
