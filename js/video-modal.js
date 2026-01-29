/* ============================================
   VIDEO MODAL - YouTube embed management
   ============================================ */

/**
 * Convierte URL de YouTube a formato embed optimizado
 * Acepta formatos: youtu.be/ID, youtube.com/watch?v=ID, etc.
 */
function getYouTubeEmbedUrl(url) {
  let videoId = '';

  // Extraer video ID de diferentes formatos
  if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split('?')[0];
  } else if (url.includes('youtube.com/watch')) {
    const urlParams = new URLSearchParams(url.split('?')[1]);
    videoId = urlParams.get('v');
  } else if (url.includes('youtube.com/embed/')) {
    videoId = url.split('embed/')[1].split('?')[0];
  }

  // Parámetros optimizados para mobile + autoplay
  const params = new URLSearchParams({
    autoplay: '1',           // Autoplay al abrir
    rel: '0',                // No mostrar videos relacionados
    modestbranding: '1',     // Branding mínimo de YouTube
    playsinline: '1',        // Reproducir inline en iOS (no fullscreen automático)
    fs: '1',                 // Permitir fullscreen
    cc_load_policy: '0',     // Subtítulos desactivados por defecto
    iv_load_policy: '3'      // Ocultar anotaciones
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Abre el modal de video con la URL especificada
 */
function openVideoModal(youtubeUrl) {
  const modal = document.getElementById('videoModal');
  const iframe = document.getElementById('videoIframe');

  if (!modal || !iframe) return;

  // Establecer la URL del embed
  iframe.src = getYouTubeEmbedUrl(youtubeUrl);

  // Mostrar modal
  modal.classList.add('active');
  document.body.classList.add('video-modal-open');

  // Focus en el botón de cerrar para accesibilidad
  setTimeout(() => {
    const closeBtn = modal.querySelector('.video-modal-close');
    closeBtn?.focus();
  }, 100);
}

/**
 * Cierra el modal de video y detiene la reproducción
 */
function closeVideoModal() {
  const modal = document.getElementById('videoModal');
  const iframe = document.getElementById('videoIframe');

  if (!modal || !iframe) return;

  // Remover la URL para detener la reproducción
  iframe.src = '';

  // Ocultar modal
  modal.classList.remove('active');
  document.body.classList.remove('video-modal-open');
}

/**
 * Event listener para cerrar al hacer click fuera del video
 */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('videoModal');

  if (modal) {
    modal.addEventListener('click', (e) => {
      // Si el click es en el overlay (no en el container), cerrar
      if (e.target === modal) {
        closeVideoModal();
      }
    });
  }

  // Cerrar con tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      closeVideoModal();
    }
  });
});
