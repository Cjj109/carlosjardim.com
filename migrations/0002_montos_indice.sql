-- Índice para el recorte por modo.
--
-- El de la primera migración es (visto, modo, n DESC) y su comentario decía
-- que "la cubre entera". No es cierto: con `WHERE visto >= ?` la columna
-- principal se usa para un rango, así que SQLite no puede aprovechar el resto
-- del índice para el orden y tiene que ordenar el resultado igual.
--
-- Este, con modo primero, sí sirve a la partición por modo y al orden por uso
-- que hace la función de ventana.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0002_montos_indice.sql

CREATE INDEX IF NOT EXISTS idx_montos_por_modo ON montos (modo, n DESC, visto);
