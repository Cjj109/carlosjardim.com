-- Cuántas veces se ha tecleado cada monto en cada modo de la calculadora.
--
-- Alimenta los botones de atajo: los dos primeros son fijos y los otros tres
-- salen de aquí cuando quien mira no tiene historial propio.
--
-- Lo que hay en la tabla y lo que NO:
--   modo   cuál de los cuatro
--   monto  redondeado a dos cifras significativas (347 → 350)
--   n      cuántas veces
--   visto  el día de la última vez, para poder ignorar lo que ya no se usa
--
-- No hay IP, ni identificador, ni sesión, ni el importe exacto de nadie. Con
-- la clave primaria compuesta, dos personas que teclean quince mil son la
-- misma fila: no se puede reconstruir quién hizo qué porque esa información
-- nunca llegó a escribirse.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0001_montos.sql

CREATE TABLE IF NOT EXISTS montos (
  modo  TEXT    NOT NULL,
  monto REAL    NOT NULL,
  n     INTEGER NOT NULL DEFAULT 1,
  visto TEXT    NOT NULL,
  PRIMARY KEY (modo, monto)
);

-- La consulta de lectura filtra por fecha y ordena por uso dentro de cada
-- modo; este índice la cubre entera.
CREATE INDEX IF NOT EXISTS idx_montos_vigentes ON montos (visto, modo, n DESC);
