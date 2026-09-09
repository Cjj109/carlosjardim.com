/**
 * Salir tiene que sacar de verdad, también sin señal.
 *
 * La cookie se borraba y ahí acababa todo: el service worker seguía con las
 * últimas tasas y con la pantalla de la calculadora guardadas en el teléfono.
 * Sin red, esa copia se sirve —el 302 a /acceso no llega si no hay red—, así
 * que quien cogiera el aparato después veía los datos del que acababa de
 * salir. Aquí se comprueba que la copia se va y que la app se queda.
 *
 *   npx wrangler pages dev . --port 8788 --d1=MONTOS=calculadora-montos \
 *     --binding ACCESO_BOOTSTRAP=clave-de-prueba-local
 *   node scripts/probar-salir.mjs
 */
import { execSync } from 'node:child_process';
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
const ctx = await nav.newContext();
const pag = await ctx.newPage();
const cdp = await ctx.newCDPSession(pag);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const inv = await (await fetch(`${BASE}/api/acceso/invitar`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ para: 'Carlos', maestra: MAESTRA }),
})).json();
await pag.goto(inv.enlace.replace('https://', 'http://'));
await pag.waitForSelector('#alta:not([hidden])', { timeout: 10000 });
await pag.fill('#apodo', 'Teléfono de prueba');
await pag.click('#btnAlta');
await pag.waitForURL(/\/calculadora/, { timeout: 15000 });

/* El service worker se instala en la primera visita y toma el mando despues.
   La propia pagina recarga sola al cambiar de mando, asi que aqui no se
   recarga a mano —las dos recargas chocaban— sino que se espera a que haya
   mando y luego se vuelve a entrar para que las peticiones pasen por el. */
await pag.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
await pag.goto(`${BASE}/calculadora`);
await pag.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
await pag.waitForTimeout(3000);

const guardado = () => pag.evaluate(async () => {
  const nombres = await caches.keys();
  const todo = [];
  for (const n of nombres) {
    const c = await caches.open(n);
    todo.push(...(await c.keys()).map((p) => new URL(p.url).pathname));
  }
  return todo;
});

console.log('\nCON LA SESIÓN ABIERTA');
const antes = await guardado();
ok('las tasas quedan guardadas para el modo sin señal', antes.includes('/api/bcv'), true);
ok('y la pantalla de la calculadora también', antes.includes('/calculadora'), true);
ok('la memoria del 60 IQ NO se guarda nunca', antes.includes('/api/iq-memoria'), false);
const app = antes.some((p) => p.startsWith('/css/'));
ok('la app (estilos) está guardada', app, true);

console.log('\nUNA PETICIÓN CORRIENTE NO ESCRIBE EN LA BASE');
{
  /* `ultimo_uso` se apuntaba en CADA petición con sesión. La calculadora
     repregunta la tasa cada minuto, así que una pestaña abierta escribía
     sesenta veces por hora en una base que se paga por escritura, y para
     apuntar un dato que solo sirve para mirar cuándo se usó algo. Ahora se
     refresca como mucho una vez al día. */
  const DB = '/Users/carlosjardim/Desktop/carlosjardim.com/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0b59cbbbe68fea6379b8b6d9dcc0fbcced0dd88b0b03cbdbb78c723bb48b08cf.sqlite';
  const uso = () => execSync(`sqlite3 "${DB}" "SELECT ultimo_uso FROM sesiones LIMIT 1;"`).toString().trim();
  ok('queda apuntado cuándo se usó', uso().length > 0, true);
  const antes = uso();
  for (let i = 0; i < 5; i++) await ctx.request.get(`${BASE}/api/bcv`);
  ok('cinco peticiones más y no se reescribe', uso(), antes);
}

console.log('\nSI LA SESIÓN MUERE CON LA APP ABIERTA');
{
  /* Es lo que pasa cuando desde otro teléfono te quitan la llave. Antes la
     calculadora se quedaba abierta con las cifras de antes y el 401 se
     recogía como "no se pudieron cargar las tasas": números viejos en
     pantalla y ni una palabra de que ya no tenías entrada. */
  await pag.evaluate(() => fetch('/api/acceso/salir', { method: 'POST' }));
  await pag.evaluate(() => document.getElementById('calcRefrescar')?.click());
  await pag.waitForURL(/\/acceso/, { timeout: 10000 }).catch(() => {});
  ok('la app manda sola a la puerta', pag.url().includes('/acceso'), true);
  ok('y guarda a dónde volver', pag.url().includes('volver='), true);
}

// Se vuelve a entrar para poder probar el botón de salir con sesión viva
await pag.goto(`${BASE}/acceso`);
await pag.waitForSelector('#btnEntrar', { timeout: 10000 });
await pag.click('#btnEntrar');
await pag.waitForURL(/\/calculadora/, { timeout: 15000 });
await pag.waitForTimeout(2500);
ok('vuelve a haber tasas guardadas', (await guardado()).includes('/api/bcv'), true);

console.log('\nDESPUÉS DE SALIR');
await pag.goto(`${BASE}/acceso`);
await pag.waitForSelector('#btnSalir', { timeout: 10000 });
await pag.click('#btnSalir');
await pag.waitForTimeout(2000);

const despues = await guardado();
ok('las tasas ya no están en el teléfono', despues.includes('/api/bcv'), false);
ok('ni la pantalla de la calculadora', despues.includes('/calculadora'), false);
ok('pero la app sigue, para no volver a bajarla', despues.some((p) => p.startsWith('/css/')), true);

console.log('\nY LA PUERTA VUELVE A ESTAR CERRADA');
ok('la cookie ya no vale', (await ctx.request.get(`${BASE}/api/bcv`)).status(), 401);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
