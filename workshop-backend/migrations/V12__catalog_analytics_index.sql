-- Composite index to accelerate the analytics query:
-- COUNT(DISTINCT job_id) grouped by catalog_item_id can be resolved via index-only scan.
CREATE INDEX IF NOT EXISTS idx_job_items_catalog_job
  ON job_items(catalog_item_id, job_id)
  WHERE catalog_item_id IS NOT NULL;
