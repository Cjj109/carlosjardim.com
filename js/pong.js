/* ============================================
   PONG.JS - Juego Pong completo
   ============================================ */

const pong = {
  running: false,
  raf: null,
  w: 800,
  h: 450,
  paddleW: 12,
  paddleH: 90,
  ballR: 7,
  pY: 0,
  aY: 0,
  pScore: 0,
  aScore: 0,
  ballX: 0,
  ballY: 0,
  vx: 0,
  vy: 0,
  keyUp: false,
  keyDown: false,
  touchY: null
};

const modal = () => document.getElementById('pongModal');
const canvas = () => document.getElementById('pongCanvas');
const stage = () => document.getElementById('pongStage');

/**
 * Abrir modal de Pong
 */
function openPong() {
  const m = document.getElementById('pongModal');
  m.style.display = 'flex';
  m.classList.add('active');
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  
  initPong();
  restartPong();
  startLoop();
}

/**
 * Cerrar modal de Pong
 */
function closePong() {
  stopLoop();
  const m = document.getElementById('pongModal');
  m.style.display = 'none';
  m.classList.remove('active');
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  pong.touchY = null;
}

/**
 * Inicializar canvas y controles
 */
function initPong() {
  const c = canvas();
  const s = stage();
  
  if (!c || !s) return;
  
  const ctx = c.getContext('2d');
  
  // Ajustar resolución
  const rect = s.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.floor(rect.width * dpr);
  c.height = Math.floor(rect.height * dpr);
  pong.w = c.width;
  pong.h = c.height;
  
  pong.pY = (pong.h - pong.paddleH) / 2;
  pong.aY = pong.pY;
  
  // Touch controls
  if (!c.dataset.bound) {
    c.dataset.bound = "1";
    
    const onTouch = (e) => {
      if (!e.touches || !e.touches[0]) return;
      const r = c.getBoundingClientRect();
      const y = e.touches[0].clientY - r.top;
      pong.touchY = y * (pong.h / r.height);
    };
    
    c.addEventListener('touchstart', onTouch, { passive: true });
    c.addEventListener('touchmove', onTouch, { passive: true });
    c.addEventListener('touchend', () => { pong.touchY = null; }, { passive: true });
    
    // Mouse drag
    let dragging = false;
    const onMouse = (e) => {
      const r = c.getBoundingClientRect();
      const y = e.clientY - r.top;
      pong.touchY = y * (pong.h / r.height);
    };
    
    c.addEventListener('mousedown', (e) => { dragging = true; onMouse(e); }, { passive: true });
    window.addEventListener('mousemove', (e) => { if (dragging) onMouse(e); }, { passive: true });
    window.addEventListener('mouseup', () => { dragging = false; pong.touchY = null; }, { passive: true });
    
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (!modal().classList.contains('active')) return;
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') pong.keyUp = true;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') pong.keyDown = true;
    });
    
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') pong.keyUp = false;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') pong.keyDown = false;
    });
    
    // Resize
    window.addEventListener('resize', () => {
      if (!modal().classList.contains('active')) return;
      initPong();
    }, { passive: true });
  }
}

/**
 * Resetear pelota
 */
function resetBall(servingToAI = false) {
  pong.ballX = pong.w / 2;
  pong.ballY = pong.h / 2;
  const base = Math.max(3.2, pong.w / 260);
  const dir = servingToAI ? 1 : -1;
  pong.vx = dir * base * 1.35;
  pong.vy = (Math.random() * 2 - 1) * base;
}

/**
 * Reiniciar juego
 */
function restartPong() {
  pong.pScore = 0;
  pong.aScore = 0;
  pong.pY = (pong.h - pong.paddleH) / 2;
  pong.aY = pong.pY;
  resetBall(false);
  pong.running = true;
}

/**
 * Detener loop
 */
function stopLoop() {
  pong.running = false;
  if (pong.raf) cancelAnimationFrame(pong.raf);
  pong.raf = null;
}

/**
 * Iniciar loop
 */
function startLoop() {
  pong.running = true;
  const loop = () => {
    update();
    draw();
    pong.raf = requestAnimationFrame(loop);
  };
  loop();
}

/**
 * Actualizar lógica del juego
 */
