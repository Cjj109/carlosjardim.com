/* ============================================
   TETRIS.JS - Juego Tetris completo
   ============================================ */

const tetris = {
  running: false,
  raf: null,
  canvas: null,
  ctx: null,
  
  // Dimensiones del grid
  cols: 10,
  rows: 20,
  blockSize: 0,
  
  // Estado del juego
  score: 0,
  board: [],
  currentPiece: null,
  currentX: 0,
  currentY: 0,
  
  // Control de tiempo
  dropCounter: 0,
  dropInterval: 1000,
  lastTime: 0,
  
  // Touch controls
  touchStartX: 0,
  touchStartY: 0,
  swipeThreshold: 30,
  
  // Formas de las piezas (Tetrominos)
  shapes: {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  },
  
  colors: {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
  }
};

/**
 * Abrir modal de Tetris
 */
function openTetris() {
  const modal = document.getElementById('tetrisModal');
  modal.style.display = 'flex';
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  
  initTetris();
  restartTetris();
  startTetrisLoop();
}

/**
 * Cerrar modal de Tetris
 */
function closeTetris() {
  stopTetrisLoop();
  const modal = document.getElementById('tetrisModal');
  modal.style.display = 'none';
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/**
 * Inicializar canvas y controles
 */
function initTetris() {
  tetris.canvas = document.getElementById('tetrisCanvas');
  const stage = document.getElementById('tetrisStage');
  
  if (!tetris.canvas || !stage) {
    console.error('Canvas o stage no encontrado');
    return;
  }
  
  tetris.ctx = tetris.canvas.getContext('2d');
  
  // Tamaño fijo más simple
  tetris.canvas.width = 300;
  tetris.canvas.height = 600;
  
  tetris.blockSize = tetris.canvas.width / tetris.cols;
  
  // Inicializar board
  tetris.board = Array(tetris.rows).fill(null).map(() => Array(tetris.cols).fill(0));
  
  console.log('Tetris inicializado:', tetris.canvas.width, 'x', tetris.canvas.height);
  console.log('Block size:', tetris.blockSize);
  
  // Setup controls (solo una vez)
  if (!tetris.canvas.dataset.bound) {
    tetris.canvas.dataset.bound = "1";
    setupTetrisControls();
  }
}

/**
 * Configurar controles (teclado + touch)
 */
function setupTetrisControls() {
  const canvas = tetris.canvas;
  
  // Keyboard
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('tetrisModal');
    if (!modal || !modal.classList.contains('active')) return;
    
    switch(e.key) {
      case 'ArrowLeft':
        moveTetrisPiece(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
        moveTetrisPiece(1);
        e.preventDefault();
        break;
      case 'ArrowDown':
        dropTetrisPiece();
        e.preventDefault();
        break;
      case 'ArrowUp':
        rotateTetrisPiece();
        e.preventDefault();
        break;
    }
  });
  
  // Touch controls
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    tetris.touchStartX = touch.clientX;
    tetris.touchStartY = touch.clientY;
  }, { passive: true });
  
  canvas.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - tetris.touchStartX;
    const deltaY = touch.clientY - tetris.touchStartY;
    
    // Determinar dirección del swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (Math.abs(deltaX) > tetris.swipeThreshold) {
        moveTetrisPiece(deltaX > 0 ? 1 : -1);
      }
    } else {
      // Vertical swipe o tap
      if (Math.abs(deltaY) > tetris.swipeThreshold) {
        if (deltaY > 0) {
          dropTetrisPiece();
        }
      } else {
        // Tap = rotar
        rotateTetrisPiece();
      }
    }
  }, { passive: true });
  
  // Resize
  window.addEventListener('resize', () => {
    const modal = document.getElementById('tetrisModal');
    if (!modal || !modal.classList.contains('active')) return;
    initTetris();
  }, { passive: true });
}

/**
 * Crear nueva pieza random
 */
function createTetrisPiece() {
  const shapes = Object.keys(tetris.shapes);
  const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
  
  tetris.currentPiece = {
    shape: JSON.parse(JSON.stringify(tetris.shapes[randomShape])),
    color: tetris.colors[randomShape],
    type: randomShape
  };
  
  tetris.currentX = Math.floor((tetris.cols - tetris.currentPiece.shape[0].length) / 2);
  tetris.currentY = 0;
  
  console.log('Nueva pieza:', randomShape);
  
  // Game over si no cabe la pieza
  if (checkTetrisCollision(tetris.currentPiece.shape, tetris.currentX, tetris.currentY)) {
    tetris.running = false;
    setTimeout(() => {
      alert(`Game Over! Puntos: ${tetris.score}`);
    }, 100);
  }
}

/**
 * Verificar colisión
 */
