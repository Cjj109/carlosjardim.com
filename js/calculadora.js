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
  claro: '#e6ebf3',
  navidad: '#0b1410',
  miguel: '#0b0910',
  halloween: '#0c0912',
  zachiro: '#ebe7dc',
  sasha: '#f3e8d9',
  turco: '#fff6e8',
  'turco-amarillo': '#ffb800',
  'turco-morado': '#581c87',
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

/* ---------- Miguel: la pala ----------
   Tocar la pala hace que golpee en ese momento en vez de esperar al
   siguiente de sus diez segundos. El golpe es CSS (@keyframes raquetazo,
   vuelo-pelota, parabola y estela), así que aquí no se dispara nada: se
   adelanta el reloj de las cuatro animaciones al punto en que la pala
   empieza a echarse atrás. Las cuatro al mismo punto, que es lo que las
   mantiene a la par, y el bucle sigue solo desde ahí.

   Si ya está golpeando o la pelota va por el aire, el toque no hace nada:
   devolver el reloj la haría desaparecer a medio vuelo. */
const GOLPE = ['raquetazo', 'vuelo-pelota', 'parabola', 'estela'];
// El punto de @keyframes raquetazo donde empieza a echarse atrás
const ECHARSE_ATRAS = 0.78;

function darALaPelota() {
  // Sin las cuatro (otro tema, o movimiento reducido) no hay golpe que dar
  const animaciones = document.querySelector('.padel')
    ?.getAnimations({ subtree: true })
    .filter((a) => GOLPE.includes(a.animationName)) || [];
  if (animaciones.length !== GOLPE.length) return;

  const { duration, delay } = animaciones[0].effect.getTiming();
  const ahora = animaciones[0].currentTime;
  // Sin reloj que leer no hay golpe: poner NaN en currentTime lanza un error
  if (!Number.isFinite(ahora) || !(duration > 0)) return;
  // Lo que lleva de la vuelta actual, contando el retraso negativo del CSS
  const dentro = (((ahora - delay) % duration) + duration) % duration;
  if (dentro >= ECHARSE_ATRAS * duration) return;

  const golpe = ahora - dentro + ECHARSE_ATRAS * duration;
  animaciones.forEach((a) => { a.currentTime = golpe; });
}

/* ---------- Elección de fuentes ---------- */

// La venta y no la media: es lo que te pagan de verdad al vender, que es para
// lo que casi siempre se abre esta calculadora. Quien tenga guardada la vieja
// 'binance' cae en la primera del grupo, que es justo la venta.
const POR_DEFECTO = {
  bcv: 'bcv',
  paralelo: 'binance-venta',
  zelle: 'zelle',
  facebank: 'facebank',
  wally: 'wally',
  zinli: 'zinli',
};
const GRUPOS = [
  ['bcv', 'fuentesBcv'],
  ['paralelo', 'fuentesParalelo'],
  ['zelle', 'fuentesZelle'],
  ['facebank', 'fuentesFacebank'],
  ['wally', 'fuentesWally'],
  ['zinli', 'fuentesZinli'],
];

function fuentesElegidas() {
  try {
    const guardado = JSON.parse(localStorage.getItem(MEMORIA));
    return guardado && typeof guardado === 'object' ? guardado : {};
  } catch {
    return {};
  }
}

/**
 * ¿Hay alguna fuente elegida que se aparte de la que ya trae /api/bcv?
 *
 * Si no la hay —y es el caso de casi todo el mundo— no hace falta sustituir
 * nada: el endpoint ya devuelve las de siempre, y pisarlas con la foto de
 * /api/fuentes solo servía para congelarlas.
 */
function hayEleccionPropia() {
  const elegidas = fuentesElegidas();
  return GRUPOS.some(([grupo]) => elegidas[grupo] && elegidas[grupo] !== POR_DEFECTO[grupo]);
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

/* Los dólares que se venden en p2p —Zelle, Facebank, Wally, Zinli— son la
   misma cuenta con distinto nombre: la venta del USDT entre cuántos de esos
   dólares cuesta un USDT. Van en una lista para que las filas, las tarjetas
   y el 60 IQ los traten igual, y el siguiente que llegue sea una línea. */
const METODOS = [
  { id: 'zelle', nombre: 'Zelle' },
  { id: 'facebank', nombre: 'Facebank' },
  { id: 'wally', nombre: 'Wally' },
  { id: 'zinli', nombre: 'Zinli' },
];

const COLORES = {
  usd: 'var(--calc-usd)',
  eur: 'var(--calc-eur)',
  usdt: 'var(--calc-usdt)',
  zelle: 'var(--calc-zelle)',
  facebank: 'var(--calc-facebank)',
  wally: 'var(--calc-wally)',
  zinli: 'var(--calc-zinli)',
  bs: 'var(--calc-texto)',
};

/* El nombre de la tasa oficial en todo lo que se lee.
   Las fichas que dan OTRA cifra que la del día —la que viene, la de
   Farmatodo— cambian también el nombre: "Dólar BCV" con el número de
   Farmatodo debajo sería decir una cosa y enseñar otra. Va por moneda porque
   el euro solo cambia de fuente si la elegida lo trae. */
const NOMBRE_OFICIAL = { 'bcv-farmatodo': 'Farmatodo', 'bcv-proxima': 'BCV que viene' };
const nombreOficial = (moneda = 'usd') => NOMBRE_OFICIAL[tasas?.[moneda]?.id] || 'BCV';

/* Cómo se llama cada tasa cuando hay que escribirla en una frase.
   No hay tabla nueva a propósito: los métodos ya traen su nombre en METODOS y
   el oficial cambia según la ficha elegida, así que una tabla aparte se
   quedaría diciendo "Dólar BCV" el día que alguien elija Farmatodo. */
const nombreDeTasa = (id) => {
  if (id === 'usd') return `dólar ${nombreOficial()}`;
  if (id === 'eur') return 'euro BCV';
  if (id === 'usdt') return 'USDT';
  return METODOS.find((m) => m.id === id)?.nombre || id;
};

/* ---------- Qué tasas se ven ----------

   Cada quien elige las suyas en Ajustes. Quien no toca euros no tiene por
   qué verlos en cada cuenta, y quien cobra por Facebank la quiere al lado de
   las demás. Se guarda en el navegador, como el tema y las fuentes.

   Facebank sale apagada de entrada: la usa poca gente, y a los demás les
   metería una tarjeta y una fila más en cada cuenta sin haberla pedido. */

const VER = 'calc-ver';
const TODAS = ['usd', 'eur', 'usdt', ...METODOS.map((m) => m.id)];
const VER_POR_DEFECTO = ['usd', 'eur', 'usdt', 'zelle'];

// Los modos que se hacen sobre una tasa concreta. Sin ella, la pregunta de
// la pestaña no tiene sentido para quien la escondió, y la pestaña se va.
const MODO_NECESITA = { bcv: 'usd', usdt: 'usdt' };

function leerVisibles() {
  try {
    const guardado = JSON.parse(localStorage.getItem(VER));
    const validas = Array.isArray(guardado) ? guardado.filter((id) => TODAS.includes(id)) : [];
    if (validas.length) return validas;
  } catch {
    // Sin almacenamiento, las de siempre
  }
  return VER_POR_DEFECTO;
}

// En una variable y no leyendo localStorage cada vez: calcular() la mira en
// cada tecla
let visibles = leerVisibles();

function guardarVisibles(lista) {
  visibles = lista;
  try {
    localStorage.setItem(VER, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento la elección dura lo que la visita
  }
}

const modoDisponible = (m) => !!MODOS[m] && (!MODO_NECESITA[m] || visibles.includes(MODO_NECESITA[m]));

/* Cuántas tarjetas van en cada fila.
   Con siete tasas posibles ya no vale una regla por cada número. Se reparten
   en filas lo más parejas que se pueda, con las más llenas arriba —siete en
   el teléfono son 3, 2 y 2— y nunca una sola descolgada al final. El máximo
   por fila depende del ancho: 3 en el teléfono, 4 con sitio, 5 en grande. */
const ANCHO_MEDIO = window.matchMedia('(min-width: 560px)');
const ANCHO_GRANDE = window.matchMedia('(min-width: 900px)');

function repartirTarjetas() {
  const tarjetas = [...document.querySelectorAll('.calc-tasas .tasa')].filter((t) => !t.hidden);
  const maximo = ANCHO_GRANDE.matches ? 5 : ANCHO_MEDIO.matches ? 4 : 3;
  const n = tarjetas.length;
  const filas = Math.max(1, Math.ceil(n / maximo));

  let i = 0;
  for (let f = 0; f < filas; f++) {
    // Las primeras filas se llevan el sobrante: 7 entre 3 filas son 3, 2, 2
    const enEsta = Math.floor(n / filas) + (f < n % filas ? 1 : 0);
    for (let k = 0; k < enEsta; k++, i++) {
      tarjetas[i].style.setProperty('--por-fila', enEsta);
      tarjetas[i].dataset.porFila = String(enEsta);
    }
  }
}

/** Enseña lo elegido y esconde lo demás, en toda la página */
function aplicarVisibles() {
  document.querySelectorAll('.calc-tasas .tasa').forEach((tarjeta) => {
    tarjeta.hidden = !visibles.includes(tarjeta.dataset.tasa);
  });
  repartirTarjetas();

  document.querySelectorAll('#calcModos .calc-modo').forEach((boton) => {
    boton.hidden = !modoDisponible(boton.dataset.modo);
  });

  // En el panel, solo las fuentes de lo que se ve
  document.querySelectorAll('#calcPanelAjustes [data-tasas]').forEach((grupo) => {
    grupo.hidden = !grupo.dataset.tasas.split(' ').some((id) => visibles.includes(id));
  });

  // Al menos una: la última que queda no se deja apagar
  document.querySelectorAll('#calcVer input').forEach((casilla) => {
    casilla.checked = visibles.includes(casilla.value);
    casilla.disabled = casilla.checked && visibles.length === 1;
  });

  // Si la pestaña abierta se acaba de ir, a la primera
  if (!modoDisponible(modo)) elegirModo('divisa');
  else calcular();
}

/* ---------- Montos rápidos ----------

   Los cinco botones eran fijos y los mismos para los cuatro modos. En tres de
   ellos se teclean divisas y 10/50/100/350/1.000 tiene sentido; en Bolívares
   se teclean bolívares, y ahí los cinco eran inservibles: el más grande, mil
   bolívares, son 1,23 $.

   Ahora cada modo trae los suyos y además se adaptan. Los dos primeros no se
   mueven —un botón que cambia de sitio en cada visita se vuelve imposible de
   acertar con el pulgar— y los tres siguientes salen de lo que de verdad se
   usa: primero lo tuyo, y si no hay historial, lo que más usa la gente. */

const MONTOS_BASE = {
  divisa: [10, 50, 100, 350, 1000],
  bcv: [10, 50, 100, 350, 1000],
  usdt: [10, 50, 100, 350, 1000],
  // En bolívares, con el dólar sobre 800, esto es entre 6 y 600 dólares
  bs: [5000, 15000, 50000, 100000, 500000],
};

const FIJOS = 2;
const RAPIDOS = 5;

/**
 * Redondea a dos cifras significativas: 347 → 350, 15.234 → 15.000.
 *
 * Sirve para dos cosas a la vez. Agrupa montos parecidos, porque nadie repite
 * "15.234" pero mucha gente ronda los quince mil; y da números que apetece
 * tocar, que es de lo que va un botón de atajo. De paso, lo que se manda al
 * contador global va redondeado y no es el importe exacto de nadie.
 */
function redondear(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const magnitud = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitud) * magnitud;
}

// Con una sola vez no basta para ganarse un botón: un monto tecleado una vez
// puede ser un error o algo irrepetible, y desplazaría a uno útil. Con dos ya
// hay costumbre.
const MINIMO_USOS = 2;

/** Los montos que más usa esta persona en este modo, de más a menos */
function montosPersonales(modoPedido) {
  const cuenta = new Map();

  for (const h of leerHistorial()) {
    if (h.modo !== modoPedido) continue;
    const m = redondear(Number(h.monto));
    if (!m) continue;
    cuenta.set(m, (cuenta.get(m) || 0) + 1);
  }

  // El historial ya viene del más nuevo al más viejo, así que a igualdad de
  // usos gana el más reciente sin tener que mirar fechas.
  return [...cuenta.entries()]
    .filter(([, veces]) => veces >= MINIMO_USOS)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);
}

