/* ============================================================
   CALCULADORA DE TASAS — página propia
   Cuatro preguntas distintas sobre las mismas tres tasas.
   ============================================================ */

const API = '/api/bcv';

let tasas = null;
let fuentes = null;

// La eleccion se guarda en el navegador de cada quien: es una preferencia
// personal, no hay cuentas ni servidor donde ponerla.
const MEMORIA = 'calc-fuentes';

function fuentesElegidas() {
  try {
    return JSON.parse(localStorage.getItem(MEMORIA)) || {};
  } catch {
    return {};
  }
}

function guardarEleccion(grupo, id) {
  const actual = fuentesElegidas();
  actual[grupo] = id;
  try {
    localStorage.setItem(MEMORIA, JSON.stringify(actual));
  } catch {
    // Modo privado o almacenamiento lleno: se sigue sin guardar
  }
}
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

    if (fuentes) {
      aplicarEleccion();
    } else {
      pintarTasas();
      calcular();
    }
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

/* ---------- Fuentes ---------- */

async function cargarFuentes() {
  try {
    const respuesta = await fetch(`/api/fuentes?t=${Date.now()}`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const datos = await respuesta.json();
    fuentes = datos.fuentes || [];
    pintarFuentes();
    aplicarEleccion();
  } catch (error) {
    console.error('No se pudieron consultar las fuentes:', error);
  }
}

function fichaFuente(f, elegida) {
  const caida = f.rate === null || f.rate === undefined;
  const valor = caida
    ? '<span class="fuente-tasa">sin respuesta</span>'
    : `<span class="fuente-tasa">${num(f.rate)}</span>${f.date ? `<span class="fuente-fecha">${fecha(f.date)}</span>` : ''}`;

  return `
    <button type="button" role="radio" aria-checked="${elegida}"
      class="fuente${elegida ? ' is-elegida' : ''}${caida ? ' fuente-caida' : ''}"
      data-grupo="${f.grupo}" data-id="${f.id}" ${caida ? 'disabled' : ''}>
      <span class="fuente-info">
        <span class="fuente-nombre">
          ${f.nombre}${elegida ? '<span class="fuente-marca">en uso</span>' : ''}
        </span>
        <span class="fuente-detalle">${f.detalle}</span>
      </span>
      <span class="fuente-valor">${valor}</span>
    </button>`;
}

function pintarFuentes() {
  if (!fuentes) return;

  const elegidas = fuentesElegidas();
  const porDefecto = { bcv: 'bcv', paralelo: 'binance' };

  for (const grupo of ['bcv', 'paralelo']) {
    const caja = document.getElementById(grupo === 'bcv' ? 'fuentesBcv' : 'fuentesParalelo');
    if (!caja) continue;

    const delGrupo = fuentes.filter((f) => f.grupo === grupo);
    const elegida = elegidas[grupo] || porDefecto[grupo];

    // Si la elegida no responde, manda la primera que si lo haga
    const activa = delGrupo.some((f) => f.id === elegida && f.rate != null)
      ? elegida
      : (delGrupo.find((f) => f.rate != null) || {}).id;

    caja.innerHTML = delGrupo.map((f) => fichaFuente(f, f.id === activa)).join('');
  }
}

/** Sustituye las tasas por las de las fuentes elegidas */
function aplicarEleccion() {
  if (!fuentes || !tasas) return;

  const elegidas = fuentesElegidas();
  const porDefecto = { bcv: 'bcv', paralelo: 'binance' };

  const buscar = (grupo) => {
    const delGrupo = fuentes.filter((f) => f.grupo === grupo && f.rate != null);
    return delGrupo.find((f) => f.id === (elegidas[grupo] || porDefecto[grupo])) || delGrupo[0] || null;
  };

  const oficial = buscar('bcv');
  const paralelo = buscar('paralelo');

  if (oficial) tasas.usd = { rate: oficial.rate, date: oficial.date, symbol: '$' };
  if (paralelo) tasas.usdt = { rate: paralelo.rate, date: paralelo.date, symbol: '₮', market: paralelo.id };

  pintarTasas();
  calcular();
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
    // El euro va último en los dos modos: es el que menos se usa
    filas = [
      { nombre: 'Dólar BCV', nota: `a ${num(usd)} Bs.`, valor: monto * usd, unidad: 'Bs.', color: COLORES.usd },
      usdt && { nombre: 'USDT p2p', nota: `a ${num(usdt)} Bs.`, valor: monto * usdt, unidad: 'Bs.', color: COLORES.usdt },
      eur && { nombre: 'Euro BCV', nota: `a ${num(eur)} Bs.`, valor: monto * eur, unidad: 'Bs.', color: COLORES.eur },
    ];
  } else if (modo === 'bs') {
    filas = [
      { nombre: 'En dólares BCV', nota: `a ${num(usd)} Bs.`, valor: monto / usd, unidad: '$', color: COLORES.usd },
      usdt && { nombre: 'En USDT', nota: `a ${num(usdt)} Bs.`, valor: monto / usdt, unidad: '₮', color: COLORES.usdt },
      eur && { nombre: 'En euros BCV', nota: `a ${num(eur)} Bs.`, valor: monto / eur, unidad: '€', color: COLORES.eur },
    ];
  } else if (modo === 'bcv') {
    const enBs = monto * usd;
    // Sin euros: quien paga un precio fijado a BCV vende USDT, no euros
    filas = [
      { nombre: 'Son en bolívares', nota: `a ${num(usd)} Bs.`, valor: enBs, unidad: 'Bs.', color: COLORES.bs },
      usdt && { nombre: 'USDT a vender', nota: `a ${num(usdt)} Bs.`, valor: enBs / usdt, unidad: '₮', color: COLORES.usdt },
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

  document.getElementById('calcRefrescar')?.addEventListener('click', () => {
    cargarTasas({ forzar: true });
    if (fuentes) cargarFuentes();
  });

  // Panel de fuentes: se consultan la primera vez que se abre, no antes,
  // porque preguntarle a las siete fuentes cuesta y casi nadie lo abre.
  const boton = document.getElementById('calcAjustes');
  const panel = document.getElementById('calcPanelAjustes');

  boton?.addEventListener('click', () => {
    const abierto = !panel.hidden;
    panel.hidden = abierto;
    boton.setAttribute('aria-expanded', String(!abierto));

    if (!abierto && !fuentes) cargarFuentes();
    if (!abierto) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  panel?.addEventListener('click', (e) => {
    const ficha = e.target.closest('.fuente');
    if (!ficha || ficha.disabled) return;

    guardarEleccion(ficha.dataset.grupo, ficha.dataset.id);
    pintarFuentes();
    aplicarEleccion();
  });

  document.getElementById('calcRestablecer')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(MEMORIA);
    } catch {
      // sin almacenamiento no hay nada que borrar
    }
    pintarFuentes();
    aplicarEleccion();
  });

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
