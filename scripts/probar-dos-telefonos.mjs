/**
 * El caso de Miguel: dos teléfonos, y la web app instalada en los dos.
 *
 * Lo que se comprueba es que sigue siendo UNA persona con DOS llaves, y no
 * dos personas distintas. Y que la app instalada —que en iOS tiene su propio
 * almacén, separado del navegador— puede entrar con la misma passkey.
 *
 *   node scripts/probar-dos-telefonos.mjs
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
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(52)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};

const nav = await chromium.launch({ channel: 'chrome' });

/**
 * Un aparato. `llavero` compartido imita iCloud o Google: dos contextos
 * distintos —el navegador y la app instalada— con acceso a las mismas
 * passkeys. Sin compartirlo, son dos aparatos sin nada en común.
 */
async function aparato(llavero) {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pag);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  if (llavero) {
    for (const c of llavero) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: c });
  }
  return {
    ctx, pag, cdp, authenticatorId,
    llaves: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials,
  };
}

const alta = async (a, enlace, apodo) => {
  await a.pag.goto(enlace.replace('https://', 'http://'));
  await a.pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
  await a.pag.fill('#apodo', apodo);
  await a.pag.click('#btnAlta');
  await a.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
};

console.log('\nTELÉFONO 1: MIGUEL ABRE SU INVITACIÓN');
const inv = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Miguel', maestra: MAESTRA }) })).json();
const tel1 = await aparato();
await alta(tel1, inv.enlace, 'iPhone');
ok('entra al primer intento', (await tel1.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nSE INSTALA LA WEB APP EN ESE MISMO TELÉFONO');
// En iOS la app instalada tiene su propio almacén: no hereda la sesión del
// navegador, pero sí ve las passkeys del llavero del sistema.
const llaveroTel1 = await tel1.llaves();
const app1 = await aparato(llaveroTel1);
ok('la app arranca sin sesión, como en iOS', (await app1.ctx.request.get(`${BASE}/api/bcv`)).status(), 401);
await app1.pag.goto(`${BASE}/acceso`);
await app1.pag.waitForSelector('#fuera:not([hidden])');
await app1.pag.click('#btnEntrar');
await app1.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('con un toque entra: la passkey ya está', (await app1.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nTELÉFONO 2: EL ENLACE QUE MIGUEL SE MANDA A SÍ MISMO');
await tel1.pag.goto(`${BASE}/acceso`);
await tel1.pag.waitForSelector('#dentro:not([hidden])');
await tel1.pag.click('#btnOtroAparato');
await tel1.pag.waitForSelector('#enlaceAparato:not([hidden])', { timeout: 10000 });
const enlace2 = await tel1.pag.textContent('#enlaceAparatoUrl');

const tel2 = await aparato();
await alta(tel2, enlace2, 'Samsung');
ok('el segundo teléfono entra', (await tel2.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nLO QUE IMPORTA: ¿UNA PERSONA O DOS?');
await tel2.pag.goto(`${BASE}/acceso`);
await tel2.pag.waitForSelector('#dentro:not([hidden])');
ok('se llama Miguel, no "Miguel (2)"', (await tel2.pag.textContent('#saludo')).includes('Miguel'), true);
ok('ve sus DOS aparatos juntos', await tel2.pag.locator('#aparatos li').count(), 2);
const lista = await tel2.pag.textContent('#aparatos');
ok('el iPhone está en la lista', lista.includes('iPhone'), true);
ok('y el Samsung también', lista.includes('Samsung'), true);

console.log('\nY LA APP INSTALADA EN EL SEGUNDO TELÉFONO');
const app2 = await aparato(await tel2.llaves());
await app2.pag.goto(`${BASE}/acceso`);
await app2.pag.waitForSelector('#fuera:not([hidden])');
await app2.pag.click('#btnEntrar');
await app2.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('también entra con un toque', (await app2.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
