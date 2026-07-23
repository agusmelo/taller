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
// detail always agree.

// Per-job subtotal. A parent row that has children contributes 0 (its line
// total is the sum of its children); every other row contributes
// quantity * unit_price.
const JOB_SUBTOTALS_SUBQUERY = `
  SELECT i.job_id,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id)
                  THEN 0
                  ELSE i.quantity * i.unit_price END) AS subtotal
  FROM job_items i
  GROUP BY i.job_id
`;

// Per-job total-paid subquery.
const JOB_PAID_SUBQUERY = `
  SELECT job_id, SUM(amount) AS paid
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
  JOB_SUBTOTALS_SUBQUERY,
  JOB_PAID_SUBQUERY,
  jobTotalExpr,
  jobTotalRounded,
  jobBalanceRounded,
};
