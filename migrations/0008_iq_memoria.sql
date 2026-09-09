-- Lo que el 60 IQ sabe de cada persona.
--
-- Decision del dueno, tomada sabiendo lo que implica: esto es un registro de
-- comportamiento atado a un nombre —que monedas mueve alguien, de cuanto, con
-- que frecuencia—, y eso es mas delicado que un correo. Un correo dice quien
-- eres; esto dice que haces. Se guarda igual porque la app esta detras de
-- passkeys, no tiene nada ilegal, y el valor de que aprenda compensa.
--
-- DOS COSAS DISTINTAS, Y POR ESO DOS TABLAS
--
--   iq_turnos  la conversacion, para que siga donde se quedo aunque cambie de
--              telefono. Se recorta: solo los ultimos, no un archivo de todo.
--   iq_notas   lo aprendido de verdad. Un parrafo corto que el propio modelo
--              va escribiendo: "paga casi siempre en USDT", "suele mover
--              cantidades de 15 a 50". Esto es lo que hace que no haya que
--              repetirle lo mismo cada vez.
--
-- Separadas porque se borran por separado: vaciar la charla de la pantalla no
-- puede llevarse lo aprendido, y olvidar lo aprendido es una decision aparte
-- que se toma a conciencia.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0008_iq_memoria.sql

CREATE TABLE IF NOT EXISTS iq_turnos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id TEXT NOT NULL,
  rol        TEXT NOT NULL,            -- 'user' o 'assistant'
  texto      TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_iq_turnos_persona ON iq_turnos (persona_id, id);

CREATE TABLE IF NOT EXISTS iq_notas (
  persona_id  TEXT PRIMARY KEY,
  notas       TEXT NOT NULL DEFAULT '',
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);
