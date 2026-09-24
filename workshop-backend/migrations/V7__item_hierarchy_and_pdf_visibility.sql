-- 007: item hierarchy + customer-facing pricing visibility flag
--
-- A job_item may now reference a parent job_item (depth cap = 1 enforced at
-- controller level). Children inherit item_type and supplier from their parent
-- and always carry quantity = 1; only description and unit_price are
-- meaningful on a child row.
--
-- The job-level show_item_details_pricing flag controls whether the customer
-- PDF reveals child unit prices (TRUE, default) or hides them, showing only
-- the parent total + child descriptions (FALSE).

ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS parent_id UUID NULL REFERENCES job_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_job_items_parent_id ON job_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_job_items_job_sort  ON job_items(job_id, sort_order);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS show_item_details_pricing BOOLEAN NOT NULL DEFAULT TRUE;
