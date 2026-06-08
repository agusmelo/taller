-- Sprint 0
--   HU-01: cuando se borra un item del catálogo, las definiciones de alerta
--          vinculadas deben preservarse (orfanas + desactivadas) en lugar de
--          ser borradas en cascada. Se cambia el FK a ON DELETE SET NULL y
--          el controlador del catálogo se encarga de marcarlas enabled=false.
--   HU-02: agregar columna workshop_id en alert_definitions y alert_dismissals
--          para preparar el modelo a multi-taller. La tabla workshops todavía
--          no existe — se usa TEXT con un valor por defecto que se puede
--          migrar a UUID/FK cuando se cree la tabla.

-- ── HU-01: relajar la cascada del FK ────────────────────────────────────────
ALTER TABLE alert_definitions
  DROP CONSTRAINT IF EXISTS alert_definitions_catalog_item_id_fkey;

ALTER TABLE alert_definitions
  ADD CONSTRAINT alert_definitions_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES item_catalog(id) ON DELETE SET NULL;

-- Los índices únicos parciales deben acotarse a definiciones habilitadas:
-- si un item del catálogo se borra, su definición queda con catalog_item_id
-- NULL + enabled=false, y otro admin tiene que poder crear una nueva del
-- mismo tipo sin chocar con la huérfana.
DROP INDEX IF EXISTS uq_alert_def_with_item;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_def_with_item
  ON alert_definitions (alert_type, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL AND enabled = true;

DROP INDEX IF EXISTS uq_alert_def_no_item;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_def_no_item
  ON alert_definitions (alert_type)
  WHERE catalog_item_id IS NULL AND enabled = true;

-- ── HU-02: columna workshop_id (placeholder TEXT hasta que exista workshops) ─
ALTER TABLE alert_definitions
  ADD COLUMN IF NOT EXISTS workshop_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE alert_dismissals
  ADD COLUMN IF NOT EXISTS workshop_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_alert_def_workshop
  ON alert_definitions (workshop_id);

CREATE INDEX IF NOT EXISTS idx_alert_dismissals_workshop
  ON alert_dismissals (workshop_id);
