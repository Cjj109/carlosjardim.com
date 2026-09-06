/* ============================================================
   CALCULADORA DE TASAS — página propia
   Cuatro preguntas distintas sobre las mismas tres tasas.
   ============================================================ */

const API = '/api/bcv';
const API_FUENTES = '/api/fuentes';

let tasas = null;
let fuentes = null;

// La eleccion se guarda en el navegador de cada quien: es una preferencia
// personal, no hay cuentas ni servidor donde ponerla.
const MEMORIA = 'calc-fuentes';
const TEMA = 'calc-tema';

// El color de la barra de estado del teléfono va con el tema: es el detalle
// que hace que deje de parecer una web abierta y parezca una app.
// La misma lista está en el <script> de la cabecera, que aplica el tema antes
// de que pinte nada; si cambia una, cambia la otra.
const TEMAS = {
  oscuro: '#0a0b0f',
  claro: '#f4f6fa',
  navidad: '#0b1410',
};

/* ---------- Utilidades ---------- */

const $ = (id) => document.getElementById(id);

/**
 * Escapa lo que va a parar a innerHTML.
 *
 * Casi todo lo que se pinta sale de la propia app, pero dos cosas no: los
 * nombres y detalles que devuelve /api/fuentes, y el historial que se lee de
 * localStorage. Ninguna es de fiar por construcción, así que ninguna entra
 * cruda en el HTML.
 */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Formatea una cifra con los decimales que hagan falta.
 *
 * Antes eran siempre dos, y eso convertía en "0,00" cualquier resultado
 * pequeño: 1 bolívar en dólares salía como cero. Para dinero dos decimales
 * bastan, pero cuando la cifra es menor que uno hacen falta más para que
 * diga algo.
 */
function num(n) {
  if (!Number.isFinite(n)) return '—';

  const abs = Math.abs(n);
  const decimales = abs >= 1 || abs === 0 ? 2 : abs >= 0.01 ? 4 : 6;

  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimales,
  }).format(n);
}

const fecha = (iso) => {
  if (!iso) return '';
  const partes = String(iso).split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : String(iso);
};

/* ---------- Lectura del monto ----------

   El campo se escribe solo con los puntos de millar, así que quien teclea
   nunca necesita ponerlos: cualquier separador que escriba es el decimal.
   Eso resuelve de raíz el error que había, en el que "10.5" se leía como
   105 —un diez por uno de más en una calculadora de dinero— porque el punto
   se borraba siempre por ser el separador de millar venezolano.

   Y como la caja se reformatea en cada tecla, la cadena ambigua nunca llega
   a existir: al escribir "100." se ve "100," en el acto, y quien quería cien
   mil lo nota antes de seguir. Los millares los pone la app. */

/**
 * Cuál de los separadores de la cadena es el decimal, si es que hay alguno.
 *
 * @param {boolean} enVivo  true mientras se teclea dentro del campo
 */
function indiceDecimal(texto, enVivo = false) {
  const coma = texto.lastIndexOf(',');
  // La coma es el decimal venezolano; si está, no hay nada que decidir.
  if (coma !== -1) return coma;

  const punto = texto.lastIndexOf('.');
  if (punto === -1) return -1;

  // Tecleando, los puntos que ya hay en la caja los ha puesto la app como
  // separadores de millar: el único que puede ser del usuario es el que acaba
  // de escribir, y ese está al final. Sin esta distinción, escribir "100000"
  // pasaba por "1.000" y el siguiente cero convertía ese punto de millar en
  // coma decimal: la caja acababa diciendo "1,00".
  if (enVivo) return punto === texto.length - 1 ? punto : -1;

  // Pegado, o puesto por la app desde el historial: aquí sí hay que adivinar.
  // Un punto suelto que no separa un grupo de tres es decimal ("10.5"); varios
  // puntos, o uno con tres dígitos detrás, son millares ("100.000").
  const puntos = texto.split('.').length - 1;
  const detras = texto.length - punto - 1;
  return puntos === 1 && detras !== 3 ? punto : -1;
}