// Lo que más usa todo el mundo. Se pide una vez y solo si el endpoint existe:
// mientras no haya base de datos detrás, esto se queda vacío y mandan los
// valores por defecto, que es exactamente lo que se quiere.
let montosGlobales = {};

const APORTAR = 'calc-aportar';

/**
 * Si esta persona suma sus montos al contador de todos.
 *
 * Por defecto sí, porque lo que viaja es un número redondeado a dos cifras
 * significativas y el modo: ni identificador, ni importe exacto, ni nada que
 * apunte a nadie. Pero se puede apagar, y se respeta si el navegador pide no
 * ser rastreado —cuesta una línea y es la respuesta correcta a alguien que ya
 * ha dicho lo que quiere.
 */
function aportaMontos() {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
  try {
    return localStorage.getItem(APORTAR) !== 'no';
  } catch {
    return true;
  }
}

/**
 * La sesión se acabó mientras la app estaba abierta.
 *
 * Pasa cuando desde otro aparato se quita esta llave, o cuando caduca la
 * cookie. Sin esto, la calculadora se quedaba abierta para siempre con las
 * últimas cifras en pantalla: el fallo se recogía como "no se pudieron
 * cargar las tasas" y quien mirara veía números viejos sin saber que ya no
 * tenía entrada. Quitarle la llave a un teléfono perdido tiene que notarse
 * en cuanto lo usen, no la próxima vez que a alguien se le ocurra recargar.
 *
 * Se manda a la puerta una sola vez: varias peticiones fallan a la vez y no
 * hace falta un redirección por cada una.
 */
let saliendo = false;
function fueraDeSesion(respuesta) {
  if (respuesta?.status !== 401) return false;
  if (saliendo) return true;
  saliendo = true;
  const volver = encodeURIComponent(location.pathname);
  location.replace(`/acceso?volver=${volver}`);
  return true;
}

async function cargarMontosGlobales() {
  try {
    const respuesta = await fetch('/api/montos', { signal: AbortSignal.timeout(4000) });
    if (fueraDeSesion(respuesta) || !respuesta.ok) return;

    const datos = await respuesta.json();
    const montos = datos?.montos;
    if (!montos || typeof montos !== 'object') return;

    /* Solo listas de montos válidos, y solo de los modos que existen. Con
       cualquier otra cosa —un null, que para typeof también es un objeto, o
       un número suelto donde iba una lista— pintarRapidos reventaba en cada
       cambio de pestaña: ya no sería una estadística que falta, sino la
       calculadora rota. */
    montosGlobales = Object.fromEntries(
      Object.keys(MONTOS_BASE).map((m) => [
        m,
        Array.isArray(montos[m]) ? montos[m].map(Number).filter((n) => Number.isFinite(n) && n > 0) : [],
      ])
    );
    pintarRapidos(modo);
  } catch {
    // Sin contador global no pasa nada: quedan los tuyos y los de siempre
  }
}

/** Suma un monto al contador de todos. Silencioso a propósito. */
function aportarMonto(modoUsado, monto) {
  const redondo = redondear(Number(monto));
  if (!redondo || !MODOS[modoUsado] || !aportaMontos()) return;

  // keepalive: esto suele pasar justo cuando se sale de la página
  fetch('/api/montos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modo: modoUsado, monto: redondo }),
    keepalive: true,
  }).catch(() => {
    // Que falle no le importa a nadie: es una estadística, no el cálculo
  });
}

/**
 * La etiqueta del botón, con el mismo formato que tendrá en el campo.
 *
 * Nada de "15 k": el botón tiene que decir exactamente lo que va a escribir,
 * porque justo debajo se va a ver "15.000" en la caja. Y ese "k" tampoco es
 * como se lee un número en Venezuela.
 */
function etiquetaMonto(n) {
  return new Intl.NumberFormat('es-VE').format(n);
}

function pintarRapidos(modoPedido) {
  const caja = $('calcRapidos');
  if (!caja) return;

  const base = MONTOS_BASE[modoPedido] || MONTOS_BASE.divisa;
  const fijos = base.slice(0, FIJOS);

  // Lo tuyo manda; detrás, lo de todos; y al final los de siempre para
  // rellenar mientras no haya ni una cosa ni otra.
  const candidatos = [
    ...montosPersonales(modoPedido),
    ...(montosGlobales[modoPedido] || []),
    ...base.slice(FIJOS),
  ];

  const elegidos = [];
  for (const m of candidatos) {
    if (elegidos.length >= RAPIDOS - FIJOS) break;
    if (!fijos.includes(m) && !elegidos.includes(m)) elegidos.push(m);
  }

  // De menor a mayor: la fila se lee igual siempre aunque cambie el contenido
  const fila = [...fijos, ...elegidos].sort((a, b) => a - b);

  caja.innerHTML = fila
    .map((m) => `<button type="button" data-monto="${esc(m)}">${esc(etiquetaMonto(m))}</button>`)
    .join('');
}

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
let ultimaBuena = 0;

async function cargarTasas({ forzar = false, primera = false } = {}) {
  const boton = $('calcRefrescar');
  const aviso = $('calcActualizado');

  // Nada de guardia por "ya hay una en curso": todas las llamadas menos la
  // primera pasan forzar:true, asi que nunca cortaba nada. Quien protege el
  // orden es el testigo `peticion`, que descarta la respuesta que llega tarde.
  const mia = ++peticion;
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
    // Si la de la cabecera vino con error, se reintenta en vez de darse por
    // vencido: un 502 pasajero en la carga inicial dejaba la app sin tasas
    // cuando un segundo intento habria funcionado. Un Response con ok:false
    // es truthy, asi que el `||` de antes se quedaba con el.
    const adelantada = enVuelo ? await enVuelo : null;
    const respuesta = adelantada?.ok
      ? adelantada
      : await fetch(API, { cache: 'no-store' });

    if (fueraDeSesion(respuesta)) return;
    if (!respuesta?.ok) throw new Error(`HTTP ${respuesta ? respuesta.status : 'sin respuesta'}`);

    const datos = await respuesta.json();
    if (mia !== peticion) return; // llegó tarde: manda una más nueva

    tasas = datos;
    ultimaBuena = Date.now();

    /* Aquí estaba el fallo más grave de todos.
       Antes: `if (fuentes) aplicarEleccion()`. Bastaba abrir el panel de
       fuentes UNA vez para que `fuentes` quedara cargado, y a partir de ahí
       cada refresco pisaba las tasas recién traídas con la foto vieja de ese
       momento. El pie seguía estampando la hora actual, así que la tasa se
       congelaba sin que nada lo dijera: justo lo que esta app existe para
       evitar.

       Ahora solo se sustituye si de verdad hay algo que sustituir —una
       elección que se aparta de lo que /api/bcv ya trae— y en ese caso se
       vuelven a pedir las fuentes, que si no se congelarían igual.

       Y también en la PRIMERA carga, que es donde se escapaba. Con
       `fuentes && …` la elección solo volvía si en esta visita ya se había
       abierto el panel: al reabrir la app se calculaba con la de siempre sin
       decir nada. Con la de Farmatodo eso pasaba justo el sábado, que es
       para lo que se elige.

       Mientras llegan se pinta lo de /api/bcv, que no engaña: la tarjeta y
       las filas llevan el nombre de su tasa, y al llegar cambian número y
       nombre a la vez. En los refrescos ya hay fuentes y no se pinta nada de
       más, que si no la de siempre parpadearía cada minuto. */
    if (hayEleccionPropia()) {
      if (!fuentes) {
        pintarTasas();
        calcular();
      }
      cargarFuentes();
    } else {
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
    if (mia === peticion && boton) boton.disabled = false;
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
    ['tasaFacebank', 'facebank'],
    ['tasaWally', 'wally'],
    ['tasaZinli', 'zinli'],
  ];

  for (const [idValor, id] of campos) {
    const valor = $(idValor);
    if (!valor) continue;
    const tasa = tasaDe(id);
    valor.textContent = tasa ? num(tasa) : '—';
  }

  // El nombre va con la fuente elegida, igual que en las filas
  const nombreUsd = $('nombreUsd');
  if (nombreUsd) nombreUsd.textContent = `Dólar ${nombreOficial()}`;
  const nombreEur = $('nombreEur');
  if (nombreEur) nombreEur.textContent = `Euro ${nombreOficial('eur')}`;

  const aviso = $('calcActualizado');
  // La tira sobre la caja subida, al día con las tarjetas
  if (document.querySelector('.calc-panel.is-subida')) pintarTira();

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

  /* La fecha del BCV sale de las tarjetas —las hacía más altas— pero importa,
     y ahora dice otra cosa. Antes ponía "BCV rige 08/09" mientras convertía
     con esa misma tasa del 8: avisaba de la trampa sin quitarla. Ahora la
     cifra que se usa es la que rige HOY, así que la fecha la confirma, y la
     que el BCV ya colgó para mañana se anuncia detrás. */
  const bcv = tasas?.usd;
  // "desde el" y no "del": la fecha es desde cuándo se aplica, que un fin de
  // semana no coincide con la fecha valor que enseña el BCV.
  const vigencia = bcv?.date ? ` · ${nombreOficial()} desde el ${fecha(bcv.date)}` : '';
  const proxima = bcv?.proxima?.rate
    ? ` · luego ${num(Number(bcv.proxima.rate))} el ${fecha(bcv.proxima.date)}`
    : '';

  aviso.textContent = `${hora} · ${origen}${vigencia}${proxima}`;
}

/* El desplazamiento de la página cuando la caja del monto sube o el panel
   se centra. Con la misma curva y la misma duración que los pliegues de la
   pregunta y la tira (--curva-caja y --tiempo-caja en el CSS, la de
   easeOutQuart: arranca con el toque y se posa despacio), para que la
   página, la caja y la tira se muevan como una sola cosa. El smooth del
   navegador tiene su propia curva y su propia duración, distintas en cada
   uno, y no se puede acompasar con nada.

   Con un ancla, manda ella. El desplazamiento no sigue entonces una curva
   propia: en cada fotograma se pone la página donde haga falta para que el
   ancla —la caja del monto— esté donde le toca en SU curva. Lo que hay
   encima de la caja se pliega a la vez con transiciones del CSS, que nunca
   van exactamente al paso del JS (en un teléfono basta un fotograma
   perdido), y con la página siguiendo su propia curva la caja iba y volvía
   unos píxeles: hasta 10, medido con siete tasas. Midiendo la caja en cada
   fotograma, se mueve siempre en un solo sentido, pase lo que pase
   alrededor.

   Se corta en cuanto el dedo toca la pantalla: una animación que pelea con
   quien está desplazando es peor que ninguna. Y sin movimiento si el
   sistema lo pide. */
const TIEMPO_CAJA = 380;
const SIN_MOVIMIENTO = window.matchMedia('(prefers-reduced-motion: reduce)');
let desplazando = 0;

