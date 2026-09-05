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

  // Se nombra la fuente elegida. Antes se comparaba con una etiqueta interna
  // y, al elegir cualquier fuente en el panel, dejaba de coincidir y decia
  // "de respaldo" aunque estuviera usando la buena.
  const origen = tasas?.usdt?.fuente
    ? tasas.usdt.fuente
    : tasas?.usdt?.market === 'binance-p2p'
      ? `Binance, ${tasas.usdt.anuncios || 0} anuncios`
      : 'p2p de respaldo';

  const hora = new Date().toLocaleTimeString('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
  });

  aviso.textContent = `${hora} · ${origen}`;
}

/* ---------- Historial ---------- */

const HISTORIAL = 'calc-historial';
const HISTORIAL_MAX = 30;

function leerHistorial() {
  try {
    const guardado = JSON.parse(localStorage.getItem(HISTORIAL));
    return Array.isArray(guardado) ? guardado : [];
  } catch {
    return [];
  }
}

/**
 * Se apunta una linea cuando copias un resultado, no en cada tecla.
 *
 * Copiar es el momento en que un calculo importa de verdad: es el numero que
 * te vas a llevar. Guardar cada pulsacion llenaria la lista de cifras a
 * medio escribir.
 */
function apuntarEnHistorial(entrada) {
  const lista = leerHistorial();

  // Si repites el mismo calculo seguido, se actualiza en vez de duplicarse
  const ultima = lista[0];
  const mismo = ultima
    && ultima.monto === entrada.monto
    && ultima.modo === entrada.modo
    && ultima.resultado === entrada.resultado;

  if (mismo) return;

  lista.unshift(entrada);

  try {
    localStorage.setItem(HISTORIAL, JSON.stringify(lista.slice(0, HISTORIAL_MAX)));
  } catch {
    // Sin almacenamiento el historial simplemente no se guarda
  }

  pintarHistorial();
}

function cuando(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();

  const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  if (mismoDia) return hora;

  return `${d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })} · ${hora}`;
}

let apunteEnCurso = null;

/**
 * Apunta el calculo que hay en pantalla.
 *
 * Antes solo se guardaba al copiar un resultado, y en el telefono eso no se
 * adivina: no hay Enter ni boton de "calcular", asi que la gente escribia,
 * miraba el numero y se iba sin que quedara rastro. Ahora se apunta solo
 * cuando dejas de escribir.
 */
function apuntarCalculoActual() {
  const primera = document.querySelector('.res');
  if (!primera) return;

  const campo = document.getElementById('calcMonto');
  const crudo = (campo?.value || '').replace(/\./g, '').replace(',', '.');
  const cantidad = parseFloat(crudo);
  if (!cantidad || cantidad <= 0) return;

  const nota = (primera.querySelector('.res-nota')?.textContent || '').replace(/[^\d,.]/g, '');

  apuntarEnHistorial({
    fecha: new Date().toISOString(),
    modo,
    monto: cantidad,
    origen: MODOS[modo].signo,
    destino: primera.querySelector('.res-nombre')?.textContent.trim() || '',
    resultado: primera.dataset.copiar,
    tasa: parseFloat(nota.replace(/\./g, '').replace(',', '.')) || 0,
    color: primera.style.getPropertyValue('--color-res'),
  });
}

/** Espera a que se deje de escribir antes de apuntar nada */
function programarApunte() {
  clearTimeout(apunteEnCurso);
  apunteEnCurso = setTimeout(apuntarCalculoActual, 1800);
}

function pintarHistorial() {
  const caja = document.getElementById('listaHistorial');
  if (!caja) return;

  const lista = leerHistorial();

  if (!lista.length) {
    caja.innerHTML = '<p class="calc-historial-vacio">Todavía no has copiado ningún resultado</p>';
    return;
  }

  caja.innerHTML = lista.map((h) => `
    <button type="button" class="hist" data-monto="${h.monto}" data-modo="${h.modo}">
      <span class="hist-izq">
        <span class="hist-operacion">${num(h.monto)} ${h.origen} → ${h.destino}</span>
        <span class="hist-cuando">${cuando(h.fecha)}</span>
      </span>
      <span class="hist-der" style="--color-res:${h.color || 'var(--calc-texto)'}">
        <span class="hist-valor">${h.resultado}</span>
        <span class="hist-tasa">a ${num(h.tasa)} Bs.</span>
      </span>
    </button>`).join('');
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

  if (oficial) {
    tasas.usd = { rate: oficial.rate, date: oficial.date, symbol: '$', fuente: oficial.nombre };
  }
  if (paralelo) {
    tasas.usdt = { rate: paralelo.rate, date: paralelo.date, symbol: '₮', market: paralelo.id, fuente: paralelo.nombre };
  }

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
    monto.addEventListener('input', () => {
      calcular();
      programarApunte();
    });

    // En el teléfono no hay Enter, así que no se puede esperar a que se
    // confirme nada: se apunta cuando dejas de escribir.
    monto.addEventListener('blur', apuntarCalculoActual);
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

      const crudo = (document.getElementById('calcMonto').value || '').replace(/\./g, '').replace(',', '.');
      const notaTasa = (fila.querySelector('.res-nota')?.textContent || '').replace(/[^\d,.]/g, '');

      apuntarEnHistorial({
        fecha: new Date().toISOString(),
        modo,
        monto: parseFloat(crudo),
        origen: MODOS[modo].signo,
        destino: fila.querySelector('.res-nombre')?.textContent.trim() || '',
        resultado: fila.dataset.copiar,
        tasa: parseFloat(notaTasa.replace(/\./g, '').replace(',', '.')) || 0,
        color: fila.style.getPropertyValue('--color-res'),
      });
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

  // En el teléfono el panel tapa la calculadora, así que al elegir se cierra
  // y se ve enseguida el efecto del cambio.
  const cerrarFuentes = () => {
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  };

  panel?.addEventListener('click', (e) => {
    const ficha = e.target.closest('.fuente');
    if (!ficha || ficha.disabled) return;

    guardarEleccion(ficha.dataset.grupo, ficha.dataset.id);
    pintarFuentes();
    aplicarEleccion();
    cerrarFuentes();
  });

  // Historial
  const botonHist = document.getElementById('calcHistorial');
  const panelHist = document.getElementById('calcPanelHistorial');

  botonHist?.addEventListener('click', () => {
    const abierto = !panelHist.hidden;
    panelHist.hidden = abierto;
    botonHist.setAttribute('aria-expanded', String(!abierto));

    if (!abierto) {
      pintarHistorial();
      panelHist.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Tocar una línea repite ese cálculo
  panelHist?.addEventListener('click', (e) => {
    const linea = e.target.closest('.hist');
    if (!linea) return;

    const campo = document.getElementById('calcMonto');
    if (campo) campo.value = linea.dataset.monto;
    elegirModo(linea.dataset.modo);

    panelHist.hidden = true;
    botonHist.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('calcBorrarHistorial')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(HISTORIAL);
    } catch {
      // nada que borrar
    }
    pintarHistorial();
  });

  document.getElementById('calcRestablecer')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(MEMORIA);
    } catch {
      // sin almacenamiento no hay nada que borrar
    }
    pintarFuentes();
    aplicarEleccion();
    cerrarFuentes();
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
