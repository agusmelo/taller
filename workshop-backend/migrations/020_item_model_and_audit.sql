-- Migration 020: item model hardening + job audit timestamps

-- 1. Zero out phantom parent prices (parents that already have children but kept their original price)
UPDATE job_items
SET unit_price = 0
WHERE parent_id IS NULL
  AND unit_price > 0
  AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = job_items.id);

-- 2. Add audit timestamps for status transitions
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 3. Best-effort backfill from updated_at for already-closed jobs
-- (Not precise, but better than null)
UPDATE jobs SET finished_at = updated_at WHERE status IN ('terminado', 'pagado') AND finished_at IS NULL;
UPDATE jobs SET paid_at     = updated_at WHERE status = 'pagado' AND paid_at IS NULL;
