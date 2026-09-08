-- Acceso por passkeys a la calculadora.
--
-- POR QUE PASSKEYS Y NO UNA CONTRASENA
--
-- Una contrasena compartida entre varias personas se filtra: se manda por
-- WhatsApp, se repite en otro sitio, se queda en un portapapeles. Una passkey
-- no se puede contar por telefono: la clave privada no sale del aparato y lo
-- que viaja es una firma que solo vale para esta peticion y para este dominio.
-- Eso ultimo tambien mata el phishing: una passkey de carlosjardim.com no
-- firma nada para otro dominio, aunque la pagina sea identica.
--
-- UNA PERSONA, VARIAS LLAVES
--
-- Las passkeys de Apple se sincronizan por iCloud y las de Google entre los
-- Android, pero NO cruzan de un ecosistema al otro. Quien tenga un Samsung y
-- un iPhone necesita una llave en cada uno. Por eso `llaves` cuelga de
-- `personas` y no al reves: se entra en un aparato y desde ahi se da de alta
-- el siguiente, sin gastar otra invitacion.
--
-- COMO ENTRA EL PRIMERO
--
-- Con ACCESO_BOOTSTRAP, una clave de un solo uso puesta en las variables de
-- Cloudflare. Sirve para crear la primera invitacion y despues se borra de
-- ahi. No hay ninguna credencial escrita en el repositorio.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0005_acceso.sql

CREATE TABLE IF NOT EXISTS personas (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  creada_en  TEXT NOT NULL DEFAULT (datetime('now')),
  activa     INTEGER NOT NULL DEFAULT 1
);

-- Una fila por aparato. `contador` detecta credenciales clonadas: el
-- autenticador lo sube en cada uso, asi que si llega uno igual o menor que el
-- ultimo visto, algo va mal. Hay autenticadores que siempre mandan 0 y esos
-- se dejan pasar, que es lo que dice la especificacion.
CREATE TABLE IF NOT EXISTS llaves (
  id            TEXT PRIMARY KEY,          -- credential id, base64url
  persona_id    TEXT NOT NULL,
  clave_publica TEXT NOT NULL,             -- SPKI en base64url
  algoritmo     INTEGER NOT NULL,          -- -7 = ES256, -257 = RS256
  contador      INTEGER NOT NULL DEFAULT 0,
  apodo         TEXT,                      -- "iPhone de Carlos", para saber cual revocar
  creada_en     TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_uso    TEXT,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_llaves_persona ON llaves (persona_id);

-- Invitaciones de un solo uso. Sin esto, cualquiera que llegue a la pagina de
-- acceso podria darse de alta a si mismo.
CREATE TABLE IF NOT EXISTS invitaciones (
  codigo      TEXT PRIMARY KEY,
  para        TEXT NOT NULL,
  creada_por  TEXT,
  creada_en   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_en   TEXT NOT NULL,
  usada_en    TEXT,
  persona_id  TEXT
);

-- Los retos de WebAuthn: aleatorios, de un solo uso y de vida corta. Son lo
-- que impide repetir una firma capturada.
CREATE TABLE IF NOT EXISTS retos (
  valor      TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,               -- 'alta' o 'entrada'
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_en  TEXT NOT NULL
);

-- Se guarda el SHA-256 del testigo, no el testigo. Si alguien se lleva la
-- base no se lleva las sesiones: con el hash no se puede fabricar la cookie.
CREATE TABLE IF NOT EXISTS sesiones (
  hash        TEXT PRIMARY KEY,
  persona_id  TEXT NOT NULL,
  creada_en   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_en   TEXT NOT NULL,
  ultimo_uso  TEXT,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sesiones_persona ON sesiones (persona_id);
