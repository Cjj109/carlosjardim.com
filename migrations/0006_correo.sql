-- El correo como identificador, guardado solo en huella.
--
-- POR QUE HUELLA Y NO EL CORREO
--
-- Lo delicado aqui no es solo la tasa: es la lista de quien la consulta. Una
-- tabla con los correos de cinco personas que entran a ver tasas es
-- exactamente el registro que no conviene que exista. Guardando el SHA-256 no
-- se pierde nada de lo que hace falta —al entrar se escribe el correo, se
-- calcula la huella y se busca— y una base robada no trae ninguna lista
-- legible.
--
-- Lo que si se pierde: no se puede escribir a esa gente ni recuperar cuentas
-- por correo. No hace falta: quien pierde el aparato pide otra invitacion por
-- donde sea, que es como se hace aqui de todos modos.
--
-- El nombre si va en claro, porque es el que elige quien invita y puede ser un
-- apodo. Sirve para saber a quien se le revoca el acceso sin tener que
-- adivinar.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0006_correo.sql

ALTER TABLE personas ADD COLUMN correo_hash TEXT;

-- Un correo, una persona. Parcial porque las filas creadas antes de esto no
-- tienen ninguno y NULL no choca consigo mismo en SQLite, pero mas vale
-- decirlo explicitamente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_correo
  ON personas (correo_hash) WHERE correo_hash IS NOT NULL;
