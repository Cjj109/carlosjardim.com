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

async function entrar(correo) {
  aviso('Pidiéndole la firma al aparato…');
  const url = correo ? `/api/acceso/reto?tipo=entrada&correo=${encodeURIComponent(correo)}` : '/api/acceso/reto?tipo=entrada';
  const { reto, llaves } = await pedir(url);

  /* Sin correo no se pasa allowCredentials: las llaves son descubribles, así
     que el navegador enseña las que tiene para este sitio y se entra con un
     gesto, sin escribir nada. Con correo se le dice exactamente cuál pedir,
     que es el repuesto para cuando ese listado no aparece. */
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: aBytes(reto),
      rpId: location.hostname,
      userVerification: 'preferred',
      timeout: 120000,
      ...(llaves?.length
        ? { allowCredentials: llaves.map((id) => ({ type: 'public-key', id: aBytes(id) })) }
        : {}),
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
      correo: ($('correo')?.value || '').trim(),
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

/* ---------- Invitar ---------- */

/**
 * Crear una invitación desde la propia página.
 *
 * Existía solo como una llamada a la API, y eso obligaba a abrir una terminal
 * para dar de alta a alguien. Quien lleva esto lo hace desde el teléfono: si
 * añadir a una persona pide un ordenador, al final no se añade a nadie o se
 * acaba compartiendo una llave que no se debía compartir.
 */
async function invitar() {
  const nombre = ($('invitado').value || '').trim();
  if (!nombre) return aviso('¿Para quién es la invitación?', true);

  aviso('Creando la invitación…');
  const { enlace, para } = await pedir('/api/acceso/invitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ para: nombre }),
  });

  $('invitacionPara').textContent = para;
  $('invitacionUrl').textContent = enlace;
  $('invitacion').hidden = false;
  $('invitado').value = '';
  aviso('');
}

async function copiarEnlace() {
  const texto = $('invitacionUrl').textContent;
  try {
    await navigator.clipboard.writeText(texto);
    aviso('Enlace copiado. Pásaselo por donde quieras.');
  } catch {
    // Sin permiso de portapapeles queda el texto a la vista para copiarlo a mano
    aviso('Cópialo a mano de la caja de arriba.', true);
  }
}

/** La primerísima invitación, con la clave de arranque de Cloudflare */
async function primeraInvitacion() {
  const maestra = ($('maestra').value || '').trim();
  const nombre = ($('primerNombre').value || '').trim();
  if (!maestra || !nombre) return aviso('Hacen falta la clave y tu nombre', true);

  aviso('Creando tu invitación…');
  const { enlace } = await pedir('/api/acceso/invitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ para: nombre, maestra }),
  });

  $('maestra').value = '';
  $('invitacionPrimeraUrl').textContent = enlace;
  $('invitacionPrimera').hidden = false;
  $('btnIrPrimera').onclick = () => { location.href = enlace; };
  aviso('');
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
    const soloUno = yo.aparatos.length <= 1;
    $('aparatos').innerHTML = yo.aparatos
      .map(
        (a) =>
          `<li><span class="ap-nombre">${a.apodo.replace(/[<>&]/g, '')}</span>` +
          `<span class="ap-fecha">desde ${fecha(a.desde)}</span>` +
          (soloUno
            ? ''
            : `<button class="quitar" type="button" data-llave="${a.id.replace(/"/g, '')}">Quitar</button>`) +
          `</li>`
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

/**
 * Quitar la llave de un aparato que ya no se tiene.
 *
 * La última no se puede quitar y por eso su botón ni aparece: ofrecer un clic
 * que deja a alguien fuera de su propio sitio, y explicárselo después con un
 * mensaje de error, es enseñar una puerta que no lleva a ninguna parte.
 */
async function quitarLlave(id, comoSeLlama) {
  if (!confirm(`¿Quitar el acceso de "${comoSeLlama}"? Ese aparato tendrá que darse de alta otra vez.`)) return;
  await pedir('/api/acceso/revocar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  await pintar();
  aviso('Quitado.');
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

  $('btnEntrar')?.addEventListener('click', conAviso(() => entrar()));
  $('btnEntrarCorreo')?.addEventListener('click', conAviso(() => {
    const correo = ($('correoEntrar').value || '').trim();
    if (!correo) return aviso('Escribe tu correo', true);
    return entrar(correo);
  }));
  $('btnAlta')?.addEventListener('click', conAviso(darDeAlta));
  $('btnAnadir')?.addEventListener('click', conAviso(darDeAlta));
  $('aparatos')?.addEventListener('click', (e) => {
    const boton = e.target.closest('.quitar');
    if (boton) conAviso(() => quitarLlave(boton.dataset.llave, boton.closest('li').querySelector('.ap-nombre').textContent))();
  });
  $('btnInvitar')?.addEventListener('click', conAviso(invitar));
  $('btnCopiar')?.addEventListener('click', conAviso(copiarEnlace));
  $('btnPrimera')?.addEventListener('click', conAviso(primeraInvitacion));
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
