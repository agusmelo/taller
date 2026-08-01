# Technical Debt

Known gaps that are deliberately not being fixed right now, with enough detail
that a future session doesn't have to rediscover them from scratch.

---

## TD-001: Payment removal after a job is `pagado` doesn't revert status/paid_at

**Discovered**: 2026-07-26, during spec work for the Cierre Mensual job-selection
fix (`spec/monthly-closing-job-selection.md`).

**Mechanism**:

1. A job reaches `status='pagado'`, `is_locked=true` via `checkAndPay`
   (`workshop-backend/src/controllers/jobsController.js:40-53`) once its balance
   drops to ≤ 0.
2. An admin can unlock **any** job, including a `'pagado'` one, via
   `PUT /jobs/:id/unlock` (`routes/index.js:74`, `unlockJob` in
   `jobsController.js:272-279`). This is reachable from the job detail UI's
   "Desbloquear" button (`job-detail.component.ts:79-87`), which renders for
   any locked job — there's no exclusion for `status === 'pagado'`.
3. Once unlocked, `DELETE /jobs/:id/payments/:paymentId` (`removePayment`,
   `jobsController.js:475-480`) is gated only by `checkJobLocked()` — it
   succeeds on the now-unlocked `'pagado'` job.
4. `removePayment` deletes the payment row but never calls `checkAndPay` (or
   any equivalent) afterward. Result: `jobs.status` stays `'pagado'` and
   `paid_at` stays at the original completion timestamp, even though the
   job's actual paid total (`SUM(payments.amount)`) no longer covers `total`.

**Impact**: any feature that trusts `status='pagado'` as "this job is fully
settled" can be wrong after this sequence. Concretely, for Cierre Mensual
(`spec/monthly-closing-job-selection.md`, which selects on `status='pagado'`
and attributes by `MAX(payments.payment_date)`): removing a payment from an
already-closed month can make the job vanish from that month's closing
entirely (if the removed payment was the last one and none remain), or
silently shift it to an earlier month's closing (if an earlier payment is now
the "last" one) — even after the business has already reported/reconciled
that month. The `Saldo` column in the Cierre Mensual per-job table would show
nonzero for that job going forward, but only if someone happens to look.

**Why not fixed now**: this is a pre-existing data-integrity gap in payment
removal / job locking — not introduced by the Cierre Mensual job-selection
fix. That fix inherits it like every other consumer of `jobs.status` /
`payments` (e.g. `dashboard.summary`, `clientFinancials`, `unpaidJobs`, the
payments page). Fixing it properly means deciding how `removePayment` (and
job unlocking in general) should behave, which is a separate, cross-cutting
decision.

**Options for whoever picks this up** (not decided — just the shape of the fix):

- **(a)** Have `removePayment` recompute the balance after deletion and
  revert `status` to `terminado`/`abierto` + clear `paid_at` if balance > 0.
- **(b)** Block unlocking (or block payment removal specifically) on
  `'pagado'` jobs entirely — force a different correction path (e.g. a
  documented manual adjustment/credit flow instead of deleting payment rows).
- **(c)** Treat each month's Cierre Mensual as an immutable snapshot once
  viewed/exported, so historical closings don't shift retroactively
  regardless of what happens to the underlying payments later.

**Related**: `spec/monthly-closing-job-selection.md`

---

## TD-002: `Cobrado (mes)` KPI has no upper date bound — counts future-dated payments

**Discovered**: 2026-07-29, while manually verifying the Cierre Mensual
job-selection fix by registering a payment dated in a future month.

**Mechanism**: `dashboardController.js:13` (`summary`):

```sql
SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_date >= $1
```

`$1` is `monthStart` (the 1st of the current calendar month) — there's no
`AND payment_date < monthEnd`. So `cobrado_month` sums every payment dated
from the start of this month **to infinity**, including payments dated in
future months. Confirmed live: registering a payment dated 2026-09-15 while
"today" was 2026-07-27 immediately moved `Cobrado (mes)` on the dashboard KPI
row, even though September hadn't started.

