# Spec — Item groups: group-level `item_type` + group pricing mode

**Feature area**: Trabajos → items (job creation + job detail), customer PDF
**Branch**: `claude/dashboard-metrics-closing-2n3ihz`
**Status**: Implemented
**Last updated**: 2026-07-29
**Related**: `docs/technical-debt.md#td-003`, `spec/monthly-closing-job-selection.md` (format reference)

---

## Context

A `job_items` row can be a **root** (`parent_id IS NULL`) or a **child** of a root; nesting is capped at one level. A root plus its children is what the UI calls a *grupo* (created via the **Compuesto** mode in job detail, or **Agregar detalle** in either the create or detail page).

Two problems, one pre-existing and one new:

**1. `item_type` was documented as group-level but enforced nowhere.** Migration `007_item_hierarchy_and_pdf_visibility.sql:4` states, as a comment: *"Children inherit item_type and supplier from their parent."* `009_item_catalog_children.sql:10` says the same for the catalog, and the frontend `CatalogChild` model has never had an `item_type` field. But `job_items.item_type` was `NOT NULL DEFAULT 'mano_de_obra'` on **every** row, and the code drifted away from the comment over four migrations:

| Site | Behavior before this change |
|------|-----------------------------|
| `jobsController.create` | Children correctly copied the parent's type ✅ |
| `jobsController.addItem` (`children[]`) | Each child took its **own** `item_type` from the payload ❌ |
| `jobsController.addItem` (`parent_id`) | `SELECT`ed `parent.item_type`, then **never used it** ❌ |
| `jobsController.updateItem` | Allowed setting `item_type` on a child row ❌ |
| `job-detail.component.ts` | Type dropdown on every child row, in 3 places ❌ |
| `job-create.component.ts` | Group-level already ✅ |

The one consumer, `pdfController.groupItemsByType`, has always read `item_type` from **root rows only** — so per-child types were collected from the user, stored, and then silently ignored.

