// Menú de juegos - Versión simple

function openGamesMenu() {
  const menu = document.getElementById('gamesMenu');
  menu.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeGamesMenu() {
  const menu = document.getElementById('gamesMenu');
  menu.classList.remove('show');
  document.body.style.overflow = '';
}

function selectGame(game) {
  closeGamesMenu();
  
  setTimeout(() => {
    if (game === 'pong' && typeof openPong === 'function') {
      openPong();
    } else if (game === 'tetris' && typeof openTetris === 'function') {
      openTetris();
    } else if (game === 'snake' && typeof openSnake === 'function') {
      openSnake();
    }
  }, 300);
}

// Cerrar al hacer clic fuera
document.addEventListener('click', (e) => {
  const menu = document.getElementById('gamesMenu');
  if (e.target === menu) {
    closeGamesMenu();
  }
});