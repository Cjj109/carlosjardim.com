/* ============================================
   BCV CALCULATOR - Currency Exchange Calculator
   ============================================ */

// Global variables
let bcvRates = null;

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
 * Load BCV rates from JSON file
 */
async function loadBCVRates() {
  try {
    const response = await fetch('data/bcv-rates.json?' + new Date().getTime());

    if (!response.ok) {
      throw new Error('Failed to fetch BCV rates');
    }

    bcvRates = await response.json();

    // Update UI with rates
    displayRates();

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

  // Perform conversion
  let result = 0;

  if (fromCurrency === 'BS') {
    // From Bs to other currency
    if (toCurrency === 'USD') {
      result = amount / bcvRates.usd.rate;
    } else if (toCurrency === 'EUR') {
      result = amount / bcvRates.eur.rate;
    }
  } else if (fromCurrency === 'USD') {
    // From USD
    if (toCurrency === 'BS') {
      result = amount * bcvRates.usd.rate;
    } else if (toCurrency === 'EUR') {
      // USD to EUR: convert USD to Bs, then Bs to EUR
      const bsAmount = amount * bcvRates.usd.rate;
      result = bsAmount / bcvRates.eur.rate;
    }
  } else if (fromCurrency === 'EUR') {
    // From EUR
    if (toCurrency === 'BS') {
      result = amount * bcvRates.eur.rate;
    } else if (toCurrency === 'USD') {
      // EUR to USD: convert EUR to Bs, then Bs to USD
      const bsAmount = amount * bcvRates.eur.rate;
      result = bsAmount / bcvRates.usd.rate;
    }
  }

  // Display result
  const symbol = getCurrencySymbol(toCurrency);
  const formattedResult = formatRate(result);

  document.getElementById('bcvResult').innerHTML =
    '<div class="bcv-result-text">' + formattedResult + ' ' + symbol + '</div>';
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency) {
  const symbols = {
    'BS': 'Bs.',
    'USD': '$',
    'EUR': '€'
  };
  return symbols[currency] || '';
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
