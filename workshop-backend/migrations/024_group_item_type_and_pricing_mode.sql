-- 024: item_type becomes a GROUP-level property + explicit group pricing mode
--
-- Background. Migration 007 already declared the intended semantics in a
-- comment ("Children inherit item_type and supplier from their parent") but
-- nothing enforced it, and the code drifted: jobsController.addItem wrote a
-- per-child item_type, updateItem let you change it, and the job-detail UI
-- exposed a type selector on every child row. Meanwhile the only consumer of
-- item_type (pdfController.groupItemsByType) has always read it from root rows
-- only. Comments are not constraints; this migration makes the invariant real.
--
-- Two root-only attributes after this migration:
--
--   item_type     -- 'mano_de_obra' | 'repuesto' | 'otro'. NOT NULL on roots
--                    (parent_id IS NULL), always NULL on children. A group is
--                    categorized as a whole; sub-items are not independently
--                    categorizable.
--
--   pricing_mode  -- 'detallado' | 'agregado'. NOT NULL on roots, always NULL
--                    on children. Decides how a group with children derives its
--                    line total:
--                      'detallado' -> SUM(children.unit_price)  (previous, and
--                                     still the default, behavior)
--                      'agregado'  -> the root's own quantity * unit_price;
--                                     children carry descriptions only and
--                                     their unit_price is forced to 0.
--                    A root with no children always contributes
--                    quantity * unit_price regardless of pricing_mode, so
--                    'detallado' is a safe default for every existing row.
--
-- Backfill of item_type conflicts: the group KEEPS THE PARENT'S type, per an
-- explicit product decision. Note the known consequence: composite groups
-- created from the job-detail page were written with a hard-coded parent
-- item_type of 'otro' (job-detail.component.ts forced it) while their children
-- carried the real types the user picked. Those groups therefore consolidate
-- under 'otro' / "Otros" and lose the per-child types. They are individually
-- correctable by editing the group's type in the UI after this migration; no
-- automated recovery is attempted. See spec/job-item-group-type-and-pricing.md.

-- ---------------------------------------------------------------------------
-- item_type: nullable, NULL on children
-- ---------------------------------------------------------------------------
ALTER TABLE job_items
  ALTER COLUMN item_type DROP NOT NULL,
  ALTER COLUMN item_type DROP DEFAULT;

UPDATE job_items SET item_type = NULL WHERE parent_id IS NOT NULL;

-- Defensive: a root must carry a type. There should be no such rows (the column
-- was NOT NULL until a moment ago), but a root left NULL here would fail the
-- CHECK below and abort the migration with a much less obvious error.
UPDATE job_items
   SET item_type = 'mano_de_obra'
 WHERE parent_id IS NULL AND item_type IS NULL;

-- ---------------------------------------------------------------------------
-- pricing_mode: how a group's line total is derived
-- ---------------------------------------------------------------------------
ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NULL;

UPDATE job_items
   SET pricing_mode = CASE WHEN parent_id IS NULL THEN 'detallado' ELSE NULL END
 WHERE pricing_mode IS DISTINCT FROM
       (CASE WHEN parent_id IS NULL THEN 'detallado' ELSE NULL END);

-- ---------------------------------------------------------------------------
-- Constraints. Named + guarded so re-running the migration is a no-op.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_items_type_on_root_only'
  ) THEN
    ALTER TABLE job_items
      ADD CONSTRAINT job_items_type_on_root_only
      CHECK ((parent_id IS NULL) = (item_type IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_items_pricing_mode_on_root_only'
  ) THEN
    ALTER TABLE job_items
      ADD CONSTRAINT job_items_pricing_mode_on_root_only
      CHECK ((parent_id IS NULL) = (pricing_mode IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_items_pricing_mode_values'
  ) THEN
    ALTER TABLE job_items
      ADD CONSTRAINT job_items_pricing_mode_values
      CHECK (pricing_mode IS NULL OR pricing_mode IN ('detallado', 'agregado'));
  END IF;
END $$;

-- Aggregate-priced groups keep child descriptions but not child prices. The
-- controllers force this on write; normalize any pre-existing data too (there
-- is none on first run, since 'agregado' did not exist before this migration).
UPDATE job_items c
   SET unit_price = 0
  FROM job_items p
 WHERE c.parent_id = p.id
   AND p.pricing_mode = 'agregado'
   AND c.unit_price <> 0;
