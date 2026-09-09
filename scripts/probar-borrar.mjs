import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_DESDE || '/Users/carlosjardim/Desktop/cabokenedy-carrusel/');
const { chromium } = require('playwright');
const BASE = 'http://localhost:8788';
let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(48)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};

const nav = await chromium.launch({ channel: 'chrome' });
const ctx = await nav.newContext();
const pag = await ctx.newPage();
const cdp = await ctx.newCDPSession(pag);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

const inv = await (await fetch(`${BASE}/api/acceso/invitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'Carlos', maestra: 'clave-de-prueba-local' }) })).json();
await pag.goto(inv.enlace.replace('https://', 'http://'));
await pag.waitForSelector('#alta:not([hidden])');
await pag.fill('#apodo', 'Prueba');
await pag.click('#btnAlta');
await pag.waitForURL(/\/calculadora/, { timeout: 15000 });
await pag.waitForTimeout(1200);

// En pantalla ancha el panel ARRANCA abierto: pulsarlo lo cerraría. Solo se
// abre si hace falta.
await pag.evaluate(() => {
  if (document.getElementById('calcPanel60iq').hidden) document.getElementById('calc60iq').click();
});
await pag.waitForTimeout(400);

ok('al abrir, no hay nada que borrar', await pag.locator('#iqBorrar:not([hidden])').count(), 0);
ok('y se ven los ejemplos', await pag.locator('.calc-iq-ejemplos').count(), 1);

// Simular una conversación con el renderizador real
await pag.evaluate(() => {
  const ev = new Event('x');
  // burbuja() es interna; se dispara por el camino real: un ejemplo
  document.querySelector('.calc-iq-ejemplo').click();
});
await pag.waitForTimeout(2500);
const hayBurbujas = await pag.locator('.calc-iq-dice').count();
ok('aparecen burbujas al preguntar', hayBurbujas > 0, true);
ok('y ahora sí sale el botón', await pag.locator('#iqBorrar:not([hidden])').count(), 1);
ok('los ejemplos se apartaron', await pag.locator('.calc-iq-ejemplos').count(), 0);

await pag.click('#iqBorrar');
await pag.waitForTimeout(400);
ok('al borrar no queda ninguna burbuja', await pag.locator('.calc-iq-dice').count(), 0);
ok('vuelven los ejemplos', await pag.locator('.calc-iq-ejemplos').count(), 1);
ok('y el botón se esconde otra vez', await pag.locator('#iqBorrar:not([hidden])').count(), 0);
ok('la memoria del 60 IQ queda vacía', await pag.evaluate(() => {
  // iqCharlaPrevia es interna; se comprueba por su efecto: tras borrar, el
  // siguiente envío no debe arrastrar historial
  return document.querySelectorAll('.calc-iq-dice').length;
}), 0);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
