const pool = require('../config/database');
const { JOB_SUBTOTALS_SUBQUERY, JOB_PAID_SUBQUERY, jobTotalRounded, jobBalanceRounded } = require('../utils/financials');

const TOTAL    = jobTotalRounded('j', 'COALESCE(it.subtotal, 0)');
const BALANCE  = jobBalanceRounded('j', 'COALESCE(it.subtotal, 0)', 'COALESCE(p.paid, 0)');

async function jobsWithBalances(req, res, next) {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['j.deleted_at IS NULL'];

    if (status) {
      params.push(status);
      conditions.push(`j.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(c.full_name ILIKE $${params.length} OR j.job_number ILIKE $${params.length} OR v.plate_number ILIKE $${params.length})`);
    }

    params.push(parseInt(limit), offset);

    const r = await pool.query(`
      SELECT j.id, j.job_number, j.job_date, j.status,
             c.full_name AS client_name, c.id AS client_id, c.rut AS client_rut,
             v.plate_number,
             ${TOTAL} AS total,
             COALESCE(p.paid, 0) AS total_paid,
             ${BALANCE} AS balance,
             p.last_payment_date,
             p.last_payment_method,
             COUNT(*) OVER() AS total_count
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
      LEFT JOIN (
        SELECT job_id, SUM(amount) AS paid,
               MAX(paid_at) AS last_payment_date,
               (ARRAY_AGG(method ORDER BY paid_at DESC))[1] AS last_payment_method
        FROM payments GROUP BY job_id
      ) p ON p.job_id = j.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY j.job_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const rows = r.rows;
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    res.json({
      data: rows.map(row => {
        delete row.total_count;
        return {
          ...row,
          total: parseFloat(row.total),
          total_paid: parseFloat(row.total_paid),
          balance: parseFloat(row.balance),
        };
      }),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) { next(err); }
}

async function recentPayments(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const r = await pool.query(`
      SELECT p.id, p.amount, p.method, p.paid_at, p.payment_date, p.reference,
             j.id AS job_id, j.job_number,
             c.id AS client_id, c.full_name AS client_name
      FROM payments p
      JOIN jobs j ON j.id = p.job_id
      JOIN clients c ON c.id = j.client_id
      WHERE j.deleted_at IS NULL
      ORDER BY p.paid_at DESC
      LIMIT $1
    `, [limit]);
    res.json(r.rows.map(row => ({ ...row, amount: parseFloat(row.amount) })));
  } catch (err) { next(err); }
}

async function agingReport(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT
        CASE
          WHEN age_days <= 30 THEN '0-30'
          WHEN age_days <= 60 THEN '31-60'
          WHEN age_days <= 90 THEN '61-90'
          ELSE '90+'
        END AS bucket,
        COUNT(*) AS job_count,
        SUM(balance) AS total_balance,
        COUNT(DISTINCT client_id) AS client_count
      FROM (
        SELECT j.client_id,
               CURRENT_DATE - j.job_date::date AS age_days,
               ${BALANCE} AS balance
        FROM jobs j
        LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
        LEFT JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
        WHERE j.status != 'pagado' AND j.deleted_at IS NULL
      ) sub
      WHERE balance > 0
      GROUP BY bucket
      ORDER BY bucket
    `);

    const buckets = { '0-30': null, '31-60': null, '61-90': null, '90+': null };
    for (const row of r.rows) {
      buckets[row.bucket] = {
        job_count: parseInt(row.job_count),
        total_balance: parseFloat(row.total_balance),
        client_count: parseInt(row.client_count),
      };
    }
    for (const key of Object.keys(buckets)) {
      if (!buckets[key]) buckets[key] = { job_count: 0, total_balance: 0, client_count: 0 };
    }
    res.json(buckets);
  } catch (err) { next(err); }
}

async function debtors(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT c.id, c.full_name, c.rut, c.phone,
             SUM(sub.balance) AS total_debt,
             COUNT(*) AS unpaid_jobs,
             MIN(sub.job_date) AS oldest_unpaid_date,
             CURRENT_DATE - MIN(sub.job_date)::date AS days_overdue
      FROM clients c
      JOIN (
        SELECT * FROM (
          SELECT j.id, j.client_id, j.job_date,
                 ${BALANCE} AS balance
          FROM jobs j
          LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
          LEFT JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
          WHERE j.status != 'pagado' AND j.deleted_at IS NULL
        ) z WHERE z.balance > 0
      ) sub ON sub.client_id = c.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.rut, c.phone
      ORDER BY total_debt DESC
    `);
    res.json(r.rows.map(row => ({
      ...row,
      total_debt: parseFloat(row.total_debt),
      unpaid_jobs: parseInt(row.unpaid_jobs),
      days_overdue: parseInt(row.days_overdue),
    })));
  } catch (err) { next(err); }
}

async function paymentsSummary(req, res, next) {
  try {
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';

    const [cobrado, pendiente, deudoresCount, byMethod] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_date >= $1`, [monthStart]),
      pool.query(`
        SELECT COALESCE(SUM(balance), 0) AS total FROM (
          SELECT ${BALANCE} AS balance
          FROM jobs j
          LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
          LEFT JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
          WHERE j.status != 'pagado' AND j.deleted_at IS NULL
        ) sub WHERE balance > 0`),
      pool.query(`
        SELECT COUNT(DISTINCT client_id) AS total FROM (
          SELECT j.client_id, ${BALANCE} AS balance
          FROM jobs j
          LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
          LEFT JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
          WHERE j.status != 'pagado' AND j.deleted_at IS NULL
        ) sub WHERE balance > 0`),
      pool.query(`
        SELECT method, SUM(amount) AS total, COUNT(*) AS count
        FROM payments WHERE payment_date >= $1
        GROUP BY method ORDER BY total DESC`, [monthStart]),
    ]);

    res.json({
      cobrado_month: parseFloat(cobrado.rows[0].total),
      pendiente_total: parseFloat(pendiente.rows[0].total),
      deudores_count: parseInt(deudoresCount.rows[0].total),
      by_method: byMethod.rows.map(r => ({
        method: r.method,
        total: parseFloat(r.total),
        count: parseInt(r.count),
      })),
    });
  } catch (err) { next(err); }
}

module.exports = { jobsWithBalances, recentPayments, agingReport, debtors, paymentsSummary };
