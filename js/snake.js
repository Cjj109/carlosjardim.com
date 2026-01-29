/* ============================================
   SNAKE.JS - Juego Snake completo
   ============================================ */

const snake = {
  running: false,
  raf: null,
  canvas: null,
  ctx: null,
  modal: null, // FIX: Cache de modal
  accentColor: null, // FIX: Cache de accent color

  // Dimensiones del grid
  gridSize: 20,
  tileCount: 0,
  tileSize: 0,

  // Estado del juego
  score: 0,
  snake: [],
  food: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },

  // Control de tiempo
  speed: 100,
  lastUpdate: 0,

  // Touch controls
  touchStartX: 0,
  touchStartY: 0,
  swipeThreshold: 20,

  // FIX: Mensaje de game over
  gameOverMessage: null,

  // FIX: Referencias a event listeners para poder eliminarlos
  listeners: {
    keydown: null,
    resize: null
  }
};

/**
 * Abrir modal de Snake
 */
function openSnake() {
  snake.modal = document.getElementById('snakeModal');
  snake.modal.style.display = 'flex';
  snake.modal.classList.add('active');
  snake.modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  initSnake();
  restartSnake();
  startSnakeLoop();
}

/**
 * Cerrar modal de Snake
 */
function closeSnake() {
  stopSnakeLoop();
  cleanupSnakeListeners(); // FIX: Limpiar listeners

  if (snake.modal) {
    snake.modal.style.display = 'none';
    snake.modal.classList.remove('active');
    snake.modal.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = '';
}

/**
 * Limpiar event listeners (FIX: Memory leak)
 */
function cleanupSnakeListeners() {
  if (snake.listeners.keydown) {
    window.removeEventListener('keydown', snake.listeners.keydown);
  }
  if (snake.listeners.resize) {
    window.removeEventListener('resize', snake.listeners.resize);
  }
}

/**
 * Inicializar canvas y controles
 */
function initSnake() {
  snake.canvas = document.getElementById('snakeCanvas');
  const stage = document.getElementById('snakeStage');
  
  if (!snake.canvas || !stage) {
    console.error('Canvas o stage no encontrado');
    return;
  }
  
  snake.ctx = snake.canvas.getContext('2d');
  
  // Tamaño fijo
  snake.canvas.width = 400;
  snake.canvas.height = 400;
  
  snake.tileCount = snake.gridSize;
  snake.tileSize = snake.canvas.width / snake.tileCount;
  
  console.log('Snake inicializado:', snake.canvas.width, 'x', snake.canvas.height);
  
  // Setup controls (solo una vez)
  if (!snake.canvas.dataset.bound) {
    snake.canvas.dataset.bound = "1";
    setupSnakeControls();
  }
}

/**
 * Configurar controles (teclado + touch)
 */
function setupSnakeControls() {
  const canvas = snake.canvas;

  // FIX: Cache de accent color
  if (!snake.accentColor) {
    const styles = getComputedStyle(document.documentElement);
    const ar = styles.getPropertyValue('--accent-r').trim();
    const ag = styles.getPropertyValue('--accent-g').trim();
    const ab = styles.getPropertyValue('--accent-b').trim();
    snake.accentColor = {
      rgb: `rgb(${ar},${ag},${ab})`,
      rgba: (alpha) => `rgba(${ar},${ag},${ab},${alpha})`,
      r: ar,
      g: ag,
      b: ab
    };
  }

  // Keyboard - FIX: Guardar referencia
  snake.listeners.keydown = (e) => {
    if (!snake.modal || !snake.modal.classList.contains('active')) return;

    switch(e.key) {
      case 'ArrowUp':
        if (snake.direction.y === 0) {
          snake.nextDirection = { x: 0, y: -1 };
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (snake.direction.y === 0) {
          snake.nextDirection = { x: 0, y: 1 };
        }
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (snake.direction.x === 0) {
          snake.nextDirection = { x: -1, y: 0 };
        }
        e.preventDefault();
        break;
      case 'ArrowRight':
        if (snake.direction.x === 0) {
          snake.nextDirection = { x: 1, y: 0 };
        }
        e.preventDefault();
        break;
    }
  };

  window.addEventListener('keydown', snake.listeners.keydown);
  
  // Touch controls
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    snake.touchStartX = touch.clientX;
    snake.touchStartY = touch.clientY;
  }, { passive: true });
  
  canvas.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - snake.touchStartX;
    const deltaY = touch.clientY - snake.touchStartY;
    
    // Determinar dirección del swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (Math.abs(deltaX) > snake.swipeThreshold) {
        if (snake.direction.x === 0) {
          snake.nextDirection = deltaX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
        }
      }
    } else {
      // Vertical swipe
      if (Math.abs(deltaY) > snake.swipeThreshold) {
        if (snake.direction.y === 0) {
          snake.nextDirection = deltaY > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
        }
      }
    }
  }, { passive: true });

  // Resize - FIX: Guardar referencia
  snake.listeners.resize = () => {
    if (!snake.modal || !snake.modal.classList.contains('active')) return;
    initSnake();
  };

  window.addEventListener('resize', snake.listeners.resize, { passive: true });
}

/**
 * Generar comida en posición random
 */
function generateSnakeFood() {
  let validPosition = false;
  
  while (!validPosition) {
    snake.food = {
      x: Math.floor(Math.random() * snake.tileCount),
      y: Math.floor(Math.random() * snake.tileCount)
    };
    
    // Verificar que no esté sobre la serpiente
    validPosition = !snake.snake.some(segment => 
      segment.x === snake.food.x && segment.y === snake.food.y
    );
  }
  
  console.log('Comida generada en:', snake.food.x, snake.food.y);
}

