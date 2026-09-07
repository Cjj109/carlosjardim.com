-- Desde cuando se APLICA cada tasa, que no es su fecha valor.
--
-- El BCV publica el viernes por la tarde con fecha valor del LUNES (o del
-- martes, si el lunes es feriado). Pero la tasa se aplica desde el dia
-- siguiente a que se publica, o sea el sabado: no tiene sentido pasar el fin
-- de semana entero con la tasa de la semana pasada cuando el BCV ya la movio.
--
-- Por eso hacen falta las dos fechas, no una:
--
--   fecha  fecha valor del BCV, la oficial
--   desde  desde cuando la aplicamos aqui, que es
--          min(fecha valor, dia siguiente al primer avistamiento)
--
-- El min() es la red de seguridad. Lo normal es verla la misma tarde en que
-- sale y entonces manda "manana"; si esto estuvo caido y la vemos dos dias
-- tarde, manda la fecha valor y la tasa no se retrasa mas alla de lo oficial.
--
-- Con el BCV publicando 830 el viernes 11:
--
--   fecha valor lunes 14, vista el viernes  -> desde sabado 12
--   fecha valor martes 15 (lunes feriado)   -> desde sabado 12
--   fecha valor martes 15, vista el lunes   -> desde martes 15
--
-- Las filas de antes se rellenan con su propia fecha, que es lo unico que se
-- sabe de ellas.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0004_bcv_desde.sql

ALTER TABLE bcv_vigencias ADD COLUMN desde TEXT;

UPDATE bcv_vigencias SET desde = fecha WHERE desde IS NULL;

CREATE INDEX IF NOT EXISTS idx_bcv_vigencias_desde ON bcv_vigencias (desde);
