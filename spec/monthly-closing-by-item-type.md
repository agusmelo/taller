# Spec — Cierre Mensual: revenue breakdown by `item_type`

**Feature area**: Dashboard → Cierre mensual (Monthly Closing), `Administrador`-only
**Branch**: `claude/dashboard-metrics-closing-2n3ihz`
**Status**: Implemented — signed off 2026-07-31 (see *Decision taken*)
**Last updated**: 2026-07-29
**Related**: `spec/job-item-group-type-and-pricing.md` (the data model this builds on — read first), `spec/monthly-closing-job-selection.md` (the job set and month attribution this reuses), `docs/technical-debt.md#td-003`

---

## Context

Cierre Mensual answers "how much did the shop close out this month". It does not
answer "how much of that was labour vs parts", which is the split a workshop
needs for pricing decisions and for its accountant — labour and parts have
different margins and, in the general case, different tax treatment.

The breakdown was impossible to compute correctly until now. `job_items.item_type`
existed on every row and was `NOT NULL DEFAULT 'mano_de_obra'`, but per-child
values were collected by the UI, stored, and then **never read by anything**
(`pdfController.groupItemsByType` has always read root rows only). Migration
`024_group_item_type_and_pricing_mode.sql` made `item_type` a root-only,
CHECK-enforced property of the *group*, and added `pricing_mode` so a group's
line total is well defined. `spec/job-item-group-type-and-pricing.md` explicitly
deferred this report as follow-up work on top of that now-trustworthy model.

**The structural consequence to design around:** a group contributes its
**whole** line total to exactly one bucket — the one on its root. There is no
sub-group attribution and there must not be. For an `'agregado'` group that is
the entire point (the price only exists at group level); for a `'detallado'`
group it is also true, and it is a change in kind from what per-child types
*appeared* to offer.

## Current State

`workshop-backend/src/controllers/dashboardController.js` → `monthlyClosing`:

- Job set: `status = 'pagado'`, attributed to the month of
  `MAX(payments.payment_date)` (`JOB_PAID_SUBQUERY.last_payment_date`) — **not**
  `job_date`. Established by `spec/monthly-closing-job-selection.md`; reused
  unchanged here.
- Per job: `subtotal` (from the shared `JOB_SUBTOTALS_SUBQUERY`) → `discount`
  (fixed amount, or a percentage of subtotal) → `taxBase = subtotal - discount`
  → `tax` (only when `tax_enabled`) → `total`. Rounding is
  `Math.round(x * 100) / 100` throughout.
- Aggregated into `all` / `iva` / `no_iva` (`count`, `subtotal`, `discount`,
  `tax`, `total`, `paid`, `balance`) plus a flat `jobs` array.
- No breakdown by `item_type` anywhere in the response.

Frontend `dashboard.component.ts` renders the three buckets as three
`mat-tab`s, each a `.closing-summary` stat row plus a per-job `mat-table`
(N.º / Cliente / Fecha / Fecha de pago / IVA / Total / Pagado / Saldo).

**The hard part.** `discount_amount`/`discount_type` and `tax_enabled`/`tax_rate`
live on the **job**; `item_type` lives on the **item**. So "revenue by type" has
no single unambiguous meaning, and the choice is load-bearing — it decides
whether the new numbers tie out against the `Subtotal` stat, the `Total` stat,
or neither.

## Decision taken

**Report both vectors: `subtotal_by_type` (gross, pre-discount, pre-IVA) and
`total_by_type` (discount and IVA apportioned pro-rata, summing exactly to the
job/period `Total`).**

Rationale:

1. **The gross split is the number that answers the business question.** "What
   share of my revenue is labour?" is a question about what the shop billed, not
   about how a job-level discount happened to be distributed. It is exact — a
   plain sum of item line totals, no allocation, no rounding residue — and it
   ties out against the `Subtotal` stat already on screen.
2. **The apportioned split is required for the report not to contradict itself.**
   `Total` is the headline figure of Cierre Mensual. A by-type section whose
   three rows visibly fail to add up to the `Total` immediately above them reads
   as a bug to the person doing the monthly close, whatever a footnote says.
3. **Neither alone is sufficient**, and reporting both costs one extra column,
   not a second report. The apportionment is a presentation of the gross split,
   so the two can never disagree about *which* type earned the money — only
   about how much of a job-level discount to charge against it.
