/* ============================================
   SIDE A ENHANCEMENTS - Interactive elements
   ============================================ */

/**
 * Open academic timeline
 */
function openAcademicTimeline() {
  const modal = document.getElementById('timelineModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('timeline-open');
}

/**
 * Close academic timeline
 */
function closeAcademicTimeline() {
  const modal = document.getElementById('timelineModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('timeline-open');

  // Collapse UCAB details if expanded
  const ucabDetails = document.getElementById('ucabDetails');
  if (ucabDetails) {
    ucabDetails.classList.remove('expanded');
  }
}

/**
 * Toggle UCAB achievements
 */
function toggleUCABAchievements() {
  const details = document.getElementById('ucabDetails');
  if (!details) return;

  details.classList.toggle('expanded');
}

/**
 * Animate skill bars
 */
function animateSkillBars() {
  const skillBars = document.querySelectorAll('.skill-bar');

  skillBars.forEach((bar, index) => {
    const targetWidth = bar.getAttribute('data-width');
    setTimeout(() => {
      bar.style.width = targetWidth;
    }, index * 150);
  });
}

// Note: openGymWidget() is now defined in gym-widget.js

/**
 * Open height scale comparison
 */
function openHeightScale() {
  const modal = document.getElementById('heightScaleModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('height-scale-open');
}

/**
 * Close height scale
 */
function closeHeightScale() {
  const modal = document.getElementById('heightScaleModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('height-scale-open');
}

/**
 * Activate Matrix Mode
 */
function activateMatrixMode() {
  document.body.classList.add('matrix-mode');

  // Animate matrix stats
  setTimeout(() => {
    const matrixBars = document.querySelectorAll('.matrix-stat-bar');
    matrixBars.forEach((bar, index) => {
      const targetWidth = bar.getAttribute('data-width');
      setTimeout(() => {
        bar.style.width = targetWidth;
      }, index * 150);
    });
  }, 100);
}

/**
 * Deactivate Matrix Mode
 */
function deactivateMatrixMode() {
  document.body.classList.remove('matrix-mode');
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  const timelineModal = document.getElementById('timelineModal');

  if (timelineModal) {
    // Close with click outside
    timelineModal.addEventListener('click', (e) => {
      if (e.target === timelineModal) {
        closeAcademicTimeline();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && timelineModal.classList.contains('active')) {
        closeAcademicTimeline();
      }
    });
  }

  // Animate skill bars on page load
  setTimeout(animateSkillBars, 500);

  // Height scale modal listeners
  const heightScaleModal = document.getElementById('heightScaleModal');
  if (heightScaleModal) {
    heightScaleModal.addEventListener('click', (e) => {
      if (e.target === heightScaleModal) {
        closeHeightScale();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && heightScaleModal.classList.contains('active')) {
        closeHeightScale();
      }
    });
  }
});
