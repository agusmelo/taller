-- Supporting indexes for /dashboard/items analytics endpoints.
-- Existing: idx_job_items_catalog_job (012), idx_jobs_job_date (013).

-- Children lookup for "parent line revenue = sum(children)" subqueries.
CREATE INDEX IF NOT EXISTS idx_job_items_parent
  ON job_items(parent_id)
  WHERE parent_id IS NOT NULL;

-- Ad-hoc candidate aggregation groups by lowered/trimmed description.
CREATE INDEX IF NOT EXISTS idx_job_items_desc_norm_adhoc
  ON job_items ((LOWER(TRIM(description))))
  WHERE catalog_item_id IS NULL AND parent_id IS NULL;

-- Time-series queries over jobs by month.
CREATE INDEX IF NOT EXISTS idx_jobs_status_job_date
  ON jobs(status, job_date)
  WHERE deleted_at IS NULL;
