# Spec — Aggregated discount in Monthly Closing summary

**Feature area**: Dashboard → Cierre mensual (Monthly Closing)
**Branch**: `claude/dashboard-metrics-closing-2n3ihz`
**PR**: [#42](https://github.com/agusmelo/taller/pull/42) (base `develop`)
**Status**: Implemented — pending QA
**Last updated**: 2026-07-26

---

## Problem

The Monthly Closing summary (Dashboard → *Cierre mensual*) displayed **Subtotal**
(the price *before* any discount) and jumped straight to **IVA** / **Total**. The
discount applied to jobs in the period was never surfaced as its own figure, so a
reader could not reconcile Subtotal → Total without inferring the discount, nor
see how much revenue was given away in discounts for the month.

## Goal

Surface the **aggregated discount** for the period as a first-class stat, keeping
the existing pre-discount price visible. The summary now reads left to right:

```
Trabajos · Subtotal (pre-discount) · Descuento · IVA · Total · Cobrado · Pendiente
```

The *Sin IVA* tab has no tax, so its order is:
`Trabajos · Subtotal · Descuento · Total · Cobrado · Pendiente`.

## Scope

**In scope** — surface a value the backend already computes:

- Add a **Descuento** stat to each of the three closing tabs: **Todos**, **Con IVA**, **Sin IVA**.
- Show the aggregated discount for that group (sum of per-job discounts).

**Out of scope** (not part of this change):

- Any backend/SQL change — the API already returns the discount.
- A per-job **Descuento** column in the closing tables (only the summary stat was added).
- Export (CSV/PDF), month-over-month comparison, or date-range selection.

## Data model / API

No API change. `GET /dashboard/monthly-closing?month=YYYY-MM` already returns the
discount, both per group and per job. Response shape (unchanged):

```jsonc
{
  "month": "2026-07",
  "all":    { "count", "subtotal", "discount", "tax", "total", "paid", "balance" },
  "iva":    { "count", "subtotal", "discount", "tax", "total", "paid", "balance" },
  "no_iva": { "count", "subtotal", "discount", "tax", "total", "paid", "balance" },
  "jobs":   [ { "id", "job_number", "client_name", "job_date", "status",
               "tax_enabled", "subtotal", "discount", "tax", "total",
               "paid", "balance" } ]
}
```

### How `discount` is computed (backend, `dashboardController.monthlyClosing`)

Per job, from the job's own fields (single source of truth, not a hardcoded rate):

- `discount_type = 'percentage'` → `discount = subtotal * (discount_amount / 100)`
- `discount_type = 'fixed'` → `discount = discount_amount`
- Rounded to 2 decimals.
- `taxBase = subtotal - discount`; `tax = tax_enabled ? taxBase * tax_rate : 0`;
  `total = taxBase + tax`.

Group totals are the sum of the per-job rounded values. So for every group the
identity **`Subtotal − Descuento + IVA = Total`** must hold.

## Implementation

Frontend only — 2 files:

- **`workshop-frontend/src/app/core/models/index.ts`**
  Added `discount: number` to `MonthlyClosingTotals` and `MonthlyClosingJob`
  (the API already returned it; the interfaces were just missing the field).

- **`workshop-frontend/src/app/features/dashboard/dashboard.component.ts`**
  Added a `Descuento` stat cell immediately after `Subtotal` in the three
  `.closing-summary` blocks. Styled red (`color: var(--red)`) to read as a
  reduction, and gated by `privacyMode` (shows `***`) like the other money stats.

## Design decisions

- **Reuse over recompute**: the discount was already in the payload; the fix is
  purely presentational, so there is no risk of the summary and the job detail
  disagreeing on the number.
- **Placement**: `Descuento` sits between `Subtotal` and `IVA`/`Total` so the
  columns read in calculation order.
- **Colour**: red matches `Pendiente` and signals "money subtracted"; it is not
  an error/alert colour in this context.
- **No per-row column**: keeps the change minimal and the tables unchanged;
  can be added later if requested.

## Verification done

- `ng build` (development) completes with exit 0. The only warning is a
  pre-existing `NG8011` in `login.component.ts`, unrelated to this change.
- Existing `__tests__/dashboard.integration.test.js` already asserts
  `discount: 200` on `all`/`iva` group totals, so the backend contract this UI
  relies on is covered.
