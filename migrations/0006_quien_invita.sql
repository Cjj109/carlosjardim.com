-- Solo quien entra por la clave maestra reparte accesos.
--
-- Hasta ahora cualquiera que estuviera dentro podia invitar, y quien el
-- invitara tambien: una cadena que crece sola. Para cinco personas de
-- confianza puede parecer inofensivo, pero es justo por donde se agranda un
-- circulo sin que nadie lo decida, y basta un descuido en cualquier eslabon.
--
-- Ahora invitar es una facultad y no una consecuencia de estar dentro. Los
-- demas conservan lo que de verdad necesitan: anadir sus propios aparatos.
--
-- Quien la tiene se deduce del dato, no se escribe a mano: es quien uso una
-- invitacion creada con la clave maestra. Esa clave solo la tiene el dueno.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0006_quien_invita.sql

ALTER TABLE personas ADD COLUMN puede_invitar INTEGER NOT NULL DEFAULT 0;

UPDATE personas SET puede_invitar = 1
WHERE id IN (
  SELECT persona_id FROM invitaciones
  WHERE creada_por = 'clave maestra' AND persona_id IS NOT NULL
);