**Impact**: `Cobrado (mes)` (and `collection_rate_month`, which divides by it)
over-reports whenever a payment is entered with a future `payment_date` —
e.g. correcting/pre-entering data, or simple user error on the date picker.

**Why not fixed now**: out of scope for `spec/monthly-closing-job-selection.md`,
which explicitly limited itself to `monthlyClosing` and left KPI cards
untouched. Flagged during that work rather than silently patched.

**Suggested fix**: add `AND payment_date < $2` with `monthEnd` passed as a
second param, mirroring how `monthlyClosing` already bounds its date range.
One-line change, no schema impact.

---

## TD-003: Catalog analytics `total_revenue` under-reports any item used as a group

**Discovered**: 2026-07-29, while auditing every reader of `item_type` for
`spec/job-item-group-type-and-pricing.md`.

**Mechanism**: `itemCatalogController.js:487` (the catalog analytics endpoint):

```sql
ROUND(SUM(cu.quantity * cu.unit_price)::numeric, 2) AS total_revenue
```

`catalog_uses` rows are `job_items` carrying a `catalog_item_id`, which only
root rows ever do (`addItem` clears it for children). For a `'detallado'` group
the root's own `quantity * unit_price` is `1 * 0` — the group's real total lives
on its children — so **every group-shaped use of a catalog item contributes $0**
to that item's `total_revenue`. An item used only as a group header reports
$0 lifetime revenue while having generated real money.

This predates `pricing_mode`: roots with children have been stored with
`unit_price = 0` since migration 007. `'agregado'` groups added in migration 024
are *correct* here by luck — their price genuinely is on the root.

**Impact**: `total_revenue` (and the `sort=total_revenue` ordering built on it)
is wrong, low, for exactly the catalog items used as service packages — likely
the highest-value ones. Silent: the number looks plausible, just small.

**Why not fixed now**: out of scope for
`spec/job-item-group-type-and-pricing.md`, which limited itself to the job-item
data model and the aggregations that feed job/dashboard totals. This is a
separate report with its own CTE structure and its own sort/filter surface.

**Suggested fix**: reuse the shared shadow-aware expression rather than
inventing a fifth inline copy — join children in and use
`groupLineTotal`-equivalent SQL, i.e. the `CASE` from
`utils/financials.js:JOB_SUBTOTALS_SUBQUERY`. Must be resolved before any
by-`item_type` revenue report is built on `catalog_uses`.

**Status update (2026-07-29)**: the by-`item_type` revenue report shipped
(`spec/monthly-closing-by-item-type.md`) **without** touching this. It aggregates
`job_items` directly via a new shared `JOB_TYPE_SUBTOTALS_SUBQUERY`, so TD-003
was not a blocker for it and remains open, unchanged. Any *future* report that
reaches for `catalog_uses` still has to fix it first.

---

## TD-004: `exportClients` uses `SUM(DISTINCT ...)`, collapsing equal subtotals

**Discovered**: 2026-07-29, while replacing the inlined subtotal subqueries in
`exportController` for `spec/job-item-group-type-and-pricing.md`.

**Mechanism**: `exportController.exportClients`:

```sql
COALESCE(SUM(DISTINCT it.subtotal), 0)  AS total_facturado,
COALESCE(SUM(DISTINCT py.paid_per_job), 0) AS total_pagado
```

`DISTINCT` inside the aggregate de-duplicates by **value**, not by job. A client
with two jobs whose subtotals are both $1,000 reports `total_facturado = 1000`,
not $2,000. The `DISTINCT` is presumably there to undo row multiplication from
the joins, but it silently discards legitimately repeated amounts — and equal
round-number totals are common in a workshop (a fixed-price service).

**Impact**: the clients CSV export under-reports `total_facturado` /
`total_pagado` for any client with two or more jobs sharing an identical
subtotal or an identical paid amount.

**Why not fixed now**: pre-existing and independent of the item data model. The
correct fix is to aggregate per job in a subquery keyed by `job_id` and then sum
without `DISTINCT`, which restructures the query — larger than the mechanical
subquery replacement that surfaced it.

**Related**: the same file's `exportJobs` is unaffected (one row per job, no
aggregation).

