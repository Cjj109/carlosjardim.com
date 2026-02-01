/* ============================================
   MONETARY INDICATORS - BCV Liquidity & Base Monetaria
   ============================================ */

// Global variables
let liquidityData = null;

/**
 * Open monetary indicators modal
 */
function openMonetaryIndicators() {
  const modal = document.getElementById('monetaryModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('monetary-open');

  // Load data if not already loaded
  if (!liquidityData) {
    loadLiquidityData();
  }
}

/**
 * Close monetary indicators modal
 */
function closeMonetaryIndicators() {
  const modal = document.getElementById('monetaryModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('monetary-open');
}

/**
 * Load liquidity data from JSON file
 */
async function loadLiquidityData() {
  try {
    const response = await fetch('data/bcv-liquidity.json?' + new Date().getTime());

    if (!response.ok) {
      throw new Error('Failed to fetch liquidity data');
    }

    liquidityData = await response.json();
    displayLiquidityData();
    displayBaseMonetariaData();

  } catch (error) {
    console.error('Error loading liquidity data:', error);
    displayLiquidityError();
  }
}

/**
 * Display liquidity data in the UI
 */
function displayLiquidityData() {
  if (!liquidityData) return;

  const latest = liquidityData.latest;

  // Update M2 value
  const m2Value = document.getElementById('m2Value');
  if (m2Value) {
    m2Value.textContent = formatBillions(latest.m2_billions);
  }

  // Update variation
  const variationEl = document.getElementById('liquidityVariation');
  if (variationEl && latest.variation_pct !== null) {
    const isPositive = latest.variation_pct > 0;
    const isNegative = latest.variation_pct < 0;
    const symbol = isPositive ? '↑' : isNegative ? '↓' : '';
    const varClass = isPositive ? 'up' : isNegative ? 'down' : 'neutral';

    variationEl.innerHTML = `<span class="var-${varClass}">${symbol} ${Math.abs(latest.variation_pct)}%</span>`;
  }

  // Update date
  const dateEl = document.getElementById('liquidityDate');
  if (dateEl) {
    dateEl.textContent = `Semana del ${formatLiquidityDate(latest.date)}`;
  }

  // Update history
  displayLiquidityHistory();

  // Update timestamp
  const updateInfo = document.getElementById('liquidityUpdateInfo');
  if (updateInfo && liquidityData.last_updated) {
    const date = new Date(liquidityData.last_updated);
    updateInfo.textContent = `Última actualización: ${formatDateTime(date)}`;
  }
}

/**
 * Display base monetaria data in the UI
 */
function displayBaseMonetariaData() {
  if (!liquidityData || !liquidityData.base_monetaria) {
    // Hide base monetaria section if no data
    const bmSection = document.getElementById('baseMonetariaSection');
    if (bmSection) bmSection.style.display = 'none';
    return;
  }

  const bmSection = document.getElementById('baseMonetariaSection');
  if (bmSection) bmSection.style.display = '';

  const latest = liquidityData.base_monetaria.latest;

  // Update BM value
  const bmValue = document.getElementById('bmValue');
  if (bmValue) {
    bmValue.textContent = formatBillions(latest.value_billions);
  }

  // Update variation
  const variationEl = document.getElementById('bmVariation');
  if (variationEl && latest.variation_pct !== null) {
    const isPositive = latest.variation_pct > 0;
    const isNegative = latest.variation_pct < 0;
    const symbol = isPositive ? '↑' : isNegative ? '↓' : '';
    const varClass = isPositive ? 'up' : isNegative ? 'down' : 'neutral';

    variationEl.innerHTML = `<span class="var-${varClass}">${symbol} ${Math.abs(latest.variation_pct)}%</span>`;
  }

  // Update date
  const dateEl = document.getElementById('bmDate');
  if (dateEl) {
    dateEl.textContent = `Semana del ${formatLiquidityDate(latest.date)}`;
  }

  // Update history
  displayBaseMonetariaHistory();
}

/**
 * Display liquidity history
 */
function displayLiquidityHistory() {
  const historyContainer = document.getElementById('liquidityHistory');
  if (!historyContainer || !liquidityData || !liquidityData.history) return;

  const entries = liquidityData.history;
  if (entries.length === 0) {
    historyContainer.innerHTML = '<div class="liquidity-history-empty">Sin historial</div>';
    return;
  }

  let html = '<div class="liquidity-history-header">Historial Semanal (M2)</div>';
  html += '<div class="liquidity-history-list">';

  entries.forEach((entry, index) => {
    const date = formatLiquidityDate(entry.date);
    const m2 = formatBillions(entry.m2_billions);
    const variation = entry.variation_pct;
    const varClass = variation > 0 ? 'up' : variation < 0 ? 'down' : 'neutral';
    const varSymbol = variation > 0 ? '↑' : variation < 0 ? '↓' : '';
    const varText = variation !== null ? `${varSymbol} ${Math.abs(variation)}%` : '—';

    html += `
      <div class="liquidity-history-item ${index === 0 ? 'current' : ''}">
        <span class="liquidity-history-date">${date}</span>
        <span class="liquidity-history-value">${m2} B</span>
        <span class="liquidity-history-var ${varClass}">${varText}</span>
      </div>
    `;
  });

  html += '</div>';
  historyContainer.innerHTML = html;
}

/**
 * Display base monetaria history
 */
function displayBaseMonetariaHistory() {
  const historyContainer = document.getElementById('bmHistory');
  if (!historyContainer || !liquidityData || !liquidityData.base_monetaria) return;

  const entries = liquidityData.base_monetaria.history;
  if (!entries || entries.length === 0) {
    historyContainer.innerHTML = '<div class="liquidity-history-empty">Sin historial</div>';
    return;
  }

  let html = '<div class="liquidity-history-header">Historial Semanal (BM)</div>';
  html += '<div class="liquidity-history-list">';

  entries.forEach((entry, index) => {
    const date = formatLiquidityDate(entry.date);
    const value = formatBillions(entry.value_billions);
    const variation = entry.variation_pct;
    const varClass = variation > 0 ? 'up' : variation < 0 ? 'down' : 'neutral';
    const varSymbol = variation > 0 ? '↑' : variation < 0 ? '↓' : '';
    const varText = variation !== null ? `${varSymbol} ${Math.abs(variation)}%` : '—';

    html += `
      <div class="liquidity-history-item ${index === 0 ? 'current' : ''}">
        <span class="liquidity-history-date">${date}</span>
        <span class="liquidity-history-value">${value} B</span>
        <span class="liquidity-history-var ${varClass}">${varText}</span>
      </div>
    `;
  });

  html += '</div>';
  historyContainer.innerHTML = html;
}

/**
 * Display error message
 */
function displayLiquidityError() {
  const m2Value = document.getElementById('m2Value');
  if (m2Value) m2Value.textContent = 'Error';

  const variationEl = document.getElementById('liquidityVariation');
  if (variationEl) variationEl.textContent = '';

  const bmValue = document.getElementById('bmValue');
  if (bmValue) bmValue.textContent = 'Error';
}

/**
 * Format billions for display
 */
function formatBillions(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format date for display
 */
function formatLiquidityDate(dateStr) {
  if (!dateStr) return '—';
  // Date is in DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  const day = parts[0];
  const month = parts[1];
  const months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthName = months[parseInt(month)] || month;

  return `${day} ${monthName}`;
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('monetaryModal');
  if (modal) {
    // Close with click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeMonetaryIndicators();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeMonetaryIndicators();
      }
    });
  }
});
