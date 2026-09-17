-- Como quiere cada quien que le hable el 60 IQ.
--
-- El tono era uno solo para todos: el que pidio el dueno, que es "sin freno" y
-- devuelve el insulto con todas sus letras. Eso esta bien para quien lo pidio y
-- no para su hermana un martes a las siete de la manana. Un asistente que es
-- "de cada usuario" no puede tener una sola boca.
--
-- Tres niveles y nada mas, porque un deslizador de groseria no lo entiende
-- nadie:
--
--   suave      hace la cuenta y ya, sin pulla. Para quien solo quiere el numero.
--   normal     la pulla de siempre sobre la pereza mental, sin groserias.
--   sin_freno  devuelve el insulto si se lo dan. Lo que hay hoy para todos.
--
-- Tabla aparte de iq_notas a proposito: las notas las escribe el modelo y se
-- borran cuando alguien pide que lo olviden; esto lo elige la persona y no
-- tiene por que irse con el olvido. Quien pide "olvidate de mi" no esta
-- pidiendo que ademas le empiecen a gritar.
--
-- Si la tabla no existe, el codigo sigue funcionando con "sin_freno": la
-- lectura va con su try y cae al valor por defecto, asi que esto se puede
-- desplegar antes de correr la migracion.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0009_iq_ajustes.sql

CREATE TABLE IF NOT EXISTS iq_ajustes (
  persona_id  TEXT PRIMARY KEY,
  tono        TEXT NOT NULL DEFAULT 'sin_freno',
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);
