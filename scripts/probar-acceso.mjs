/**
 * Prueba de punta a punta del acceso por passkeys.
 *
 *   1. npx wrangler pages dev . --port 8788 \
 *        --d1=MONTOS=calculadora-montos \
 *        --binding ACCESO_BOOTSTRAP=clave-de-prueba-local
 *   2. borrar las tablas de acceso de la base local (el bootstrap solo vale
 *      cuando no hay nadie dado de alta, así que si no se limpia, falla)
 *   3. node scripts/probar-acceso.mjs
 *
 * Usa un autenticador virtual de Chrome, así que firma de verdad: sin esto,
 * la verificación de firmas se estaría enviando a producción sin haberla
 * ejecutado nunca. Recorre el alta con invitación, el segundo aparato, la
 * salida, la vuelta a entrar, la invitación gastada y una firma inventada.
 *
 * Playwright no es dependencia de este repo —es un sitio estático sin build—
 * así que se toma prestado de donde esté instalado.
 */
import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_DESDE || '/Users/carlosjardim/Desktop/cabokenedy-carrusel/');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8788';
const MAESTRA = 'clave-de-prueba-local';

let fallos = 0;
const comprobar = (titulo, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${titulo.padEnd(50)} ${JSON.stringify(real)}${ok ? '' : `  (esperado ${JSON.stringify(esperado)})`}`);
};

const navegador = await chromium.launch({ channel: 'chrome' });
const contexto = await navegador.newContext({ ignoreHTTPSErrors: true });
const pagina = await contexto.newPage();

// Autenticador virtual: hace de Face ID / huella
const cdp = await contexto.newCDPSession(pagina);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

console.log('\nANTES DE ENTRAR');
await pagina.goto(`${BASE}/api/bcv`, { waitUntil: 'domcontentloaded' });
comprobar('/api/bcv está cerrado', await pagina.evaluate(() => document.body.innerText.includes('iniciar sesión')), true);

console.log('\nINVITACIÓN CON LA CLAVE MAESTRA');
const inv = await (await fetch(`${BASE}/api/acceso/invitar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ para: 'Carlos', maestra: MAESTRA }),
})).json();
comprobar('se crea la invitación', inv.ok, true);
const codigo = new URL(inv.enlace).searchParams.get('codigo');
comprobar('el código es largo (no adivinable)', codigo.length >= 40, true);

const sinClave = await (await fetch(`${BASE}/api/acceso/invitar`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ para: 'Intruso', maestra: 'lo-que-sea' }),
})).json();
comprobar('con clave maestra falsa, no', sinClave.ok, false);

console.log('\nALTA CON LA INVITACIÓN');
await pagina.goto(`${BASE}/acceso?codigo=${codigo}`);
await pagina.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
await pagina.fill('#apodo', 'Samsung de prueba');
await pagina.click('#btnAlta');
await pagina.waitForURL(/\/calculadora/, { timeout: 15000 });
comprobar('tras el alta, entra a la calculadora', pagina.url().includes('/calculadora'), true);

console.log('\nYA DENTRO');
// Por el contexto del navegador: lleva las cookies igual que la página y no
// depende de que esta haya terminado de cargar.
const conSesion = (await contexto.request.get(`${BASE}/api/bcv`)).status();
comprobar('/api/bcv ya responde', conSesion, 200);

await pagina.goto(`${BASE}/acceso`);
await pagina.waitForSelector('#dentro:not([hidden])', { timeout: 10000 });
comprobar('la página saluda por el nombre', (await pagina.textContent('#saludo')).includes('Carlos'), true);
comprobar('aparece el aparato dado de alta', (await pagina.textContent('#aparatos')).includes('Samsung de prueba'), true);

console.log('\nSEGUNDO APARATO (el caso Samsung + iPhone)');
await pagina.fill('#apodoNuevo', 'iPhone de prueba');
await pagina.click('#btnAnadir');
await pagina.waitForTimeout(2500);
comprobar('ahora hay dos aparatos', (await pagina.textContent('#aparatos')).includes('iPhone de prueba'), true);

console.log('\nSALIR Y VOLVER A ENTRAR');
await pagina.click('#btnSalir');
await pagina.waitForTimeout(1500);
const traSalir = (await contexto.request.get(`${BASE}/api/bcv`)).status();
comprobar('al salir, la puerta vuelve a cerrarse', traSalir, 401);

await pagina.goto(`${BASE}/acceso`);
await pagina.waitForSelector('#fuera:not([hidden])', { timeout: 10000 });
await pagina.click('#btnEntrar');
await pagina.waitForURL(/\/calculadora/, { timeout: 15000 });
comprobar('se entra con la passkey, sin escribir nada', pagina.url().includes('/calculadora'), true);
comprobar('y los datos vuelven a servirse', (await contexto.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nLA INVITACIÓN NO SE PUEDE REUTILIZAR');
const repetida = await (await fetch(`${BASE}/api/acceso/reto?tipo=alta&codigo=${codigo}`)).json();
comprobar('la invitación ya gastada se rechaza', repetida.ok, false);

console.log('\nFIRMA MANIPULADA');
const reto = await (await fetch(`${BASE}/api/acceso/reto?tipo=entrada`)).json();
const falsa = await (await fetch(`${BASE}/api/acceso/entrar`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credencial: 'inventada', clientData: 'x', authData: 'x', firma: 'x' }),
})).json();
comprobar('una credencial inventada no entra', falsa.ok, false);

await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
await navegador.close();
console.log(fallos ? `\n${fallos} COMPROBACIONES FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
