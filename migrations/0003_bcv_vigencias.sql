-- Qué tasa del BCV rige cada día.
--
-- El BCV publica por la tarde la tasa del día siguiente, así que la página no
-- dice "cuánto vale el dólar ahora" sino "cuánto valdrá mañana". Sin esta
-- tabla no había manera de saber cuál era la anterior, y la web convertía con
-- la nueva desde el momento mismo en que se publicaba.
--
-- La clave es la FECHA VALOR, no el día en que se leyó: sirve justamente para
-- poder preguntar "la más reciente que ya haya llegado", que es la que rige.
-- Por eso `fecha` es la primaria y no hace falta índice: la búsqueda es
-- WHERE fecha <= ? ORDER BY fecha DESC, y el índice de la primaria la cubre.
--
-- El euro va en la misma fila porque comparte fecha valor con el dólar: son
-- las dos cifras del mismo recuadro de la misma página.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0003_bcv_vigencias.sql

CREATE TABLE IF NOT EXISTS bcv_vigencias (
  fecha    TEXT PRIMARY KEY,
  usd      REAL,
  eur      REAL,
  visto_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La que rige hoy, 7 de septiembre de 2026, para que esto no arranque en
-- blanco: sin una tasa anterior apuntada, la primera lectura tras el
-- despliegue no tendría a qué caer y seguiría sirviendo la de mañana.
INSERT OR IGNORE INTO bcv_vigencias (fecha, usd, eur)
VALUES ('2026-09-07', 813.7361, 945.65085917);
