-- Sprint 1 / HU-04: caché de resultados de evaluación
--
-- Para evitar el N+1 actual en GET /alerts/feed (donde cada request
-- re-evalúa todas las definiciones contra la DB), el runner ahora persiste
-- los items crudos (sin filtro de dismissals) en una columna JSONB.
-- El feed lee de esta caché y aplica solo el filtro de dismissals.

ALTER TABLE alert_definitions
  ADD COLUMN IF NOT EXISTS last_results JSONB NOT NULL DEFAULT '[]'::jsonb;