/** El texto del campo, ya con los puntos de millar puestos */
function formatearTexto(texto, enVivo = false) {
  const limpio = String(texto).replace(/[^\d.,]/g, '');
  const corte = indiceDecimal(limpio, enVivo);

  const soloDigitos = (s) => s.replace(/\D/g, '');
  let entero = soloDigitos(corte === -1 ? limpio : limpio.slice(0, corte));
  let decimal = corte === -1 ? null : soloDigitos(limpio.slice(corte + 1));

  // Tres dígitos detrás del separador y era un grupo de millar, no decimales:
  // así es como se teclea "100.000" de toda la vida. Sin esto, quien lo
  // escribía se quedaba con 100 —mil veces menos— porque el punto se tomaba
  // por coma decimal. Se descarta si delante solo hay un cero, que ahí "0,999"
  // sí son decimales.
  if (enVivo && decimal && decimal.length === 3 && entero && entero !== '0') {
    entero += decimal;
    decimal = null;
  } else if (decimal) {
    // Dos decimales y no más: es dinero.
    decimal = decimal.slice(0, 2);
  }

  const sinCeros = entero.replace(/^0+(?=\d)/, '');
  const conMiles = sinCeros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimal === null) return conMiles;
  return `${conMiles || '0'},${decimal}`;
}

/** El número que representa el campo, o NaN */
function leerMonto(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,]/g, '');
  const corte = indiceDecimal(limpio);

  const entero = (corte === -1 ? limpio : limpio.slice(0, corte)).replace(/\D/g, '');
  const decimal = corte === -1 ? '' : limpio.slice(corte + 1).replace(/\D/g, '');

  if (!entero && !decimal) return NaN;
  return parseFloat(`${entero || '0'}.${decimal || '0'}`);
}

const montoActual = () => leerMonto($('calcMonto')?.value);

/* Reescribe el campo dejando el cursor donde estaba */

const contarDigitos = (s) => (s.match(/\d/g) || []).length;

function trasNDigitos(texto, n) {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] >= '0' && texto[i] <= '9') {
      vistos += 1;
      if (vistos === n) return i + 1;
    }
  }
  return texto.length;
}

function reformatearCampo(campo, { enVivo = true } = {}) {
  const antes = campo.value;
  const nuevo = formatearTexto(antes, enVivo);
  if (nuevo === antes) return;

  const caret = campo.selectionStart ?? antes.length;
  const digitosDetras = contarDigitos(antes.slice(0, caret));

  campo.value = nuevo;

  // Si el cursor iba detrás de todos los dígitos se queda al final. Sin este
  // caso, al escribir la coma el cursor caía delante de ella y la siguiente
  // tecla se colaba en la parte entera.
  const destino = digitosDetras >= contarDigitos(nuevo)
    ? nuevo.length
    : trasNDigitos(nuevo, digitosDetras);

  try {
    campo.setSelectionRange(destino, destino);
  } catch {
    // Algunos navegadores no dejan mover el cursor si el campo no tiene foco
  }
}

/* ---------- Tema ---------- */

function aplicarTema(tema) {
  const elegido = TEMAS[tema] ? tema : 'oscuro';

  document.documentElement.dataset.tema = elegido;
  document.documentElement.style.background = TEMAS[elegido];

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', TEMAS[elegido]);

  document.querySelectorAll('#listaTemas .tema').forEach((boton) => {
    const activo = boton.dataset.tema === elegido;
    boton.classList.toggle('is-elegido', activo);
    boton.setAttribute('aria-checked', String(activo));
    boton.tabIndex = activo ? 0 : -1;
  });

  try {
    localStorage.setItem(TEMA, elegido);
  } catch {
    // Sin almacenamiento el tema dura lo que la visita
  }
}

function temaGuardado() {
  try {
    return localStorage.getItem(TEMA) || 'oscuro';
  } catch {
    return 'oscuro';
  }
}

/* ---------- Elección de fuentes ---------- */

const POR_DEFECTO = { bcv: 'bcv', paralelo: 'binance', zelle: 'zelle' };
const GRUPOS = [
  ['bcv', 'fuentesBcv'],
  ['paralelo', 'fuentesParalelo'],
  ['zelle', 'fuentesZelle'],
];

