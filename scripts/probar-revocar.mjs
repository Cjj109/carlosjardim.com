/**
 * Lo que pasa al quitar la llave de un teléfono perdido.
 *
 * El fallo que esto vigila: quitar la llave no cerraba la sesión de ese
 * aparato, así que su cookie seguía valiendo 180 días. El botón "Quitar"
 * prometía algo que no hacía, que es la peor clase de fallo de seguridad: el
 * que deja tranquilo a quien debería preocuparse.
 *
 *   node scripts/probar-revocar.mjs
 */
import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_DESDE || '/Users/carlosjardim/Desktop/cabokenedy-carrusel/');
const { chromium } = require('playwright');
const BASE = 'http://localhost:8788';
const MAESTRA = 'clave-de-prueba-local';
let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(54)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};

const nav = await chromium.launch({ channel: 'chrome' });
const aparato = async (uv = true) => {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pag);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: uv, isUserVerified: uv, automaticPresenceSimulation: true },
  });
  return { ctx, pag, cdp, authenticatorId };
};
const alta = async (a, enlace, apodo) => {
  await a.pag.goto(enlace.replace('https://', 'http://'));
  await a.pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
  await a.pag.fill('#apodo', apodo);
  await a.pag.click('#btnAlta');
  await a.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
};

const inv = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Carlos', maestra: MAESTRA }) })).json();
const tel1 = await aparato();
await alta(tel1, inv.enlace, 'iPhone');

// Segundo aparato, con su propia sesión
await tel1.pag.goto(`${BASE}/acceso`);
await tel1.pag.waitForSelector('#dentro:not([hidden])');
await tel1.pag.click('#btnOtroAparato');
await tel1.pag.waitForSelector('#enlaceAparato:not([hidden])');
const enlace2 = await tel1.pag.textContent('#enlaceAparatoUrl');
const tel2 = await aparato();
await alta(tel2, enlace2, 'Samsung');

console.log('\nLOS DOS DENTRO');
ok('el iPhone entra', (await tel1.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);
ok('el Samsung entra', (await tel2.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nSE PIERDE EL SAMSUNG Y SE LE QUITA LA LLAVE DESDE EL IPHONE');
await tel1.pag.goto(`${BASE}/acceso`);
await tel1.pag.waitForSelector('#dentro:not([hidden])');
tel1.pag.on('dialog', (d) => d.accept());
const fila = tel1.pag.locator('#aparatos li', { hasText: 'Samsung' });
await fila.locator('.quitar').click();
await tel1.pag.waitForTimeout(2000);

ok('el Samsung queda FUERA en el acto', (await tel2.ctx.request.get(`${BASE}/api/bcv`)).status(), 401);
ok('y el iPhone sigue dentro', (await tel1.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nSIN CARA NI HUELLA NO SE ENTRA');
// Un autenticador que no verifica a la persona: solo sabe que alguien lo tocó
const robado = await aparato(false);
await robado.pag.goto(`${BASE}/acceso`);
await robado.pag.waitForSelector('#fuera:not([hidden])');
const invB = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'SinUV', maestra: MAESTRA }) })).json();
await robado.pag.goto(invB.enlace.replace('https://', 'http://'));
await robado.pag.waitForSelector('#alta:not([hidden])');
await robado.pag.fill('#apodo', 'Sin verificación');
await robado.pag.click('#btnAlta');
await robado.pag.waitForTimeout(3000);
ok('no se da de alta sin verificación', (await robado.ctx.request.get(`${BASE}/api/bcv`)).status(), 401);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
