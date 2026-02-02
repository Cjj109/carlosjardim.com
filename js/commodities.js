/* ============================================
   COMMODITIES - Real-time price tracker
   Bitcoin, Ethereum, Gold, Oil (Brent)
   ============================================ */

// Global state
let commoditiesData = null;
let commoditiesRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Open commodities modal
 */
function openCommodities() {
  const modal = document.getElementById('commoditiesModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('commodities-open');

  // Load prices
  loadCommoditiesPrices();

  // Start auto-refresh
  startCommoditiesRefresh();
}

/**
 * Close commodities modal
 */
function closeCommodities() {
  const modal = document.getElementById('commoditiesModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.classList.remove('commodities-open');

  // Stop auto-refresh
  stopCommoditiesRefresh();
}

/**
 * Open commodities from utilities menu
 */
function openCommoditiesFromUtilities() {
  closeUtilitiesMenu();
  setTimeout(() => {
    openCommodities();
  }, 100);
}

/**
 * Start auto-refresh interval
 */
function startCommoditiesRefresh() {
  stopCommoditiesRefresh(); // Clear any existing interval
  commoditiesRefreshInterval = setInterval(() => {
    loadCommoditiesPrices();
  }, REFRESH_INTERVAL);
}

/**
 * Stop auto-refresh interval
 */
function stopCommoditiesRefresh() {
  if (commoditiesRefreshInterval) {
    clearInterval(commoditiesRefreshInterval);
    commoditiesRefreshInterval = null;
  }
}

/**
 * Load all commodity prices
 */
async function loadCommoditiesPrices() {
  // Show loading state
  updateLoadingState(true);

  // Fetch all prices in parallel
  const [cryptoData, goldData, oilData] = await Promise.all([
    fetchCryptoPrices(),
    fetchGoldPrice(),
    fetchOilPrice()
  ]);

  // Update UI
  if (cryptoData) {
    updateCryptoUI(cryptoData);
  }

  if (goldData) {
    updateGoldUI(goldData);
  }

  if (oilData) {
    updateOilUI(oilData);
  }

  // Update timestamp
  updateTimestamp();
  updateLoadingState(false);
}

/**
 * Fetch Bitcoin and Ethereum prices from CoinGecko
 */
async function fetchCryptoPrices() {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { cache: 'no-store' }
    );

    if (!response.ok) throw new Error('CoinGecko API error');

    const data = await response.json();
    return {
      bitcoin: {
        price: data.bitcoin?.usd || null,
        change: data.bitcoin?.usd_24h_change || null
      },
      ethereum: {
        price: data.ethereum?.usd || null,
        change: data.ethereum?.usd_24h_change || null
      }
    };
  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return null;
  }
}

/**
 * Fetch Gold price
 * Using multiple fallback APIs
 */
async function fetchGoldPrice() {
  // Try primary API (Gold API - free tier)
  try {
    const response = await fetch(
      'https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU',
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.XAU) {
        // XAU rate is ounces per USD, we need USD per ounce
        const pricePerOunce = 1 / data.rates.XAU;
        return {
          price: pricePerOunce,
          change: null // This API doesn't provide change
        };
      }
    }
  } catch (e) {
    console.warn('Primary gold API failed:', e);
  }

  // Try fallback: CoinGecko PAX Gold (tokenized gold)
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true',
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      if (data['pax-gold']) {
        return {
          price: data['pax-gold'].usd,
          change: data['pax-gold'].usd_24h_change
        };
      }
    }
  } catch (e) {
    console.warn('Fallback gold API failed:', e);
  }

  return null;
}

/**
 * Fetch Oil (Brent) price
 * Brent crude is the reference for Venezuelan oil pricing
 */
async function fetchOilPrice() {
  // Try using a public API for oil prices
  // Note: Most oil APIs require API keys, so we use fallbacks

  // Try CoinGecko's oil-related token or commodity tracker
  try {
    // Use a proxy-friendly endpoint or cached data approach
    // For now, we'll use a static approximation updated periodically
    // In production, you'd want to use an API like:
    // - Alpha Vantage (requires free API key)
    // - Twelve Data (requires free API key)
    // - Yahoo Finance API

    // Fallback: Use CoinGecko's petro token or similar
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=petro&vs_currencies=usd&include_24hr_change=true',
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      // Petro is Venezuela's cryptocurrency pegged to oil
      // Not exact but gives an approximation
      if (data.petro) {
        return {
          price: data.petro.usd,
          change: data.petro.usd_24h_change,
          isProxy: true
        };
      }
    }
  } catch (e) {
    console.warn('Oil price fetch failed:', e);
  }

  // Return estimated value with disclaimer
  // Brent crude typically ranges $70-90 USD
  return {
    price: null,
    change: null,
    unavailable: true
  };
}

