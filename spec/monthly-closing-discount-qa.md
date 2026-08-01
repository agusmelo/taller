# QA Review — Aggregated discount in Monthly Closing summary

**Feature**: Dashboard → *Cierre mensual* now shows a **Descuento** stat.
**Spec**: [`monthly-closing-discount.md`](./monthly-closing-discount.md)
**PR**: [#42](https://github.com/agusmelo/taller/pull/42)
**Tester**: Claude (/qa)  **Date**: 2026-07-26  **Result**: ☒ Pass ☐ Fail

---

## Setup

```bash
docker compose up -d          # frontend :4200 · API :3000 · Postgres
# Log in as admin (Cierre mensual is an admin-only dashboard section)
admin / admin123
```

Navigate to the **Dashboard** and scroll to the **Cierre mensual** card. Use the
month picker at the top of the card to select a month that has jobs.

**Prep data (if the month is empty)** — create a few jobs dated in the selected
month so each case below is covered:
- **Job A** — IVA on, a **fixed** discount (e.g. subtotal 1000, discount 200).
- **Job B** — IVA on, a **percentage** discount (e.g. subtotal 1000, discount 10%).
- **Job C** — IVA off (Sin IVA), no discount.
- **Job D** — IVA off (Sin IVA), a discount.

---

## Test cases

### 1. Descuento stat is present in all three tabs

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open **Cierre mensual**, tab **Todos** | Summary shows, in order: Trabajos · Subtotal · **Descuento** · IVA · Total · Cobrado · Pendiente |
| 2 | Switch to tab **Con IVA** | Same row, **Descuento** present between Subtotal and IVA |
| 3 | Switch to tab **Sin IVA** | Row shows Trabajos · Subtotal · **Descuento** · Total · Cobrado · Pendiente (no IVA stat — correct, that group has no tax) |

### 2. Descuento value is correct

| Step | Action | Expected |
|------|--------|----------|
| 1 | Tab **Todos** | **Descuento** = sum of the discount of every job in the month (fixed + percentage jobs both counted) |
| 2 | Verify the identity | **Subtotal − Descuento + IVA = Total** for the *Todos* summary |
| 3 | Tab **Con IVA** vs **Sin IVA** | The two Descuento values add up to the *Todos* Descuento |
| 4 | Percentage discount job (Job B) | Its share of Descuento = subtotal × percentage (e.g. 1000 × 10% = 100), not a flat amount |
| 5 | Cross-check a single job | Open one job's detail; its discount there matches what it contributes to the closing |

### 3. Formatting & currency

| Step | Action | Expected |
|------|--------|----------|
| 1 | Look at the Descuento value | Formatted as currency, same style as Subtotal/Total (uses `appCurrency`) |
| 2 | Colour | Descuento renders in **red** (like Pendiente) |
| 3 | Month with **no discounts** | Descuento shows the zero-currency value (e.g. `$0`), not blank / `NaN` / `undefined` |

### 4. Privacy mode

| Step | Action | Expected |
|------|--------|----------|
| 1 | Toggle **privacy mode** on (the eye/ocultar control on the dashboard) | Descuento is masked as `***`, exactly like Subtotal, IVA, Total, Cobrado, Pendiente |
| 2 | Toggle privacy mode off | Descuento value reappears |

### 5. Month switching

| Step | Action | Expected |
|------|--------|----------|
| 1 | Change the month in the picker | Summary (including Descuento) reloads for the new month |
| 2 | Pick a month with no jobs | Trabajos = 0 and all money stats (incl. Descuento) show zero, no error in console |

### 6. Regression — nothing else changed

| Step | Action | Expected |
|------|--------|----------|
| 1 | Subtotal value | Still the **pre-discount** price (unchanged by this feature) |
| 2 | IVA / Total / Cobrado / Pendiente | Unchanged values and positions |
| 3 | Job table below the summary | Rows unchanged (no new column added); clicking a row still opens the job |
| 4 | Rest of the dashboard | Other cards (revenue trend, job status, etc.) unaffected |

---

## Sign-off

- [x] All test cases pass
- [x] `Subtotal − Descuento + IVA = Total` holds in every tab
- [x] Con IVA + Sin IVA discounts reconcile to the Todos total
- [x] Privacy mode masks the new stat
- [x] No console errors when switching months / empty months

**Notes / defects found:**

None. Tested against branch `claude/dashboard-metrics-closing-2n3ihz` (base `develop`)
using 4 seeded jobs in Aug 2026 covering fixed/percentage/no-discount/Sin-IVA cases.
Full evidence: `.gstack/qa-reports/qa-report-monthly-closing-discount-2026-07-26.md`
