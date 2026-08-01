# Spec — Cierre Mensual: fix job selection & attribution

**Feature area**: Dashboard → Cierre mensual (Monthly Closing)
**Branch**: `claude/dashboard-metrics-closing-2n3ihz`
**Status**: Spec'd — pending implementation
**Last updated**: 2026-07-26
**Related**: `spec/monthly-closing-discount.md` / `spec/monthly-closing-discount-qa.md` (the discount feature this bug was found underneath — no changes needed to that logic)

---

## Context

Cierre Mensual (Dashboard → *Cierre mensual*, `Administrador`-only per `docs/qa-testing-guide.md`) is meant to be a monthly revenue-recognition report: how much did the shop actually collect and close out this month. Today it reports something else — jobs *dated* in the month, whether or not they were ever paid — so the report used for monthly bookkeeping can include revenue never collected, and can misattribute revenue collected in a different month than the one it's shown in.

This surfaced during QA of the `Descuento` stat (`spec/monthly-closing-discount-qa.md`): the discount arithmetic was correct, but the underlying job set was wrong. Neither the original Cierre Mensual feature (no spec ever existed for it — built in commit `09eca46` directly) nor the discount branch's spec (which explicitly scoped out backend changes: *"the API already returns the discount"*) nor QA (which only tested the discount arithmetic) caught it.

## Current State

`workshop-backend/src/controllers/dashboardController.js:283-363` (`monthlyClosing`):

```sql
WHERE j.deleted_at IS NULL
  AND j.job_date >= $1 AND j.job_date < $2
```

- Selects **any** job dated in the month — `abierto`, `terminado`, and `pagado` alike.
- Groups by `job_date` (a user-editable field set at job creation/edit time), unrelated to when — or whether — the job was paid.
- Confirmed by the existing tests at `workshop-backend/__tests__/dashboard.integration.test.js:135-172`: both `monthlyClosing` tests create jobs with nonzero `balance` (never fully paid) and assert they appear in the closing (e.g. line 153: `count: 2 ... balance: 1000`). These tests currently encode the bug and are rewritten as part of this fix, not just supplemented.

## Proposed Change

