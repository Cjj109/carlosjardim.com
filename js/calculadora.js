/* ============================================================
   CALCULADORA DE TASAS — página propia
   Cuatro preguntas distintas sobre las mismas tres tasas.
   ============================================================ */

const API = '/api/bcv';

let tasas = null;
let modo = 'divisa';
let refresco = null;

const COLORES = {
  usd: 'var(--calc-usd)',
  eur: 'var(--calc-eur)',
  usdt: 'var(--calc-usdt)',
  bs: 'var(--calc-texto)',
};

const MODOS = {
  divisa: { pregunta: '¿Cuántos bolívares son, según cada tasa?', signo: '$' },
  bs: { pregunta: '¿Cuántas divisas salen, según cada tasa?', signo: 'Bs' },
  bcv: { pregunta: 'Un precio fijado a tasa BCV: ¿qué hay que pagar?', signo: '$' },
  usdt: { pregunta: 'Tienes USDT: ¿cuánto es y a cuánto equivale?', signo: '₮' },
};

const num = (n) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fecha = (iso) => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

/* ---------- Datos ---------- */

async function cargarTasas({ forzar = false } = {}) {
  const boton = document.getElementById('calcRefrescar');
  const aviso = document.getElementById('calcActualizado');

  if (boton) boton.disabled = true;
  if (aviso && forzar) aviso.textContent = 'Actualizando…';

  try {
    const url = forzar ? `${API}?t=${Date.now()}` : API;
    const respuesta = await fetch(url, { cache: forzar ? 'no-store' : 'default' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    tasas = await respuesta.json();
    pintarTasas();
    calcular();
  } catch (error) {
    console.error('No se pudieron cargar las tasas:', error);
    if (aviso) aviso.textContent = 'No se pudieron cargar las tasas';
  } finally {
    if (boton) boton.disabled = false;
  }
}

function tasaDe(id) {
  if (!tasas) return null;
  const dato = tasas[id];
  return dato && dato.rate > 0 ? dato.rate : null;
}

function pintarTasas() {
  const campos = [
    ['tasaUsd', 'fechaUsd', 'usd'],
    ['tasaEur', 'fechaEur', 'eur'],
    ['tasaUsdt', 'fechaUsdt', 'usdt'],
  ];

  for (const [idValor, idFecha, id] of campos) {
    const valor = document.getElementById(idValor);
    const cuando = document.getElementById(idFecha);
    const tasa = tasaDe(id);

    if (valor) valor.textContent = tasa ? num(tasa) : '—';
    if (cuando) cuando.textContent = tasas?.[id]?.date ? fecha(tasas[id].date) : '';
  }

  const aviso = document.getElementById('calcActualizado');
  if (!aviso) return;

  const origen = tasas?.usdt?.market === 'binance-p2p'
    ? `p2p de ${tasas.usdt.anuncios || 0} anuncios de Binance`
    : 'p2p de respaldo';

  const hora = new Date().toLocaleTimeString('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
  });

  aviso.textContent = `${hora} · ${origen}`;
}

/* ---------- Cálculo ---------- */

function filaHTML({ nombre, nota, valor, unidad, color }) {
  return `
    <button type="button" class="res" style="--color-res:${color}" data-copiar="${num(valor)}">
      <span class="res-info">
        <span class="res-nombre">${nombre}</span>
        <span class="res-nota">${nota}</span>
      </span>
      <span class="res-valor">
        ${num(valor)}${unidad ? `<span class="res-unidad">${unidad}</span>` : ''}
        <span class="res-copiar">copiar</span>
      </span>
    </button>`;
}

function calcular() {
  const salida = document.getElementById('calcResultados');
  if (!salida) return;

  if (!tasas) {
    salida.innerHTML = '<p class="calc-vacio">Cargando tasas…</p>';
    return;
  }

  const crudo = (document.getElementById('calcMonto').value || '').replace(/\./g, '').replace(',', '.');
  const monto = parseFloat(crudo);

  if (!monto || monto <= 0 || isNaN(monto)) {
    salida.innerHTML = '<p class="calc-vacio">Escribe una cantidad</p>';
    return;
  }

  const usd = tasaDe('usd');
  const eur = tasaDe('eur');
  const usdt = tasaDe('usdt');

  if (!usd) {
    salida.innerHTML = '<p class="calc-vacio">Sin tasa del BCV</p>';
    return;
  }

  let filas = [];

  if (modo === 'divisa') {
    filas = [
      { nombre: 'Dólar BCV', nota: `a ${num(usd)} Bs.`, valor: monto * usd, unidad: 'Bs.', color: COLORES.usd },
      eur && { nombre: 'Euro BCV', nota: `a ${num(eur)} Bs.`, valor: monto * eur, unidad: 'Bs.', color: COLORES.eur },
      usdt && { nombre: 'USDT p2p', nota: `a ${num(usdt)} Bs.`, valor: monto * usdt, unidad: 'Bs.', color: COLORES.usdt },
    ];
  } else if (modo === 'bs') {
    filas = [
      { nombre: 'En dólares BCV', nota: `a ${num(usd)} Bs.`, valor: monto / usd, unidad: '$', color: COLORES.usd },
      eur && { nombre: 'En euros BCV', nota: `a ${num(eur)} Bs.`, valor: monto / eur, unidad: '€', color: COLORES.eur },
      usdt && { nombre: 'En USDT', nota: `a ${num(usdt)} Bs.`, valor: monto / usdt, unidad: '₮', color: COLORES.usdt },
    ];
  } else if (modo === 'bcv') {
    const enBs = monto * usd;
    filas = [
      { nombre: 'Son en bolívares', nota: `a ${num(usd)} Bs.`, valor: enBs, unidad: 'Bs.', color: COLORES.bs },
      usdt && { nombre: 'USDT a vender', nota: `a ${num(usdt)} Bs.`, valor: enBs / usdt, unidad: '₮', color: COLORES.usdt },
      eur && { nombre: 'Euros a vender', nota: `a ${num(eur)} Bs.`, valor: enBs / eur, unidad: '€', color: COLORES.eur },
    ];
  } else if (modo === 'usdt') {
    if (!usdt) {
      salida.innerHTML = '<p class="calc-vacio">Sin tasa p2p</p>';
      return;
    }
    const enBs = monto * usdt;
    filas = [
      { nombre: 'Son en bolívares', nota: `a ${num(usdt)} Bs.`, valor: enBs, unidad: 'Bs.', color: COLORES.usdt },
      { nombre: 'Equivalen a BCV', nota: `a ${num(usd)} Bs.`, valor: enBs / usd, unidad: '$', color: COLORES.usd },
      eur && { nombre: 'Equivalen en euros', nota: `a ${num(eur)} Bs.`, valor: enBs / eur, unidad: '€', color: COLORES.eur },
    ];
  }

  salida.innerHTML = filas.filter(Boolean).map(filaHTML).join('');
}

/* ---------- Interacción ---------- */

function elegirModo(nuevo) {
  if (!MODOS[nuevo]) return;
  modo = nuevo;

  document.querySelectorAll('#calcModos .calc-modo').forEach((boton) => {
    const activo = boton.dataset.modo === nuevo;
    boton.classList.toggle('is-active', activo);
    boton.setAttribute('aria-selected', activo ? 'true' : 'false');
  });

  const pregunta = document.getElementById('calcPregunta');
  if (pregunta) pregunta.textContent = MODOS[nuevo].pregunta;

  const signo = document.getElementById('calcSigno');
  if (signo) signo.textContent = MODOS[nuevo].signo;

  calcular();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarTasas();

  const monto = document.getElementById('calcMonto');
  if (monto) {
    monto.addEventListener('input', calcular);
    monto.focus();
  }

  document.getElementById('calcModos')?.addEventListener('click', (e) => {
    const boton = e.target.closest('.calc-modo');
    if (boton) elegirModo(boton.dataset.modo);
  });

  document.getElementById('calcRapidos')?.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton || !monto) return;
    monto.value = boton.dataset.monto;
    calcular();
  });

  document.getElementById('calcResultados')?.addEventListener('click', async (e) => {
    const fila = e.target.closest('.res');
    if (!fila || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(fila.dataset.copiar);
      fila.classList.add('is-copiado');
      setTimeout(() => fila.classList.remove('is-copiado'), 1400);
    } catch (error) {
      console.warn('No se pudo copiar:', error);
    }
  });

  document.getElementById('calcRefrescar')?.addEventListener('click', () => cargarTasas({ forzar: true }));

  // El p2p se mueve durante el dia; el BCV no. Se refresca solo cada minuto.
  refresco = setInterval(() => cargarTasas({ forzar: true }), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(refresco);
    } else {
      cargarTasas({ forzar: true });
      refresco = setInterval(() => cargarTasas({ forzar: true }), 60000);
    }
  });
});
