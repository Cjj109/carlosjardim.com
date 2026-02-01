/* ============================================
   GOLDEN TICKET + CHOCOLATE SHOP
   ============================================ */

// Chocolates database
const chocolates = {
  jesus: {
    name: "Jesús",
    image: "images/Jesus.webp",
    instagram: "@elyizus",
    status: "extremadamente apartado",
    description: "Dulce en fase beta. En un día de Luz se derritió y dio como resultado otro dulce. Hoy vive una vida tranquila comiendo perros calientes y jugando LoL. No sale en el test de compatibilidad porque es incompatible con otra mujer (nadie fue amenazado para escribir esto)."
  },
  miguel: {
    name: "Miguel Acosta",
    image: "images/Miguel.webp",
    instagram: "@miguex94",
    status: "apartado",
    description: "En su momento fue el terror de cierto sitio que a él no le gusta mencionar ¿hoy? Su vida gira alrededor de la iglesia y la fe. Un hombre totalmente cambiado y apartado ¿su sabor? Solo para una."
  },
  zachiro: {
    name: "Zachiro",
    image: "images/Zachiro.webp",
    instagram: "@zachiroj",
    status: null,
    description: "El primer asiático nacido de dos padres venezolanos. Fanático de los videojuegos. Cuenta con una moto y un tatuaje de un número. Dispuesto a tatuarse tu nombre, pero solo si tienes el sabor correcto."
  },
  anthonny: {
    name: "Anthonny",
    image: "images/Anthonny.webp",
    instagram: "@anthonny.123",
    status: "apartado",
    description: "El Benjamín Button del cabello. Ya a los 13 años tenía barba, lo que hacía que lo expulsaran de sitios para menores ¿el problema? Su cabello ya había vivido lo suficiente y decidió abandonarlo ¿hoy? Gracias a un viaje a Rusia volvió a encontrar el camino de Head & Shoulders. Este es un dulce tipo Di Caprio (no apto para mayores de 23)."
  },
  ricardo: {
    name: "Ricardo",
    image: "images/Ricardo.webp",
    instagram: "@radsl",
    status: null,
    description: "Este caramelo es conocido por partir. Tiene prohibición de venta en Tanaguarenas. Con ligero sabor y olor a pollo a la brasa y con un trauma a los carros Chrysler (con este le pago la universidad al hijo de su mecánico)."
  },
  mike: {
    name: "Miguel Angelo",
    image: "images/Mike.webp",
    instagram: "@miguel267",
    status: null,
    description: "De fabricación venezolana, pero actualmente se encuentra en el mercado estadounidense. Su mayor miedo en la actualidad es el hielo (ICE). Cuenta con un legendario movimiento de caderas que le ganó el apodo de Magic Mike (de ahí se inspiró la película)."
  },
  david: {
    name: "David Pereira",
    image: "images/David.webp",
    instagram: "@davidapereiraf",
    status: null,
    description: "Este chocolate era un poco más blanco, pero se doró (de más) en sus viajes a Los Caracas. Su sueño es encontrar una alemana que disfrute su sabor ¿el problema? Hoy está más cerca del lado oscuro."
  }
};

// Exponer chocolates globalmente para que el test de compatibilidad pueda acceder
window.chocolates = chocolates;

// Track if user has visited Side B
let hasVisitedSideB = false;
let goldenTicketShown = false;
let scrollPositionBeforeModal = 0;

/**
 * Detect when user toggles to Side B
 */
const originalToggleMode = window.toggleMode;
window.toggleMode = function(showAlt) {
  if (showAlt) {
    hasVisitedSideB = true;
  } else if (hasVisitedSideB && !goldenTicketShown) {
    // User is returning to Side A after visiting Side B
    setTimeout(() => {
      showGoldenTicket();
    }, 800);
  }

  // Call original function
  if (originalToggleMode) {
    originalToggleMode(showAlt);
  }
};

/**
 * Show golden ticket
 */
function showGoldenTicket() {
  const ticket = document.getElementById('goldenTicket');
  if (!ticket || goldenTicketShown) return;

  goldenTicketShown = true;
  ticket.classList.add('show');
}

