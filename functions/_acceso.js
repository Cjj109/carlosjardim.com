/**
 * El acceso por passkeys: criptografía, retos y sesiones.
 *
 * Sin dependencias, a propósito. Este sitio es estático puro —no tiene
 * package.json ni build— y meterle uno para traer una librería de WebAuthn
 * cambiaría cómo se despliega entero. Todo lo que hace falta lo da WebCrypto,
 * que ya está en el runtime.
 *
 * QUÉ SE VERIFICA AL ENTRAR, Y POR QUÉ CADA COSA
 *
 *   el reto      aleatorio, de un solo uso y con caducidad. Es lo que impide
 *                repetir una firma capturada.
 *   el origen    la firma tiene que venir de esta web. Es lo que mata el
 *                phishing: una passkey de carlosjardim.com no firma para otro
 *                dominio aunque la página sea calcada.
 *   el rpIdHash  el autenticador mete el hash del dominio DENTRO de lo
 *                firmado, así que no basta con mentir en el JSON del cliente.
 *   el flag UP   hubo un gesto de la persona, no una firma automática.
 *   la firma     con la clave pública guardada en el alta.
 *   el contador  si no sube, la credencial puede estar clonada.
 *
 * LO QUE NO SE VERIFICA, DICHO CLARO
 *
 * En el alta no se parsea la attestation: se guarda la clave pública que
 * manda el navegador con getPublicKey(). Parsearla exigiría un lector de CBOR
 * escrito a mano, que es bastante código y bastante sitio donde equivocarse.
 * Se puede prescindir porque el alta ya está cerrada por una invitación de un
 * solo uso: quien la tenga puede registrar la llave que quiera, pero es que
 * la invitación ya le daba entrada. No se pierde nada que la invitación no
 * hubiera dado ya.
 *
 * Lo que esto NO sirve para: no oculta que el sitio existe. El dominio y el
 * certificado son públicos, y quien aloja la web sigue viendo lo que sirve.
 */

/* ---------- base64url ---------- */

export const aBytes = (b64u) => {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64u.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const aB64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const sha256 = async (datos) => new Uint8Array(await crypto.subtle.digest('SHA-256', datos));

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Comparación en tiempo constante: comparar con === filtra por dónde falla */
export function igualesEnTiempoConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const aleatorio = (n = 32) => aB64u(crypto.getRandomValues(new Uint8Array(n)));

/* ---------- Dominio y origen ---------- */

/**
 * El rpId es el dominio, sin puerto. Se saca de la petición y no de una
 * constante para que valga igual en localhost al desarrollar y en producción,
 * sin una variable que alguien tenga que acordarse de cambiar.
 */
export function identidadDelSitio(request) {
  const url = new URL(request.url);
  return { rpId: url.hostname, origen: url.origin };
}

/* ---------- Retos ---------- */

const MINUTOS = 60 * 1000;

export async function crearReto(db, tipo) {
  const valor = aleatorio(32);
  await db
    .prepare("INSERT INTO retos (valor, tipo, expira_en) VALUES (?, ?, datetime('now', '+5 minutes'))")
    .bind(valor, tipo)
    .run();
  return valor;
}

/**
 * Consume el reto: lo borra y dice si valía.
 *
 * Se borra SIEMPRE, valga o no. Si solo se borrara al acertar, un reto podría
 * probarse una y otra vez.
 */
export async function consumirReto(db, valor, tipo) {
  if (!valor) return false;

  /* Borrar y leer en la MISMA sentencia.
     Antes eran dos —un SELECT y luego un DELETE— y entre las dos cabía otra
     petición: dos llegadas a la vez con el mismo reto lo encontraban las dos
     y las dos daban por bueno. Un reto que vale dos veces es exactamente lo
     que un reto viene a impedir. Con DELETE ... RETURNING solo una se lo
     lleva. */
  const fila = await db
    .prepare("DELETE FROM retos WHERE valor = ? AND expira_en > datetime('now') RETURNING tipo")
    .bind(valor)
    .first();

  // La basura de los caducados, que no la borra nadie más
  await db.prepare("DELETE FROM retos WHERE expira_en <= datetime('now')").run();

  return !!fila && fila.tipo === tipo;
}

/* ---------- clientDataJSON ---------- */

/** Comprueba lo que el navegador dice que firmó: tipo, reto y origen */
export async function revisarClientData(db, clientDataB64u, tipoEsperado, origenEsperado) {
  let datos;
  try {
    datos = JSON.parse(new TextDecoder().decode(aBytes(clientDataB64u)));
  } catch {
    return { ok: false, error: 'Datos del cliente ilegibles' };
  }

  if (datos.type !== tipoEsperado) return { ok: false, error: 'Tipo de operación inesperado' };
  if (datos.origin !== origenEsperado) return { ok: false, error: 'Origen no autorizado' };

  const tipoReto = tipoEsperado === 'webauthn.create' ? 'alta' : 'entrada';
  if (!(await consumirReto(db, datos.challenge, tipoReto))) {
    return { ok: false, error: 'El reto no vale o ya caducó' };
  }
  return { ok: true };
}

/* ---------- Firma ---------- */

/**
 * ECDSA firma en DER y WebCrypto espera r||s en crudo. Sin esta conversión la
 * verificación falla siempre, y falla de la peor manera: como si la firma
 * fuera mala.
 */
function derACrudo(der) {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('firma DER mal formada');
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i += 1;

  const leerEntero = () => {
    if (der[i++] !== 0x02) throw new Error('firma DER mal formada');
    let n = der[i++];
    let v = der.slice(i, i + n);
    i += n;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);      // quitar el cero de signo
    const salida = new Uint8Array(32);
    salida.set(v, 32 - v.length);                            // y rellenar por la izquierda
    return salida;
  };

  const r = leerEntero();
  const s = leerEntero();
  const crudo = new Uint8Array(64);
  crudo.set(r, 0);
  crudo.set(s, 32);
  return crudo;
}

