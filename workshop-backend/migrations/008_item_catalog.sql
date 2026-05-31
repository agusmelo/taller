-- 008: item catalog
--
-- Curated list of item templates used to power the autocomplete when creating
-- or editing job items. Replaces the previous historical-based suggestion
-- source (which scanned job_items directly).
--
-- Items only carry description + item_type. Quantity, unit_price, supplier,
-- and parent/children structure remain per-job concerns.
--
-- Descriptions are unique on a normalized form (LOWER(TRIM(...))) so we don't
-- accumulate near-duplicates like "Aceite" / "aceite " / "ACEITE".

CREATE TABLE IF NOT EXISTS item_catalog (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description VARCHAR(500) NOT NULL,
  item_type   VARCHAR(20) NOT NULL DEFAULT 'mano_de_obra'
              CHECK (item_type IN ('mano_de_obra', 'repuesto', 'otro')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_catalog_desc_norm
  ON item_catalog (LOWER(TRIM(description)));

CREATE INDEX IF NOT EXISTS idx_item_catalog_desc_lower
  ON item_catalog (LOWER(description));

DROP TRIGGER IF EXISTS trg_item_catalog_updated_at ON item_catalog;
CREATE TRIGGER trg_item_catalog_updated_at
  BEFORE UPDATE ON item_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
