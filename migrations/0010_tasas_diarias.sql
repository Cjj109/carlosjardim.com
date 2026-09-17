-- Una foto al dia de las tasas del mercado, para poder mirar atras.
--
-- El BCV ya tenia su historico sin querer: bcv_vigencias guarda una fila por
-- fecha valor desde el 7 de septiembre, porque hacia falta para saber cual rige
-- hoy. El mercado p2p no tenia ninguno: el USDT y las primas de Zelle, Facebank,
-- Wally y Zinli se leen en vivo en cada peticion y se tiran.
--
-- Sin esto, el 60 IQ solo sabe el instante. No puede contestar "subio?", ni
-- "me conviene esperar?", ni "llevas tres dias cambiando a peor tasa", que son
-- preguntas de dinero de las de verdad. Una fila al dia basta para todas.
--
-- QUE SE GUARDA Y QUE NO
--
-- Las cifras del dia y nada mas: ni quien pregunto, ni cuantas veces, ni de
-- donde. Es el precio publico del mercado, el mismo para todo el mundo, asi que
-- aqui no hay nada de nadie.
--
-- La fila del dia se va actualizando mientras el dia corre, asi que al final
-- guarda el ultimo valor visto. No es el cierre exacto —nadie mira a medianoche—
-- pero para "como viene la semana" es lo que hace falta, y pretender mas
-- precision seria inventarsela.
--
-- QUIEN ESCRIBE
--
-- /api/bcv, despues de responder y como mucho una vez al dia por centro de
-- datos: la escritura va detras de la cache del borde, como el freno de
-- Cotizave. Sin ese freno serian miles de escrituras diarias para guardar el
-- mismo numero, que es justo el error que ya costo un aviso una vez.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0010_tasas_diarias.sql

CREATE TABLE IF NOT EXISTS tasas_diarias (
  fecha    TEXT PRIMARY KEY,
  usdt     REAL,
  zelle    REAL,
  facebank REAL,
  wally    REAL,
  zinli    REAL,
  visto_en TEXT NOT NULL DEFAULT (datetime('now'))
);
