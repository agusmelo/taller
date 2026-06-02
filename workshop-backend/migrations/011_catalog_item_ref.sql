-- Track which catalog item a job_item originated from (provenance, not live sync).
-- Nullable: NULL means the item was typed manually or predates this migration.
-- ON DELETE SET NULL: deleting a catalog item leaves job_items intact.
ALTER TABLE job_items
  ADD COLUMN catalog_item_id UUID REFERENCES item_catalog(id) ON DELETE SET NULL;

-- Partial index: only index rows that actually have a catalog reference,
-- keeping the index small and analytics queries fast.
CREATE INDEX idx_job_items_catalog_item_id
  ON job_items(catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;
