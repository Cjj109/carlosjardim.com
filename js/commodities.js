/* ============================================
   COMMODITIES - Real-time price tracker
   Bitcoin, Ethereum, Gold, EUR/USD
   ============================================ */

// Global state
let commoditiesData = null;
let commoditiesRefreshInterval = null;
let isRefreshing = false;
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
  if (isRefreshing) return;
  isRefreshing = true;

  // Show loading state
  updateLoadingState(true);

  // Fetch all prices in parallel
  const [cryptoData, goldData, eurUsdData] = await Promise.all([
    fetchCryptoPrices(),
    fetchGoldPrice(),
    fetchEurUsdRate()
  ]);

  // Update UI
  if (cryptoData) {
    updateCryptoUI(cryptoData);
  }

  if (goldData) {
    updateGoldUI(goldData);
  }

  if (eurUsdData) {
    updateEurUsdUI(eurUsdData);
  }

  // Update timestamp
  updateTimestamp();
  updateLoadingState(false);
  isRefreshing = false;
}

/**
 * Manual refresh triggered by clicking on a price
 */
function refreshCommodityPrices() {
  if (isRefreshing) return;

  // Reset auto-refresh timer
  startCommoditiesRefresh();

  // Load prices
  loadCommoditiesPrices();
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
 * Fetch EUR/USD exchange rate
 * Using free forex APIs
 */
async function fetchEurUsdRate() {
  // Try Frankfurter API (free, no API key required)
  try {
    const response = await fetch(
      'https://api.frankfurter.app/latest?from=EUR&to=USD',
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.USD) {
        // Get yesterday's rate for change calculation
        const yesterdayResponse = await fetch(
          'https://api.frankfurter.app/latest?from=EUR&to=USD&amount=1',
          { cache: 'no-store' }
        );

        let change = null;

        // Try to get historical rate for change
        try {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const dateStr = yesterday.toISOString().split('T')[0];

          const histResponse = await fetch(
            `https://api.frankfurter.app/${dateStr}?from=EUR&to=USD`,
            { cache: 'no-store' }
          );

          if (histResponse.ok) {
            const histData = await histResponse.json();
            if (histData.rates && histData.rates.USD) {
              const currentRate = data.rates.USD;
              const previousRate = histData.rates.USD;
              change = ((currentRate - previousRate) / previousRate) * 100;
            }
          }
        } catch (e) {
          console.warn('Could not fetch EUR/USD historical rate:', e);
        }

        return {
          price: data.rates.USD,
          change: change
        };
      }
    }
  } catch (e) {
    console.warn('Frankfurter API failed:', e);
  }

  // Fallback: Try exchangerate.host
  try {
    const response = await fetch(
      'https://api.exchangerate.host/latest?base=EUR&symbols=USD',
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.USD) {
        return {
          price: data.rates.USD,
          change: null
        };
      }
    }
  } catch (e) {
    console.warn('Exchangerate.host API failed:', e);
  }

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
 * Update EUR/USD UI
 */
function updateEurUsdUI(data) {
  const eurUsdCard = document.querySelector('.commodity-card.eurusd');
  const eurUsdPrice = document.getElementById('eurUsdPrice');
  const eurUsdChange = document.getElementById('eurUsdChange');

  if (data.unavailable) {
    eurUsdPrice.textContent = 'No disponible';
    eurUsdChange.textContent = '';
    eurUsdCard?.classList.add('error');
  } else if (data.price) {
    // Format as exchange rate (e.g., 1.0850)
    eurUsdPrice.textContent = data.price.toFixed(4);
    updateChangeElement(eurUsdChange, data.change);
    eurUsdCard?.classList.remove('error');
  } else {
    eurUsdPrice.textContent = 'No disponible';
    eurUsdChange.textContent = '';
    eurUsdCard?.classList.add('error');
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

    // Add click-to-refresh on price elements
    const priceElements = modal.querySelectorAll('.commodity-price');
    priceElements.forEach(el => {
      el.addEventListener('click', () => {
        refreshCommodityPrices();
      });
    });
  }
});