function update() {
  if (!pong.running) return;
  
  // Control del jugador
  const speed = Math.max(5.2, pong.h / 85);
  if (pong.touchY !== null) {
    pong.pY = pong.touchY - pong.paddleH / 2;
  } else {
    if (pong.keyUp) pong.pY -= speed;
    if (pong.keyDown) pong.pY += speed;
  }
  pong.pY = Math.max(0, Math.min(pong.h - pong.paddleH, pong.pY));
  
  // IA sigue la pelota
  const target = pong.ballY - pong.paddleH / 2;
  const aiSpeed = speed * 0.82;
  pong.aY += (target - pong.aY) * 0.08;
  pong.aY = Math.max(0, Math.min(pong.h - pong.paddleH, pong.aY));
  
  // Mover pelota
  pong.ballX += pong.vx;
  pong.ballY += pong.vy;
  
  // Rebote en paredes
  if (pong.ballY - pong.ballR <= 0) {
    pong.ballY = pong.ballR;
    pong.vy *= -1;
  }
  if (pong.ballY + pong.ballR >= pong.h) {
    pong.ballY = pong.h - pong.ballR;
    pong.vy *= -1;
  }
  
  // Colisión con paletas
  const hitPaddle = (px, py) => {
    const withinY = pong.ballY >= py && pong.ballY <= py + pong.paddleH;
    const withinX = pong.ballX + pong.ballR >= px && pong.ballX - pong.ballR <= px + pong.paddleW;
    return withinX && withinY;
  };
  
  // Paleta izquierda (jugador)
  const pX = 22;
  if (pong.vx < 0 && hitPaddle(pX, pong.pY)) {
    pong.ballX = pX + pong.paddleW + pong.ballR;
    pong.vx *= -1.03;
    const rel = (pong.ballY - (pong.pY + pong.paddleH / 2)) / (pong.paddleH / 2);
    pong.vy = rel * Math.max(3.0, pong.h / 180);
  }
  
  // Paleta derecha (IA)
  const aX = pong.w - 22 - pong.paddleW;
  if (pong.vx > 0 && hitPaddle(aX, pong.aY)) {
    pong.ballX = aX - pong.ballR;
    pong.vx *= -1.03;
    const rel = (pong.ballY - (pong.aY + pong.paddleH / 2)) / (pong.paddleH / 2);
    pong.vy = rel * Math.max(3.0, pong.h / 180);
  }
  
  // Puntuación
  if (pong.ballX < -30) {
    pong.aScore++;
    resetBall(false);
  }
  if (pong.ballX > pong.w + 30) {
    pong.pScore++;
    resetBall(true);
  }
  
  // Limitar velocidad
  const maxV = Math.max(8.5, pong.w / 65);
  pong.vx = Math.max(-maxV, Math.min(maxV, pong.vx));
  pong.vy = Math.max(-maxV, Math.min(maxV, pong.vy));
}

/**
 * Dibujar frame del juego
 */
function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const w = pong.w;
  const h = pong.h;
  
  ctx.clearRect(0, 0, w, h);
  
  // Colores desde CSS
  const styles = getComputedStyle(document.documentElement);
  const ar = styles.getPropertyValue('--accent-r').trim();
  const ag = styles.getPropertyValue('--accent-g').trim();
  const ab = styles.getPropertyValue('--accent-b').trim();
  const accent = `rgb(${ar},${ag},${ab})`;
  
  // Línea central
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.setLineDash([8, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, 18);
  ctx.lineTo(w / 2, h - 18);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Paletas
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(22, pong.pY, pong.paddleW, pong.paddleH);
  ctx.fillRect(w - 22 - pong.paddleW, pong.aY, pong.paddleW, pong.paddleH);
  
  // Pelota con glow
  ctx.shadowColor = `rgba(${ar},${ag},${ab},0.45)`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(pong.ballX, pong.ballY, pong.ballR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Marcador
  ctx.font = `${Math.floor(h / 12)}px JetBrains Mono, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(String(pong.pScore), w * 0.42, h * 0.14);
  ctx.fillText(String(pong.aScore), w * 0.58, h * 0.14);
  
  // Label
  ctx.font = `${Math.floor(h / 32)}px JetBrains Mono, monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('ARRASTRA / W-S', w / 2, h - 18);
}

// Cerrar modal al hacer clic fuera
document.addEventListener('DOMContentLoaded', () => {
  const m = document.getElementById('pongModal');
  if (m) {
    m.addEventListener('click', (e) => {
      if (e.target.id === 'pongModal') closePong();
    }, { passive: true });
  }
});