/**
 * Close golden ticket and show mini ticket
 */
function closeGoldenTicket() {
  const ticket = document.getElementById('goldenTicket');
  if (!ticket) return;

  ticket.classList.remove('show');

  // Show mini ticket after closing the big golden ticket
  setTimeout(() => {
    showMiniGoldenTicket();
  }, 500);
}

/**
 * Open chocolate shop
 */
function openChocolateShop() {
  const ticket = document.getElementById('goldenTicket');
  const modal = document.getElementById('chocolateShopModal');

  if (!modal) return;

  // Save scroll position before opening modal
  scrollPositionBeforeModal = window.scrollY || window.pageYOffset;

  // Hide ticket
  if (ticket) {
    ticket.classList.remove('show');
    // Show mini ticket after closing the big golden ticket
    setTimeout(() => {
      showMiniGoldenTicket();
    }, 500);
  }

  // Show chocolate shop
  modal.classList.add('active');
  document.body.classList.add('chocolate-shop-open');

  // Render chocolates grid
  renderChocolatesGrid();
}

/**
 * Close chocolate shop
 */
function closeChocolateShop() {
  const modal = document.getElementById('chocolateShopModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('chocolate-shop-open');

  // Restore scroll position after modal closes
  setTimeout(() => {
    window.scrollTo(0, scrollPositionBeforeModal);
  }, 50);

  // Reset to grid view
  setTimeout(() => {
    const gridView = document.getElementById('chocolatesGridView');
    const detailView = document.getElementById('chocolateDetailView');
    if (gridView) gridView.style.display = 'block';
    if (detailView) {
      detailView.classList.remove('active');
      detailView.style.display = 'none';
    }
  }, 300);
}

/**
 * Show mini golden ticket in Side A
 */
function showMiniGoldenTicket() {
  const miniTicket = document.getElementById('miniGoldenTicket');
  if (miniTicket) {
    miniTicket.style.display = 'inline-block';
  }
}

/**
 * Render chocolates grid
 */
function renderChocolatesGrid() {
  const container = document.getElementById('chocolatesGrid');
  if (!container) return;

  container.innerHTML = Object.keys(chocolates).map(key => {
    const choc = chocolates[key];
    const statusBadge = choc.status
      ? `<div class="chocolate-status ${choc.status === 'extremadamente apartado' ? 'extreme' : ''}">
           ${choc.status === 'extremadamente apartado' ? '🚨 EXTREMADAMENTE APARTADO' : '⚠️ APARTADO'}
         </div>`
      : '';

    return `
      <div class="chocolate-card" onclick="showChocolateDetail('${key}')">
        <img src="${choc.image}" alt="${choc.name}" class="chocolate-img" onerror="this.src='images/placeholder.png'">
        <div class="chocolate-name">${choc.name}</div>
        ${statusBadge}
      </div>
    `;
  }).join('');
}

/**
 * Show chocolate detail
 */
function showChocolateDetail(chocolateKey) {
  const choc = chocolates[chocolateKey];
  if (!choc) return;

  const gridView = document.getElementById('chocolatesGridView');
  const detailView = document.getElementById('chocolateDetailView');

  if (!gridView || !detailView) return;

  // Hide grid, show detail
  gridView.style.display = 'none';
  detailView.style.display = 'block';
  setTimeout(() => {
    detailView.classList.add('active');
  }, 10);

  // Render detail
  const statusBadge = choc.status
    ? `<div class="detail-status ${choc.status === 'extremadamente apartado' ? 'extreme' : ''}">
         ${choc.status === 'extremadamente apartado' ? '🚨 EXTREMADAMENTE APARTADO' : '⚠️ APARTADO'}
       </div>`
    : '';

  detailView.innerHTML = `
    <div class="chocolate-detail active">
      <img src="${choc.image}" alt="${choc.name}" class="detail-img" onerror="this.src='images/placeholder.png'">
      <div class="detail-name">${choc.name}</div>
      ${statusBadge}
      <div class="detail-description">${choc.description}</div>

      <div class="detail-actions">
        <a href="https://instagram.com/${choc.instagram.replace('@', '')}"
           target="_blank"
           rel="noopener noreferrer"
           class="detail-btn">
          Ver Perfil
        </a>
        <button onclick="backToChocolatesGrid()" class="detail-btn secondary">
          Ver Otros Chocolates
        </button>
        <button onclick="closeChocolateShop()" class="detail-btn secondary">
          Cerrar
        </button>
      </div>
    </div>
  `;
}

/**
 * Back to chocolates grid
 */
function backToChocolatesGrid() {
  const gridView = document.getElementById('chocolatesGridView');
  const detailView = document.getElementById('chocolateDetailView');

  if (!gridView || !detailView) return;

  detailView.classList.remove('active');
  setTimeout(() => {
    detailView.style.display = 'none';
    gridView.style.display = 'block';
  }, 300);
}

/**
 * Open compatibility test from chocolate shop
 */
function openCompatibilityTestFromShop() {
  // Close chocolate shop first
  closeChocolateShop();

  // Open compatibility test after a short delay
  setTimeout(() => {
    openCompatibilityTest();
  }, 400);
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('chocolateShopModal');

  if (modal) {
    // Close with click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeChocolateShop();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeChocolateShop();
      }
    });
  }

});

