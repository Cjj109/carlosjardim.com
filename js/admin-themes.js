/* ============================================
   ADMIN THEMES - Panel de temáticas (con login)
   ============================================ */

const THEME_STORAGE_KEY = 'carlosjardim_theme';
const ADMIN_SESSION_KEY = 'carlosjardim_admin';

const themes = {
  default: { name: 'Por defecto', emoji: '⚪' },
  valentine: { name: '14 de Febrero (Magic Mike)', emoji: '💋' },
  carnaval: { name: 'Carnavales', emoji: '🎭' },
  navidad: { name: 'Navidad', emoji: '🎄' }
};

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

function setTheme(themeId) {
  document.body.dataset.theme = themeId === 'default' ? '' : themeId;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (e) {}
  updateAdminThemeButtons();
}

function updateAdminThemeButtons() {
  const current = getStoredTheme();
  document.querySelectorAll('.admin-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === current);
  });
}

function isAdminLoggedIn() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function setAdminLoggedIn() {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
  } catch (e) {}
}

function showAdminLoginForm() {
  const loginForm = document.getElementById('adminLoginForm');
  const themesSection = document.getElementById('adminThemesSection');
  if (loginForm) loginForm.style.display = 'block';
  if (themesSection) themesSection.style.display = 'none';
}

function showAdminThemesSection() {
  const loginForm = document.getElementById('adminLoginForm');
  const themesSection = document.getElementById('adminThemesSection');
  if (loginForm) loginForm.style.display = 'none';
  if (themesSection) themesSection.style.display = 'block';
  updateAdminThemeButtons();
}

function openAdminPanel() {
  const overlay = document.getElementById('adminPanelOverlay');
  if (!overlay) return;

  overlay.classList.add('active');

  if (isAdminLoggedIn()) {
    showAdminThemesSection();
  } else {
    showAdminLoginForm();
    document.getElementById('adminLoginError').style.display = 'none';
  }
}

function closeAdminPanel() {
  const overlay = document.getElementById('adminPanelOverlay');
  if (overlay) overlay.classList.remove('active');
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const userInput = document.getElementById('adminUser');
  const passInput = document.getElementById('adminPass');
  const errorEl = document.getElementById('adminLoginError');

  if (!userInput || !passInput || !errorEl) return;

  const user = userInput.value.trim();
  const pass = passInput.value;

  errorEl.style.display = 'none';
  errorEl.textContent = '';

  if (!user || !pass) {
    errorEl.textContent = 'Usuario y contraseña requeridos';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      setAdminLoggedIn();
      showAdminThemesSection();
    } else {
      errorEl.textContent = data.error || 'Credenciales incorrectas';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Error de conexión. ¿API configurada?';
    errorEl.style.display = 'block';
  }
}

// Konami code: ↑↑↓↓←→←→
let konamiSequence = [];
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];

document.addEventListener('keydown', (e) => {
  konamiSequence.push(e.key);
  if (konamiSequence.length > konamiCode.length) konamiSequence.shift();
  if (konamiSequence.join(',') === konamiCode.join(',')) {
    openAdminPanel();
    konamiSequence = [];
  }
});

// Triple click en traffic lights
document.addEventListener('DOMContentLoaded', () => {
  const lights = document.querySelector('.traffic-lights');
  if (lights) {
    let clickCount = 0;
    let clickTimer = null;
    lights.addEventListener('click', () => {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickCount = 0; }, 500);
      if (clickCount >= 3) {
        openAdminPanel();
        clickCount = 0;
      }
    });
  }

  // Aplicar tema guardado al cargar
  setTheme(getStoredTheme());

  // Ruta ?admin=1 para acceder al panel
  if (new URLSearchParams(location.search).get('admin') === '1') {
    openAdminPanel();
  }
});
