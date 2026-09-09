/**
 * Los topes y las entradas mal formadas.
 *
 * Todo lo de aquí es alcanzable SIN sesión: son las puertas que cualquiera
 * puede tocar desde fuera. Lo que se comprueba no es que rechacen —eso ya se
 * probaba— sino CÓMO rechazan: un 500 sin cuerpo es un fallo del servidor y
 * se ve como tal; un 400 o un 429 es una respuesta.
 *
 *   npx wrangler pages dev . --port 8788 --d1=MONTOS=calculadora-montos \
 *     --binding ACCESO_BOOTSTRAP=clave-de-prueba-local
 *   node scripts/probar-limites.mjs
 */
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:8788';
const MAESTRA = 'clave-de-prueba-local';
const DB =
  '/Users/carlosjardim/Desktop/carlosjardim.com/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0b59cbbbe68fea6379b8b6d9dcc0fbcced0dd88b0b03cbdbb78c723bb48b08cf.sqlite';

let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(52)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};
const sql = (q) => execSync(`sqlite3 "${DB}" "${q}"`).toString().trim();
const post = (ruta, cuerpo) =>
  fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

console.log('\nauthData MAL FORMADO (se comprueba la función, no la ruta)');
{
  /* Por la ruta no se llega: revisarClientData corta antes con un 401. Pero
     con un clientData bueno sí se llega, y entonces un authData que no es
     base64 hacía lanzar a atob fuera de todo try: 500 sin cuerpo. */
  const { authDataValida } = await import('../functions/_acceso.js');
  const basura = await authDataValida('!!!no es base64!!!', 'localhost').catch((e) => ({ lanzo: e.message }));
  ok('no lanza, devuelve el motivo', basura.ok === false && !basura.lanzo, true);
  ok('ni con undefined', (await authDataValida(undefined, 'localhost').catch(() => ({ lanzo: true }))).ok, false);
  ok('ni con un authData demasiado corto', (await authDataValida('AAAA', 'localhost')).ok, false);
}

console.log('\nENTRAR CON BASURA (nadie autenticado del otro lado)');
{
  const tipos = await post('/api/acceso/entrar', {
    credencial: 1, clientData: {}, authData: [], firma: null,
  });
  ok('campos que no son texto dan 400', tipos.status, 400);

  const vacio = await fetch(`${BASE}/api/acceso/entrar`, { method: 'POST', body: 'no soy json' });
  ok('cuerpo ilegible da 400', vacio.status, 400);
}

console.log('\nUNA LLAVE QUE NUNCA PODRÍA ENTRAR NO SE DA DE ALTA');
{
  const inv = await (await post('/api/acceso/invitar', { para: 'Prueba', maestra: MAESTRA })).json();
  const codigo = new URL(inv.enlace).searchParams.get('codigo');

  const mala = await post('/api/acceso/registrar', {
    codigo, credencial: 'abc', clavePublica: 'no-es-una-clave', algoritmo: -7,
    clientData: 'x', apodo: 'Prueba',
  });
  ok('clave pública ilegible: 400', mala.status, 400);

  const algo = await post('/api/acceso/registrar', {
    codigo, credencial: 'abc', clavePublica: 'AAAA', algoritmo: -1234,
    clientData: 'x', apodo: 'Prueba',
  });
  ok('algoritmo que no sabemos verificar: 400', algo.status, 400);

  const sigue = sql(`SELECT usada_en IS NULL FROM invitaciones WHERE codigo='${codigo}'`);
  ok('y la invitación NO se gastó en el intento', sigue, '1');

  const largo = await post('/api/acceso/registrar', {
    codigo, credencial: 'a'.repeat(600), clavePublica: 'AAAA', algoritmo: -7,
    clientData: 'x',
  });
  ok('un id desmedido no llega a la base', largo.status, 400);
}

console.log('\nTOPE DE INVITACIONES VIVAS');
{
  sql("DELETE FROM invitaciones WHERE creada_por='clave maestra'");
  const estados = [];
  for (let i = 0; i < 12; i++) {
    estados.push((await post('/api/acceso/invitar', { para: `P${i}`, maestra: MAESTRA })).status);
  }
  ok('las diez primeras salen', estados.slice(0, 10).every((s) => s === 200), true);
  ok('la once ya no, y lo dice con 429', estados[10], 429);
  sql("DELETE FROM invitaciones WHERE creada_por='clave maestra'");
}

console.log('\nTOPE DE RETOS VIVOS (llenar la tabla desde fuera)');
{
  sql('DELETE FROM retos');
  const codigos = [];
  for (let tanda = 0; tanda < 11; tanda++) {
    const lote = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${BASE}/api/acceso/reto`).then((r) => r.status))
    );
    codigos.push(...lote);
  }
  ok('al llenarse contesta 429, nunca 500', codigos.filter((s) => s === 500).length, 0);
  ok('y llegó a rechazar de verdad', codigos.includes(429), true);
  const cuerpo = await (await fetch(`${BASE}/api/acceso/reto`)).json();
  ok('con un mensaje en español', typeof cuerpo.error === 'string' && cuerpo.error.length > 10, true);
  sql('DELETE FROM retos');
  ok('vaciada la tabla, se vuelve a repartir', (await fetch(`${BASE}/api/acceso/reto`)).status, 200);
}

console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
