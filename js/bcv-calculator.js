/* ============================================
   BCV CALCULATOR - Currency Exchange Calculator
   ============================================ */

// Global variables
let bcvRates = null;
let bcvHistory = null;
let isRefreshingUsdt = false;

// DolarAPI URL for live USDT/parallel dollar rate
// El p2p sale del propio endpoint del sitio, que lo lee del mercado de
// Binance via Cotizave. Antes se pedia el "paralelo" de DolarAPI, que es otra
// medicion y se actualiza una vez de madrugada: al refrescar se sustituia el
// dato bueno por uno peor.
const USDT_API_URL = '/api/bcv';

/**
 * Open BCV calculator modal
 */
let refrescoUsdt = null;

function openBCVCalculator() {
  const modal = document.getElementById('bcvCalculatorModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('bcv-open');

  // Load rates if not already loaded
  if (!bcvRates) {
    loadBCVRates();
  }

  // El p2p se mueve durante el dia, asi que mientras la calculadora este
  // abierta se refresca solo cada minuto. El dolar y el euro del BCV no hacen
  // falta: cambian una vez al dia.
  clearInterval(refrescoUsdt);
  refrescoUsdt = setInterval(refreshUsdtRate, 60000);
}

/**
 * Close BCV calculator modal
 */
function closeBCVCalculator() {
  const modal = document.getElementById('bcvCalculatorModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('bcv-open');

  clearInterval(refrescoUsdt);
  refrescoUsdt = null;
}

/**
 * Fetch USDT rate from DolarAPI (parallel dollar rate)
 */
async function fetchUsdtRate() {
  try {
    // El parametro suelta la cache del borde para traer la ultima referencia
    const response = await fetch(`${USDT_API_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.usdt && data.usdt.rate) return data.usdt;
    }
  } catch (e) {
    console.warn('No se pudo refrescar el USDT:', e.message);
  }
  return null;
}

/**
 * Load BCV rates from edge API (SSR) with fallback to static JSON
 */
async function loadBCVRates() {
  try {
    // Fetch rates and history in parallel to avoid waterfall
    const historyPromise = fetch('data/bcv-rates-history.json');

    // Primary: edge API (SSR). Fallback: static JSON + live USDT
    let ratesResponse = await fetch('/api/bcv');
    let data;

    if (ratesResponse.ok) {
      data = await ratesResponse.json();
    } else {
      const [staticRates, usdtData] = await Promise.all([
        fetch('data/bcv-rates.json'),
        fetchUsdtRate()
      ]);
      if (!staticRates.ok) throw new Error('Failed to fetch BCV rates');
      data = await staticRates.json();
      if (usdtData) data.usdt = { ...usdtData, live: true };
    }

    bcvRates = data;

    // Await history (already started in parallel)
    const historyResponse = await historyPromise;
    if (historyResponse.ok) {
      bcvHistory = await historyResponse.json();
    }

    displayRates();
    displayHistory();
    // Si ya habia algo escrito mientras cargaban las tasas, el resultado se
    // quedaba en "Cargando tasas..." hasta volver a teclear.
    calculateConversion();

  } catch (error) {
    console.error('Error loading BCV rates:', error);
    displayError();
  }
}

/**
 * Refresh USDT rate only (triggered by clicking the rate)
 */
async function refreshUsdtRate() {
  if (isRefreshingUsdt) return;
  isRefreshingUsdt = true;

  const usdtRateEl = document.getElementById('bcvUsdtRate');
  const originalText = usdtRateEl ? usdtRateEl.textContent : '';

  // Show loading state
  if (usdtRateEl) {
    usdtRateEl.textContent = '...';
    usdtRateEl.style.opacity = '0.5';
  }

  try {
    const usdtData = await fetchUsdtRate();

    if (usdtData && bcvRates) {
      bcvRates.usdt = usdtData;

      // Update display
      if (usdtRateEl) {
        usdtRateEl.textContent = formatRate(usdtData.rate);
        usdtRateEl.style.opacity = '1';

        // Flash green to indicate success
        usdtRateEl.style.color = '#2ecc71';
        setTimeout(() => {
          usdtRateEl.style.color = '';
        }, 500);
      }

      // Recalculate if there's a pending conversion
      calculateConversion();
    } else {
      throw new Error('No USDT data available');
    }
  } catch (e) {
    console.error('Error refreshing USDT:', e);
    // Restore original value
    if (usdtRateEl) {
      usdtRateEl.textContent = originalText;
      usdtRateEl.style.opacity = '1';
    }
  }

  isRefreshingUsdt = false;
}

/**
 * Display current rates in the UI
 */
function displayRates() {
  if (!bcvRates) return;

  // USD rate
  const usdRate = document.getElementById('bcvUsdRate');
  if (usdRate && bcvRates.usd) {
    usdRate.textContent = formatRate(bcvRates.usd.rate);
  }

  // EUR rate
  const eurRate = document.getElementById('bcvEurRate');
  if (eurRate && bcvRates.eur) {
    eurRate.textContent = formatRate(bcvRates.eur.rate);
  }

  // USDT rate
  const usdtRate = document.getElementById('bcvUsdtRate');
  if (usdtRate && bcvRates.usdt) {
    usdtRate.textContent = formatRate(bcvRates.usdt.rate);
    // Add live indicator if fetched in real-time
    const liveIndicator = document.getElementById('usdtLiveIndicator');
    if (liveIndicator) {
      liveIndicator.style.display = bcvRates.usdt.live ? 'inline-flex' : 'none';
    }
  }

  // Update timestamp
  const updateInfo = document.getElementById('bcvUpdateInfo');
  if (updateInfo && bcvRates.last_updated) {
    const date = new Date(bcvRates.last_updated);
    updateInfo.textContent = `Última actualización: ${formatDateTime(date)}`;
  }
}

/**
 * Display error message
 */
function displayError() {
  const usdRate = document.getElementById('bcvUsdRate');
  const eurRate = document.getElementById('bcvEurRate');

  if (usdRate) usdRate.textContent = 'Error';
  if (eurRate) eurRate.textContent = 'Error';
}

/**
 * Display rate history
 */
function displayHistory() {
  const historyContainer = document.getElementById('bcvHistory');
  if (!historyContainer || !bcvHistory || !bcvHistory.entries) return;

  const entries = bcvHistory.entries.slice(0, 7); // Show last 7 entries
  if (entries.length === 0) {
    historyContainer.innerHTML = '<div class="bcv-history-empty">Sin historial disponible</div>';
    return;
  }

  let html = '<div class="bcv-history-header">Historial USD (BCV)</div>';
  html += '<div class="bcv-history-list">';

  entries.forEach((entry, index) => {
    const date = formatHistoryDate(entry.date);
    const rate = formatRate(entry.usd.rate);
    const variation = entry.usd.variation;
    const varClass = variation > 0 ? 'up' : variation < 0 ? 'down' : 'neutral';
    const varSymbol = variation > 0 ? '↑' : variation < 0 ? '↓' : '';
    const varText = variation !== 0 ? `${varSymbol} ${Math.abs(variation)}%` : '—';

    html += `
      <div class="bcv-history-item ${index === 0 ? 'current' : ''}">
        <span class="bcv-history-date">${date}</span>
        <span class="bcv-history-rate">${rate} Bs.</span>
        <span class="bcv-history-var ${varClass}">${varText}</span>
      </div>
    `;
  });

  html += '</div>';
  historyContainer.innerHTML = html;
}

/**
 * Format date for history display
 */
function formatHistoryDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'short'
  }).format(date);
}

/**
 * Format rate for display
 */
function formatRate(rate) {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rate);
}

/**
 * Format datetime for display
 */
function formatDateTime(date) {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Calculate currency conversion
 */
let bcvMonedaOrigen = 'USD';

const BCV_MONEDAS = ['USD', 'EUR', 'USDT', 'BS'];

const BCV_NOMBRES = {
  USD: 'Dólar BCV',
  EUR: 'Euro BCV',
  USDT: 'USDT p2p',
  BS: 'Bolívares'
};

/** Cuántos bolívares vale una unidad de cada moneda */
function tasaEnBs(moneda) {
  if (!bcvRates) return null;
  if (moneda === 'BS') return 1;
  if (moneda === 'USD') return bcvRates.usd && bcvRates.usd.rate;
  if (moneda === 'EUR') return bcvRates.eur && bcvRates.eur.rate;
  if (moneda === 'USDT') return (bcvRates.usdt && bcvRates.usdt.rate) || (bcvRates.usd && bcvRates.usd.rate);
  return null;
}

/**
 * Convierte la cantidad escrita a las otras tres monedas de una vez.
 *
 * Antes había que elegir origen y destino en dos desplegables y salía un solo
 * resultado, así que ver "cuánto es esto en bolívares y en USDT" pedía dos
 * pasadas. El icono de intercambio, además, no hacía nada: era un div sin
 * ningún evento.
 */
function calculateConversion() {
  const contenedor = document.getElementById('bcvResults');
  if (!contenedor) return;

  if (!bcvRates) {
    contenedor.innerHTML = '<div class="bcv-result-empty">Cargando tasas...</div>';
    return;
  }

  const cantidad = parseFloat(document.getElementById('bcvAmount').value);

  if (!cantidad || cantidad <= 0 || isNaN(cantidad)) {
    contenedor.innerHTML = '<div class="bcv-result-empty">Escribe una cantidad</div>';
    return;
  }

  const tasaOrigen = tasaEnBs(bcvMonedaOrigen);
  if (!tasaOrigen) {
    contenedor.innerHTML = '<div class="bcv-result-empty">Sin tasa disponible</div>';
    return;
  }

  const enBolivares = cantidad * tasaOrigen;

  const filas = BCV_MONEDAS
    .filter((moneda) => moneda !== bcvMonedaOrigen)
    .map((moneda) => {
      const tasa = tasaEnBs(moneda);
      if (!tasa) return '';

      const valor = enBolivares / tasa;
      const referencia = moneda === 'BS'
        ? `1 ${bcvMonedaOrigen === 'BS' ? 'Bs.' : bcvMonedaOrigen} = ${formatRate(tasaOrigen)} Bs.`
        : `1 ${moneda} = ${formatRate(tasa)} Bs.`;

      return `
        <button type="button" class="bcv-result-row" data-copiar="${formatRate(valor)}">
          <span class="bcv-result-info">
            <span class="bcv-result-moneda">${getCurrencySymbol(moneda)} ${BCV_NOMBRES[moneda]}</span>
            <span class="bcv-result-tasa">${referencia}</span>
          </span>
          <span class="bcv-result-valor">${formatRate(valor)}<span class="bcv-copiar-pista">copiar</span></span>
        </button>`;
    })
    .join('');

  contenedor.innerHTML = filas;
}

/** Marca la moneda elegida y recalcula */
function elegirMonedaOrigen(moneda) {
  if (!BCV_MONEDAS.includes(moneda)) return;
  bcvMonedaOrigen = moneda;

  document.querySelectorAll('#bcvFromChips .bcv-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.currency === moneda);
    chip.setAttribute('aria-pressed', chip.dataset.currency === moneda ? 'true' : 'false');
  });

  calculateConversion();
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency) {
  const symbols = {
    'BS': 'Bs.',
    'USD': '$',
    'EUR': '€',
    'USDT': '₮'
  };
  return symbols[currency] || '';
}

/**
 * Copy result to clipboard with fallback for Android/older browsers
 */
function copyResult(amount, symbol) {
  const textToCopy = `${amount} ${symbol}`;
  const btn = event.target.closest('.bcv-copy-btn');
  const originalText = btn.innerHTML;

  // Function to show success feedback
  const showSuccess = () => {
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      ¡Copiado!
    `;
    btn.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
    btn.style.borderColor = 'rgba(46, 204, 113, 0.5)';

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.backgroundColor = '';
      btn.style.borderColor = '';
    }, 2000);
  };

  // Function to show error feedback
  const showError = () => {
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      Error
    `;
    btn.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
    btn.style.borderColor = 'rgba(231, 76, 60, 0.5)';

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.backgroundColor = '';
      btn.style.borderColor = '';
    }, 2000);
  };

  // Fallback method using textarea for older browsers/Android
  const fallbackCopy = () => {
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);

    // Handle iOS
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    textArea.setSelectionRange(0, textToCopy.length);

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
    return success;
  };

  // Try modern Clipboard API first, then fallback
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(textToCopy)
      .then(showSuccess)
      .catch(() => {
        // Try fallback if Clipboard API fails
        if (fallbackCopy()) {
          showSuccess();
        } else {
          showError();
        }
      });
  } else {
    // Use fallback for non-secure contexts or older browsers
    if (fallbackCopy()) {
      showSuccess();
    } else {
      showError();
    }
  }
}

/**
 * Clear calculator
 */
function clearBCVCalculator() {
  const cantidad = document.getElementById('bcvAmount');
  if (cantidad) cantidad.value = '';

  const resultados = document.getElementById('bcvResults');
  if (resultados) {
    resultados.innerHTML = '<div class="bcv-result-empty">Escribe una cantidad</div>';
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // BCV modal
  const bcvModal = document.getElementById('bcvCalculatorModal');
  if (bcvModal) {
    // Close with click outside
    bcvModal.addEventListener('click', (e) => {
      if (e.target === bcvModal) {
        closeBCVCalculator();
      }
    });
  }

  // Calculo en vivo mientras se escribe
  const amountInput = document.getElementById('bcvAmount');
  if (amountInput) {
    amountInput.addEventListener('input', calculateConversion);
  }

  // Moneda de origen
  const chips = document.getElementById('bcvFromChips');
  if (chips) {
    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.bcv-chip');
      if (chip) elegirMonedaOrigen(chip.dataset.currency);
    });
  }

  // Montos rapidos
  const rapidos = document.getElementById('bcvQuick');
  if (rapidos) {
    rapidos.addEventListener('click', (e) => {
      const boton = e.target.closest('.bcv-quick-btn');
      if (!boton || !amountInput) return;
      amountInput.value = boton.dataset.amount;
      calculateConversion();
    });
  }

  // Tocar un resultado lo copia
  const resultados = document.getElementById('bcvResults');
  if (resultados) {
    resultados.addEventListener('click', async (e) => {
      const fila = e.target.closest('.bcv-result-row');
      if (!fila || !navigator.clipboard) return;

      try {
        await navigator.clipboard.writeText(fila.dataset.copiar);
        fila.classList.add('is-copiado');
        setTimeout(() => fila.classList.remove('is-copiado'), 1200);
      } catch (err) {
        console.warn('No se pudo copiar:', err);
      }
    });
  }

  // Add click-to-refresh on USDT rate
  const usdtRateEl = document.getElementById('bcvUsdtRate');
  if (usdtRateEl) {
    usdtRateEl.addEventListener('click', refreshUsdtRate);
  }
});
