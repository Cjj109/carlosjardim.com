/**
 * El recorrido completo TAL COMO LO HARÁ EL DUEÑO: todo desde la página, sin
 * una sola línea de terminal. Primera vez, entrar, invitar a alguien, y que
 * ese alguien entre con su enlace.
 */
import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_DESDE || '/Users/carlosjardim/Desktop/cabokenedy-carrusel/');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8788';
let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(52)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};

const navegador = await chromium.launch({ channel: 'chrome' });

async function aparato(nombre) {
  const ctx = await navegador.newContext();
  const pag = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pag);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { nombre, ctx, pag };
}

console.log('\nCARLOS, PRIMERA VEZ (desde el teléfono, sin terminal)');
const carlos = await aparato('samsung');
await carlos.pag.goto(`${BASE}/acceso`);
await carlos.pag.waitForSelector('#fuera:not([hidden])');
await carlos.pag.click('#primeraVez summary');
await carlos.pag.fill('#maestra', 'clave-de-prueba-local');
await carlos.pag.fill('#primerNombre', 'Carlos');
await carlos.pag.click('#btnPrimera');
await carlos.pag.waitForSelector('#invitacionPrimera:not([hidden])', { timeout: 10000 });
ok('la página le da su enlace', (await carlos.pag.textContent('#invitacionPrimeraUrl')).includes('/acceso?codigo='), true);

await carlos.pag.click('#btnIrPrimera');
await carlos.pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
await carlos.pag.fill('#apodo', 'Samsung');
await carlos.pag.click('#btnAlta');
await carlos.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('crea su passkey y entra', (await carlos.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nCARLOS INVITA A MIGUEL, TAMBIÉN DESDE LA PÁGINA');
await carlos.pag.goto(`${BASE}/acceso`);
await carlos.pag.waitForSelector('#dentro:not([hidden])');
await carlos.pag.fill('#invitado', 'Miguel');
await carlos.pag.click('#btnInvitar');
await carlos.pag.waitForSelector('#invitacion:not([hidden])', { timeout: 10000 });
const enlaceMiguel = await carlos.pag.textContent('#invitacionUrl');
ok('sale el enlace para Miguel', enlaceMiguel.includes('/acceso?codigo='), true);
ok('y dice para quién es', await carlos.pag.textContent('#invitacionPara'), 'Miguel');

console.log('\nMIGUEL, EN SU PROPIO APARATO');
const miguel = await aparato('iphone');
ok('antes de entrar, no ve nada', (await miguel.ctx.request.get(`${BASE}/api/bcv`)).status(), 401);
await miguel.pag.goto(enlaceMiguel.replace('https://', 'http://'));
await miguel.pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
ok('su invitación dice su nombre', await miguel.pag.textContent('#invitadoA'), 'Miguel');
await miguel.pag.fill('#apodo', 'iPhone de Miguel');
await miguel.pag.click('#btnAlta');
await miguel.pag.waitForURL(/\/calculadora/, { timeout: 15000 });
ok('Miguel entra con su passkey', (await miguel.ctx.request.get(`${BASE}/api/bcv`)).status(), 200);

console.log('\nCADA UNO CON LO SUYO');
await miguel.pag.goto(`${BASE}/acceso`);
await miguel.pag.waitForSelector('#dentro:not([hidden])');
ok('Miguel se ve a sí mismo', (await miguel.pag.textContent('#saludo')).includes('Miguel'), true);
ok('y solo su aparato', (await miguel.pag.textContent('#aparatos')).includes('Samsung'), false);

const repetido = await (await fetch(enlaceMiguel.replace('https://', 'http://').replace('/acceso?codigo=', '/api/acceso/reto?tipo=alta&codigo='))).json();
ok('su invitación ya no sirve otra vez', repetido.ok, false);

await navegador.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
