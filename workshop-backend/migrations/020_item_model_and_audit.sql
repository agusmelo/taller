-- Migration 020: item model hardening + job audit timestamps

-- 1. Zero out phantom parent prices (parents that already have children but
--    kept their original price) — except an 'agregado' root, whose price IS
--    the group's real price and is meant to stay.
--
-- HOTFIX 2026-09-23 (docs/incidents/2026-09-22-mano-de-obra-pricing-mode.md):
-- this ran unconditionally, with no notion of pricing_mode (that concept
-- didn't exist yet — migration 024, which introduces it, comes after this
-- one). run.js has no migration-tracking table: it re-runs every file on
-- every deploy, so this kept firing forever, re-zeroing every legitimate
-- 'agregado' root's price on every single deploy after 024 introduced it —
-- not just once. Guarded on the column's existence because the very first
-- time this file ever ran (before 024 had ever run), pricing_mode didn't
-- exist yet and referencing it would fail outright.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_items' AND column_name = 'pricing_mode'
  ) THEN
    UPDATE job_items
       SET unit_price = 0
     WHERE parent_id IS NULL
       AND unit_price > 0
       AND pricing_mode IS DISTINCT FROM 'agregado'
       AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = job_items.id);
  ELSE
    UPDATE job_items
       SET unit_price = 0
     WHERE parent_id IS NULL
       AND unit_price > 0
       AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = job_items.id);
  END IF;
END $$;

-- 2. Add audit timestamps for status transitions
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 3. Best-effort backfill from updated_at for already-closed jobs
-- (Not precise, but better than null)
UPDATE jobs SET finished_at = updated_at WHERE status IN ('terminado', 'pagado') AND finished_at IS NULL;
UPDATE jobs SET paid_at     = updated_at WHERE status = 'pagado' AND paid_at IS NULL;
