/** Quién es esta sesión y qué aparatos tiene. Lo usa la página de acceso. */
import { sesionDe, json } from '../../_acceso.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  if (!db) return json({ ok: false, error: 'Acceso no configurado' }, 503);

  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: true, dentro: false });

  const quien = await db
    .prepare('SELECT puede_invitar FROM personas WHERE id = ?')
    .bind(sesion.id)
    .first();

  const llaves = await db
    .prepare('SELECT id, apodo, creada_en, ultimo_uso FROM llaves WHERE persona_id = ? ORDER BY creada_en')
    .bind(sesion.id)
    .all();

  return json({
    ok: true,
    dentro: true,
    nombre: sesion.nombre,
    puedeInvitar: !!quien?.puede_invitar,
    aparatos: (llaves.results || []).map((l) => ({
      id: l.id,
      apodo: l.apodo || 'Sin nombre',
      desde: l.creada_en,
      ultimoUso: l.ultimo_uso,
    })),
  });
}
