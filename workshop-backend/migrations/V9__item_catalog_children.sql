-- 009: subitems (children) for item_catalog
--
-- A catalog item can now have child entries that act as a default detail
-- breakdown, mirroring the parent/child structure already used in job_items.
--
-- Semantics:
--   * parent_id IS NULL  -> top-level catalog entry; item_type and description
--                           are user-visible. UNIQUE on normalized description.
--   * parent_id IS NOT NULL -> child of a catalog entry. Only description and
--                              sort_order matter; item_type is ignored at the
--                              UX layer (children inherit from parent in jobs).
--                              Two parents may share a child with the same
--                              description, so the UNIQUE index is partial.

ALTER TABLE item_catalog
  ADD COLUMN IF NOT EXISTS parent_id  UUID NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS idx_item_catalog_desc_norm;
DROP INDEX IF EXISTS idx_item_catalog_desc_lower;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_catalog_parent_desc_norm
  ON item_catalog (LOWER(TRIM(description)))
  WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_item_catalog_parent_id
  ON item_catalog (parent_id);

CREATE INDEX IF NOT EXISTS idx_item_catalog_parent_sort
  ON item_catalog (parent_id, sort_order);
