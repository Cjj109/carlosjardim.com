-- De que llave nacio cada sesion.
--
-- Sin esto, quitar la llave de un telefono perdido no cerraba su sesion: la
-- cookie de ese aparato seguia valiendo 180 dias. O sea que el boton "Quitar"
-- prometia algo que no hacia, que es la peor clase de fallo de seguridad
-- —el que deja tranquilo a quien deberia preocuparse.
--
-- Ahora al revocar una llave se borran tambien las sesiones que salieron de
-- ella, y solo esas: los demas aparatos de la misma persona siguen dentro.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0007_sesion_por_llave.sql

ALTER TABLE sesiones ADD COLUMN llave_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sesiones_llave ON sesiones (llave_id);