/**
 * Update crypto (BTC/ETH) UI
 */
function updateCryptoUI(data) {
  // Bitcoin
  const btcCard = document.querySelector('.commodity-card.btc');
  const btcPrice = document.getElementById('btcPrice');
  const btcChange = document.getElementById('btcChange');

  if (data.bitcoin.price) {
    btcPrice.textContent = formatPrice(data.bitcoin.price);
    updateChangeElement(btcChange, data.bitcoin.change);
    btcCard?.classList.remove('error');
  } else {
    btcPrice.textContent = 'No disponible';
    btcChange.textContent = '';
    btcCard?.classList.add('error');
  }

  // Ethereum
  const ethCard = document.querySelector('.commodity-card.eth');
  const ethPrice = document.getElementById('ethPrice');
  const ethChange = document.getElementById('ethChange');

  if (data.ethereum.price) {
    ethPrice.textContent = formatPrice(data.ethereum.price);
    updateChangeElement(ethChange, data.ethereum.change);
    ethCard?.classList.remove('error');
  } else {
    ethPrice.textContent = 'No disponible';
    ethChange.textContent = '';
    ethCard?.classList.add('error');
  }
}

/**
 * Update Gold UI
 */
function updateGoldUI(data) {
  const goldCard = document.querySelector('.commodity-card.gold');
  const goldPrice = document.getElementById('goldPrice');
  const goldChange = document.getElementById('goldChange');

  if (data.price) {
    goldPrice.textContent = formatPrice(data.price) + '/oz';
    updateChangeElement(goldChange, data.change);
    goldCard?.classList.remove('error');
  } else {
    goldPrice.textContent = 'No disponible';
    goldChange.textContent = '';
    goldCard?.classList.add('error');
  }
}

/**
 * Update Oil UI
 */
function updateOilUI(data) {
  const oilCard = document.querySelector('.commodity-card.oil');
  const oilPrice = document.getElementById('oilPrice');
  const oilChange = document.getElementById('oilChange');

  if (data.unavailable) {
    oilPrice.textContent = 'API limitada';
    oilChange.textContent = 'Requiere clave API';
    oilChange.className = 'commodity-change neutral';
    oilCard?.classList.add('error');
  } else if (data.price) {
    oilPrice.textContent = formatPrice(data.price) + '/bbl';
    if (data.isProxy) {
      oilChange.textContent = '~Petro VE';
      oilChange.className = 'commodity-change neutral';
    } else {
      updateChangeElement(oilChange, data.change);
    }
    oilCard?.classList.remove('error');
  } else {
    oilPrice.textContent = 'No disponible';
    oilChange.textContent = '';
    oilCard?.classList.add('error');
  }
}

/**
 * Update change element with proper styling
 */
function updateChangeElement(element, change) {
  if (!element) return;

  if (change === null || change === undefined) {
    element.textContent = '---';
    element.className = 'commodity-change neutral';
    return;
  }

  const isPositive = change > 0;
  const isNegative = change < 0;
  const symbol = isPositive ? '↑' : isNegative ? '↓' : '';
  const changeClass = isPositive ? 'up' : isNegative ? 'down' : 'neutral';

  element.textContent = `${symbol} ${Math.abs(change).toFixed(2)}%`;
  element.className = `commodity-change ${changeClass}`;
}

/**
 * Format price for display
 */
function formatPrice(price) {
  if (price === null || price === undefined) return '---';

  // Format based on price magnitude
  if (price >= 1000) {
    return '$' + new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  } else if (price >= 1) {
    return '$' + new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  } else {
    return '$' + price.toFixed(4);
  }
}

/**
 * Update timestamp
 */
function updateTimestamp() {
  const updateInfo = document.getElementById('commoditiesUpdateInfo');
  if (!updateInfo) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  updateInfo.innerHTML = `<span class="live-dot"></span>Actualizado: ${timeStr}`;
}

/**
 * Update loading state
 */
function updateLoadingState(isLoading) {
  const cards = document.querySelectorAll('.commodity-card');
  cards.forEach(card => {
    if (isLoading) {
      card.classList.add('loading');
    } else {
      card.classList.remove('loading');
    }
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('commoditiesModal');
  if (modal) {
    // Close with click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeCommodities();
      }
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeCommodities();
      }
    });
  }
});