function fuentesElegidas() {
  try {
    const guardado = JSON.parse(localStorage.getItem(MEMORIA));
    return guardado && typeof guardado === 'object' ? guardado : {};
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
  zelle: 'var(--calc-zelle)',
  bs: 'var(--calc-texto)',
};

const MODOS = {
  divisa: { pregunta: '¿Cuántos bolívares son, según cada tasa?', signo: '$' },
  bs: { pregunta: '¿Cuántas divisas salen, según cada tasa?', signo: 'Bs' },
  bcv: { pregunta: 'Un precio fijado a tasa BCV: ¿qué hay que pagar?', signo: '$' },
  usdt: { pregunta: 'Tienes USDT: ¿cuánto es y a cuánto equivale?', signo: '₮' },
};

/* ---------- Datos ---------- */

// Marca de la petición en curso. Sin esto, una respuesta lenta que llegara
// después de otra más nueva pisaba las tasas buenas con las viejas: pasa cada
// vez que el refresco automático y el botón coinciden.
let peticion = 0;
let cargando = false;
let ultimaBuena = 0;

async function cargarTasas({ forzar = false, primera = false } = {}) {
  const boton = $('calcRefrescar');
  const aviso = $('calcActualizado');

  if (cargando && !forzar) return;

  const mia = ++peticion;
  cargando = true;
  if (boton) boton.disabled = true;
  if (aviso && forzar) aviso.textContent = 'Actualizando…';

  try {
    // La cabecera ya lanzó la primera petición antes de que este script
    // existiera; aprovecharla ahorra un viaje completo en la carga inicial.
    const enVuelo = primera ? window.__tasasEnVuelo : null;
    delete window.__tasasEnVuelo;

    // Sin ?t=: el no-store ya evita la caché, y el parámetro variable hacía
    // que el service worker guardara una entrada nueva por minuto y que la
    // copia de emergencia no coincidiera nunca con lo que se pedía.
    const respuesta = (enVuelo && (await enVuelo)) || (await fetch(API, { cache: 'no-store' }));
    if (!respuesta || !respuesta.ok) throw new Error(`HTTP ${respuesta ? respuesta.status : 'sin respuesta'}`);

    const datos = await respuesta.json();
    if (mia !== peticion) return; // llegó tarde: manda una más nueva

    tasas = datos;
    ultimaBuena = Date.now();

    if (fuentes) aplicarEleccion();
    else {
      pintarTasas();
      calcular();
    }
  } catch (error) {
    if (mia !== peticion) return;
    console.error('No se pudieron cargar las tasas:', error);

    // Si ya había tasas se quedan en pantalla y solo se avisa de que son las
    // de antes: borrarlas por un fallo de red deja al usuario sin nada.
    if (tasas) pintarTasas({ falloDeRed: true });
    else if (aviso) aviso.textContent = navigator.onLine ? 'No se pudieron cargar las tasas' : 'Sin conexión';
  } finally {
    if (mia === peticion) {
      cargando = false;
      if (boton) boton.disabled = false;
    }
  }
}

function tasaDe(id) {
  const dato = tasas?.[id];
  return dato && Number.isFinite(dato.rate) && dato.rate > 0 ? dato.rate : null;
}

/** "hace 3 min" para saber si lo que se ve sigue siendo de ahora */
function antiguedad(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min === 1) return 'hace 1 min';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
}

function pintarTasas({ falloDeRed = false } = {}) {
  const campos = [
    ['tasaUsd', 'usd'],
    ['tasaEur', 'eur'],
    ['tasaUsdt', 'usdt'],
    ['tasaZelle', 'zelle'],
  ];

  for (const [idValor, id] of campos) {
    const valor = $(idValor);
    if (!valor) continue;
    const tasa = tasaDe(id);
    valor.textContent = tasa ? num(tasa) : '—';
  }

  const aviso = $('calcActualizado');
  if (!aviso) return;

  if (falloDeRed) {
    aviso.textContent = `${navigator.onLine ? 'No respondió' : 'Sin conexión'} · tasas de ${antiguedad(ultimaBuena)}`;
    aviso.classList.add('is-viejo');
    return;
  }

  aviso.classList.remove('is-viejo');

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

  // La fecha sale de las tarjetas —las hacia mas altas— pero la del BCV
  // importa: dice que esa tasa rige el proximo dia habil, no hoy.
  const vigencia = tasas?.usd?.date ? ` · BCV rige ${fecha(tasas.usd.date)}` : '';

  aviso.textContent = `${hora} · ${origen}${vigencia}`;
}

/* ---------- Historial ---------- */

const HISTORIAL = 'calc-historial';
const HISTORIAL_MAX = 30;

function leerHistorial() {
  try {
    const guardado = JSON.parse(localStorage.getItem(HISTORIAL));
    return Array.isArray(guardado) ? guardado.filter((h) => h && typeof h === 'object') : [];
  } catch {
    return [];
  }
}

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
  if (Number.isNaN(d.getTime())) return '';

  const hoy = new Date();
  const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return hora;

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
function apuntarFila(fila) {
  if (!fila) return;

  const cantidad = montoActual();
  if (!Number.isFinite(cantidad) || cantidad <= 0) return;

  apuntarEnHistorial({
    fecha: new Date().toISOString(),
    modo,
    monto: cantidad,
    origen: MODOS[modo].signo,
    destino: fila.querySelector('.res-nombre')?.textContent.trim() || '',
    resultado: fila.dataset.copiar || '',
    tasa: Number(fila.dataset.tasa) || 0,
    color: fila.dataset.color || '',
  });
}