`monthlyClosing` selects only `status = 'pagado'` jobs, attributed to the month of **`MAX(payments.payment_date)`** for that job (the payment that brought its balance to 0) — not `job_date`, not `jobs.paid_at`, not `payments.paid_at` (both of the latter are system-write timestamps, not the payment's business date, and can diverge from `payment_date` if a payment is entered/backdated after the fact).

Example: job total $100, $50 paid in May, $50 paid in July (completing it) → appears **only** in July's closing.

Scope: **only** `monthlyClosing`. The KPI cards (`Facturado (mes)`/`Cobrado (mes)`/`Trabajos del mes`), `Tendencia de ingresos`, and everything else on the dashboard keep their current (different) logic — out of scope for this issue.

### Implementation Details

**Backend — `workshop-backend/src/utils/financials.js:28-32`**

Extend the shared `JOB_PAID_SUBQUERY` (used by 5 controllers, 12 call sites — safe to extend additively since every caller selects specific columns, none does `SELECT *`):

```sql
const JOB_PAID_SUBQUERY = `
  SELECT job_id, SUM(amount) AS paid, MAX(payment_date) AS last_payment_date
  FROM payments
  GROUP BY job_id
`;
```

**Backend — `workshop-backend/src/controllers/dashboardController.js:283-363`**

```sql
SELECT
  j.id, j.job_number, j.tax_enabled, j.tax_rate,
  j.discount_amount, j.discount_type, j.status, j.job_date,
  c.full_name AS client_name,
  COALESCE(it.subtotal, 0) AS subtotal,
  p.paid, p.last_payment_date
FROM jobs j
JOIN clients c ON c.id = j.client_id
LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
WHERE j.deleted_at IS NULL
  AND j.status = 'pagado'
  AND p.last_payment_date >= $1 AND p.last_payment_date < $2
ORDER BY p.last_payment_date
```

The join to payments becomes **INNER** (was `LEFT`): a `'pagado'` job with actual money owed always has ≥1 payment row, so this is safe.

**Edge case**: a $0-total job (all-free items) can flip to `'pagado'` via `checkAndPay` with zero payments ever recorded (balance `0 - 0 = 0`). It has no `last_payment_date`, so it's excluded from every closing. This is the correct outcome (no revenue event to attribute to any month) — flagged here as a deliberate decision, not an oversight.

Response mapping: pass `last_payment_date` straight through per job (it's a date, no rounding needed).

**Frontend — `workshop-frontend/src/app/core/models/index.ts`**

Add `last_payment_date: string` to `MonthlyClosingJob`.

**Frontend — `workshop-frontend/src/app/features/dashboard/dashboard.component.ts:271,298,324`**

Each of the 3 tabs' job tables gets a new column, header **"Fecha de pago"**, rendering `{{ j.last_payment_date | date:'dd/MM/yyyy':'UTC' }}`, next to the existing `job_date`/"Fecha" column (kept as-is — job creation date).

**Column decision (in scope):** remove the **Estado** column — once every row is filtered to `status='pagado'`, it's a 100%-constant literal `"Pagado"` with zero information content. **Keep Saldo and Pagado** — normally `Saldo` is always `$0` (job is fully paid), but it's *live-computed* as `total − paid`, not a static flag, so if the payment-reversal gap described in `docs/technical-debt.md#td-001` ever fires, `Saldo` becomes a visible nonzero tripwire in this exact table. Removing it would remove the only visible signal of that failure mode.

Net per-job table columns (all 3 tabs): N°, Cliente, Fecha, **Fecha de pago**, IVA, Total, Pagado, Saldo.

## Acceptance Criteria

1. A job with `status != 'pagado'` never appears in any month's `monthlyClosing` response (`all`, `iva`, `no_iva`, or `jobs`), regardless of `job_date`.
2. A job paid in full across 2+ payments in different months appears **only** in the closing for the month of its last (balance-completing) payment's `payment_date`.
3. A job paid in full by a single payment appears in the closing for that payment's `payment_date` month.
4. `Subtotal − Descuento + IVA = Total` still holds per tab (unaffected by this change).
5. The per-job table in each of the 3 tabs shows both `job_date` ("Fecha") and the completing payment's date ("Fecha de pago"), and no longer shows "Estado".
6. A $0-total job that reaches `'pagado'` with zero payments is excluded from every month's closing.
7. `workshop-backend/__tests__/dashboard.integration.test.js:136-172` rewritten to reflect the new rule (no test asserts an unpaid/partial job appears in a closing).
8. Existing `Sin IVA` behavior (no IVA stat shown) is unaffected.

## Testing Plan

| Layer | What | Count |
|-------|------|-------|
| Integration | Rewrite existing 2 `monthlyClosing` tests (dashboard.integration.test.js:136-172) for the new rule | ~2 (rewritten) |
| Integration | New: multi-month split payment ($50 May + $50 July → July only) | +1 |
| Integration | New: single-payment completion attributes to that payment's month | +1 |
| Integration | New: `abierto`/`terminado` (never fully paid) jobs excluded regardless of `job_date` | +1 |
| Integration | New: $0-total job with no payments excluded | +1 |
| E2E (manual, via /qa) | Dashboard shows both Fecha and Fecha de pago columns, no Estado column; values match a manually-paid multi-month job | 1 pass |

## Rollback Plan

Single-controller change plus one shared subquery extension — revert the PR. The subquery extension is additive (new column, unused by other 12 call sites), so no other endpoint needs a coordinated rollback.

## Effort Estimate

- Backend query + subquery change: ~30 min
- Rewrite 2 existing tests + write 4 new ones: ~1h
- Frontend model + column changes (3 tabs): ~30 min
- Manual QA pass (multi-month scenario with actual payments): ~30 min

**Total: ~2.5h**

## Files Reference

| File | Change |
|------|--------|
| `workshop-backend/src/utils/financials.js:28-32` | Add `MAX(payment_date) AS last_payment_date` to `JOB_PAID_SUBQUERY` |
| `workshop-backend/src/controllers/dashboardController.js:283-363` | Filter `status='pagado'`, join payments as INNER, filter/group by `last_payment_date` instead of `job_date` |
| `workshop-backend/__tests__/dashboard.integration.test.js:135-172` | Rewrite existing 2 tests + add 4 new (see Testing Plan) |
| `workshop-frontend/src/app/core/models/index.ts` | Add `last_payment_date: string` to `MonthlyClosingJob` |
| `workshop-frontend/src/app/features/dashboard/dashboard.component.ts:271,298,324` | Add "Fecha de pago" column, remove "Estado" column, in all 3 tabs' job tables |
| `docs/technical-debt.md` (new) | TD-001 — payment reversal after `'pagado'` leaves status/paid_at stale |

## Out of Scope

- KPI cards (`Facturado (mes)`/`Cobrado (mes)`/`Trabajos del mes`) and `Tendencia de ingresos` chart — different, also-inconsistent logic, not touched here.
- Payment reversal after `'pagado'` leaves `status`/`paid_at` stale — documented as `docs/technical-debt.md#td-001`, not fixed here.
- Surfacing partial/unpaid jobs anywhere in this module — explicitly excluded; they remain visible via Deudas de clientes / job list.

## Related

- `spec/monthly-closing-discount.md` / `spec/monthly-closing-discount-qa.md`
- `docs/technical-debt.md#td-001`
