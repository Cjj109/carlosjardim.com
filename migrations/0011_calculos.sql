-- Los calculos de cada quien, para que el 60 IQ sea el mismo en todos sus
-- aparatos.
--
-- Hasta ahora el historial vivia en localStorage: del telefono, y solo del
-- telefono. Sus notas y su conversacion si viajaban —estan en iq_notas y en
-- iq_turnos— asi que el asistente te reconocia al cambiar de aparato pero no
-- se acordaba de nada de lo que habias calculado. Medio conocido.
--
-- LA DECISION, OTRA VEZ Y A CONCIENCIA
--
-- Esto es lo mismo que se penso en 0008: un registro de comportamiento atado a
-- un nombre. Que monedas mueve alguien, de cuanto y con que frecuencia. Ahi se
-- decidio guardar, sabiendo lo que implica, porque la app esta detras de
-- passkeys, la usan cinco personas que se conocen y el valor de que aprenda
-- compensa. Aqui vale lo mismo y por las mismas razones.
--
-- Dos diferencias con /api/montos, que tambien apunta montos: aquel guarda el
-- monto REDONDEADO y SIN DUENO, para que los botones de atajo salgan de lo que
-- la gente usa; este guarda el calculo entero con su dueno. Son dos cosas
-- distintas y por eso son dos tablas: la anonima no se puede volver personal
-- por mirarla mas fuerte.
--
-- SE BORRA CON EL RESTO
--
-- "Que lo olvide" ya se llevaba las notas y la conversacion. Ahora tambien
-- esto: olvidar dejando apuntado que mueves 350 dolares los viernes no es
-- olvidar. Y se recorta a los ultimos por persona, como iq_turnos: esto es
-- memoria de trabajo, no un archivo de por vida.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0011_calculos.sql

CREATE TABLE IF NOT EXISTS calculos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id TEXT NOT NULL,
  -- La del aparato: cuando se hizo el calculo, no cuando llego aqui. Si el
  -- telefono estaba sin senal, lo que importa es la hora en que se calculo.
  fecha      TEXT NOT NULL,
  modo       TEXT NOT NULL,
  monto      REAL NOT NULL,
  destino    TEXT,
  resultado  TEXT,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calculos_persona ON calculos (persona_id, id);
