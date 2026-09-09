/**
 * Quién puede repartir accesos.
 *
 * El dueño —quien entró por la clave maestra— invita. Los demás no, pero sí
 * pueden añadir sus propios aparatos, que es lo que de verdad necesitan.
 *
 *   node scripts/probar-quien-invita.mjs
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
const aparato = async () => {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pag);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { ctx, pag };
};
const alta = async (a, enlace, apodo) => {
  await a.pag.goto(enlace.replace('https://', 'http://'));
  await a.pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
  await a.pag.fill('#apodo', apodo);
  await a.pag.click('#btnAlta');
  await a.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
};

const invC = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Carlos', maestra: MAESTRA }) })).json();
const carlos = await aparato();
await alta(carlos, invC.enlace, 'iPhone');

console.log('\nEL DUEÑO');
await carlos.pag.goto(`${BASE}/acceso`);
await carlos.pag.waitForSelector('#dentro:not([hidden])');
ok('ve la casilla de invitar', await carlos.pag.locator('#bloqueInvitar:not([hidden])').count(), 1);
await carlos.pag.fill('#invitado', 'Miguel');
await carlos.pag.click('#btnInvitar');
await carlos.pag.waitForSelector('#invitacion:not([hidden])');
const paraMiguel = await carlos.pag.textContent('#invitacionUrl');
ok('y puede invitar', paraMiguel.includes('/acceso?codigo='), true);

console.log('\nMIGUEL, YA DENTRO');
const miguel = await aparato();
await alta(miguel, paraMiguel, 'iPhone de Miguel');
await miguel.pag.goto(`${BASE}/acceso`);
await miguel.pag.waitForSelector('#dentro:not([hidden])');
ok('NO ve la casilla de invitar', await miguel.pag.locator('#bloqueInvitar:not([hidden])').count(), 0);
ok('pero sí el enlace para su otro teléfono', await miguel.pag.locator('#btnOtroAparato').count(), 1);

const aPelo = await miguel.ctx.request.post(`${BASE}/api/acceso/invitar`, { data: { para: 'Colado' } });
ok('y por la API tampoco, no solo escondido', aPelo.status(), 403);

await miguel.pag.click('#btnOtroAparato');
await miguel.pag.waitForSelector('#enlaceAparato:not([hidden])', { timeout: 10000 });
const suyo = await miguel.pag.textContent('#enlaceAparatoUrl');
const miguel2 = await aparato();
await alta(miguel2, suyo, 'Samsung de Miguel');
ok('su segundo aparato entra igual', (await miguel2.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