4. **The residual question is UI emphasis, not arithmetic**, so it is cheap to
   revisit: dropping either column later is a template change plus deleting one
   response field, with no change to the SQL or to the job set.

Apportionment basis: each type's share of the job's **subtotal**. Discount and
IVA are apportioned together, in one step, by allocating the job's already-rounded
`total`. Rationale for one step rather than two: every extra apportioned quantity
is another independent rounding residue to reconcile, and `taxBase`-by-type is not
a figure the report displays.

**Rounding residue is forced to zero, deterministically.** Each type's part is
`round2(total * share)`; the leftover cent (`total - Σ parts`) is added to the
bucket with the **largest share**, ties broken by the fixed order
`mano_de_obra > repuesto > otro`. So `Σ total_by_type == total` **exactly**, per
job and therefore per period (the period buckets are sums of per-job parts). Three
rounded thirds can never sum to something other than the whole.

**Signed off by the repo owner on 2026-07-31: report both.** The decision was
first taken by the implementing session, which had no channel to ask
interactively, and was then put to the owner explicitly with all three options
(gross-only / apportioned-only / both) and their trade-offs. The owner confirmed
**both columns**, for the reason given above: the gross split is the number that
answers "what share of my revenue is labour" with no allocation assumption, and
the apportioned split is what stops the by-type rows visibly failing to add up to
the `Total` stat directly above them.

Recorded here rather than left implicit precisely because of the incident this
repo's owner has cited (a feature shipped with no written requirements, which
caused a real bug). Should this ever be revisited: gross-only means deleting the
`Total` column from the by-type table and the `total_by_type` field;
apportioned-only means deleting the `Subtotal` and `%` columns and
`subtotal_by_type`. Neither reversal touches the query.

### Rejected alternatives

| Option | Why not |
|--------|---------|
| Gross `subtotal_by_type` only | Cheapest and unambiguous, but the three buckets visibly fail to sum to the `Total` stat directly above them. Rejected on (2). |
| Apportioned `total_by_type` only | Ties out, but hides the only exact number and forces the reader to accept an arbitrary allocation of a job-level discount as if it were a property of the items. |
| Also apportion `discount` and `tax` per type | Three more residues to reconcile, for two figures the by-type section does not display. Out of scope; the one-step apportionment already reconciles the headline. |
| Attribute per **child** `item_type` | Structurally impossible after migration 024 (children have no type) and explicitly not wanted — see `spec/job-item-group-type-and-pricing.md`. |
| Build on `catalog_uses` / `item_catalog` | Blocked by `docs/technical-debt.md#td-003`: `catalog_uses` are root rows only, so every `'detallado'` group would contribute $0. Avoided by aggregating from `job_items` directly — TD-003 is therefore **not** a blocker for this change and stays open, untouched. |

## Proposed Change

### Implementation Details

**Backend — `workshop-backend/src/utils/financials.js`** (new shared exports)

`JOB_TYPE_SUBTOTALS_SUBQUERY` — the per-`(job_id, item_type)` variant of
`JOB_SUBTOTALS_SUBQUERY`. It is deliberately built as a **regrouping of the same
rows under the same `CASE`**, not as a second formulation of the money math:

```sql
SELECT i.job_id,
       COALESCE(i.item_type, r.item_type, 'otro') AS item_type,
       SUM(CASE
             WHEN i.parent_id IS NOT NULL AND r.pricing_mode = 'agregado' THEN 0
             WHEN i.parent_id IS NULL AND i.pricing_mode = 'detallado'
                  AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id) THEN 0
             ELSE i.quantity * i.unit_price
           END) AS subtotal
FROM job_items i
LEFT JOIN job_items r ON r.id = i.parent_id
GROUP BY i.job_id, COALESCE(i.item_type, r.item_type, 'otro')
```

- Identical row set and identical per-row `CASE` as `JOB_SUBTOTALS_SUBQUERY`,
  differing only in the grouping key. So
  `Σ_type JOB_TYPE_SUBTOTALS_SUBQUERY == JOB_SUBTOTALS_SUBQUERY` **by
  construction**, not by coincidence — the property cannot drift.