const PARAMS = {
  '-7': { importar: { name: 'ECDSA', namedCurve: 'P-256' }, verificar: { name: 'ECDSA', hash: 'SHA-256' }, der: true },
  '-257': { importar: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verificar: { name: 'RSASSA-PKCS1-v1_5' }, der: false },
};

/** Verifica la firma sobre authenticatorData || SHA-256(clientDataJSON) */
export async function firmaValida(llave, authDataB64u, clientDataB64u, firmaB64u) {
  const params = PARAMS[String(llave.algoritmo)];
  if (!params) return false;

  try {
    const publica = await crypto.subtle.importKey('spki', aBytes(llave.clave_publica), params.importar, false, ['verify']);
    const authData = aBytes(authDataB64u);
    const hashCliente = await sha256(aBytes(clientDataB64u));

    const firmado = new Uint8Array(authData.length + hashCliente.length);
    firmado.set(authData, 0);
    firmado.set(hashCliente, authData.length);

    let firma = aBytes(firmaB64u);
    if (params.der) firma = derACrudo(firma);

    return await crypto.subtle.verify(params.verificar, publica, firma, firmado);
  } catch (e) {
    console.warn('[acceso] no se pudo verificar la firma:', e.message);
    return false;
  }
}

/**
 * Lo que el autenticador firmó por su cuenta: el dominio y el gesto.
 *
 * Importa que esto vaya DENTRO de lo firmado. El JSON del cliente lo escribe
 * el navegador y se podría falsear; esto no.
 */
export async function authDataValida(authDataB64u, rpId) {
  const d = aBytes(authDataB64u);
  if (d.length < 37) return { ok: false, error: 'Datos del autenticador incompletos' };

  const esperado = await sha256(new TextEncoder().encode(rpId));
  for (let i = 0; i < 32; i++) {
    if (d[i] !== esperado[i]) return { ok: false, error: 'El dominio no coincide' };
  }

  const flags = d[32];
  if (!(flags & 0x01)) return { ok: false, error: 'Falta la confirmación de la persona' };

  const contador = (d[33] << 24) | (d[34] << 16) | (d[35] << 8) | d[36];
  return { ok: true, contador: contador >>> 0 };
}

/* ---------- Sesiones ---------- */

export const COOKIE = 'cj_acceso';
const DIAS = 24 * 60 * MINUTOS;
const DURACION_DIAS = 180;

/**
 * Crea la sesión y devuelve la cookie.
 *
 * 180 días porque el dueño lo pidió de un solo paso: se entra una vez y ya.
 * La passkey sigue estando para renovarla, así que una sesión larga no baja
 * el listón de entrar, solo evita repetirlo cada semana.
 */
export async function crearSesion(db, personaId) {
  const testigo = aleatorio(32);
  const hash = hex(await sha256(new TextEncoder().encode(testigo)));

  await db
    .prepare("INSERT INTO sesiones (hash, persona_id, expira_en) VALUES (?, ?, datetime('now', '+180 days'))")
    .bind(hash, personaId)
    .run();
  await db.prepare("DELETE FROM sesiones WHERE expira_en <= datetime('now')").run();

  // HttpOnly: el JavaScript de la página no puede leerla, así que un XSS no
  // se lleva la sesión. SameSite=Lax: no viaja en peticiones de otros sitios.
  return `${COOKIE}=${testigo}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DURACION_DIAS * 24 * 60 * 60}`;
}

export function leerCookie(request, nombre) {
  const crudo = request.headers.get('Cookie') || '';
  for (const trozo of crudo.split(';')) {
    const [k, ...v] = trozo.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

/** La persona de esta petición, o null */
export async function sesionDe(db, request) {
  const testigo = leerCookie(request, COOKIE);
  if (!db || !testigo) return null;

  try {
    const hash = hex(await sha256(new TextEncoder().encode(testigo)));
    const fila = await db
      .prepare(
        `SELECT s.persona_id, p.nombre FROM sesiones s
         JOIN personas p ON p.id = s.persona_id
         WHERE s.hash = ? AND s.expira_en > datetime('now') AND p.activa = 1`
      )
      .bind(hash)
      .first();
    if (!fila) return null;

    await db.prepare("UPDATE sesiones SET ultimo_uso = datetime('now') WHERE hash = ?").bind(hash).run();
    return { id: fila.persona_id, nombre: fila.nombre };
  } catch (e) {
    console.error('[acceso] error leyendo la sesión:', e.message);
    return null;
  }
}

export const cerrarCookie = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export const json = (datos, status = 200, cabeceras = {}) =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cabeceras },
  });
