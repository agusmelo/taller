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

-- On a fresh first run, create the full unique index. On idempotent re-runs
-- where 009 has already been applied (parent_id column exists), skip it —
-- 009 drops this index and replaces it with a correct partial one anyway.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'item_catalog' AND column_name = 'parent_id'
  ) THEN
    -- Dedup any pre-existing rows before enforcing uniqueness.
    DELETE FROM item_catalog a
    USING item_catalog b
    WHERE a.id > b.id
      AND LOWER(TRIM(a.description)) = LOWER(TRIM(b.description));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_item_catalog_desc_norm
      ON item_catalog (LOWER(TRIM(description)));

    CREATE INDEX IF NOT EXISTS idx_item_catalog_desc_lower
      ON item_catalog (LOWER(description));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_item_catalog_updated_at ON item_catalog;
CREATE TRIGGER trg_item_catalog_updated_at
  BEFORE UPDATE ON item_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