- A child is attributed to `r.item_type` (its root's type), pulling a
  `'detallado'` group's children into their root's bucket. `COALESCE(..., 'otro')`
  is defensive only (the CHECK constraints make a null root type impossible);
  it mirrors `pdfController.groupItemsByType`'s fallback.
- `r.pricing_mode = 'agregado'` replaces the `EXISTS` on the parent — equivalent,
  since `r.id = i.parent_id` joins on the primary key.
- This is **not** a fifth inlined copy: it lives in `financials.js` next to the
  expression it refines, and `dashboardController` imports it.

`ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro']` — the canonical order, which
is also the residue tie-break order.

`apportionByType(shares, target)` — splits an already-rounded `target` across
`ITEM_TYPES` proportionally to `shares`, guaranteeing `Σ parts === target`:
each part is `round2(target * share / Σshares)`, and the residue goes to the
largest share (ties by `ITEM_TYPES` order). When `Σshares === 0` all parts are 0
and any nonzero `target` lands wholly on `otro` — unreachable in practice (a
job with no priced items reaches `'pagado'` with no payments and is therefore
excluded from every closing, per `spec/monthly-closing-job-selection.md`), but
specified so the invariant holds unconditionally rather than throwing.

**Backend — `workshop-backend/src/controllers/dashboardController.js`**
(`monthlyClosing`)

- After the existing job query, a **second** query fetches the type breakdown
  for exactly the job ids just returned (`WHERE i.job_id = ANY($1)`), so the two
  results cannot describe different job sets. Skipped entirely when the month
  has no jobs.
- Per job: `subtotal_by_type = apportionByType(shares, round2(subtotal))` and
  `total_by_type = apportionByType(shares, total)`, where `shares` are the raw
  per-type subtotals and `total` is the value the controller already computes and
  rounds.
- `calc()` gains `subtotal_by_type` / `total_by_type`, each the per-type sum over
  the list, `round2`-ed to kill float noise from summing 2-decimal values.
- No change to the job set, the WHERE clause, the month attribution, the existing
  response fields, or the rounding convention.

**Frontend — `workshop-frontend/src/app/core/models/index.ts`**

New `MonthlyClosingByType = Record<ItemType, number>`. `MonthlyClosingTotals`
and `MonthlyClosingJob` each gain `subtotal_by_type` and `total_by_type`.

**Frontend — `workshop-frontend/src/app/features/dashboard/dashboard.component.ts`**

Each of the 3 tabs gets an **Ingresos por tipo** block between the
`.closing-summary` stat row and the per-job table: a 3-row table
`Tipo | Subtotal | % del subtotal | Total`, plus a bold totals row that
reproduces the `Subtotal` and `Total` stats, so the reconciliation is visible
rather than asserted. Type labels come from the existing `ItemTypePipe`
("Mano de Obra" / "Repuestos" / "Otros"); badge colours reuse
`job-detail.typeBadge`'s convention (`b-teal` for labour, `b-reg` otherwise).
`privacyMode` masks the money columns (the `%` column is a ratio, not an amount,
and stays visible — consistent with `count` staying visible).

Rows are precomputed in `loadMonthlyClosing()` into three fields rather than
computed by a template method call, so change detection does no work per cycle.

**Deliberately not changed:** the per-job `mat-table` gains no columns. It is
already 8 columns wide; adding 3–6 more would break the layout on the target
viewport. The per-job `subtotal_by_type` / `total_by_type` are returned by the
API for drill-down and for future export/PDF consumers, and are what the
aggregate is summed from — which is also what makes the per-job invariant
directly testable.

## Acceptance Criteria

1. `subtotal_by_type` sums to the job's `subtotal` for every job, and to the
   period's `subtotal` for each of `all` / `iva` / `no_iva`.
2. `total_by_type` sums **exactly** to the job's `total`, and to the period's
   `total` for each of the three buckets — no rounding drift, including when a
   percentage discount produces a total that does not divide evenly by the shares.
3. An `'agregado'` group contributes its full `quantity * unit_price` to its
   root's type bucket, and nothing to any other bucket — including when a price
   has been forced onto one of its children behind the controllers' back.
4. A `'detallado'` group contributes `SUM(children)` to its **root's** type
   bucket, with children contributing to no other bucket.
5. A job with items of all three types reports all three buckets nonzero.
6. A fixed discount and a percentage discount both leave criterion 2 holding.
7. `tax_enabled` true and false both leave criterion 2 holding; with
   `tax_enabled = false`, `total_by_type` is the post-discount split.
8. The job set is unchanged: no non-`'pagado'` job appears, and month
   attribution still follows `MAX(payments.payment_date)`.
9. Every pre-existing `monthlyClosing` response field is byte-identical to
   before this change for the same data.
10. The by-type table renders in all 3 tabs, its totals row equals the
    `Subtotal` and `Total` stats above it, and `privacyMode` masks the amounts.

## Testing Plan

| Layer | What | Count |
|-------|------|-------|
| Integration (`__tests__/dashboard.integration.test.js`, new `describe`) | all three types in one job; buckets sum to subtotal and to total | 1 |
| Integration | `'agregado'` group lands wholly in its root's bucket | 1 |
| Integration | `'detallado'` group lands wholly in its root's bucket (children pulled into the root's type) | 1 |
| Integration | stale price forced onto an `'agregado'` child changes no bucket | 1 |
| Integration | fixed discount — buckets reconcile with `total` exactly | 1 |
| Integration | percentage discount producing an indivisible residue — buckets reconcile with `total` exactly, residue on the largest bucket | 1 |
| Integration | `tax_enabled = true` and `= false` reconcile | 2 |
| Integration | period-level `all` / `iva` / `no_iva` buckets reconcile with their own `subtotal` and `total` | 1 |
| Integration | untyped/`otro` items land in `otro`; a month with no jobs returns all-zero buckets | 1 |
| Regression | the 5 existing `monthlyClosing` tests stay green unmodified | 5 |
| Manual (browser) | Cierre mensual, all 3 tabs, numbers cross-checked against `psql` | see below |