function animarScroll(destino, { ancla = null, anclaFinal = null } = {}) {
  cancelAnimationFrame(desplazando);
  const desde = window.scrollY;
  const distancia = destino - desde;
  if (!ancla && Math.abs(distancia) < 1) return;
  if (SIN_MOVIMIENTO.matches) {
    window.scrollTo(0, destino);
    return;
  }

  // Dónde se ve el ancla ahora y dónde se tiene que ver al final
  const vistaDesde = ancla?.getBoundingClientRect().top ?? 0;
  const vistaHasta = ancla ? anclaFinal - destino : 0;
  let anterior = null;
  let quietos = 0;

  /* El reloj arranca en el primer fotograma y no al llamar: las transiciones
     del CSS que acompañan al desplazamiento también empiezan a contar en ese
     fotograma. Contando desde la llamada, el desplazamiento iba un fotograma
     por delante de los pliegues, y cuando se movían en sentidos contrarios
     la caja daba un vaivén de unos píxeles. */
  let inicio = null;
  const paso = (ahora) => {
    inicio ??= ahora;
    const t = Math.min(1, (ahora - inicio) / TIEMPO_CAJA);
    const e = 1 - (1 - t) ** 4;

    if (!ancla) {
      window.scrollTo(0, desde + distancia * e);
      if (t < 1) desplazando = requestAnimationFrame(paso);
      return;
    }

    // Dónde está el ancla en la página en este fotograma, se haya plegado
    // lo que se haya plegado encima, y la página donde toque para verla en
    // su sitio de la curva
    const enPagina = ancla.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, enPagina - (vistaDesde + (vistaHasta - vistaDesde) * e));

    // Pasada la curva, unos fotogramas más mientras lo de encima termina de
    // plegarse, para que la caja acabe exactamente en su sitio
    quietos = anterior !== null && Math.abs(enPagina - anterior) < 0.5 ? quietos + 1 : 0;
    anterior = enPagina;
    if (t < 1 || (quietos < 2 && ahora - inicio < TIEMPO_CAJA * 2)) {
      desplazando = requestAnimationFrame(paso);
    }
  };
  desplazando = requestAnimationFrame(paso);
}

/**
 * Un golpecito en el teléfono, si el teléfono sabe darlo.
 *
 * No está en iOS —Safari no implementa vibrate— así que esto es un extra que
 * se nota donde existe y no se echa de menos donde no. Con su try porque
 * algunos navegadores lanzan si la página aún no ha recibido un gesto, y
 * quedarse sin copiar por no poder vibrar sería absurdo.
 */
/* El plan B para el iPhone.

   Safari no implementa navigator.vibrate y no hay indicios de que vaya a
   hacerlo, así que en iOS el golpecito no existía. Lo único que sí da háptico
   ahí es un interruptor nativo: desde iOS 17.4, cambiar un
   <input type="checkbox" switch> dispara la retroalimentación del sistema.

   Así que se tiene uno escondido y se le da al interruptor cuando no hay
   vibración de verdad. Es un truco y se sabe: si Apple lo quita, aquí no se
   rompe nada —vuelve a no haber golpecito, que es donde estábamos. */
let interruptorHaptico = null;

function hapticoDeApple() {
  try {
    if (!interruptorHaptico) {
      interruptorHaptico = document.createElement('input');
      interruptorHaptico.type = 'checkbox';
      interruptorHaptico.setAttribute('switch', '');
      // Fuera de la vista pero dentro de la página: display:none no dispara nada
      interruptorHaptico.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
      interruptorHaptico.setAttribute('aria-hidden', 'true');
      interruptorHaptico.tabIndex = -1;
      document.body.appendChild(interruptorHaptico);
    }
    interruptorHaptico.checked = !interruptorHaptico.checked;
    interruptorHaptico.dispatchEvent(new Event('change', { bubbles: false }));
  } catch {
    // Sin háptico se sigue igual: nunca fue imprescindible
  }
}

/**
 * Un golpecito, con lo que tenga cada teléfono.
 *
 * Android tiene la API de vibración y con eso basta. En iPhone no existe, así
 * que se prueba el interruptor de arriba. Con su try porque algunos
 * navegadores lanzan si la página aún no ha recibido un gesto, y quedarse sin
 * copiar por no poder vibrar sería absurdo.
 */
function toque(ms = 8) {
  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(ms)) return;
  } catch {
    // Cae al plan B
  }
  hapticoDeApple();
}

/* Cuánto dura el aviso de deshacer. Seis segundos: lo que se tarda en darse
   cuenta de que uno tocó donde no era, sin quedarse tapando la pantalla. */
const DESHACER_DURA = 6000;
let deshacerEnCurso = null;

/**
 * Avisa de algo que se acaba de hacer y ofrece deshacerlo.
 *
 * El reparto: no preguntar antes y sí poder volver atrás después. Confirmar
 * cada vez castiga a quien acierta, que son casi todas las veces; deshacer
 * solo aparece cuando hizo falta y se va solo cuando no.
 *
 * El manejador se pone con onclick a propósito, no con addEventListener: así
 * un aviso nuevo reemplaza al anterior en vez de apilarse, y no puede quedar
 * un botón que deshaga dos cosas de golpe.
 */
function avisarDeshacer(texto, deshacer) {
  const caja = $('calcDeshacer');
  const etiqueta = $('calcDeshacerTexto');
  const boton = $('calcDeshacerBoton');
  if (!caja || !etiqueta || !boton) return;

  clearTimeout(deshacerEnCurso);
  etiqueta.textContent = texto;
  caja.hidden = false;

  const cerrar = () => {
    clearTimeout(deshacerEnCurso);
    deshacerEnCurso = null;
    caja.hidden = true;
    boton.onclick = null;
  };

  boton.onclick = () => {
    deshacer();
    toque(8);
    cerrar();
  };

  deshacerEnCurso = setTimeout(cerrar, DESHACER_DURA);
}

const cortarScroll = () => cancelAnimationFrame(desplazando);
window.addEventListener('touchstart', cortarScroll, { passive: true });
window.addEventListener('wheel', cortarScroll, { passive: true });

/* La tira de tasas que acompaña a la caja del monto cuando sube en el
   teléfono (ver subirCaja). Sale de las tarjetas visibles, leídas tal cual:
   así lleva el mismo formato y el nombre de la fuente elegida, y las que se
   escondieron no están. Van como tarjetas en miniatura: todas en una fila
   si son cuatro o menos, y si no en dos filas lo más parejas posible
   (--cols), que una sola descolgada al final se ve rota. Con nombres
   cortos, que cada una tiene poco más de un dedo de ancho. */
const NOMBRE_EN_TIRA = { eur: 'Euro', usdt: 'USDT' };

function pintarTira() {
  const tira = $('calcTira');
  if (!tira) return;

  const tarjetas = [...document.querySelectorAll('.calc-tasas .tasa:not([hidden])')];
  tira.style.setProperty('--cols', tarjetas.length <= 4 ? tarjetas.length : Math.ceil(tarjetas.length / 2));

  tira.innerHTML = tarjetas
    .map((tarjeta) => {
      const id = tarjeta.dataset.tasa;
      const nombre = id === 'usd'
        ? nombreOficial()
        : NOMBRE_EN_TIRA[id] || tarjeta.querySelector('.tasa-nombre')?.textContent.trim();
      const valor = tarjeta.querySelector('.tasa-valor')?.textContent.trim() || '—';
      return `<span class="tira-tasa" data-tasa="${esc(id)}"><b>${esc(nombre)}</b><span class="tira-valor">${esc(valor)}</span></span>`;
    })
    .join('');
}

/** Lo que el 60 IQ ha aprendido de quien mira, y cómo quiere que le hable */
async function pintarMemoria() {
  const caja = $('iqNotas');
  if (!caja) return;
  try {
    const r = await fetch('/api/iq-memoria', { credentials: 'same-origin' });
    const d = await r.json();
    // `lineas` es lo nuevo; `notas` cubre una app instalada de antes de esto
    pintarNotas(d.lineas ?? (d.notas?.trim() ? d.notas.trim().split('\n') : []));
    marcarTono(d.tono);
  } catch {
    caja.innerHTML = '<li class="calc-iq-vacio">No se pudo consultar.</li>';
  }
}

/** Cada nota en su línea, con la ✕ que la tacha */
function pintarNotas(lineas) {
  const caja = $('iqNotas');
  if (!caja) return;

  caja.innerHTML = lineas.length
    ? lineas
        .map((l) => String(l).replace(/^-\s*/, '').trim())
        .filter(Boolean)
        .map(
          (l, i) =>
            `<li class="calc-iq-nota"><span>${esc(l)}</span>` +
            `<button type="button" class="calc-iq-quitar" data-linea="${i}" aria-label="Que olvide: ${esc(l)}">×</button></li>`
        )
        .join('')
    : '<li class="calc-iq-vacio">Todavía nada.</li>';
}

/** Deja marcado el tono que tiene puesto */
function marcarTono(tono) {
  const grupo = $('iqTonos');
  if (!grupo) return;

  for (const boton of grupo.querySelectorAll('button[data-tono]')) {
    const suyo = boton.dataset.tono === (tono || 'sin_freno');
    boton.setAttribute('aria-checked', String(suyo));
    boton.classList.toggle('is-activo', suyo);
    // Un radiogroup se recorre con flechas, así que solo el elegido entra con Tab
    boton.tabIndex = suyo ? 0 : -1;
  }
}

/**
 * Que se olvide de ti: lo aprendido y la conversación guardada.
 *
 * Las dos cosas juntas, porque "olvídame" dejando doce turnos guardados no es
 * olvidar. Esto sí pide confirmación —al revés que limpiar la pantalla—
 * porque aquí sí se pierde algo que no vuelve.
 */
async function olvidarMemoria() {
  if (!confirm('¿Que olvide todo lo que sabe de ti? Esto no se puede deshacer.')) return;

  /* Con su try, como pintarMemoria. Sin él, sin señal el fetch rechazaba y
     el error se quedaba sin atender: el botón no hacía nada y nadie decía
     por qué. Y un borrado que el servidor no hizo no se da por hecho: la
     charla de esta pestaña solo se olvida si de verdad se borró. */
  const caja = $('iqNotas');
  try {
    const respuesta = await fetch('/api/iq-memoria', { method: 'DELETE' });
    if (fueraDeSesion(respuesta)) return;
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  } catch (error) {
    console.warn('No se pudo borrar la memoria del 60 IQ:', error);
    if (caja) caja.textContent = navigator.onLine ? 'No se pudo borrar. Intenta de nuevo.' : 'Sin conexión: no se pudo borrar.';
    return;
  }

  iqCharlaPrevia.length = 0;
  await pintarMemoria();
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
  aportarMonto(entrada.modo, entrada.monto);

  /* Y una copia para el 60 IQ, que vive en el servidor y no en este aparato.
     Sin esperarla y sin que importe si falla: el cálculo ya está hecho y
     guardado aquí, esto solo sirve para que el asistente te conozca igual
     cuando abras desde otro teléfono. */
  fetch('/api/calculos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fecha: entrada.fecha,
      modo: entrada.modo,
      monto: entrada.monto,
      destino: entrada.destino,
      resultado: entrada.resultado,
    }),
  }).catch(() => {});

  try {
    localStorage.setItem(HISTORIAL, JSON.stringify(lista.slice(0, HISTORIAL_MAX)));
  } catch {
    // Sin almacenamiento el historial simplemente no se guarda
  }

  pintarHistorial();
  pintarRapidos(modo);
}