const apuntarCalculoActual = () => apuntarFila(document.querySelector('.res'));

/** Espera a que se deje de escribir antes de apuntar nada */
function programarApunte() {
  clearTimeout(apunteEnCurso);
  apunteEnCurso = setTimeout(apuntarCalculoActual, 1800);
}

function pintarHistorial() {
  const caja = $('listaHistorial');
  if (!caja) return;

  const lista = leerHistorial();

  if (!lista.length) {
    caja.innerHTML = '<p class="calc-historial-vacio">Todavía no has calculado nada</p>';
    return;
  }

  caja.innerHTML = lista.map((h) => `
    <button type="button" class="hist" data-monto="${esc(h.monto)}" data-modo="${esc(h.modo)}">
      <span class="hist-izq">
        <span class="hist-operacion">${esc(num(Number(h.monto)))} ${esc(h.origen)} → ${esc(h.destino)}</span>
        <span class="hist-cuando">${esc(cuando(h.fecha))}</span>
      </span>
      <span class="hist-der"${h.color ? ` style="--color-res:${esc(h.color)}"` : ''}>
        <span class="hist-valor">${esc(h.resultado)}</span>
        ${h.tasa > 0 ? `<span class="hist-tasa">a ${esc(num(Number(h.tasa)))} Bs.</span>` : ''}
      </span>
    </button>`).join('');
}

/* ---------- Fuentes ---------- */

let cargandoFuentes = false;