/**
 * Start slot machine animation
 */
function startSlotMachine() {
  const container = document.getElementById('slotMachineContainer');
  const reel = document.getElementById('slotReel');
  const gridView = document.getElementById('chocolatesGridView');

  if (!container || !reel) return;

  // Hide grid view and show slot machine
  if (gridView) gridView.style.display = 'none';
  container.style.display = 'flex';

  // Build the reel with all chocolates repeated multiple times
  const chocolateKeys = Object.keys(chocolates);
  const reelItems = [];

  // Repeat chocolates 20 times for smooth animation
  for (let i = 0; i < 20; i++) {
    chocolateKeys.forEach(key => {
      reelItems.push({
        key: key,
        image: chocolates[key].image
      });
    });
  }

  // Render reel
  reel.innerHTML = reelItems.map(item => `
    <div class="slot-item" data-key="${item.key}">
      <img src="${item.image}" alt="${chocolates[item.key].name}">
    </div>
  `).join('');

  // Select a random winner
  const winnerIndex = Math.floor(Math.random() * chocolateKeys.length);
  const winnerKey = chocolateKeys[winnerIndex];

  // Calculate final position (center the winner in the viewport)
  // Each item is 100px (80px for mobile)
  const itemHeight = window.innerWidth <= 768 ? 80 : 100;
  const totalItems = reelItems.length;
  const middleItem = Math.floor(totalItems / 2);

  // Find the winner's position near the middle
  let winnerPosition = -1;
  for (let i = middleItem; i < totalItems; i++) {
    if (reelItems[i].key === winnerKey) {
      winnerPosition = i;
      break;
    }
  }

  // Calculate offset to center the winner (account for container height 300px / 2 = 150px)
  const centerOffset = window.innerWidth <= 768 ? 120 : 150; // Half of container height
  const finalPosition = -(winnerPosition * itemHeight) + centerOffset - (itemHeight / 2);

  // Start spinning animation
  reel.classList.add('spinning');

  // After 2 seconds, stop and show winner
  setTimeout(() => {
    reel.classList.remove('spinning');
    reel.style.transform = `translateY(${finalPosition}px)`;

    // After animation completes, show the winner detail (reduced from 3000ms to 800ms)
    setTimeout(() => {
      container.style.display = 'none';
      if (gridView) gridView.style.display = 'block';
      showChocolateDetail(winnerKey);

      // Reset reel for next time
      setTimeout(() => {
        reel.style.transition = 'none';
        reel.style.transform = 'translateY(0)';
        reel.classList.remove('spinning');
        setTimeout(() => {
          reel.style.transition = 'transform 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }, 50);
      }, 300);
    }, 800);
  }, 2000);
}