function horaDe(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

/** El día de un apunte, para agrupar: "Hoy", "Ayer" o "Martes 8 de septiembre" */
function diaDe(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';

  // El año solo si no es este, que casi nunca hace falta
  const texto = d.toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== hoy.getFullYear() && { year: 'numeric' }),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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

  /* Agrupado por día: la fecha una vez, arriba de su grupo, y en cada línea
     solo la hora. Con la fecha repetida en todas, "8/9 · 07:01 p. m." cinco
     veces seguidas era ruido que había que leer para saber que no decía nada.
     El color va en la línea entera y no solo en la cifra: de ahí sale
     también la franja de la izquierda, como en los resultados. */
  let diaAnterior = null;
  caja.innerHTML = lista.map((h) => {
    const dia = diaDe(h.fecha);
    const cabecera = dia && dia !== diaAnterior ? `<p class="hist-dia">${esc(dia)}</p>` : '';
    diaAnterior = dia;

    return `${cabecera}
    <button type="button" class="hist" data-monto="${esc(h.monto)}" data-modo="${esc(h.modo)}"${h.color ? ` style="--color-res:${esc(h.color)}"` : ''}>
      <span class="hist-izq">
        <span class="hist-operacion"><b>${esc(num(Number(h.monto)))} ${esc(h.origen)}</b> <span class="hist-destino">→ ${esc(h.destino)}</span></span>
        <span class="hist-cuando">${esc(horaDe(h.fecha))}</span>
      </span>
      <span class="hist-der">
        <span class="hist-valor">${esc(h.resultado)}</span>
        ${h.tasa > 0 ? `<span class="hist-tasa">a ${esc(num(Number(h.tasa)))} Bs.</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

/* ---------- Fuentes ---------- */

let cargandoFuentes = false;

async function cargarFuentes() {
  if (cargandoFuentes) return;
  cargandoFuentes = true;

  try {
    const respuesta = await fetch(API_FUENTES, { cache: 'no-store' });
    if (fueraDeSesion(respuesta)) return;
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
  // El motivo lo manda el servidor: "tardo demasiado" y "sin respuesta" se
  // pintaban igual, y de un hueco sin numero se concluye que algo esta roto
  // cuando a lo mejor solo iba despacio.
  const valor = caida
    ? `<span class="fuente-tasa">${esc(f.motivo || 'sin respuesta')}</span>`
    : `<span class="fuente-tasa">${esc(num(Number(f.rate)))}</span>${f.date ? `<span class="fuente-fecha">${esc(fecha(f.date))}</span>` : ''}`;

  // La página del BCV publica por la tarde la tasa del día siguiente. La cifra
  // de la ficha es la que rige —es la que se usará si se elige— y la que ya
  // viene se cuenta aquí, que es una línea de texto y no una columna estrecha.
  const detalle = f.proxima?.rate
    ? `${f.detalle || ''} Ya publicó ${num(Number(f.proxima.rate))}, que entra el ${fecha(f.proxima.date)}.`.trim()
    : f.detalle || '';

  return `
    <button type="button" role="radio" aria-checked="${elegida}" tabindex="${elegida ? 0 : -1}"
      class="fuente${elegida ? ' is-elegida' : ''}${caida ? ' fuente-caida' : ''}"
      data-grupo="${esc(f.grupo)}" data-id="${esc(f.id)}" ${caida ? 'disabled' : ''}>
      <span class="fuente-info">
        <span class="fuente-nombre">
          ${esc(f.nombre)}${elegida ? '<span class="fuente-marca">en uso</span>' : ''}
        </span>
        <span class="fuente-detalle">${esc(detalle)}</span>
      </span>
      <span class="fuente-valor">${valor}</span>
    </button>`;
}

/**
 * La fuente que manda en un grupo: la elegida si responde, si no la primera.
 *
 * Recibe las elecciones ya leídas. Antes llamaba a fuentesElegidas() por su
 * cuenta, y como se invoca tres veces en pintarFuentes y otras tres en
 * aplicarEleccion, eran seis lecturas de localStorage con su JSON.parse por
 * cada repintado.
 */
function fuenteActiva(grupo, elegidas) {
  if (!fuentes) return null;

  const delGrupo = fuentes.filter((f) => f.grupo === grupo && f.rate != null);
  if (!delGrupo.length) return null;

  const elegida = elegidas[grupo] || POR_DEFECTO[grupo];
  return delGrupo.find((f) => f.id === elegida) || delGrupo[0];
}

function pintarFuentes() {
  if (!fuentes) return;

  const elegidas = fuentesElegidas();

  for (const [grupo, idCaja] of GRUPOS) {
    const caja = $(idCaja);
    if (!caja) continue;

    const delGrupo = fuentes.filter((f) => f.grupo === grupo);
    const activa = fuenteActiva(grupo, elegidas);

    caja.innerHTML = delGrupo.length
      ? delGrupo.map((f) => fichaFuente(f, activa != null && f.id === activa.id)).join('')
      : '<p class="calc-historial-vacio">Ninguna respondió</p>';
  }
}

/** Sustituye las tasas por las de las fuentes elegidas */
function aplicarEleccion() {
  if (!fuentes || !tasas) return;

  const elegidas = fuentesElegidas();
  const oficial = fuenteActiva('bcv', elegidas);
  const paralelo = fuenteActiva('paralelo', elegidas);

  if (oficial) {
    // `proxima` viaja con la tasa: sin esto, elegir una fuente a mano borraba
    // el aviso de la tasa que ya viene.
    tasas.usd = {
      rate: oficial.rate,
      date: oficial.date,
      symbol: '$',
      fuente: oficial.nombre,
      // De aquí sale el nombre que se enseña: ver NOMBRE_OFICIAL
      id: oficial.id,
      proxima: oficial.proxima ?? null,
    };
    // El euro va con el dólar. Antes se quedaba siempre con el de /api/bcv, y
    // eso se notaba al elegir "la que viene": el dólar cambiaba y el euro no,
    // enseñando dos tasas de días distintos una al lado de la otra.
    if (oficial.eur) {
      tasas.eur = { rate: oficial.eur, date: oficial.date, symbol: '€', fuente: oficial.nombre, id: oficial.id };
    }
  }
  if (paralelo) {
    tasas.usdt = { rate: paralelo.rate, date: paralelo.date, symbol: '₮', market: paralelo.id, fuente: paralelo.nombre };
  }
  // El Zelle es su propio grupo. Estaba metido entre las fuentes "paralelas",
  // así que elegirlo ahí reemplazaba la tasa del USDT por la del Zelle: las
  // filas seguían diciendo "USDT p2p" mientras mostraban otra cosa, y salía
  // dos veces el mismo número.
  // Lo mismo con Facebank, Wally y Zinli, cada uno en su grupo
  for (const { id } of METODOS) {
    const elegida = fuenteActiva(id, elegidas);
    if (elegida) tasas[id] = { rate: elegida.rate, date: elegida.date, fuente: elegida.nombre };
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
function filasDelModo(monto, { usd, eur, usdt, ...dolares }) {
  // Una fila por cada medio en dólares que tenga tasa, en el orden de METODOS
  const porMetodo = (fila) =>
    METODOS.filter(({ id }) => dolares[id]).map(({ id, nombre }) => fila(id, nombre, dolares[id]));

  if (modo === 'divisa') {
    // El euro va último en los dos modos: es el que menos se usa
    return [
      usd && { nombre: `Dólar ${nombreOficial()}`, tasa: usd, valor: monto * usd, unidad: 'Bs.', color: COLORES.usd },
      usdt && { nombre: 'USDT p2p', tasa: usdt, valor: monto * usdt, unidad: 'Bs.', color: COLORES.usdt },
      ...porMetodo((id, nombre, v) => ({ nombre, tasa: v, valor: monto * v, unidad: 'Bs.', color: COLORES[id] })),
      eur && { nombre: `Euro ${nombreOficial('eur')}`, tasa: eur, valor: monto * eur, unidad: 'Bs.', color: COLORES.eur },
    ];
  }

  if (modo === 'bs') {
    return [
      usd && { nombre: `En dólares ${nombreOficial()}`, tasa: usd, valor: monto / usd, unidad: '$', color: COLORES.usd },
      usdt && { nombre: 'En USDT', tasa: usdt, valor: monto / usdt, unidad: '₮', color: COLORES.usdt },
      ...porMetodo((id, nombre, v) => ({ nombre: `En ${nombre}`, tasa: v, valor: monto / v, unidad: '$', color: COLORES[id] })),
      eur && { nombre: `En euros ${nombreOficial('eur')}`, tasa: eur, valor: monto / eur, unidad: '€', color: COLORES.eur },
    ];
  }

  if (modo === 'bcv') {
    const enBs = monto * usd;
    // Sin euros: quien paga un precio fijado a BCV vende USDT, no euros
    return [
      { nombre: 'Son en bolívares', tasa: usd, valor: enBs, unidad: 'Bs.', color: COLORES.bs },
      usdt && { nombre: 'USDT a vender', tasa: usdt, valor: enBs / usdt, unidad: '₮', color: COLORES.usdt },
      ...porMetodo((id, nombre, v) => ({ nombre: `${nombre} a vender`, tasa: v, valor: enBs / v, unidad: '$', color: COLORES[id] })),
    ];
  }

  const enBs = monto * usdt;
  return [
    { nombre: 'Son en bolívares', tasa: usdt, valor: enBs, unidad: 'Bs.', color: COLORES.usdt },
    // Vendiendo el USDT y cobrando por Zelle salen mas dolares, porque el
    // Zelle vale menos: es el mismo dinero contado en otra moneda.
    ...porMetodo((id, nombre, v) => ({ nombre: `Equivalen en ${nombre}`, tasa: v, valor: enBs / v, unidad: '$', color: COLORES[id] })),
    usd && { nombre: `Equivalen a ${nombreOficial()}`, tasa: usd, valor: enBs / usd, unidad: '$', color: COLORES.usd },
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
  const usdt = tasaDe('usdt');

  // Cada modo pide lo suyo, y solo lo suyo.
  //
  // Antes bastaba con que faltara el BCV para dejar la calculadora entera en
  // blanco, incluso en modos donde es una fila más entre cuatro. Y el BCV es
  // justo la fuente más frágil —la del certificado roto—, así que el corte
  // saltaba precisamente cuando más falta hacía el resto.
  //
  // "Precio BCV" sí lo necesita de verdad: la pregunta entera parte de un
  // precio fijado a esa tasa, sin ella no hay nada que calcular.
  const eur = tasaDe('eur');
  const zelle = tasaDe('zelle');
  // Con que quede UNA tasa hay algo que enseñar. Mirar solo usd y usdt
  // repetía un nivel más abajo el mismo error: una fuente frágil llevándose
  // la pantalla entera por delante.
  if (!usd && !usdt && !eur && !zelle) return vacio(salida, 'Sin tasas ahora mismo');
  if (!usd && modo === 'bcv') return vacio(salida, 'Sin tasa del BCV');
  if (!usdt && modo === 'usdt') return vacio(salida, 'Sin tasa p2p');

  // filasDelModo siempre devuelve un array; la rama que devolvía un texto
  // desapareció al validar los modos antes de llamarla.
  // Lo escondido entra como si no hubiera tasa: filasDelModo ya sabe saltarse
  // una fila sin tasa, así que no hace falta enseñarle nada más. Las filas de
  // "Son en bolívares" no se pierden: sus modos solo existen con su tasa a la
  // vista (MODO_NECESITA).
  const ver = (id, tasa) => (visibles.includes(id) ? tasa : null);
  const filas = filasDelModo(monto, {
    usd: ver('usd', usd),
    eur: ver('eur', eur),
    usdt: ver('usdt', usdt),
    ...Object.fromEntries(METODOS.map(({ id }) => [id, ver(id, tasaDe(id))])),
  });

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
 * clave de OpenRouter no vive aquí sino en /api/60iq, porque cualquier cosa que
 * esté en este archivo la puede leer quien abra el código fuente.
 */
let iqPreguntando = false;

// La conversación, para que un "y a todas las tasas" sepa a qué se refiere.
// Vive en memoria y se va con la pestaña: es una charla, no un archivo.
const iqCharlaPrevia = [];
const IQ_MAX_TURNOS = 6;
// Cuántos cálculos suyos viajan con la pregunta. Ocho son los de hoy y parte
// de ayer: bastan para que sepa con quién habla sin mandarle el archivo entero.
const IQ_CALCULOS = 8;

/* Los ejemplos de inicio, guardados tal cual antes de que la primera pregunta
   los quite. Al borrar la conversación se devuelven: dejar el hueco en blanco
   convierte "borrar" en "romper", y esos ejemplos son además lo que enseña a
   usar esto a quien llega. */
let ejemplosDeInicio = null;

function burbuja(quien, texto, { error = false, partes = null } = {}) {
  const charla = $('iqCharla');
  if (!charla) return null;

  const ejemplos = charla.querySelector('.calc-iq-ejemplos');
  if (ejemplos) {
    if (ejemplosDeInicio === null) ejemplosDeInicio = ejemplos.outerHTML;
    ejemplos.remove();
  }

  const nodo = document.createElement('p');
  nodo.className = `calc-iq-dice calc-iq-${quien}${error ? ' es-error' : ''}`;

  if (partes) nodo.innerHTML = respuestaHTML(partes);
  else nodo.textContent = texto;

  charla.appendChild(nodo);
  charla.scrollTop = charla.scrollHeight;

  const borrar = $('iqBorrar');
  if (borrar) borrar.hidden = false;

  return nodo;
}

/**
 * Limpia la pantalla del 60 IQ. Solo la pantalla.
 *
 * Es cosa de ruido visual: se pregunta, se lee la respuesta y esa respuesta se
 * queda ocupando sitio cuando ya no dice nada nuevo. Con una tabla de
 * comparación son diez líneas entre uno y lo siguiente que quiere preguntar.
 *
 * NO borra nada más, y es a propósito. La primera versión se llevaba también
 * lo que el 60 IQ recordaba, con el argumento de que pantalla limpia y cabeza
 * limpia debían ir juntas. El dueño lo corrigió y tiene razón: quien limpia
 * está despejando la vista para SEGUIR hablando, no empezando de cero. Que
 * pierda el hilo ahí es un castigo por ordenar.
 *
 * Para que olvide de verdad está "Que lo olvide", que es otra cosa y se pide
 * aparte.
 */
function limpiarCharla() {
  const charla = $('iqCharla');
  if (!charla) return;

  charla.innerHTML = ejemplosDeInicio || '';

  const borrar = $('iqBorrar');
  if (borrar) borrar.hidden = true;
}

/**
 * La respuesta en tres pesos distintos.
 *
 * Antes salía todo del mismo tamaño y en el mismo tono, así que la cuenta de
 * abajo competía con el resultado. Cada cosa se lee de una manera: la pulla se
 * lee, el resultado se mira, y la operación solo se comprueba de reojo.
 */
function respuestaHTML(p) {
  const trozos = [`<span class="iq-pulla">${esc(p.pulla)}</span>`];

  if (p.resultado) trozos.push(`<span class="iq-resultado">${esc(p.resultado)}</span>`);

  // El veredicto de una comparación: la respuesta, no el dato
  if (p.veredicto) trozos.push(`<span class="iq-veredicto">${esc(p.veredicto)}</span>`);

  if (Array.isArray(p.lineas) && p.lineas.length) {
    if (p.encabezado) trozos.push(`<span class="iq-encabezado">${esc(p.encabezado)}</span>`);
    trozos.push(`<span class="iq-lista">${p.lineas
      .map((l) => `<span class="iq-fila${l.gana ? ' es-gana' : ''}"><b>${esc(l.salida)}</b><i>${esc(l.detalle)}</i></span>`)
      .join('')}</span>`);
  }

  if (p.operacion) trozos.push(`<span class="iq-operacion">${esc(p.operacion)}</span>`);

  return trozos.join('');
}

/**
 * Las tres cosas que se pueden hacer con una respuesta del 60 IQ.
 *
 * Antes, ninguna: la respuesta se leía y ahí se acababa. Si elegía la tasa que
 * no era —el error más común— había que reescribir la pregunta entera, y si
 * acertaba no había forma de decírselo.
 *
 *   Copiar        el resultado, igual que se copia una fila de la calculadora.
 *   Con otra tasa repite LA MISMA pregunta nombrando otra, que es justo lo que
 *                 uno reescribe a mano cuando se equivoca de mercado.
 *   ✓ / ✗         si sirvió. Cada ✗ es un caso de prueba real, con las
 *                 palabras de quien preguntó, para el banco de preguntas.
 */
function ponerAcciones(nodo, pregunta, respuesta) {
  if (!nodo || !pregunta) return;

  const acciones = document.createElement('span');
  acciones.className = 'iq-acciones';

  const boton = (texto, titulo) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (titulo) b.title = titulo;
    acciones.appendChild(b);
    return b;
  };

  /* Copiar: solo la cifra si la hay, y si no, lo que dijo. Copiar la pulla
     cuando lo que se quiere es el número obliga a limpiarla a mano en la otra
     app, que es donde se va a pegar. */
  const cifra = nodo.querySelector('.iq-resultado')?.textContent.trim();
  boton('Copiar', 'Copiar la respuesta').addEventListener('click', async (e) => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(cifra || respuesta);
      e.currentTarget.textContent = 'Copiado';
      toque(8);
      setTimeout(() => { e.currentTarget.textContent = 'Copiar'; }, 1400);
    } catch (error) {
      console.warn('No se pudo copiar la respuesta:', error);
    }
  });

  /* Con otra tasa: se ofrecen las que tiene a la vista menos la que ya usó,
     leída de la propia respuesta. Sin esto habría que adivinar cuál propuso. */
  const usada = TODAS.find((id) => (nodo.textContent || '').includes(nombreDeTasa(id)));

  /* UNA sola sugerencia, no una lista.
     Con las tres visibles salían seis botones debajo de la respuesta, y en el
     ancho de un teléfono eso compite con el número, que es a lo que se viene.
     Además el error de verdad va casi siempre en el mismo sentido: eligió el
     oficial cuando se quería vender en el mercado, o al revés. Ofrecer justo
     esa es útil; ofrecer cuatro es un menú. */
  const contraria = usada === 'usdt' ? 'usd' : 'usdt';
  const otras = contraria !== usada && visibles.includes(contraria)
    ? [contraria]
    : visibles.filter((id) => id !== usada).slice(0, 1);

  for (const id of otras) {
    const nombre = nombreDeTasa(id);
    boton(`En ${nombre}`, `Repetir la pregunta en ${nombre}`).addEventListener('click', () => {
      // La misma pregunta nombrando la tasa: es lo que se escribiría a mano
      preguntarAl60IQ(`${pregunta} en ${nombre}`);
    });
  }

  // El voto, al final: es lo menos urgente de los tres
  const votar = (b, acerto) => {
    b.addEventListener('click', () => {
      acciones.classList.add('es-votado');
      b.classList.add('es-elegido');
      if (!acerto) b.classList.add('es-fallo');
      toque(8);
      // Sin esperar y sin avisar si falla: el voto es un extra, y molestar a
      // quien acaba de ayudar sería el peor pago posible
      fetch('/api/iq-voto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, respuesta, acerto }),
      }).catch(() => {});
    });
  };

  votar(boton('✓', 'Me sirvió'), true);
  votar(boton('✗', 'No era esto'), false);

  nodo.appendChild(acciones);
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
        tasas: Object.fromEntries(TODAS.map((id) => [id, tasaDe(id)])),
        // Las que tiene a la vista: "a todas las tasas" son esas. Las demás
        // van igual en `tasas`, por si las nombra.
        visibles,
        // Lo que la persona tiene delante. Sin esto, "cuánto son 15000" no
        // tenía respuesta posible —15000 de qué— y la respuesta estaba en la
        // pantalla: el modo abierto dice la moneda.
        contexto: { modo, monto: montoActual() || null },
        historial: iqCharlaPrevia.slice(-IQ_MAX_TURNOS),
        /* Lo que ha calculado últimamente, del propio panel Historial. Es lo
           que le permite hablar como alguien que te conoce —"otra vez los 350
           en USDT"— en vez de tratarte como a un desconocido cada vez.
           Solo lo que hace falta para reconocer un cálculo: ni el color de la
           fila ni la tasa exacta, que eso ya lo tiene aparte y más fresco. */
        calculos: leerHistorial()
          .slice(0, IQ_CALCULOS)
          .map((h) => ({
            fecha: h.fecha,
            modo: h.modo,
            monto: h.monto,
            destino: h.destino,
            resultado: h.resultado,
          })),
      }),
    });

    const datos = await respuesta.json().catch(() => ({}));
    esperando?.remove();

    if (fueraDeSesion(respuesta)) return;
    if (!respuesta.ok || !datos.respuesta) {
      burbuja('iq', datos.error || 'No se pudo preguntar. Intenta de nuevo.', { error: true });
      return;
    }

    const dicho = burbuja('iq', datos.respuesta, { partes: datos.partes });

    /* Los botones, con su propia red. Estaban dentro del try de la petición, y
       eso significaba que un fallo al COLGARLOS borraba una respuesta que ya
       había llegado bien: en pantalla salía "No se pudo preguntar" encima de
       una cuenta perfecta. Adornar no puede tumbar lo adornado. */
    try {
      ponerAcciones(dicho, pregunta, datos.respuesta);
    } catch (error) {
      console.warn('No se pudieron poner las acciones:', error);
    }

    iqCharlaPrevia.push({ rol: 'user', texto: pregunta }, { rol: 'assistant', texto: datos.respuesta });
    // Sin dejar que crezca sin freno: son turnos, no un historial
    if (iqCharlaPrevia.length > IQ_MAX_TURNOS * 2) iqCharlaPrevia.splice(0, 2);
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
  if (!modoDisponible(nuevo)) return;
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

  pintarRapidos(nuevo);
  calcular();
}

