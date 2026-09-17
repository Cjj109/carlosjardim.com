-- Si el 60 IQ acerto o no, dicho por quien pregunto.
--
-- El banco de preguntas (scripts/probar-modelo.mjs) son 24 casos que se le
-- ocurrieron a quien lo escribio. Estan bien, pero son suposiciones sobre lo
-- que la gente pregunta. Esto guarda lo que la gente pregunta DE VERDAD y si
-- la respuesta servia, que es la unica materia prima honesta para saber si el
-- prompt esta mejorando o solo cambiando.
--
-- QUE SE GUARDA
--
-- La pregunta, lo que contesto y un si o un no. Nada mas. No hace falta la
-- decision entera del modelo: para arreglar un caso basta con poder repetirlo,
-- y para repetirlo basta la pregunta.
--
-- Se guarda con dueno porque el voto es de alguien y esa persona tiene que
-- poder llevarselo: "que lo olvide" tambien borra esto. Un voto anonimo seria
-- mas comodo de justificar, pero entonces no habria forma de borrarlo cuando
-- alguien lo pide, y eso importa mas.
--
-- No se recorta: son pocos por definicion —hay que tocar un boton— y cada uno
-- vale para siempre como caso de prueba.
--
--   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0012_iq_votos.sql

CREATE TABLE IF NOT EXISTS iq_votos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id TEXT NOT NULL,
  pregunta   TEXT NOT NULL,
  respuesta  TEXT NOT NULL,
  -- 1 acerto, 0 no. Sin escala de estrellas: lo que se quiere saber es si
  -- servia o no, y una escala solo invita a pensarselo.
  acerto     INTEGER NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_iq_votos_acerto ON iq_votos (acerto, id);