async function cargarFuentes() {
  if (cargandoFuentes) return;
  cargandoFuentes = true;

  try {
    const respuesta = await fetch(API_FUENTES, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const datos = await respuesta.json();
    fuentes = Array.isArray(datos.fuentes) ? datos.fuentes : [];
    pintarFuentes();
    aplicarEleccion();
  } catch (error) {
    console.error('No se pudieron consultar las fuentes:', error);
    for (const [, caja] of GRUPOS) {
      const nodo = $(caja);
      if (nodo && !nodo.children.length) {
        nodo.innerHTML = '<p class="calc-historial-vacio">No se pudieron consultar</p>';
      }
    }
  } finally {
    cargandoFuentes = false;
  }
}

function fichaFuente(f, elegida) {
  const caida = f.rate === null || f.rate === undefined;
  const valor = caida
    ? '<span class="fuente-tasa">sin respuesta</span>'
    : `<span class="fuente-tasa">${esc(num(Number(f.rate)))}</span>${f.date ? `<span class="fuente-fecha">${esc(fecha(f.date))}</span>` : ''}`;

  return `
    <button type="button" role="radio" aria-checked="${elegida}" tabindex="${elegida ? 0 : -1}"
      class="fuente${elegida ? ' is-elegida' : ''}${caida ? ' fuente-caida' : ''}"
      data-grupo="${esc(f.grupo)}" data-id="${esc(f.id)}" ${caida ? 'disabled' : ''}>
      <span class="fuente-info">
        <span class="fuente-nombre">
          ${esc(f.nombre)}${elegida ? '<span class="fuente-marca">en uso</span>' : ''}
        </span>
        <span class="fuente-detalle">${esc(f.detalle)}</span>
      </span>
      <span class="fuente-valor">${valor}</span>
    </button>`;
}

/** La fuente que manda en un grupo: la elegida si responde, si no la primera que sí */
function fuenteActiva(grupo) {
  if (!fuentes) return null;

  const delGrupo = fuentes.filter((f) => f.grupo === grupo && f.rate != null);
  if (!delGrupo.length) return null;

  const elegida = fuentesElegidas()[grupo] || POR_DEFECTO[grupo];
  return delGrupo.find((f) => f.id === elegida) || delGrupo[0];
}

function pintarFuentes() {
  if (!fuentes) return;

  for (const [grupo, idCaja] of GRUPOS) {
    const caja = $(idCaja);
    if (!caja) continue;

    const delGrupo = fuentes.filter((f) => f.grupo === grupo);
    const activa = fuenteActiva(grupo);

    caja.innerHTML = delGrupo.length
      ? delGrupo.map((f) => fichaFuente(f, activa != null && f.id === activa.id)).join('')
      : '<p class="calc-historial-vacio">Ninguna respondió</p>';
  }
}

/** Sustituye las tasas por las de las fuentes elegidas */
function aplicarEleccion() {
  if (!fuentes || !tasas) return;

  const oficial = fuenteActiva('bcv');
  const paralelo = fuenteActiva('paralelo');
  const zelle = fuenteActiva('zelle');

  if (oficial) {
    tasas.usd = { rate: oficial.rate, date: oficial.date, symbol: '$', fuente: oficial.nombre };
  }
  if (paralelo) {
    tasas.usdt = { rate: paralelo.rate, date: paralelo.date, symbol: '₮', market: paralelo.id, fuente: paralelo.nombre };
  }
  // El Zelle es su propio grupo. Estaba metido entre las fuentes "paralelas",
  // así que elegirlo ahí reemplazaba la tasa del USDT por la del Zelle: las
  // filas seguían diciendo "USDT p2p" mientras mostraban otra cosa, y salía
  // dos veces el mismo número.
  if (zelle) {
    tasas.zelle = { rate: zelle.rate, date: zelle.date, symbol: 'Z', fuente: zelle.nombre };
  }

  pintarTasas();
  calcular();
}

/* ---------- Cálculo ---------- */

function filaHTML({ nombre, tasa, valor, unidad, color }) {
  return `
    <button type="button" class="res" style="--color-res:${esc(color)}"
      data-copiar="${esc(num(valor))}" data-tasa="${esc(tasa)}" data-color="${esc(color)}">
      <span class="res-info">
        <span class="res-nombre">${esc(nombre)}</span>
        <span class="res-nota">a ${esc(num(tasa))} Bs.</span>
      </span>
      <span class="res-valor">
        ${esc(num(valor))}${unidad ? `<span class="res-unidad">${esc(unidad)}</span>` : ''}
      </span>
    </button>`;
}

/** Las filas que tocan según el modo, o un texto si falta alguna tasa */
function filasDelModo(monto, { usd, eur, usdt, zelle }) {
  if (modo === 'divisa') {
    // El euro va último en los dos modos: es el que menos se usa
    return [
      { nombre: 'Dólar BCV', tasa: usd, valor: monto * usd, unidad: 'Bs.', color: COLORES.usd },
      usdt && { nombre: 'USDT p2p', tasa: usdt, valor: monto * usdt, unidad: 'Bs.', color: COLORES.usdt },
      zelle && { nombre: 'Zelle', tasa: zelle, valor: monto * zelle, unidad: 'Bs.', color: COLORES.zelle },
      eur && { nombre: 'Euro BCV', tasa: eur, valor: monto * eur, unidad: 'Bs.', color: COLORES.eur },
    ];
  }

  if (modo === 'bs') {
    return [
      { nombre: 'En dólares BCV', tasa: usd, valor: monto / usd, unidad: '$', color: COLORES.usd },
      usdt && { nombre: 'En USDT', tasa: usdt, valor: monto / usdt, unidad: '₮', color: COLORES.usdt },
      zelle && { nombre: 'En Zelle', tasa: zelle, valor: monto / zelle, unidad: '$', color: COLORES.zelle },
      eur && { nombre: 'En euros BCV', tasa: eur, valor: monto / eur, unidad: '€', color: COLORES.eur },
    ];
  }

  if (modo === 'bcv') {
    const enBs = monto * usd;
    // Sin euros: quien paga un precio fijado a BCV vende USDT, no euros
    return [
      { nombre: 'Son en bolívares', tasa: usd, valor: enBs, unidad: 'Bs.', color: COLORES.bs },
      usdt && { nombre: 'USDT a vender', tasa: usdt, valor: enBs / usdt, unidad: '₮', color: COLORES.usdt },
      zelle && { nombre: 'Zelle a vender', tasa: zelle, valor: enBs / zelle, unidad: '$', color: COLORES.zelle },
    ];
  }

  if (!usdt) return 'Sin tasa p2p';

  const enBs = monto * usdt;
  return [
    { nombre: 'Son en bolívares', tasa: usdt, valor: enBs, unidad: 'Bs.', color: COLORES.usdt },
    // Vendiendo el USDT y cobrando por Zelle salen mas dolares, porque el
    // Zelle vale menos: es el mismo dinero contado en otra moneda.
    zelle && { nombre: 'Equivalen en Zelle', tasa: zelle, valor: enBs / zelle, unidad: '$', color: COLORES.zelle },
    { nombre: 'Equivalen a BCV', tasa: usd, valor: enBs / usd, unidad: '$', color: COLORES.usd },
  ];
}

let resumenEnCurso = null;

/**
 * Dicta el resultado al lector de pantalla, una sola vez y con calma.
 *
 * La lista de resultados tenía aria-live, así que cada tecla volvía a leer
 * las cuatro filas enteras y no dejaba oír nada. Ahora se anuncia un resumen
 * y solo cuando se para de escribir.
 */
function anunciar(texto) {
  const caja = $('calcResumen');
  if (!caja) return;

  clearTimeout(resumenEnCurso);
  resumenEnCurso = setTimeout(() => { caja.textContent = texto; }, 700);
}

function vacio(salida, texto) {
  salida.innerHTML = `<p class="calc-vacio">${esc(texto)}</p>`;
  anunciar(texto);
}

function calcular() {
  const salida = $('calcResultados');
  if (!salida) return;

  const campo = $('calcMonto');
  const borrar = $('calcBorrar');
  if (borrar) borrar.hidden = !campo?.value;

  if (!tasas) return vacio(salida, 'Cargando tasas…');

  const monto = montoActual();
  if (!Number.isFinite(monto) || monto <= 0) return vacio(salida, 'Escribe una cantidad');

  const usd = tasaDe('usd');
  if (!usd) return vacio(salida, 'Sin tasa del BCV');

  const filas = filasDelModo(monto, {
    usd,
    eur: tasaDe('eur'),
    usdt: tasaDe('usdt'),
    zelle: tasaDe('zelle'),
  });

  if (typeof filas === 'string') return vacio(salida, filas);

  const buenas = filas.filter(Boolean).filter((f) => Number.isFinite(f.valor));
  if (!buenas.length) return vacio(salida, 'Sin tasas para este cálculo');

  salida.innerHTML = buenas.map(filaHTML).join('');
  anunciar(`${num(monto)} ${MODOS[modo].signo}: ${buenas.map((f) => `${f.nombre}, ${num(f.valor)} ${f.unidad}`).join('; ')}`);
}

/* ---------- 60 IQ ---------- */

/**
 * El ayudante que hace la cuenta cuando la pregunta viene en cristiano.
 *
 * Le pasamos las tasas que hay en pantalla en ese momento, para que no se las
 * invente: el modelo pone la conversación, los números los pone la app. La
 * clave de OpenAI no vive aquí sino en /api/60iq, porque cualquier cosa que
 * esté en este archivo la puede leer quien abra el código fuente.
 */
let iqPreguntando = false;

function burbuja(quien, texto, { error = false } = {}) {
  const charla = $('iqCharla');
  if (!charla) return null;

  const ejemplos = charla.querySelector('.calc-iq-ejemplos');
  if (ejemplos) ejemplos.remove();

  const nodo = document.createElement('p');
  nodo.className = `calc-iq-dice calc-iq-${quien}${error ? ' es-error' : ''}`;
  nodo.textContent = texto;

  charla.appendChild(nodo);
  charla.scrollTop = charla.scrollHeight;
  return nodo;
}

async function preguntarAl60IQ(pregunta) {
  if (iqPreguntando || !pregunta) return;

  const boton = $('iqEnviar');
  iqPreguntando = true;
  if (boton) boton.disabled = true;

  burbuja('tu', pregunta);
  const esperando = burbuja('iq', 'Pensando, para variar…');

  try {
    const respuesta = await fetch('/api/60iq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pregunta,
        // Solo las cifras: es lo único que necesita para calcular
        tasas: {
          usd: tasaDe('usd'),
          eur: tasaDe('eur'),
          usdt: tasaDe('usdt'),
          zelle: tasaDe('zelle'),
        },
      }),
    });

    const datos = await respuesta.json().catch(() => ({}));
    esperando?.remove();

    if (!respuesta.ok || !datos.respuesta) {
      burbuja('iq', datos.error || 'No se pudo preguntar. Intenta de nuevo.', { error: true });
      return;
    }

    burbuja('iq', datos.respuesta);
  } catch (error) {
    console.warn('Falló la consulta al 60 IQ:', error);
    esperando?.remove();
    burbuja('iq', navigator.onLine ? 'No se pudo preguntar.' : 'Sin conexión.', { error: true });
  } finally {
    iqPreguntando = false;
    if (boton) boton.disabled = false;
  }
}