function checkTetrisCollision(shape, x, y) {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const newX = x + col;
        const newY = y + row;
        
        if (newX < 0 || newX >= tetris.cols || newY >= tetris.rows) {
          return true;
        }
        
        if (newY >= 0 && tetris.board[newY][newX]) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Mover pieza horizontalmente
 */
function moveTetrisPiece(dir) {
  if (!tetris.running) return;
  
  const newX = tetris.currentX + dir;
  if (!checkTetrisCollision(tetris.currentPiece.shape, newX, tetris.currentY)) {
    tetris.currentX = newX;
  }
}

/**
 * Rotar pieza
 */
function rotateTetrisPiece() {
  if (!tetris.running) return;
  
  const rotated = tetris.currentPiece.shape[0].map((_, i) =>
    tetris.currentPiece.shape.map(row => row[i]).reverse()
  );
  
  if (!checkTetrisCollision(rotated, tetris.currentX, tetris.currentY)) {
    tetris.currentPiece.shape = rotated;
  }
}

/**
 * Caída rápida
 */
function dropTetrisPiece() {
  if (!tetris.running) return;
  
  while (!checkTetrisCollision(tetris.currentPiece.shape, tetris.currentX, tetris.currentY + 1)) {
    tetris.currentY++;
  }
  lockTetrisPiece();
}

/**
 * Fijar pieza al board
 */
function lockTetrisPiece() {
  const shape = tetris.currentPiece.shape;
  const color = tetris.currentPiece.color;
  
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const y = tetris.currentY + row;
        const x = tetris.currentX + col;
        if (y >= 0) {
          tetris.board[y][x] = color;
        }
      }
    }
  }
  
  clearTetrisLines();
  createTetrisPiece();
}

/**
 * Limpiar líneas completas
 */
function clearTetrisLines() {
  let linesCleared = 0;
  
  for (let row = tetris.rows - 1; row >= 0; row--) {
    if (tetris.board[row].every(cell => cell !== 0)) {
      tetris.board.splice(row, 1);
      tetris.board.unshift(Array(tetris.cols).fill(0));
      linesCleared++;
      row++; // Revisar la misma fila de nuevo
    }
  }
  
  if (linesCleared > 0) {
    tetris.score += linesCleared * 100;
    document.getElementById('tetrisScore').textContent = tetris.score;
  }
}

/**
 * Reiniciar juego
 */
function restartTetris() {
  tetris.score = 0;
  tetris.board = Array(tetris.rows).fill(null).map(() => Array(tetris.cols).fill(0));
  tetris.dropCounter = 0;
  tetris.lastTime = 0;
  document.getElementById('tetrisScore').textContent = '0';
  createTetrisPiece();
  tetris.running = true;
}

/**
 * Detener loop
 */
function stopTetrisLoop() {
  tetris.running = false;
  if (tetris.raf) cancelAnimationFrame(tetris.raf);
  tetris.raf = null;
}

/**
 * Iniciar loop
 */
function startTetrisLoop() {
  tetris.running = true;
  tetris.lastTime = performance.now();
  
  const loop = (time) => {
    if (!tetris.running) return;
    
    const deltaTime = time - tetris.lastTime;
    tetris.lastTime = time;
    
    tetris.dropCounter += deltaTime;
    
    if (tetris.dropCounter > tetris.dropInterval) {
      tetris.dropCounter = 0;
      
      if (!checkTetrisCollision(tetris.currentPiece.shape, tetris.currentX, tetris.currentY + 1)) {
        tetris.currentY++;
      } else {
        lockTetrisPiece();
      }
    }
    
    drawTetris();
    tetris.raf = requestAnimationFrame(loop);
  };
  
  loop(tetris.lastTime);
}

/**
 * Dibujar frame
 */
function drawTetris() {
  const ctx = tetris.ctx;
  const bs = tetris.blockSize;
  
  if (!ctx) return;
  
  // Limpiar
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, tetris.canvas.width, tetris.canvas.height);
  
  // Dibujar board
  for (let row = 0; row < tetris.rows; row++) {
    for (let col = 0; col < tetris.cols; col++) {
      if (tetris.board[row][col]) {
        ctx.fillStyle = tetris.board[row][col];
        ctx.fillRect(col * bs, row * bs, bs - 1, bs - 1);
      }
    }
  }
  
  // Dibujar pieza actual
  if (tetris.currentPiece) {
    ctx.fillStyle = tetris.currentPiece.color;
    const shape = tetris.currentPiece.shape;
    
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const x = (tetris.currentX + col) * bs;
          const y = (tetris.currentY + row) * bs;
          ctx.fillRect(x, y, bs - 1, bs - 1);
        }
      }
    }
  }
  
  // Grid sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  
  for (let i = 0; i <= tetris.cols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * bs, 0);
    ctx.lineTo(i * bs, tetris.canvas.height);
    ctx.stroke();
  }
  
  for (let i = 0; i <= tetris.rows; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * bs);
    ctx.lineTo(tetris.canvas.width, i * bs);
    ctx.stroke();
  }
}

// Cerrar modal al hacer clic fuera
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('tetrisModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'tetrisModal') closeTetris();
    }, { passive: true });
  }
});