const ORDEN_MODOS = ['divisa', 'bs', 'bcv', 'usdt'];

/**
 * Deslizar de lado para cambiar de modo.
 *
 * Las cuatro pestañas son el gesto más repetido de la app y en el teléfono
 * obligan a apuntar a un blanco estrecho arriba del panel. Deslizar sobre el
 * propio panel es lo que la mano espera cuando hay pestañas.
 *
 * Solo cuenta si el movimiento es claramente horizontal —más de 50 px y al
 * menos el doble que en vertical—; si no, se deja pasar como scroll, que es
 * lo que se está haciendo el resto del tiempo.
 */
function deslizarEntreModos(panel) {
  let x0 = 0;
  let y0 = 0;
  let siguiendo = false;

  panel.addEventListener('touchstart', (e) => {
    /* Apagarlo SIEMPRE al empezar.
       Antes se salía sin hacerlo cuando el toque caía en el campo, así que
       quedaba encendido con las coordenadas del gesto anterior: tocabas la
       caja del monto, el touchend calculaba un desplazamiento enorme desde
       donde estuvo el dedo la vez pasada, y la app cambiaba de modo. Se
       redibujaba todo y el teclado ni llegaba a abrirse. Desde fuera parecía
       que el campo "no respondía bien". */
    siguiendo = false;

    if (e.touches.length !== 1) return;
    // No robar el gesto a lo que ya se desplaza solo, ni al campo de texto
    if (e.target.closest('.calc-iq-charla, .calc-historial, input')) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    siguiendo = true;
  }, { passive: true });

  panel.addEventListener('touchend', (e) => {
    if (!siguiendo) return;
    siguiendo = false;

    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 2) return;

    // Solo entre las pestañas que se ven
    const disponibles = ORDEN_MODOS.filter(modoDisponible);
    const i = disponibles.indexOf(modo);
    const destino = disponibles[i + (dx < 0 ? 1 : -1)];
    if (destino) elegirModo(destino);
  }, { passive: true });
}