/* ---------- Interacción ---------- */

function elegirModo(nuevo, { foco = false } = {}) {
  if (!MODOS[nuevo]) return;
  modo = nuevo;

  document.querySelectorAll('#calcModos .calc-modo').forEach((boton) => {
    const activo = boton.dataset.modo === nuevo;
    boton.classList.toggle('is-active', activo);
    boton.setAttribute('aria-selected', activo ? 'true' : 'false');
    boton.tabIndex = activo ? 0 : -1;
    if (activo && foco) boton.focus();
  });

  const pregunta = $('calcPregunta');
  if (pregunta) pregunta.textContent = MODOS[nuevo].pregunta;

  const signo = $('calcSigno');
  if (signo) signo.textContent = MODOS[nuevo].signo;

  calcular();
}

/**
 * Flechas para moverse entre pestañas y entre opciones, que es como se espera
 * que funcionen un tablist y un radiogroup con el teclado.
 */
function navegarConFlechas(contenedor, selector, alElegir) {
  contenedor.addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!paso) return;

    const items = [...contenedor.querySelectorAll(selector)].filter((b) => !b.disabled);
    const desde = items.indexOf(document.activeElement);
    if (desde === -1) return;

    e.preventDefault();
    alElegir(items[(desde + paso + items.length) % items.length]);
  });
}