**Live bug this created:** `job-detail.component.ts` hard-coded `payload.item_type = 'otro'` for every composite group it created (the group had no type selector at all — the parent's badge rendered as a literal `"Grupo"`). So every group created from the job detail page printed under **"Otros"** on the customer PDF regardless of its contents, and the real types the user picked per-child were discarded. Groups created from the *create* page were unaffected.

**2. Aggregate pricing has no representation.** A group's line total was unconditionally `SUM(children.unit_price)`. Shops that only know a group's total price — not the per-sub-item breakdown — had no way to enter it while keeping the sub-item descriptions. Their only options were to fabricate per-child prices or to collapse the group into one flat line and lose the breakdown entirely.

These two interact: once a group can be priced in aggregate, a per-child `item_type` becomes meaningless — you cannot attribute revenue to a category at a level that has no revenue attached.

## Proposed Change

Two **root-only** attributes on `job_items`, enforced by CHECK constraints rather than by comment:

```
item_type     'mano_de_obra' | 'repuesto' | 'otro'   NOT NULL on roots, NULL on children
pricing_mode  'detallado' | 'agregado'               NOT NULL on roots, NULL on children
```

`pricing_mode` decides how a group with children derives its line total:

| `pricing_mode` | Group line total | Where prices live |
|---------------|------------------|-------------------|
| `detallado` (default) | `SUM(children.unit_price)` | on the children; the root's own price is forced to 0 |
| `agregado` | `root.quantity * root.unit_price` | on the root; children carry descriptions only, `unit_price` forced to 0 |

A root **with no children** always contributes `quantity * unit_price` regardless of `pricing_mode`, so `'detallado'` is a correct default for every pre-existing row and for every simple item.

### Decisions taken (open questions, resolved with the product owner)

| Question | Decision |
|----------|----------|
| Backfill when a child's `item_type` differs from its parent's | **Keep the parent's.** See the accepted trade-off below. |
| Enforcement mechanism | **`NULL` on children + CHECK constraints.** Not a mirrored/denormalized copy and not an application-level convention — a comment-only convention is precisely what failed here for four migrations. |
| Shape of an aggregate group | **Children are kept for their descriptions**, the price lives on the root. Explicit `pricing_mode` column rather than inferring "aggregate" from all-zero children (a half-entered detailed group looks identical). |
| Child price display in aggregate mode | **Not rendered at all** — no empty column, no `—` placeholder. In `detallado` mode the parent's price is the derived sum, as before. |
| By-`item_type` revenue reporting | **In scope for the project, handled as follow-up work** on top of this now-correct data model (see *Follow-up* below). |

**Accepted trade-off on the backfill.** "Keep the parent's type" is one line of SQL and fully deterministic, but it consolidates under `'otro'` exactly the groups most likely to be miscategorized: those created from the job-detail page, whose parent was hard-coded to `'otro'` while the children held the real types the user chose. Those per-child types are dropped and **not** recovered automatically. The product owner chose this after being shown the consequence. Mitigation: a group's type is editable from the root row in the UI, so any group that lands in *Otros* incorrectly is a two-click fix; and the dev database contains 0 such rows (15 groups, 0 parent/child type mismatches), so the blast radius is whatever a given production database happens to hold.

### Implementation Details

**Migration — `workshop-backend/migrations/024_group_item_type_and_pricing_mode.sql`** (new)

```sql
ALTER TABLE job_items
  ALTER COLUMN item_type DROP NOT NULL,
  ALTER COLUMN item_type DROP DEFAULT;
UPDATE job_items SET item_type = NULL WHERE parent_id IS NOT NULL;

ALTER TABLE job_items ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NULL;
UPDATE job_items SET pricing_mode = CASE WHEN parent_id IS NULL THEN 'detallado' ELSE NULL END ...;

ALTER TABLE job_items ADD CONSTRAINT job_items_type_on_root_only
  CHECK ((parent_id IS NULL) = (item_type IS NOT NULL));
ALTER TABLE job_items ADD CONSTRAINT job_items_pricing_mode_on_root_only
  CHECK ((parent_id IS NULL) = (pricing_mode IS NOT NULL));
ALTER TABLE job_items ADD CONSTRAINT job_items_pricing_mode_values
  CHECK (pricing_mode IS NULL OR pricing_mode IN ('detallado', 'agregado'));
```

Constraint creation is guarded by `pg_constraint` lookups so the file is idempotent (verified: applied twice against the dev DB, second run a no-op). The existing value CHECK on `item_type` needs no change — `NULL IN (...)` evaluates to `NULL`, which a CHECK accepts.

**Backend — `workshop-backend/src/utils/financials.js`**

`JOB_SUBTOTALS_SUBQUERY` gains two explicit "shadow" cases. A row contributes `quantity * unit_price` unless:

- it is the root of a `'detallado'` group **with** children (total comes from the children), or
- it is a child of an `'agregado'` group (the group total is on the root).

Both are stated as SQL predicates rather than relying on the shadowed row happening to hold `0`, so a stale price can never leak into a job total. `calcFinancials` in `jobsController` mirrors this via a new exported `groupLineTotal(root, children)`.

**Backend — inlined copies of the subtotal expression, now removed.** Four hand-inlined variants had already drifted out of `financials.js` before `pricing_mode` existed and would each have produced wrong totals for aggregate groups:

| Site | Fix |
|------|-----|
| `jobsController.list` | replaced with `JOB_SUBTOTALS_SUBQUERY` |
| `exportController` (2 sites) | replaced with `JOB_SUBTOTALS_SUBQUERY` |
| `alertStrategies.js:122,486` | root-only formulations; `pricing_mode = 'detallado'` guard added in place (restructuring these two `WITH` clauses was higher-risk than the guard) |

**Backend — `jobsController`**

- `create`: children written with `item_type = NULL, pricing_mode = NULL`; per-item `pricing_mode` accepted; the unused side of the group zeroed on write.
- `addItem`: children forced to `item_type = NULL, pricing_mode = NULL` — an `item_type` in the payload for a child is discarded, not honored. Adding a child to an `'agregado'` parent **preserves** the parent's price (it is the group total); for a `'detallado'` parent it is still zeroed (it becomes phantom data).
- `updateItem`: returns **400** when `item_type` or `pricing_mode` is sent for a child row (loud failure over silent no-op, matching the existing `parent_id` re-assignment guard). Switching a root's mode reconciles prices: `detallado → agregado` zeroes the children's prices, `agregado → detallado` zeroes the root's.
- Close guard (`status → terminado`/`pagado`): the zero-price check exempts the same two shadow cases. An aggregate group closes with unpriced children; a root with no price still blocks, as does a `'detallado'` child with no price.
- `normalizePricingMode` coerces absent/unknown values to `'detallado'`, so a client that never sends the field behaves exactly as before this change.

**Backend — `pdfController`**

`lineTotal` respects `pricing_mode`. An `'agregado'` group shows its real quantity and unit price (it is priced like a simple item) instead of `1` / `—`. Its children **never** render a price cell, independent of the job-level `show_item_details_pricing` flag — that flag decides whether prices the shop *does* track are revealed to the customer, which is a different question from prices that do not exist. `groupItemsByType` falls back to `'otro'` for a null type defensively.

**Frontend — `workshop-frontend/src/app/core/models/index.ts`**

New exported `ItemType` and `PricingMode` unions. `JobItem.item_type` becomes `ItemType | null`; `pricing_mode: PricingMode | null` added. `computeLineTotal` in `core/utils/items-tree.ts` mirrors `groupLineTotal`. `ItemTypePipe` returns `''` for null.

**Frontend — `job-detail.component.ts`**

- The 3 per-child type dropdowns (new-group children, inline add-child, edit-child) are **removed**.
- Compuesto mode gains a group-level **Tipo** selector — this is what removes the hard-coded `'otro'`.
- Compuesto mode gains a **Precio: Por detalle | Total del grupo** toggle. In *Total del grupo*, the group's total input appears in the header and child price inputs disappear; in *Por detalle*, the running sum of the children is shown instead.
- An existing group's mode is switchable from its edit row, with a warning when the switch will discard per-detail prices.
- Display: the parent row shows its real type badge (previously replaced by a literal `"Grupo"` badge), plus a secondary `Grupo` / `Grupo · total` tag. Child rows no longer show a type badge, and show no price column at all in aggregate mode (`.child-row.no-price` drops the grid column rather than leaving it blank).

**Frontend — `job-create.component.ts`**

`ParentDraft` gains `pricing_mode`; `ChildDraft` still has no `item_type` (it never did). Per-group mode toggle appears once the group has children. `isDerived()`/`lineTotal()`/`setPricingMode()` keep the live totals consistent, and the create payload sends `pricing_mode` per item.

**Test infrastructure — `workshop-backend/__tests__/helpers/db.js`**

`ensureSchema` short-circuited on `to_regclass('public.jobs')` — "if the schema exists at all, assume it is current". Adding migration 024 to an existing `workshop_test` database would therefore have run the entire suite against a **stale schema**, which is as misleading as a suite that never reaches Postgres. Replaced with a `schema_migrations` ledger table applying migrations per-file, with a one-time backfill for databases created before the ledger existed. Adding a migration file is now sufficient; no manual `dropdb` step.

## Acceptance Criteria

1. A `job_items` child row can never hold a non-null `item_type` or `pricing_mode` — the database rejects it, not just the controller.
2. A root row can never hold a null `item_type` or `pricing_mode`.
3. `addItem` with a `parent_id` **and** an `item_type` in the body creates a child with `item_type = NULL` (the payload value is discarded, request still succeeds).
4. `updateItem` returns 400 when `item_type` or `pricing_mode` is sent for a child row.
5. A `'detallado'` group's subtotal contribution is `SUM(children.unit_price)`, and its root's stored `unit_price` is 0 — unchanged from before this spec.
6. An `'agregado'` group's subtotal contribution is `root.quantity * root.unit_price`; its children's stored `unit_price` is 0 and their descriptions are preserved.
7. A price forced onto an aggregate group's child behind the controllers' back does **not** change any reported subtotal (the exclusion is structural).
8. The SQL aggregation (`JOB_SUBTOTALS_SUBQUERY`, via `jobs.list`) and the JS one (`calcFinancials`, via `jobs.getOne`) agree on every combination of aggregate group + detailed group + simple item.
9. Adding a child to an `'agregado'` group preserves the group total; adding one to a previously simple `'detallado'` item still zeroes that item's now-phantom price.
10. `detallado → agregado` zeroes the children's prices and applies the root's; `agregado → detallado` zeroes the root's price.
11. A job whose only group is `'agregado'` with unpriced children can be closed (`terminado`); the same group with no price on its root cannot; a `'detallado'` group with one unpriced child cannot.
12. A group created from the job detail page carries the type the user selected and prints in that section of the customer PDF — not unconditionally under *Otros*.
13. An aggregate group's children show no price on the customer PDF regardless of `show_item_details_pricing`.

## Testing Plan

| Layer | What | Count |
|-------|------|-------|
| Integration (`__tests__/jobItemGroups.integration.test.js`, new) | CHECK constraints reject a typed child, a mode-carrying child, and an untyped root | 3 |
| Integration | `create` writes children with null type/mode; `addItem` discards a child `item_type`; `updateItem` 400s on a child type/mode; group type editable from the root | 4 |
| Integration | `detallado` sums children; `agregado` uses the root price; `agregado` honours root quantity; stale child price cannot leak; mixed job agrees in SQL and JS; `addItem` with `children[]` + `agregado`; child added to `agregado` preserves the total; child added to simple `detallado` zeroes it | 8 |
| Integration | mode switching both directions | 2 |
| Integration | close guard: aggregate with unpriced children closes; aggregate with no root price blocked; detailed with unpriced child blocked | 3 |
| Unit (existing `calcFinancials.test.js`) | 26 existing tests must stay green unmodified — items without `pricing_mode` default to detailed | 26 |
| Manual (browser) | Both pricing modes end to end in job detail, group type reaches the PDF | see QA notes |

**Result**: 20 new integration tests, all executing against a real Postgres (`workshop_test`) with zero `[skip] Postgres unreachable` warnings; 26 pre-existing `calcFinancials` unit tests green without modification.

Two pre-existing suites fail on this branch — `alertsController.test.js` and `alerts.integration.test.js`, 6 tests about `alert_dismissals` / `last_results`. Verified unrelated: the identical 6 failures reproduce at `HEAD` (`b8b4d12`) in a clean worktree, and neither `alertsController.js` nor either test file is touched by this change.

## Rollback Plan

Reverting the application code alone is safe and sufficient: `normalizePricingMode` defaults to `'detallado'`, and a reverted subtotal expression treats every group as detailed — which is correct for every row except groups a user explicitly set to `'agregado'` (those would revert to summing their zeroed children, i.e. contribute 0, visibly wrong rather than silently wrong).

Reverting the **migration** additionally needs `ALTER TABLE job_items DROP CONSTRAINT` ×3, restoring `item_type` to `NOT NULL DEFAULT 'mano_de_obra'`, and backfilling children's `item_type` from their parent (the pre-migration per-child values are not recoverable — that is the accepted backfill trade-off, and it is one-way).

## Out of Scope

- **`item_catalog` needs no change.** Catalog children never had a meaningful `item_type` (migration 009 documented them as ignored; the `CatalogChild` model has no such field), so the catalog was already group-level. Catalog entries are templates and carry no prices, so `pricing_mode` does not apply to them.
- **`itemCatalogController`'s `total_revenue`** under-reports for any root with children — pre-existing, see `docs/technical-debt.md#td-003`.
- **`exportController.exportClients`' `SUM(DISTINCT ...)`** collapses two clients' equal job subtotals — pre-existing, see `docs/technical-debt.md#td-004`.
- **Deleting the last child of a `'detallado'` group** leaves a root with `unit_price = 0` that then blocks closing until re-priced. Pre-existing behavior, unchanged.
- **The by-`item_type` revenue report** — see below.

## Follow-up

The by-`item_type` revenue breakdown ("cierre de caja") is the reason `item_type` needed to become trustworthy at group level, and is in scope for the project — but no such report exists yet anywhere: `dashboardController.monthlyClosing` has no type breakdown, `exportController` has none, and `pdfController.groupItemsByType` is the *only* reader of `item_type` in the codebase. It is handled as separate follow-up work on top of this data model, so this change stays a reviewable data-model diff. Notes for whoever picks it up:

- Every group now contributes its **whole** total to exactly one of the three buckets. For an `'agregado'` group that is the point; for a `'detallado'` group it is also true, and is a change in kind from what per-child types *appeared* to offer (they were never actually read).
- `docs/technical-debt.md#td-003` must be resolved first if the report is built on `catalog_uses`/`item_catalog` rather than on `job_items` directly.
- Attribution month should follow `spec/monthly-closing-job-selection.md` (`MAX(payments.payment_date)`), not `job_date`.

## Related

- `workshop-backend/migrations/007_item_hierarchy_and_pdf_visibility.sql` — the comment this change finally enforces
- `workshop-backend/migrations/009_item_catalog_children.sql` — same convention on the catalog side
- `docs/technical-debt.md#td-003`, `#td-004`
- `spec/monthly-closing-job-selection.md`
