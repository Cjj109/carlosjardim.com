/**
 * Pérdida del aparato y recuperación.
 * Es la pregunta del dueño: ¿y si pierdo el teléfono que tiene la llave?
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
  await a.pag.waitForSelector('#alta:not([hidden])');
  await a.pag.fill('#apodo', apodo);
  await a.pag.click('#btnAlta');
};

console.log('\nALTA CON INVITACIÓN');
const inv1 = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Carlos', maestra: MAESTRA }) })).json();
const samsung = await aparato();
await alta(samsung, inv1.enlace, 'Samsung');
await samsung.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('entra tras darse de alta', (await samsung.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nSEGUNDO APARATO Y QUITAR EL PERDIDO');
await samsung.pag.goto(`${BASE}/acceso`);
await samsung.pag.waitForSelector('#dentro:not([hidden])');
ok('con una sola llave no se ofrece quitarla', await samsung.pag.locator('.quitar').count(), 0);
await samsung.pag.fill('#apodoNuevo', 'iPhone');
await samsung.pag.click('#btnAnadir');
await samsung.pag.waitForTimeout(2500);
ok('ahora hay dos aparatos', await samsung.pag.locator('#aparatos li').count(), 2);
ok('y ya se pueden quitar', await samsung.pag.locator('.quitar').count(), 2);

samsung.pag.on('dialog', (d) => d.accept());
await samsung.pag.locator('.quitar').first().click();
await samsung.pag.waitForTimeout(2000);
ok('quitado el perdido, queda uno', await samsung.pag.locator('#aparatos li').count(), 1);

console.log('\nSE PIERDEN TODOS LOS APARATOS');
const perdido = await aparato();
ok('desde uno nuevo, no se entra', (await perdido.ctx.request.get(`${BASE}/api/bcv`)).status(), 401);
const rescate = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Carlos otra vez', maestra: MAESTRA }) })).json();
ok('la clave maestra SÍ rescata, ya con gente dentro', rescate.ok, true);
await alta(perdido, rescate.enlace, 'Teléfono nuevo');
await perdido.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('y se vuelve a entrar', (await perdido.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nSIN LA CLAVE MAESTRA PUESTA, ESA PUERTA NO EXISTE');
const sinMaestra = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Intruso', maestra: 'inventada' }) })).json();
ok('con una clave falsa, no', sinMaestra.ok, false);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