Every integration test must execute against a real Postgres (`workshop_test`)
with **zero** `[skip] Postgres unreachable` lines in the output — a suite that
silently no-ops is worse than no suite.

Two pre-existing suites fail on this branch — `alertsController.test.js` and
`alerts.integration.test.js`, 6 tests about `alert_dismissals` / `last_results`.
Verified unrelated (identical failures at `HEAD` `b8b4d12` in a clean worktree);
neither file is touched here.

## Rollback Plan

Additive and self-contained: revert `dashboardController.monthlyClosing`, the two
new `financials.js` exports, and the frontend model/template additions. No
migration, no schema change, no change to the job set or to any existing response
field — so no other endpoint needs a coordinated rollback, and no data written by
this feature needs unwinding (it writes nothing).

Partial rollback of just the *decision* (see *Decision taken*) is a template
change plus one deleted response field.

## Out of Scope

- **`docs/technical-debt.md#td-003`** — `itemCatalogController.total_revenue`
  under-reports `'detallado'` groups. Not a blocker here because this report
  aggregates `job_items` directly and never touches `catalog_uses`. Left open.
- **`docs/technical-debt.md#td-001` / `#td-002`** — unchanged, and inherited by
  this report exactly as by the rest of Cierre Mensual.
- **Per-type `discount` and `tax`** — see *Rejected alternatives*.
- **Per-job by-type columns in the tab tables** — API-only, see above.
- **A chart.** The breakdown is 3 categories × 2 measures; a table is denser,
  exactly reconcilable, and copy-pasteable into the accountant's spreadsheet. A
  donut would add a Chart.js instance per tab to convey three numbers.
- **CSV/PDF export of the breakdown**, and the by-type split on any other
  dashboard widget (`Facturado (mes)`, `Tendencia de ingresos`) — those use
  different, separately-inconsistent job selection logic
  (`spec/monthly-closing-job-selection.md` scoped them out).
- **`children.quantity` in the JS mirror.** `groupLineTotal` sums children's
  `unit_price` while the SQL uses `quantity * unit_price`; harmless today because
  both `create` and `addItem` force `quantity = 1` on every child, and this
  change uses the SQL convention so its buckets sum to the SQL subtotal. Noted,
  not touched.

## Related

- `spec/job-item-group-type-and-pricing.md` — the data model, and the *Follow-up*
  section that scoped this work
- `spec/monthly-closing-job-selection.md` — job set and month attribution
- `spec/monthly-closing-discount.md` / `spec/monthly-closing-discount-qa.md`
- `workshop-backend/migrations/024_group_item_type_and_pricing_mode.sql`
- `docs/technical-debt.md#td-001`, `#td-003`
