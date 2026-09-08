/**
 * La página de acceso, del lado del navegador.
 *
 * Todo lo que decide de verdad pasa en el servidor: aquí solo se le pide al
 * aparato que firme y se manda la firma. Si alguien reescribe este archivo
 * entero no gana nada, porque sin la clave privada —que no sale del aparato—
 * no hay firma que valga.
 */

const $ = (id) => document.getElementById(id);

const aBytes = (b64u) => {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const aB64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const params = new URLSearchParams(location.search);
const CODIGO = params.get('codigo');
const VOLVER = params.get('volver') || '/calculadora';

function aviso(texto, malo = false) {
  const n = $('mensaje');
  n.textContent = texto;
  n.className = malo ? 'mensaje es-malo' : 'mensaje';
  n.hidden = !texto;
}

const pedir = async (url, opciones) => {
  const r = await fetch(url, { credentials: 'same-origin', ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `Error ${r.status}`);
  return d;
};

/**
 * Un nombre para el aparato, para poder distinguirlos después.
 *
 * Se saca del navegador y se acierta a medias, así que es editable: lo que
 * importa es poder decir "revoca el del teléfono viejo" sin adivinar cuál es.
 */
function nombreDelAparato() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android' : 'Tablet Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Este aparato';
}

/* ---------- Entrar ---------- */

async function entrar() {
  aviso('Pidiéndole la firma al aparato…');
  const { reto } = await pedir('/api/acceso/reto?tipo=entrada');

  /* Sin allowCredentials: las llaves son descubribles, así que el navegador
     enseña las que tiene para este sitio y se entra con un gesto, sin escribir
     usuario. Es el "un solo paso" que se pidió. */
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: aBytes(reto),
      rpId: location.hostname,
      userVerification: 'preferred',
      timeout: 120000,
    },
  });
  if (!cred) throw new Error('No se eligió ninguna llave');

  await pedir('/api/acceso/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credencial: cred.id,
      clientData: aB64u(cred.response.clientDataJSON),
      authData: aB64u(cred.response.authenticatorData),
      firma: aB64u(cred.response.signature),
    }),
  });

  location.href = VOLVER;
}

/* ---------- Darse de alta / añadir aparato ---------- */

async function darDeAlta() {
  aviso('Preparando el alta…');
  const url = CODIGO ? `/api/acceso/reto?tipo=alta&codigo=${encodeURIComponent(CODIGO)}` : '/api/acceso/reto?tipo=alta';
  const { reto, para, usuarioId } = await pedir(url);

  /* Hay dos casillas, la del alta con invitación y la de añadir aparato desde
     dentro, y solo una está a la vista. Se coge la de la que esté visible. */
  const casilla = $('alta').hidden ? $('apodoNuevo') : $('apodo');
  const apodo = (casilla?.value || '').trim() || nombreDelAparato();

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: aBytes(reto),
      rp: { id: location.hostname, name: 'carlosjardim.com' },
      user: {
        id: new TextEncoder().encode(usuarioId),
        name: para,
        displayName: para,
      },
      // ES256 primero y RS256 detrás: son los dos que acepta el servidor
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        // Descubrible: es lo que permite entrar sin escribir nada
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
      // Sin attestation: no se le pide al aparato que se identifique de qué
      // marca es. No hace falta y es un dato menos que viaja.
      attestation: 'none',
      timeout: 120000,
    },
  });
  if (!cred) throw new Error('No se creó la llave');

  const resp = cred.response;
  await pedir('/api/acceso/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo: CODIGO,
      credencial: cred.id,
      // getPublicKey da la clave en SPKI ya lista: así el servidor no tiene
      // que leer CBOR para sacarla
      clavePublica: aB64u(resp.getPublicKey()),
      algoritmo: resp.getPublicKeyAlgorithm(),
      clientData: aB64u(resp.clientDataJSON),
      apodo,
    }),
  });

  if (CODIGO) location.href = VOLVER;
  else await pintar();
}

/* ---------- Estado de la página ---------- */

const fecha = (iso) => (iso ? new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('es-VE') : '—');

async function pintar() {
  const yo = await pedir('/api/acceso/yo');

  $('cargando').hidden = true;

  if (yo.dentro) {
    $('dentro').hidden = false;
    $('fuera').hidden = true;
    $('alta').hidden = true;
    $('saludo').textContent = `Hola, ${yo.nombre}.`;
    $('aparatos').innerHTML = yo.aparatos
      .map(
        (a) =>
          `<li><span class="ap-nombre">${a.apodo.replace(/[<>&]/g, '')}</span>` +
          `<span class="ap-fecha">desde ${fecha(a.desde)}</span></li>`
      )
      .join('');
    aviso('');
    return;
  }

  $('dentro').hidden = true;
  if (CODIGO) {
    $('alta').hidden = false;
    $('fuera').hidden = true;
    try {
      const { para } = await pedir(`/api/acceso/reto?tipo=alta&codigo=${encodeURIComponent(CODIGO)}`);
      $('invitadoA').textContent = para;
    } catch (e) {
      $('alta').hidden = true;
      aviso(e.message, true);
    }
  } else {
    $('fuera').hidden = false;
    $('alta').hidden = true;
  }
}

/* ---------- Arranque ---------- */

const conAviso = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    // Que la persona cancele el diálogo del sistema no es un error que
    // merezca un mensaje rojo: es que cambió de idea.
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') return aviso('');
    aviso(e.message || 'No se pudo completar', true);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PublicKeyCredential) {
    $('cargando').hidden = true;
    return aviso('Este navegador no admite passkeys. Prueba con Safari, Chrome o Edge al día.', true);
  }

  $('btnEntrar')?.addEventListener('click', conAviso(entrar));
  $('btnAlta')?.addEventListener('click', conAviso(darDeAlta));
  $('btnAnadir')?.addEventListener('click', conAviso(darDeAlta));
  $('btnSalir')?.addEventListener('click', conAviso(async () => {
    await pedir('/api/acceso/salir', { method: 'POST' });
    location.reload();
  }));

  try {
    await pintar();
  } catch (e) {
    $('cargando').hidden = true;
    aviso(e.message, true);
  }
});