/** Abre un panel y cierra los demás: apilados, en el teléfono no se ve nada */
function crearPaneles(lista) {
  const nodos = lista
    .map(([b, p]) => [$(b), $(p)])
    .filter(([b, p]) => b && p);

  function alternar(panel) {
    const abrir = panel.hidden;

    for (const [boton, otro] of nodos) {
      const activo = abrir && otro === panel;
      otro.hidden = !activo;
      boton.setAttribute('aria-expanded', String(activo));
    }

    if (abrir) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cerrar(panel) {
    for (const [boton, otro] of nodos) {
      if (panel && otro !== panel) continue;
      otro.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
    }
  }

  for (const [boton, panel] of nodos) {
    boton.addEventListener('click', () => alternar(panel));
  }

  // Escape cierra el que esté abierto, como cualquier menú
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abierto = nodos.find(([, p]) => !p.hidden);
    if (!abierto) return;
    cerrar(null);
    abierto[0].focus();
  });

  return { alternar, cerrar };
}

function programarRefresco() {
  // Siempre se limpia antes: al volver a la pestaña se creaba un intervalo
  // nuevo sin quitar el anterior, y la app acababa pidiendo las tasas varias
  // veces por minuto sin que se notara.
  clearInterval(refresco);
  refresco = setInterval(() => cargarTasas({ forzar: true }), 60000);
}