/**
 * Reiniciar juego
 */
function restartSnake() {
  console.log('🔄 Reiniciando Snake...');

  // Detener el loop anterior
  stopSnakeLoop();

  snake.score = 0;
  snake.direction = { x: 1, y: 0 };
  snake.nextDirection = { x: 1, y: 0 };
  snake.speed = 100;
  snake.gameOverMessage = null; // FIX: Limpiar mensaje de game over
  
  // Serpiente inicial (3 segmentos en el centro)
  const centerX = Math.floor(snake.tileCount / 2);
  const centerY = Math.floor(snake.tileCount / 2);
  
  snake.snake = [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY }
  ];
  
  generateSnakeFood();
  document.getElementById('snakeScore').textContent = '0';
  snake.running = true;
  snake.lastUpdate = performance.now();
  
  // Reiniciar el loop
  startSnakeLoop();
  
  console.log('✅ Snake reiniciado');
}

/**
 * Detener loop
 */
function stopSnakeLoop() {
  snake.running = false;
  if (snake.raf) {
    cancelAnimationFrame(snake.raf);
    snake.raf = null;
  }
}

/**
 * Iniciar loop
 */
function startSnakeLoop() {
  if (snake.raf) {
    cancelAnimationFrame(snake.raf);
  }
  
  snake.running = true;
  snake.lastUpdate = performance.now();
  
  const loop = (time) => {
    if (!snake.running) return;
    
    const deltaTime = time - snake.lastUpdate;
    
    if (deltaTime > snake.speed) {
      snake.lastUpdate = time;
      updateSnake();
    }
    
    drawSnake();
    snake.raf = requestAnimationFrame(loop);
  };
  
  loop(snake.lastUpdate);
}

/**
 * Actualizar lógica del juego
 */
function updateSnake() {
  // Actualizar dirección
  snake.direction = { ...snake.nextDirection };
  
  // Calcular nueva cabeza
  const head = { ...snake.snake[0] };
  head.x += snake.direction.x;
  head.y += snake.direction.y;
  
  // Verificar colisión con paredes
  if (head.x < 0 || head.x >= snake.tileCount || 
      head.y < 0 || head.y >= snake.tileCount) {
    gameOver();
    return;
  }
  
  // Verificar colisión consigo misma
  if (snake.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
    gameOver();
    return;
  }
  
  // Agregar nueva cabeza
  snake.snake.unshift(head);
  
  // Verificar si comió
  if (head.x === snake.food.x && head.y === snake.food.y) {
    snake.score += 10;
    document.getElementById('snakeScore').textContent = snake.score;
    console.log('¡Comida comida! Score:', snake.score);
    generateSnakeFood();
    
    // Aumentar velocidad gradualmente
    if (snake.speed > 50) {
      snake.speed -= 1;
    }
  } else {
    // Remover cola si no comió
    snake.snake.pop();
  }
}

/**
 * Game over (FIX: Sin alert, mensaje en canvas)
 */
function gameOver() {
  snake.running = false;
  snake.gameOverMessage = `GAME OVER · Puntos: ${snake.score}`;
  drawSnake(); // Redibujar para mostrar el mensaje
}

/**
 * Dibujar frame
 */
function drawSnake() {
  const ctx = snake.ctx;
  const ts = snake.tileSize;
  
  if (!ctx) return;
  
  // Fondo
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, snake.canvas.width, snake.canvas.height);
  
  // Grid sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  
  for (let i = 0; i <= snake.tileCount; i++) {
    ctx.beginPath();
    ctx.moveTo(i * ts, 0);
    ctx.lineTo(i * ts, snake.canvas.height);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, i * ts);
    ctx.lineTo(snake.canvas.width, i * ts);
    ctx.stroke();
  }
  
  // FIX: Usar color cacheado en lugar de getComputedStyle
  const color = snake.accentColor || {
    rgb: 'rgb(255,59,48)',
    rgba: (alpha) => `rgba(255,59,48,${alpha})`,
    r: '255',
    g: '59',
    b: '48'
  };

  // Dibujar serpiente
  snake.snake.forEach((segment, index) => {
    const x = segment.x * ts;
    const y = segment.y * ts;

    if (index === 0) {
      // Cabeza con glow
      ctx.shadowColor = color.rgba(0.6);
      ctx.shadowBlur = 12;
      ctx.fillStyle = color.rgb;
    } else {
      // Cuerpo degradado
      const alpha = 1 - (index / snake.snake.length) * 0.5;
      ctx.shadowBlur = 0;
      ctx.fillStyle = color.rgba(alpha);
    }

    ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
  });
  
  ctx.shadowBlur = 0;
  
  // Dibujar comida (GRANDE Y VISIBLE)
  ctx.fillStyle = '#00ff00';
  ctx.shadowColor = 'rgba(0,255,0,0.8)';
  ctx.shadowBlur = 15;
  ctx.fillRect(snake.food.x * ts + 2, snake.food.y * ts + 2, ts - 4, ts - 4);
  ctx.shadowBlur = 0;

  // FIX: Mostrar mensaje de game over si existe
  if (snake.gameOverMessage) {
    // Overlay semitransparente
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, snake.canvas.width, snake.canvas.height);

    // Mensaje principal
    ctx.font = 'bold 28px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(snake.gameOverMessage, snake.canvas.width / 2, snake.canvas.height / 2 - 20);

    // Hint para reiniciar
    ctx.font = '16px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Presiona REINICIAR para jugar de nuevo', snake.canvas.width / 2, snake.canvas.height / 2 + 30);
  }
}

// Cerrar modal al hacer clic fuera
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('snakeModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'snakeModal') closeSnake();
    }, { passive: true });
  }
});