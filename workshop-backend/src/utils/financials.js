// Single source of truth for job financial math expressed in SQL.
//
// These fragments mirror calcFinancials() in jobsController.js exactly:
//   subtotal -> (hierarchy-aware sum of item line totals)
//   discount -> percentage of subtotal, or a fixed amount
//   taxBase  -> subtotal - discount
//   tax      -> taxBase * tax_rate when tax_enabled, else 0
//   total    -> taxBase + tax
// All money values are rounded to 2 decimals, matching the JS implementation.
//
// Keep this in lockstep with calcFinancials: any aggregation that reports a
// job total/balance MUST use these so the payments page, dashboard and job
// detail always agree. Do not hand-inline a copy of the subtotal expression —
// three inlined copies had already drifted out of this file by the time
// pricing_mode was added (jobsController.list, exportController x2).

// Per-job subtotal. Every row contributes quantity * unit_price unless it is
// "shadowed" by the pricing mode of its group (see migration 024):
//
//   * a root of a 'detallado' group that has children -> contributes 0, because
//     its line total is the SUM of its children's prices;
//   * a child of an 'agregado' group -> contributes 0, because that group's
//     price lives entirely on the root and children are descriptions only.
//
// Both shadow rules are stated explicitly rather than relying on the shadowed
// rows happening to hold 0, so a stale price left on a row can never leak into
// a job total.
const JOB_SUBTOTALS_SUBQUERY = `
  SELECT i.job_id,
         SUM(CASE
               WHEN i.parent_id IS NOT NULL
                    AND EXISTS (SELECT 1 FROM job_items p
                                 WHERE p.id = i.parent_id
                                   AND p.pricing_mode = 'agregado')
               THEN 0
               WHEN i.parent_id IS NULL
                    AND i.pricing_mode = 'detallado'
                    AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id)
               THEN 0
               ELSE i.quantity * i.unit_price
             END) AS subtotal
  FROM job_items i
  GROUP BY i.job_id
`;

// The three revenue categories, in canonical order. Also the deterministic
// tie-break order used by apportionByType below.
const ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro'];

// Per-(job, item_type) subtotal — the by-category variant of the expression
// above, used by dashboard.monthlyClosing for the revenue breakdown
// (spec/monthly-closing-by-item-type.md).
//
// This is deliberately the SAME row set under the SAME CASE as
// JOB_SUBTOTALS_SUBQUERY, differing only in the GROUP BY key. Therefore
// SUM over item_type of this == JOB_SUBTOTALS_SUBQUERY's subtotal *by
// construction*, and the two cannot drift apart. Do not restate the money math
// here; if the shadow rules change, they change in one CASE that both queries
// must keep sharing.
//
// item_type is root-only since migration 024, so a child is attributed to its
// root's type (r.item_type): a 'detallado' group's children land in their own
// group's bucket, never in one of their own. The 'otro' fallback is defensive —
// the CHECK constraints make a null root type impossible — and mirrors
// pdfController.groupItemsByType.
const JOB_TYPE_SUBTOTALS_SUBQUERY = `
  SELECT i.job_id,
         COALESCE(i.item_type, r.item_type, 'otro') AS item_type,
         SUM(CASE
               WHEN i.parent_id IS NOT NULL
                    AND r.pricing_mode = 'agregado'
               THEN 0
               WHEN i.parent_id IS NULL
                    AND i.pricing_mode = 'detallado'
                    AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id)
               THEN 0
               ELSE i.quantity * i.unit_price
             END) AS subtotal
  FROM job_items i
  LEFT JOIN job_items r ON r.id = i.parent_id
  GROUP BY i.job_id, COALESCE(i.item_type, r.item_type, 'otro')
`;

const round2 = (n) => Math.round(n * 100) / 100;

// Split an already-rounded `target` across ITEM_TYPES in proportion to
// `shares`, guaranteeing that the parts sum to `target` EXACTLY.
//
// Needed because discount and IVA are job-level while item_type is item-level:
// a job's total has to be allocated across categories, and three independently
// rounded parts do not in general sum to the rounded whole. The leftover cent
// goes to the largest share, ties broken by ITEM_TYPES order, so the result is
// deterministic for identical input.
//
// `shares` is an object keyed by item type (missing keys count as 0); the values
// need no particular scale — only their ratios matter.
function apportionByType(shares, target) {
  const out = {};
  const totalShare = ITEM_TYPES.reduce((s, t) => s + (Number(shares[t]) || 0), 0);
  if (totalShare === 0) {
    // No priced items to attribute to. Unreachable for a job that reaches a
    // monthly closing (it needs a completing payment), but the sum-to-target
    // invariant is stated unconditionally rather than left to chance.
    for (const t of ITEM_TYPES) out[t] = 0;
    if (target !== 0) out.otro = round2(target);
    return out;
  }

  let allocated = 0;
  let largest = ITEM_TYPES[0];
  for (const t of ITEM_TYPES) {
    const share = Number(shares[t]) || 0;
    out[t] = round2((target * share) / totalShare);
    allocated = round2(allocated + out[t]);
    if (share > (Number(shares[largest]) || 0)) largest = t;
  }
  const residue = round2(target - allocated);
  if (residue !== 0) out[largest] = round2(out[largest] + residue);
  return out;
}

// Per-job total-paid subquery. last_payment_date is the most recent
// payment_date recorded for the job (business date, not a system timestamp) —
// used by monthlyClosing to attribute a fully-paid job to the month its
// balance was actually completed.
const JOB_PAID_SUBQUERY = `
  SELECT job_id, SUM(amount) AS paid, MAX(payment_date) AS last_payment_date
  FROM payments
  GROUP BY job_id
`;

// Unrounded total expression. `j` is the jobs table alias; `s` is a SQL
// expression yielding the job subtotal (e.g. 'COALESCE(it.subtotal, 0)').
function jobTotalExpr(j, s) {
  const discount = `CASE WHEN ${j}.discount_type = 'percentage'
                         THEN (${s}) * (${j}.discount_amount / 100)
                         ELSE ${j}.discount_amount END`;
  const taxBase = `((${s}) - (${discount}))`;
  const tax = `CASE WHEN ${j}.tax_enabled THEN ${taxBase} * ${j}.tax_rate ELSE 0 END`;
  return `(${taxBase} + (${tax}))`;
}

// Total rounded to 2 decimals.
function jobTotalRounded(j, s) {
  return `ROUND((${jobTotalExpr(j, s)})::numeric, 2)`;
}

// Balance (total - paid) rounded to 2 decimals. `paid` is a SQL expression for
// the amount paid (e.g. 'COALESCE(p.paid, 0)').
function jobBalanceRounded(j, s, paid) {
  return `ROUND(((${jobTotalExpr(j, s)}) - (${paid}))::numeric, 2)`;
}

module.exports = {
  ITEM_TYPES,
  JOB_SUBTOTALS_SUBQUERY,
  JOB_TYPE_SUBTOTALS_SUBQUERY,
  JOB_PAID_SUBQUERY,
  apportionByType,
  jobTotalExpr,
  jobTotalRounded,
  jobBalanceRounded,
};
