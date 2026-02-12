/**
 * Cloudflare Pages Function: BCV Exchange Rates (SSR/Edge)
 * Fetches USD, EUR from bcvapi.tech and USDT from DolarAPI
 * Replaces GitHub Action for rates - runs at edge on each request
 * Cache: 5 minutes (Cloudflare CDN)
 */

const EUR_API = 'https://bcvapi.tech/api/v1/euro/public';
const USD_API = 'https://bcvapi.tech/api/v1/dolar/public';
const USDT_API = 'https://ve.dolarapi.com/v1/dolares/paralelo';

const CACHE_MAX_AGE = 300; // 5 minutes

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function onRequestGet(context) {
  try {
    const [eurRes, usdRes, usdtRes] = await Promise.allSettled([
      fetchJson(EUR_API),
      fetchJson(USD_API),
      fetchJson(USDT_API)
    ]);

    const eur = eurRes.status === 'fulfilled' ? eurRes.value : null;
    const usd = usdRes.status === 'fulfilled' ? usdRes.value : null;
    const usdt = usdtRes.status === 'fulfilled' ? usdtRes.value : null;

    const now = new Date().toISOString();

    const output = {
      last_updated: now,
      eur: eur ? {
        rate: parseFloat(eur.tasa) || 0,
        date: eur.fecha || now.split('T')[0],
        symbol: '€'
      } : null,
      usd: usd ? {
        rate: parseFloat(usd.tasa) || 0,
        date: usd.fecha || now.split('T')[0],
        symbol: '$'
      } : null,
      usdt: usdt ? {
        rate: parseFloat(usdt.promedio) || 0,
        date: usdt.fechaActualizacion ? usdt.fechaActualizacion.split('T')[0] : now.split('T')[0],
        symbol: '₮',
        live: true
      } : null
    };

    return new Response(JSON.stringify(output), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=60`
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch rates', message: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
