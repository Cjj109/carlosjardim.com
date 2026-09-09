/**
 * Qué borra cada botón. Es lo que se acaba de corregir, así que conviene que
 * quede fijado: "Borrar" limpia la vista y nada más; "Que lo olvide" se lleva
 * lo aprendido Y la conversación guardada.
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
await pag.waitForURL(/\/calculadora/);
await pag.waitForTimeout(1200);

// Se siembra memoria a mano: el modelo no responde en local sin clave
const sembrar = async () => {
  const r = await ctx.request.get(`${BASE}/api/iq-memoria`);
  return r.json();
};
ok('al principio no sabe nada', (await sembrar()).notas, '');

console.log('\n"BORRAR" ES SOLO ESTÉTICO');
await pag.evaluate(() => {
  if (document.getElementById('calcPanel60iq').hidden) document.getElementById('calc60iq').click();
});
await pag.waitForTimeout(300);
await pag.evaluate(() => document.querySelector('.calc-iq-ejemplo').click());
await pag.waitForTimeout(2500);
ok('hay burbujas en pantalla', (await pag.locator('.calc-iq-dice').count()) > 0, true);

let peticionesDeBorrado = 0;
pag.on('request', (r) => { if (r.url().includes('/api/iq-memoria') && r.method() === 'DELETE') peticionesDeBorrado++; });
await pag.click('#iqBorrar');
await pag.waitForTimeout(800);
ok('la pantalla queda limpia', await pag.locator('.calc-iq-dice').count(), 0);
ok('y NO pidió borrar nada al servidor', peticionesDeBorrado, 0);

console.log('\n"QUE LO OLVIDE" SÍ BORRA');
// Sembrar notas directamente en la base para poder comprobar el borrado
await pag.evaluate(() => { window.__confirmar = window.confirm; window.confirm = () => true; });

// Se siembra memoria en la base, que es lo que el modelo llenaría en producción
const { execSync } = await import('node:child_process');
const DB = '/Users/carlosjardim/Desktop/carlosjardim.com/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0b59cbbbe68fea6379b8b6d9dcc0fbcced0dd88b0b03cbdbb78c723bb48b08cf.sqlite';
/* La persona de ESTA prueba, no la primera de la tabla: la base local se
   queda con la gente de las pruebas anteriores y con `LIMIT 1` se sembraba
   la memoria de otro. Salía en rojo sin que nada estuviera roto. */
const persona = execSync(`sqlite3 "${DB}" "SELECT id FROM personas ORDER BY creada_en DESC, rowid DESC LIMIT 1;"`).toString().trim();
execSync(`sqlite3 "${DB}" "INSERT OR REPLACE INTO iq_notas (persona_id, notas) VALUES ('${persona}', '- paga casi siempre en USDT'); INSERT INTO iq_turnos (persona_id, rol, texto) VALUES ('${persona}','user','hola'),('${persona}','assistant','qué tal');"`);

const antes = await (await ctx.request.get(`${BASE}/api/iq-memoria`)).json();
ok('ahora sabe algo', antes.notas.includes('USDT'), true);
ok('y tiene la charla guardada', antes.turnosGuardados, 2);

await pag.evaluate(() => document.getElementById('iqMemoria').open = true);
await pag.waitForTimeout(800);
ok('se puede ver desde la app', (await pag.textContent('#iqNotas')).includes('USDT'), true);

await pag.click('#iqOlvidar');
await pag.waitForTimeout(1200);
const despues = await (await ctx.request.get(`${BASE}/api/iq-memoria`)).json();
ok('tras olvidar, no sabe nada', despues.notas, '');
ok('y la charla guardada también se fue', despues.turnosGuardados, 0);

await nav.close();
console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