/**
 * Flechas para moverse entre pestañas y entre opciones, que es como se espera
 * que funcionen un tablist y un radiogroup con el teclado.
 */
function navegarConFlechas(contenedor, selector, alElegir) {
  contenedor.addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!paso) return;

    const items = [...contenedor.querySelectorAll(selector)].filter((b) => !b.disabled && !b.hidden);
    const desde = items.indexOf(document.activeElement);
    if (desde === -1) return;

    e.preventDefault();
    alElegir(items[(desde + paso + items.length) % items.length]);
  });
}

/** Abre un panel y cierra los demás: apilados, en el teléfono no se ve nada */
function crearPaneles(lista, alTocar) {
  const nodos = lista
    .map(([b, p]) => [$(b), $(p)])
    .filter(([b, p]) => b && p);

  function alternar(panel) {
    const abrir = panel.hidden;

    for (const [boton, otro] of nodos) {
      const activo = abrir && otro === panel;
      if (!activo && otro.contains(document.activeElement)) document.activeElement.blur();
      otro.hidden = !activo;
      boton.setAttribute('aria-expanded', String(activo));
    }

    // Solo se desplaza si el panel sale DEBAJO. Con sitio para dos columnas
    // aparece al lado, y desplazarse ahí mueve la pantalla sin motivo.
    if (abrir && !window.matchMedia('(min-width: 900px)').matches) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function cerrar(panel) {
    for (const [boton, otro] of nodos) {
      if (panel && otro !== panel) continue;
      // Si el foco estaba dentro del que se cierra, soltarlo: un campo que
      // desaparece deja el teclado puesto sin nada donde escribir.
      if (otro.contains(document.activeElement)) document.activeElement.blur();
      otro.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
    }
  }

  for (const [boton, panel] of nodos) {
    boton.addEventListener('click', () => {
      alTocar?.();
      alternar(panel);
    });
  }

  // Escape cierra el que esté abierto, como cualquier menú
  /* Escape va de dentro afuera, como en cualquier interfaz: primero suelta
     el campo —quitando el teclado en una tableta con teclado físico— y solo
     si no había ninguno enfocado cierra el panel. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
      return;
    }

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
  aplicarVisibles();
  // Al girar el teléfono o cambiar el tamaño de la ventana, las filas cambian
  ANCHO_MEDIO.addEventListener('change', repartirTarjetas);
  ANCHO_GRANDE.addEventListener('change', repartirTarjetas);
  pintarRapidos(modo);
  cargarMontosGlobales();
  cargarTasas({ primera: true });

  const monto = $('calcMonto');

  /* En el teléfono, el teclado tapaba los resultados mientras se escribía.
     La caja quedaba justo encima de él y las filas, que se recalculan con
     cada tecla, debajo: no se veía ninguna hasta darle a Enter. Medido en
     360×780 y 412×915, cero de cuatro a la vista con el teclado abierto.

     Así que al tocar la caja la página sube hasta dejarla arriba, y entre
     ella y el teclado caben los resultados: se ven cambiar mientras se
     escribe, y el Enter ya solo baja el teclado. Las tarjetas de las tasas
     se quedan fuera de la pantalla, así que encima de la caja sale una tira
     con ellas (pintarTira), en el sitio de la pregunta. En el iPhone, cuyo
     teclado numérico ni siquiera tiene Enter, era además la única manera
     de verlos sin tener que tocar fuera.

     La página no siempre es tan alta como para subir tanto, así que se le
     añade abajo el hueco que falte (--hueco-teclado, en el body). Se queda
     mientras haya una cantidad: quitarlo al bajar el teclado encogería la
     página de golpe y todo daría un salto justo cuando uno se pone a leer.
     Se va al vaciar la caja.

     Solo en pantallas táctiles estrechas. En el escritorio no hay teclado
     que tape nada, y en una tableta el panel cabe entero. */
  const MARGEN_ARRIBA = 12;
  const TACTIL = window.matchMedia('(pointer: coarse)');

  /* Se miden los plegables y no la pregunta o la tira: el alto que ocupan
     incluye los márgenes de dentro, y el scrollHeight de un párrafo no. Con
     el del párrafo, el centrado se quedaba 27 px corto y al final corregía. */
  const plegables = (panel) => ({
    pregunta: panel.querySelector('.plegable-pregunta'),
    tira: panel.querySelector('.plegable-tira'),
  });
  // Lo que mide abierto, esté como esté: el div de dentro nunca se recorta
  // a sí mismo, solo lo recorta la fila del plegable
  const altoAbierto = (plegable) => plegable.firstElementChild.scrollHeight;

  const subirCaja = () => {
    if (!TACTIL.matches || ANCHO_MEDIO.matches) return;

    const panel = monto.closest('.calc-panel');
    const { pregunta, tira } = plegables(panel);
    // Sin los plegables (un HTML de otra versión) no hay nada que subir
    if (!pregunta || !tira) return;
    pintarTira();

    // Adónde se va: el borde de arriba del plegable de la pregunta, que es
    // donde queda la tira cuando la pregunta se pliega. Se mide antes de
    // plegar nada, y así se sabe el destino desde el primer fotograma.
    const raiz = document.documentElement;
    const arriba = pregunta.getBoundingClientRect().top + window.scrollY - MARGEN_ARRIBA;
    // Lo que cambia el alto al cambiar la pregunta por la tira
    const crece = altoAbierto(tira) - altoAbierto(pregunta);
    const huecoPuesto = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    // Lo que le falta a la página para poder desplazarse hasta `arriba`
    const falta = arriba + window.innerHeight - (raiz.scrollHeight - huecoPuesto + crece);
    raiz.style.setProperty('--hueco-teclado', `${Math.max(0, Math.ceil(falta))}px`);

    /* La pregunta se pliega, la tira se despliega y la página sube: las tres
       a la vez y con la misma curva, mientras sube el teclado. Antes se
       esperaban 320 ms a que terminara de subir, por miedo a que el
       navegador desplazara por su cuenta; esa pausa era lo que se notaba. Si
       el navegador empuja a mitad de camino, el fotograma siguiente vuelve a
       poner la página donde toca. */
    // El ancla es la caja: acaba `crece` más abajo en la página, lo que
    // cambia el alto al cambiar la pregunta por la tira
    const caja = monto.closest('.calc-monto');
    const cajaEnPagina = caja.getBoundingClientRect().top + window.scrollY;
    panel.classList.add('is-subida');
    animarScroll(arriba, { ancla: caja, anclaFinal: cajaEnPagina + crece });
  };

  const soltarHueco = () => {
    if (monto.value || document.activeElement === monto) return;
    document.documentElement.style.removeProperty('--hueco-teclado');
    // La tira se va con el hueco, y vuelve la pregunta
    monto.closest('.calc-panel')?.classList.remove('is-subida');
  };

  /* Al bajar el teclado —Enter, o tocar fuera— con una cantidad puesta, el
     panel se centra en la pantalla. La caja arriba del todo sirve para
     escribir, pero lo que se hace después casi siempre es cambiar de pestaña
     —Divisas, Bolívares, Precio BCV, USDT— con la misma cantidad, y las
     pestañas se habían quedado fuera. Centrado se ven ellas, la caja y los
     resultados, y asoman las tarjetas por encima: por eso la tira se va, que
     ya no hace falta. Si el panel no cabe entero, arriba con su margen.

     El hueco se queda (se va al vaciar la caja), así que siempre hay página
     para llegar a donde se desplaza y nada da un salto. */
  const centrarPanel = () => {
    const panel = monto.closest('.calc-panel');
    if (!panel.classList.contains('is-subida')) return;

    // El alto que tendrá el panel con la pregunta en vez de la tira, medido
    // antes de cambiarlas: el destino se sabe desde el primer fotograma y la
    // página no tiene que corregir el rumbo a mitad de camino
    const { pregunta, tira } = plegables(panel);
    if (!pregunta || !tira) return;
    const marco = panel.getBoundingClientRect();
    const cambio = altoAbierto(pregunta) - altoAbierto(tira);
    const margen = Math.max(MARGEN_ARRIBA, (window.innerHeight - (marco.height + cambio)) / 2);

    // La tira se pliega y la página baja a la vez, como al subir pero al
    // revés, con la caja otra vez de ancla
    const caja = monto.closest('.calc-monto');
    const cajaEnPagina = caja.getBoundingClientRect().top + window.scrollY;
    panel.classList.remove('is-subida');
    animarScroll(marco.top + window.scrollY - margen, { ancla: caja, anclaFinal: cajaEnPagina + cambio });
  };

  /* Lo mismo, pero en el escritorio, donde la caja nunca sube porque no hay
     teclado que tape nada y por tanto no había nada que bajar al soltarla.

     El problema ahí es otro: el panel mide 537 px y arranca en el 251, así
     que en la ventana de un portátil —1280×680 con la barra del navegador
     puesta— la última tasa y el pie quedan 89 px por debajo del borde.
     Escribías la cantidad, soltabas el campo y tenías que desplazarte a mano
     para ver justo lo que venías a ver.

     Así que al soltar la caja con una cantidad puesta, el panel se centra.
     Sin plegar nada, que aquí no hay tira ni pregunta que turnar: solo el
     desplazamiento, con la misma curva que en el teléfono.

     Solo si hace falta, y midiendo lo escondido, no el salto. En una pantalla
     de 900 px el panel entra entero y moverlo sería quitarle la página de
     debajo a quien no ha pedido nada. Y por un pelo tampoco: en 1366×768
     sobraba 1 px y la primera versión de esto daba un viaje de 135 para
     recuperarlo, que se lee como un tirón sin motivo. Por debajo de este
     margen, lo cortado no molesta tanto como molestaría el movimiento. */
  const MINIMO_ESCONDIDO = 24;

  /* Si sueltas la caja para tocar los botones del pie —Ajustes, Historial,
     60 IQ, Tema— quien manda es el panel que se abre: crearPaneles ya lo trae
     a la vista él solo, y centrar a la vez serían dos animaciones peleándose
     por la misma página. Se mira el pointerdown porque para cuando llega el
     blur el foco ya cambió de sitio y no se sabe quién se lo llevó. */
  let ultimoToque = { nodo: null, cuando: 0 };
  document.addEventListener(
    'pointerdown',
    (e) => { ultimoToque = { nodo: e.target, cuando: performance.now() }; },
    true,
  );
  // Con tiempo: un toque de hace un minuto no explica este blur, que entonces
  // vino del teclado (Tab, Enter) y ahí sí toca centrar.
  const vaAOtraCosa = () =>
    performance.now() - ultimoToque.cuando < 1000 &&
    !!ultimoToque.nodo?.closest?.('.calc-pie, .calc-ajustes');

  const centrarEnEscritorio = () => {
    const panel = monto.closest('.calc-panel');
    // Del teléfono se encarga centrarPanel, que además pliega la tira
    if (!panel || panel.classList.contains('is-subida') || vaAOtraCosa()) return;

    const marco = panel.getBoundingClientRect();
    // El resumen va fuera del panel y es lo último que se lee
    const resumen = $('calcResumen');
    const abajo = Math.max(marco.bottom, resumen?.getBoundingClientRect().bottom ?? 0);
    // Lo que se queda fuera, por abajo o por arriba, lo que sea peor
    const escondido = Math.max(abajo - window.innerHeight, MARGEN_ARRIBA - marco.top);
    if (escondido < MINIMO_ESCONDIDO) return;

    const margen = Math.max(MARGEN_ARRIBA, (window.innerHeight - marco.height) / 2);
    const destino = Math.max(0, marco.top + window.scrollY - margen);
    animarScroll(destino);
  };

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

    monto.addEventListener('focus', subirCaja);
    // Con cantidad, el panel se centra —de una manera en el teléfono y de
    // otra en el escritorio—; vacía, la página vuelve a su alto
    monto.addEventListener('blur', () => {
      if (!monto.value) return soltarHueco();
      centrarPanel();
      centrarEnEscritorio();
    });
    monto.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        monto.blur();
      }
    });
    // Sin focus() automático: en el móvil el teclado saltaba al abrir y tapaba
    // justo las tasas y los resultados que se venía a ver.
  }

  /* La X borra, y ya. Que abra o no el teclado depende de si estabas
     escribiendo.

     Antes hacía focus() siempre, así que tocarla mientras mirabas los
     resultados te levantaba el teclado y te tapaba media pantalla para nada:
     habías pedido borrar, no escribir.

     Pero si venías tecleando y la usas para corregir, quitarte el teclado es
     igual de molesto. Así que no se decide nada: se deja como estaba. Hay que
     mirarlo en pointerdown porque para cuando llega el click el foco ya se lo
     ha llevado el botón. */
  const botonBorrar = $('calcBorrar');
  let escribiendoAlBorrar = false;

  botonBorrar?.addEventListener('pointerdown', () => {
    escribiendoAlBorrar = document.activeElement === monto;
  });

  /* Y que no le robe el foco al campo.
     Sin esto, el navegador se lo lleva al botón —el teclado se cierra— y el
     click de después tiene que devolvérselo, que es cuando se reabre. Con el
     foco quieto no hay nada que deshacer. En mousedown y no en pointerdown
     para no comerse el gesto de desplazar empezado sobre el botón. */
  botonBorrar?.addEventListener('mousedown', (e) => e.preventDefault());

  botonBorrar?.addEventListener('click', (e) => {
    if (!monto) return;
    monto.value = '';
    calcular();

    // e.detail 0 es activación por teclado (Enter o espacio): ahí sí se
    // devuelve el foco al campo, que es a donde iba quien navega así.
    if (escribiendoAlBorrar || e.detail === 0) monto.focus();
    else monto.blur();

    escribiendoAlBorrar = false;
    // Vacía y sin teclado: el hueco de subir la caja ya no hace falta
    soltarHueco();
  });

  const panelPrincipal = document.querySelector('.calc-panel');
  if (panelPrincipal) deslizarEntreModos(panelPrincipal);

  /* TIRAR PARA ACTUALIZAR
     Existe el botón del pie, y se queda: es el camino seguro y el único que
     tiene quien no usa un teléfono. Pero el gesto de tirar hacia abajo es el
     que el pulgar intenta solo en una app que se abre veinte veces al día, y
     hasta ahora no hacía nada.

     Se aprovecha que el body ya lleva overscroll-behavior-y: contain, puesto
     por otra razón: el tirón nativo de Chrome ya estaba desactivado, así que
     este gesto no se pelea con nada.

     Solo desde arriba del todo y solo hacia abajo: si la página está a medio
     desplazar, el dedo está leyendo, no pidiendo tasas nuevas. */
  const TIRON_MINIMO = 64;
  const barraTiron = $('calcTiron');
  let tirandoDesde = null;
  // Dónde empezó en horizontal, para distinguir un tirón de un deslizamiento
  // entre pestañas, que baja unos píxeles de propina
  let tirandoEnX = 0;
  let tironListo = false;

  /* Lo que se desplaza por dentro: la charla del 60 IQ y el historial tienen
     su propia altura máxima en el teléfono. Si el dedo empieza ahí y ese
     cajón todavía tiene recorrido hacia arriba, el gesto es suyo, no mío.

     Sin esto, el tirón le robaba el desplazamiento a la respuesta del 60 IQ:
     como abrir el panel deja la página arriba del todo, arrastrar dentro de
     la charla cumplía mi condición y sacaba la barra en vez de mover el
     texto. Un gesto nuevo no puede comerse uno que ya existía. */
  const cajonPropio = (nodo) => nodo?.closest?.('.calc-iq-charla, .calc-historial, .calc-ajustes');

  document.addEventListener('touchstart', (e) => {
    /* Un solo dedo y desde el tope: con dos es un pellizco, y a medio
       desplazar es lectura.

       Y nunca dentro de un panel. Antes solo me apartaba si el cajón tenía
       recorrido, así que con la charla en su tope —que es como está recién
       abierta— el tirón se activaba justo encima de la respuesta y esa zona
       se sentía muerta: ni la charla se movía ni la página. Dentro de un
       panel el gesto no es mío ni cuando el cajón está quieto; para actualizar
       está el botón, que además queda a la vista. */
    tirandoDesde =
      !cajonPropio(e.target) && window.scrollY <= 0 && e.touches.length === 1
        ? e.touches[0].clientY
        : null;
    tirandoEnX = e.touches[0]?.clientX ?? 0;
    tironListo = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (tirandoDesde === null || !barraTiron) return;

    /* Y que el gesto sea vertical de verdad. Deslizando entre pestañas el dedo
       baja unos píxeles de propina, y con eso la barra asomaba un poco en cada
       cambio de pestaña: un parpadeo sin sentido que ensucia un gesto que ya
       funcionaba. Si lo horizontal manda, esto no es un tirón. */
    if (Math.abs(e.touches[0].clientX - tirandoEnX) > Math.abs(e.touches[0].clientY - tirandoDesde)) {
      tirandoDesde = null;
      barraTiron.style.opacity = '';
      barraTiron.classList.remove('es-listo');
      return;
    }

    const recorrido = e.touches[0].clientY - tirandoDesde;
    // Hacia arriba es desplazarse normal: el gesto se cancela y no vuelve
    // hasta que se levante el dedo
    if (recorrido <= 0) {
      tirandoDesde = null;
      barraTiron.style.opacity = '';
      barraTiron.classList.remove('es-listo');
      return;
    }

    /* Se frena a la mitad y se corta en el doble del mínimo: sin tope, el
       dedo podía arrastrar la barra media pantalla y el gesto parecía otra
       cosa. Con freno, pasado el punto de no retorno ya casi no se mueve, que
       es la señal de "ya está". */
    const avance = Math.min(recorrido / 2, TIRON_MINIMO * 2);
    const parte = Math.min(1, avance / TIRON_MINIMO);

    barraTiron.style.opacity = String(Math.min(1, parte * 1.4));
    barraTiron.style.setProperty('--tiron', `${parte * 100}%`);

    if (parte >= 1 && !tironListo) {
      tironListo = true;
      barraTiron.classList.add('es-listo');
      // Aquí ya vale soltar, y conviene saberlo sin mirar la barra
      toque(10);
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (tirandoDesde === null || !barraTiron) return;
    tirandoDesde = null;

    if (tironListo) {
      cargarTasas({ forzar: true });
      if (fuentes) cargarFuentes();
      programarRefresco();
    }

    tironListo = false;
    barraTiron.classList.remove('es-listo');
    barraTiron.classList.add('es-soltado');
    barraTiron.style.opacity = '';
    setTimeout(() => barraTiron.classList.remove('es-soltado'), 300);
  }, { passive: true });

  /* PULSACIÓN LARGA EN UNA TARJETA PARA ESCONDERLA
     Esconder una tasa vivía en Ajustes → "Qué tasas ver", tres toques dentro
     de un panel que casi nadie abre. La tarjeta está ahí delante y es donde
     uno piensa "esta no la uso".

     No pide confirmación y sí ofrece deshacer, que para algo reversible es
     mejor reparto: preguntar antes molesta cada vez, deshacer después solo
     cuando hace falta. */
  const MANTENER = 500;
  let pulsando = null;
  let tarjetaPulsada = null;

  const soltarTarjeta = () => {
    clearTimeout(pulsando);
    pulsando = null;
    tarjetaPulsada?.classList.remove('es-pulsada');
    tarjetaPulsada = null;
  };

  document.querySelector('.calc-tasas')?.addEventListener('pointerdown', (e) => {
    const tarjeta = e.target.closest('.tasa');
    if (!tarjeta) return;

    tarjetaPulsada = tarjeta;
    tarjeta.classList.add('es-pulsada');

    pulsando = setTimeout(() => {
      const id = tarjeta.dataset.tasa;
      // La última que queda no se deja apagar: una calculadora sin ninguna
      // tasa no calcula nada
      if (!id || visibles.length <= 1) {
        soltarTarjeta();
        return;
      }

      const antes = [...visibles];
      guardarVisibles(visibles.filter((t) => t !== id));
      aplicarVisibles();
      toque(14);
      // El nombre se lee de la tarjeta, no de una tabla aparte: NOMBRE_EN_TIRA
      // solo conoce el euro y el USDT, así que las demás habrían salido en
      // crudo —"zelle escondida"—. En la tarjeta ya pone lo que hay que decir.
      const nombre = tarjeta.querySelector('.tasa-nombre')?.textContent.trim() || id;
      avisarDeshacer(`${nombre} escondida`, () => {
        guardarVisibles(antes);
        aplicarVisibles();
      });
      soltarTarjeta();
    }, MANTENER);
  });

  for (const evento of ['pointerup', 'pointercancel', 'pointerleave']) {
    document.querySelector('.calc-tasas')?.addEventListener(evento, soltarTarjeta);
  }
  // Desplazarse con el dedo empezando sobre una tarjeta no es mantener pulsado
  document.querySelector('.calc-tasas')?.addEventListener('pointermove', (e) => {
    if (pulsando && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) soltarTarjeta();
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
      // Un golpecito: copiar es la acción más usada de la pantalla y se hace
      // sin mirar, con la otra app ya en la cabeza. El aviso de "copiado" hay
      // que leerlo; esto se siente.
      toque(8);
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

  /* En una tableta en horizontal el 60 IQ arranca abierto.
     Ahí sobra ancho: con el panel al lado se ven la calculadora y el ayudante
     a la vez, y al cerrarlo la calculadora se queda sola en el centro y más
     grande. El cambio de disposición lo hace el CSS con :has(), así que aquí
     solo hay que abrirlo.
     No se vuelve a abrir solo al girar la tableta: sería discutirle al usuario
     lo que acaba de decidir. */
  const HAY_SITIO = window.matchMedia('(min-width: 900px)');
  let panelesTocados = false;

  const paneles = crearPaneles([
    ['calc60iq', 'calcPanel60iq'],
    ['calcTema', 'calcPanelTema'],
    ['calcHistorial', 'calcPanelHistorial'],
    ['calcAjustes', 'calcPanelAjustes'],
  ], () => { panelesTocados = true; });

  // 60 IQ
  const iqCampo = $('iqPregunta');

  $('calc60iq')?.addEventListener('click', () => {
    // Con ratón se enfoca; con el dedo no, igual que el campo del monto. Los
    // ejemplos de debajo se tocan, y con el teclado encima no se ven.
    if (!$('calcPanel60iq')?.hidden && !CON_DEDO.matches) iqCampo?.focus();
  });

  // El teclado del teléfono tapa la caja de escribir: el panel está al final
  // de una página larga y al enfocar el campo queda justo debajo del teclado.
  // iOS no encoge el viewport al abrirlo —solo lo desplaza—, así que hay que
  // traerlo a la vista a mano, y esperar a que el teclado termine de subir.
  const traerALaVista = () => {
    // Solo cuando el panel sale debajo. Al lado ya se ve, y desplazarse
    // entonces mueve la pantalla sin motivo.
    if (HAY_SITIO.matches) return;
    setTimeout(() => iqCampo?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  };

  iqCampo?.addEventListener('focus', traerALaVista);
  window.visualViewport?.addEventListener('resize', () => {
    if (document.activeElement === iqCampo) traerALaVista();
  });

  /* Lo mismo para "Preguntar": el foco se queda en el campo mientras se
     toca. Así el teclado no se mueve, la página no da el salto y el click
     llega a la primera. */
  $('iqEnviar')?.addEventListener('mousedown', (e) => e.preventDefault());

  $('iqBorrar')?.addEventListener('click', limpiarCharla);
  $('iqOlvidar')?.addEventListener('click', olvidarMemoria);
  // Se consulta al desplegarlo, no al cargar: casi nadie lo abre y sería una
  // petición de más en cada apertura de la app.
  $('iqMemoria')?.addEventListener('toggle', (e) => { if (e.target.open) pintarMemoria(); });

  /* Tachar una nota suelta. El índice se manda tal como se pintó: si la
     memoria cambió por detrás, el servidor comprueba que exista y ante la duda
     no borra nada, que es mejor que llevarse la de al lado. */
  $('iqNotas')?.addEventListener('click', async (e) => {
    const boton = e.target.closest('.calc-iq-quitar');
    if (!boton) return;

    boton.disabled = true;
    try {
      const r = await fetch('/api/iq-memoria', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linea: Number(boton.dataset.linea) }),
      });
      if (fueraDeSesion(r)) return;
      const d = await r.json();
      if (d.ok) pintarNotas(d.lineas || []);
      else boton.disabled = false;
    } catch (error) {
      console.warn('No se pudo tachar la nota:', error);
      boton.disabled = false;
    }
  });

  // Decirle a mano lo que tiene que saber, sin esperar a que lo deduzca
  $('iqAnadirNota')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = $('iqNotaNueva');
    const nota = campo?.value.trim();
    if (!nota) return;

    campo.disabled = true;
    try {
      const r = await fetch('/api/iq-memoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota }),
      });
      if (fueraDeSesion(r)) return;
      const d = await r.json();
      // Solo se vacía la caja si de verdad se guardó: borrar lo que alguien
      // escribió sin haberlo apuntado es perderle el texto
      if (d.ok) {
        campo.value = '';
        pintarNotas(d.lineas || []);
      }
    } catch (error) {
      console.warn('No se pudo apuntar la nota:', error);
    } finally {
      campo.disabled = false;
      campo.focus();
    }
  });

  /* El tono. Se marca al tocarlo y se corrige si el servidor dice que no:
     fingir que se guardó y hablarte igual al día siguiente sería peor que
     tardar medio segundo en confirmarlo. */
  const elegirTono = async (boton) => {
    const tono = boton?.dataset.tono;
    if (!tono) return;

    const antes = $('iqTonos')?.querySelector('[aria-checked="true"]')?.dataset.tono;
    marcarTono(tono);
    boton.focus();

    try {
      const r = await fetch('/api/iq-memoria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tono }),
      });
      if (fueraDeSesion(r)) return;
      const d = await r.json();
      if (!d.ok) marcarTono(antes);
    } catch (error) {
      console.warn('No se pudo cambiar el tono:', error);
      marcarTono(antes);
    }
  };

  $('iqTonos')?.addEventListener('click', (e) => elegirTono(e.target.closest('button[data-tono]')));
  const grupoTonos = $('iqTonos');
  if (grupoTonos) navegarConFlechas(grupoTonos, 'button[data-tono]', elegirTono);

  $('iqForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pregunta = iqCampo?.value.trim();
    if (!pregunta) return;
    iqCampo.value = '';
    // Ya preguntaste: lo que viene ahora es leer la respuesta, y el teclado
    // la tapaba entera en un teléfono.
    cerrarTeclado();
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

  // Miguel: tocar la pala la hace golpear (ver darALaPelota)
  document.querySelector('.pala-toque')?.addEventListener('click', darALaPelota);

  /* Sasha y sus ánimos, que su dueño y su hermana conocen de memoria: la
     tranquila, la curiosa con la cabeza ladeada, la de los ojitos de
     pedir, la feliz con la lengua fuera y la dormida. El JS solo dice cuál
     (data-animo); cómo se ve cada uno lo dice el CSS.

     De día va pasando de uno a otro sola. De noche —de diez a seis, por la
     hora del teléfono— duerme; si se la toca se despierta curiosa un rato y
     vuelve a dormirse. Despierta, tocarla la alegra o hace que se relama, y
     le sale un corazón. Mientras se escribe un monto mira la caja: eso es
     solo CSS (:has). Sin movimiento si el sistema lo pide: se queda
     tranquila, o dormida de noche. */
  const sasha = document.querySelector('.sasha');
  if (sasha) {
    const DE_DIA = ['tranquila', 'curiosa', 'tranquila', 'ojitos', 'tranquila', 'feliz'];
    let vuelta = 0;
    let despiertaHasta = 0;
    let reloj = null;

    const esDeNoche = () => {
      const hora = new Date().getHours();
      return hora >= 22 || hora < 6;
    };
    const ponerAnimo = (animo) => { sasha.dataset.animo = animo; };

    // Reinicia una animación de clase aunque se toque seguido
    const repetir = (clase) => {
      sasha.classList.remove(clase);
      void sasha.offsetWidth;
      sasha.classList.add(clase);
    };

    const siguiente = () => {
      // Fuera de su tema o con la app de fondo no hay nadie mirando
      if (document.documentElement.dataset.tema !== 'sasha' || document.hidden) return;
      if (esDeNoche() && Date.now() > despiertaHasta) return ponerAnimo('dormida');
      if (SIN_MOVIMIENTO.matches) return ponerAnimo('tranquila');
      vuelta = (vuelta + 1) % DE_DIA.length;
      ponerAnimo(DE_DIA[vuelta]);
    };

    const programar = (ms = 6500) => {
      clearTimeout(reloj);
      reloj = setTimeout(() => { siguiente(); programar(); }, ms);
    };

    ponerAnimo(esDeNoche() ? 'dormida' : 'tranquila');
    programar();

    sasha.addEventListener('click', () => {
      if (sasha.dataset.animo === 'dormida') {
        despiertaHasta = Date.now() + 20000;
        ponerAnimo('curiosa');
      } else if (Math.random() < 0.5) {
        // Un gesto a la vez: tocándola seguido, la lengua de relamerse se
        // quedaba puesta sobre la boca abierta
        sasha.classList.remove('lame');
        ponerAnimo('feliz');
        repetir('mimo');
      } else {
        // Con la boca cerrada, que la lengua de relamerse sale de ahí
        sasha.classList.remove('mimo');
        ponerAnimo('tranquila');
        repetir('lame');
      }
      // Lo que se provocó tocándola dura un poco más antes del siguiente
      programar(8000);
    });

    sasha.addEventListener('animationend', (e) => {
      if (e.animationName === 'lamer') sasha.classList.remove('lame');
      if (e.animationName === 'corazon') sasha.classList.remove('mimo');
    });
  }

  const panelHist = $('calcPanelHistorial');
  $('calcHistorial')?.addEventListener('click', () => {
    if (!panelHist.hidden) pintarHistorial();
  });

  // Tocar una línea repite ese cálculo
  panelHist?.addEventListener('click', (e) => {
    const linea = e.target.closest('.hist');
    if (!linea) return;

    if (monto) monto.value = formatearTexto(linea.dataset.monto);
    // Un cálculo de una pestaña que ya no se ve se repite en Divisas
    elegirModo(modoDisponible(linea.dataset.modo) ? linea.dataset.modo : 'divisa');
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

  // Qué tasas ver. El panel NO se cierra al tocar, al contrario que al elegir
  // una fuente: aquí lo normal es marcar o desmarcar varias seguidas.
  $('calcVer')?.addEventListener('change', (e) => {
    const casilla = e.target.closest('input');
    if (!casilla) return;

    const lista = TODAS.filter((id) => (id === casilla.value ? casilla.checked : visibles.includes(id)));
    if (!lista.length) {
      casilla.checked = true;
      return;
    }

    guardarVisibles(lista);
    aplicarVisibles();
  });

  // El interruptor de aportar montos
  const aportar = $('calcAportar');
  if (aportar) {
    const rastreoApagado = navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
    aportar.checked = aportaMontos();

    if (rastreoApagado) {
      // El navegador ya dijo que no; se muestra apagado y no se deja tocar,
      // en vez de fingir que la decisión sigue abierta.
      aportar.disabled = true;
      aportar.closest('label')?.setAttribute('title', 'Tu navegador pide no ser rastreado');
    }

    aportar.addEventListener('change', () => {
      try {
        localStorage.setItem(APORTAR, aportar.checked ? 'si' : 'no');
      } catch {
        // Sin almacenamiento la elección dura lo que la visita
      }
    });
  }

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

  /* Y también al girar la tableta, mientras el usuario no haya decidido él.
     Cargar en vertical y girar a horizontal es el caso normal en una tableta,
     y ahí el ancho aparece después del arranque. En cuanto toca cualquier
     botón de panel manda su decisión y esto no vuelve a meterse. */
  const abrirSiHaySitio = () => {
    if (HAY_SITIO.matches && !panelesTocados && $('calcPanel60iq')?.hidden) {
      paneles.alternar($('calcPanel60iq'));
    }
  };

  abrirSiHaySitio();
  HAY_SITIO.addEventListener('change', abrirSiHaySitio);

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

  /* Con el dedo no se pone el foco solo: abrir el teclado sin que nadie lo
     haya pedido tapa media pantalla. Con ratón sí, que ahí no cuesta nada. */
  const CON_DEDO = window.matchMedia('(pointer: coarse)');

  /** Cierra el teclado si lo hay. Un solo sitio para no dejar cabos sueltos. */
  const cerrarTeclado = () => {
    const activo = document.activeElement;
    if (activo instanceof HTMLInputElement) activo.blur();
  };

  /* Tocar fuera cierra el teclado.
     En iOS y iPadOS, tocar el fondo no quita el foco de un campo por sí solo:
     el teclado se queda puesto tapando media pantalla hasta que le das a la
     tecla de bajar.
     Los atajos de monto y las filas de resultado no cuentan: ahí sí tiene
     sentido seguir con el teclado abierto para ajustar la cifra. */
  document.addEventListener('pointerdown', (e) => {
    const activo = document.activeElement;
    if (!(activo instanceof HTMLInputElement)) return;
    if (e.target === activo || e.target.closest('input')) return;
    /* Ajustar la cifra con un atajo o copiar un resultado no es dejar de
       escribir: ahí el teclado se queda.

       Y los dos botones que ACTÚAN sobre el campo tampoco cuentan, aunque
       estén fuera de él. Quitarles el foco aquí rompía las dos cosas:

         La X borraba, este blur cerraba el teclado y el click de después
         volvía a enfocar el campo: se cerraba y se reabría de un tirón. En el
         iPad se ve clarísimo.

         "Preguntar" era peor. El teclado se cerraba, la página crecía de
         golpe y para cuando tocaba disparar el click el botón ya no estaba
         bajo el dedo: no pasaba nada, y había que tocar dos veces. La primera
         parecía "cerrar el teclado" porque es justo lo que hacía.

       El teclado del 60 IQ se cierra igual, pero en el submit, que es cuando
       de verdad ya preguntaste. */
    if (e.target.closest('#calcRapidos, .res, #calcBorrar, #iqEnviar')) return;
    activo.blur();
  }, { passive: true });

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