document.addEventListener('DOMContentLoaded', () => {
  aplicarTema(temaGuardado());
  cargarTasas({ primera: true });

  const monto = $('calcMonto');
  if (monto) {
    monto.addEventListener('input', (e) => {
      // Lo pegado no se ha escrito tecla a tecla, así que ahí sí toca
      // interpretar los separadores en vez de darlos por millares.
      reformatearCampo(monto, { enVivo: e.inputType !== 'insertFromPaste' });
      calcular();
      programarApunte();
    });

    // En el teléfono no hay Enter, así que no se puede esperar a que se
    // confirme nada: se apunta cuando dejas de escribir.
    monto.addEventListener('blur', apuntarCalculoActual);
    monto.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        monto.blur();
      }
    });
    // Sin focus() automático: en el móvil el teclado saltaba al abrir y tapaba
    // justo las tasas y los resultados que se venía a ver.
  }

  $('calcBorrar')?.addEventListener('click', () => {
    if (!monto) return;
    monto.value = '';
    calcular();
    monto.focus();
  });

  const modos = $('calcModos');
  modos?.addEventListener('click', (e) => {
    const boton = e.target.closest('.calc-modo');
    if (boton) elegirModo(boton.dataset.modo);
  });
  if (modos) navegarConFlechas(modos, '.calc-modo', (b) => elegirModo(b.dataset.modo, { foco: true }));

  $('calcRapidos')?.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton || !monto) return;
    monto.value = formatearTexto(boton.dataset.monto);
    calcular();
    programarApunte();
  });

  $('calcResultados')?.addEventListener('click', async (e) => {
    const fila = e.target.closest('.res');
    if (!fila) return;

    apuntarFila(fila);

    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(fila.dataset.copiar);
      fila.classList.add('is-copiado');
      setTimeout(() => fila.classList.remove('is-copiado'), 1400);
    } catch (error) {
      console.warn('No se pudo copiar:', error);
    }
  });

  $('calcRefrescar')?.addEventListener('click', () => {
    cargarTasas({ forzar: true });
    if (fuentes) cargarFuentes();
    programarRefresco();
  });

  const paneles = crearPaneles([
    ['calc60iq', 'calcPanel60iq'],
    ['calcTema', 'calcPanelTema'],
    ['calcHistorial', 'calcPanelHistorial'],
    ['calcAjustes', 'calcPanelAjustes'],
  ]);

  // 60 IQ
  const iqCampo = $('iqPregunta');

  $('calc60iq')?.addEventListener('click', () => {
    if (!$('calcPanel60iq')?.hidden) iqCampo?.focus();
  });

  $('iqForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pregunta = iqCampo?.value.trim();
    if (!pregunta) return;
    iqCampo.value = '';
    preguntarAl60IQ(pregunta);
  });

  $('iqCharla')?.addEventListener('click', (e) => {
    const ejemplo = e.target.closest('.calc-iq-ejemplo');
    if (ejemplo) preguntarAl60IQ(ejemplo.textContent.trim());
  });

  // Panel de fuentes: se consultan la primera vez que se abre, no antes,
  // porque preguntarle a las ocho fuentes cuesta y casi nadie lo abre.
  const panelFuentes = $('calcPanelAjustes');
  $('calcAjustes')?.addEventListener('click', () => {
    if (!panelFuentes.hidden && !fuentes) cargarFuentes();
  });

  // En el teléfono el panel tapa la calculadora, así que al elegir se cierra
  // y se ve enseguida el efecto del cambio.
  panelFuentes?.addEventListener('click', (e) => {
    const ficha = e.target.closest('.fuente');
    if (!ficha || ficha.disabled) return;

    guardarEleccion(ficha.dataset.grupo, ficha.dataset.id);
    pintarFuentes();
    aplicarEleccion();
    paneles.cerrar(panelFuentes);
  });

  for (const [, idCaja] of GRUPOS) {
    const caja = $(idCaja);
    if (caja) navegarConFlechas(caja, '.fuente', (b) => b.focus());
  }

  const panelTema = $('calcPanelTema');
  panelTema?.addEventListener('click', (e) => {
    const boton = e.target.closest('.tema');
    if (!boton) return;

    aplicarTema(boton.dataset.tema);
    paneles.cerrar(panelTema);
  });

  const listaTemas = $('listaTemas');
  if (listaTemas) navegarConFlechas(listaTemas, '.tema', (b) => { aplicarTema(b.dataset.tema); b.focus(); });

  const panelHist = $('calcPanelHistorial');
  $('calcHistorial')?.addEventListener('click', () => {
    if (!panelHist.hidden) pintarHistorial();
  });

  // Tocar una línea repite ese cálculo
  panelHist?.addEventListener('click', (e) => {
    const linea = e.target.closest('.hist');
    if (!linea) return;

    if (monto) monto.value = formatearTexto(linea.dataset.monto);
    elegirModo(linea.dataset.modo);
    paneles.cerrar(panelHist);
  });

  $('calcBorrarHistorial')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(HISTORIAL);
    } catch {
      // nada que borrar
    }
    pintarHistorial();
  });

  $('calcRestablecer')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(MEMORIA);
    } catch {
      // sin almacenamiento no hay nada que borrar
    }
    pintarFuentes();
    aplicarEleccion();
    paneles.cerrar(panelFuentes);
  });

  // El p2p se mueve durante el dia; el BCV no. Se refresca solo cada minuto.
  programarRefresco();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(refresco);
      refresco = null;
    } else {
      cargarTasas({ forzar: true });
      programarRefresco();
    }
  });

  // Al recuperar la señal se vuelve a preguntar en el acto, sin esperar al
  // minuto: es justo cuando lo que hay en pantalla está más viejo.
  window.addEventListener('online', () => cargarTasas({ forzar: true }));
  window.addEventListener('offline', () => { if (tasas) pintarTasas({ falloDeRed: true }); });

  // Al salir no queda nada corriendo: importa en la app instalada, que no
  // descarga la página entre aperturas.
  window.addEventListener('pagehide', () => {
    clearInterval(refresco);
    clearTimeout(apunteEnCurso);
    clearTimeout(resumenEnCurso);
  });
});
