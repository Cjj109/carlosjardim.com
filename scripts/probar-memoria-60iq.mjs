/**
 * La memoria del 60 IQ: la lógica que puede fallar en silencio.
 *
 * De todo lo que hace la memoria, solo dos cosas deciden algo: qué contexto se
 * le arma al modelo y cómo se acumulan las notas. Lo demás son consultas.
 * Estas dos son puras, así que se prueban a solas —sin navegador, sin base y
 * sin gastar una llamada al modelo.
 *
 *   node scripts/probar-memoria-60iq.mjs
 */
import { mezclarContexto, anadirNota } from '../functions/api/60iq.js';

let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(56)} ${JSON.stringify(real)}${bien ? '' : `\n      esperado: ${JSON.stringify(esp)}`}`);
};

const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });

console.log('\nEL CONTEXTO QUE SE LE ARMA AL MODELO');
{
  const guardados = [u('vieja 1'), a('resp 1'), u('vieja 2'), a('resp 2')];

  ok('al abrir la app, lo guardado', mezclarContexto(guardados, []).length, 4);

  // El fallo que se corrigió: el navegador traía dos y sustituían a los cuatro
  const delNavegador = [u('nueva'), a('resp nueva')];
  const mezcla = mezclarContexto(guardados, delNavegador);
  ok('tras preguntar, NO se pierde lo viejo', mezcla.length, 6);
  ok('lo viejo va primero', mezcla[0].content, 'vieja 1');
  ok('y lo nuevo al final', mezcla[5].content, 'resp nueva');

  // La carrera: lo del navegador ya está guardado, no debe salir dos veces
  ok('sin duplicar lo que ya está guardado',
    mezclarContexto([...guardados, ...delNavegador], delNavegador).length, 6);

  // Un mensaje repetido de verdad sí cuenta dos veces si viene del navegador
  ok('el tope recorta por el final', mezclarContexto(guardados, delNavegador, 3).map((m) => m.content),
    ['resp 2', 'nueva', 'resp nueva']);

  ok('sin nada, nada', mezclarContexto([], []), []);
}

console.log('\nCÓMO SE ACUMULAN LAS NOTAS');
{
  ok('la primera', anadirNota('', 'paga en USDT'), '- paga en USDT');
  ok('la segunda se añade debajo', anadirNota('- paga en USDT', 'mueve de 15 a 50'),
    '- paga en USDT\n- mueve de 15 a 50');
  ok('una repetida no entra otra vez', anadirNota('- paga en USDT', 'paga en USDT'), '- paga en USDT');
  ok('vacía no cambia nada', anadirNota('- paga en USDT', '   '), '- paga en USDT');
  ok('null tampoco', anadirNota('- paga en USDT', null), '- paga en USDT');

  // El recorte: por líneas enteras, nunca a mitad de frase
  const largas = ['- ' + 'a'.repeat(40), '- ' + 'b'.repeat(40), '- ' + 'c'.repeat(40)].join('\n');
  const recortada = anadirNota(largas, 'd'.repeat(40), 90);
  ok('al recortar, toda línea sigue entera', recortada.split('\n').every((l) => l.startsWith('- ')), true);
  ok('cae la más vieja', recortada.includes('aaa'), false);
  ok('y se queda la nueva', recortada.includes('ddd'), true);
  ok('nunca deja menos de una línea', anadirNota('', 'x'.repeat(300), 20).split('\n').length, 1);
}

console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
