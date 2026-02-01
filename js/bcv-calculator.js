/* ============================================
   BCV CALCULATOR - Currency Exchange Calculator
   ============================================ */

// Global variables
let bcvRates = null;
let bcvHistory = null;

/**
 * Open BCV calculator modal
 */
function openBCVCalculator() {
  const modal = document.getElementById('bcvCalculatorModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('bcv-open');

  // Load rates if not already loaded
  if (!bcvRates) {
    loadBCVRates();
  }
}

/**
 * Close BCV calculator modal
 */
function closeBCVCalculator() {
  const modal = document.getElementById('bcvCalculatorModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('bcv-open');
}

/**
 * Load BCV rates from JSON file + live USDT from API
 */
async function loadBCVRates() {
  try {
    const cacheBuster = new Date().getTime();

    // Fetch cached rates (USD, EUR) and history in parallel with live USDT
    const [ratesResponse, historyResponse, usdtResponse] = await Promise.all([
      fetch('data/bcv-rates.json?' + cacheBuster),
      fetch('data/bcv-rates-history.json?' + cacheBuster),
      fetch('https://ve.dolarapi.com/v1/dolares/paralelo').catch(() => null)
    ]);

    if (!ratesResponse.ok) {
      throw new Error('Failed to fetch BCV rates');
    }

    bcvRates = await ratesResponse.json();

    // Update USDT with live data if available
    if (usdtResponse && usdtResponse.ok) {
      try {
        const usdtData = await usdtResponse.json();
        bcvRates.usdt = {
          rate: usdtData.promedio,
          date: usdtData.fechaActualizacion ? usdtData.fechaActualizacion.split('T')[0] : new Date().toISOString().split('T')[0],
          symbol: '₮',
          live: true
        };
      } catch (e) {
        console.warn('Could not parse live USDT data, using cached');
      }
    }

    // Load history if available
    if (historyResponse.ok) {
      bcvHistory = await historyResponse.json();
    }

    // Update UI with rates
    displayRates();
    displayHistory();

  } catch (error) {
    console.error('Error loading BCV rates:', error);
    displayError();
  }
}

/**
 * Display current rates in the UI
 */
function displayRates() {
  if (!bcvRates) return;

  // USD rate
  const usdRate = document.getElementById('bcvUsdRate');
  if (usdRate) {
    usdRate.textContent = formatRate(bcvRates.usd.rate);
  }

  // EUR rate
  const eurRate = document.getElementById('bcvEurRate');
  if (eurRate) {
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
function calculateConversion() {
  if (!bcvRates) {
    document.getElementById('bcvResult').innerHTML =
      '<div class="bcv-result-empty">Cargando tasas...</div>';
    return;
  }

  const amount = parseFloat(document.getElementById('bcvAmount').value);
  const fromCurrency = document.getElementById('bcvFromCurrency').value;
  const toCurrency = document.getElementById('bcvToCurrency').value;

  // Validate input
  if (!amount || amount <= 0 || isNaN(amount)) {
    document.getElementById('bcvResult').innerHTML =
      '<div class="bcv-result-empty">Ingresa un monto válido</div>';
    return;
  }

  // Prevent same currency conversion
  if (fromCurrency === toCurrency) {
    document.getElementById('bcvResult').innerHTML =
      '<div class="bcv-result-text">' + formatRate(amount) + ' ' + getCurrencySymbol(fromCurrency) + '</div>';
    return;
  }

  // Get rates (with USDT fallback)
  const usdRate = bcvRates.usd.rate;
  const eurRate = bcvRates.eur.rate;
  const usdtRate = bcvRates.usdt ? bcvRates.usdt.rate : usdRate;

  // Perform conversion
  let result = 0;

  if (fromCurrency === 'BS') {
    // From Bs to other currency
    if (toCurrency === 'USD') {
      result = amount / usdRate;
    } else if (toCurrency === 'EUR') {
      result = amount / eurRate;
    } else if (toCurrency === 'USDT') {
      result = amount / usdtRate;
    }
  } else if (fromCurrency === 'USD') {
    // From USD
    if (toCurrency === 'BS') {
      result = amount * usdRate;
    } else if (toCurrency === 'EUR') {
      const bsAmount = amount * usdRate;
      result = bsAmount / eurRate;
    } else if (toCurrency === 'USDT') {
      const bsAmount = amount * usdRate;
      result = bsAmount / usdtRate;
    }
  } else if (fromCurrency === 'EUR') {
    // From EUR
    if (toCurrency === 'BS') {
      result = amount * eurRate;
    } else if (toCurrency === 'USD') {
      const bsAmount = amount * eurRate;
      result = bsAmount / usdRate;
    } else if (toCurrency === 'USDT') {
      const bsAmount = amount * eurRate;
      result = bsAmount / usdtRate;
    }
  } else if (fromCurrency === 'USDT') {
    // From USDT
    if (toCurrency === 'BS') {
      result = amount * usdtRate;
    } else if (toCurrency === 'USD') {
      const bsAmount = amount * usdtRate;
      result = bsAmount / usdRate;
    } else if (toCurrency === 'EUR') {
      const bsAmount = amount * usdtRate;
      result = bsAmount / eurRate;
    }
  }

  // Display result
  const symbol = getCurrencySymbol(toCurrency);
  const formattedResult = formatRate(result);

  document.getElementById('bcvResult').innerHTML = `
    <div class="bcv-result-text">${formattedResult} ${symbol}</div>
    <button class="bcv-copy-btn" onclick="copyResult('${formattedResult}', '${symbol}')" title="Copiar resultado">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Copiar
    </button>
  `;
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
  document.getElementById('bcvAmount').value = '';
  document.getElementById('bcvResult').innerHTML =
    '<div class="bcv-result-empty">Resultado aparecerá aquí</div>';
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

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bcvModal.classList.contains('active')) {
        closeBCVCalculator();
      }
    });
  }

  // Real-time calculation on input
  const amountInput = document.getElementById('bcvAmount');
  const fromSelect = document.getElementById('bcvFromCurrency');
  const toSelect = document.getElementById('bcvToCurrency');

  if (amountInput) {
    amountInput.addEventListener('input', calculateConversion);
  }

  if (fromSelect) {
    fromSelect.addEventListener('change', calculateConversion);
  }

  if (toSelect) {
    toSelect.addEventListener('change', calculateConversion);
  }
});
