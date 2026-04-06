const pool = require('../config/database');

async function summary(req, res, next) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const yearStart  = today.slice(0, 4) + '-01-01';

    const [revenueToday, revenueMonth, revenueYear, jobsToday, jobsMonth] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_at::date = $1`, [today]),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_at >= $1`, [monthStart]),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_at >= $1`, [yearStart]),
      pool.query(`SELECT COUNT(*) AS total FROM jobs WHERE created_at::date = $1 AND deleted_at IS NULL`, [today]),
      pool.query(`SELECT COUNT(*) AS total FROM jobs WHERE created_at >= $1 AND deleted_at IS NULL`, [monthStart]),
    ]);

    res.json({
      revenue_today:  parseFloat(revenueToday.rows[0].total),
      revenue_month:  parseFloat(revenueMonth.rows[0].total),
      revenue_year:   parseFloat(revenueYear.rows[0].total),
      jobs_today:     parseInt(jobsToday.rows[0].total),
      jobs_month:     parseInt(jobsMonth.rows[0].total),
    });
  } catch (err) { next(err); }
}

async function revenueTrend(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(paid_at, 'YYYY-MM') AS month, SUM(amount) AS total
      FROM payments
      WHERE paid_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
      ORDER BY month
    `);
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function jobStatus(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM jobs WHERE deleted_at IS NULL
      GROUP BY status
    `);
    const counts = { abierto: 0, terminado: 0, pagado: 0 };
    r.rows.forEach(row => { counts[row.status] = parseInt(row.count); });
    res.json(counts);
  } catch (err) { next(err); }
}

async function clientFinancials(req, res, next) {
  try {
    const { filter } = req.query;
    const r = await pool.query(`
      SELECT
        c.id, c.full_name, c.rut,
        COUNT(DISTINCT j.id) AS job_count,
        COALESCE(SUM(DISTINCT it.subtotal_per_job), 0) AS total_facturado,
        COALESCE(SUM(DISTINCT py.paid_per_job), 0) AS total_pagado
      FROM clients c
      LEFT JOIN jobs j ON j.client_id = c.id AND j.deleted_at IS NULL
      LEFT JOIN (
        SELECT job_id, SUM(quantity * unit_price) AS subtotal_per_job
        FROM job_items GROUP BY job_id
      ) it ON it.job_id = j.id
      LEFT JOIN (
        SELECT job_id, SUM(amount) AS paid_per_job
        FROM payments GROUP BY job_id
      ) py ON py.job_id = j.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.rut
      ORDER BY (COALESCE(SUM(DISTINCT it.subtotal_per_job), 0) - COALESCE(SUM(DISTINCT py.paid_per_job), 0)) DESC
    `);

    let rows = r.rows.map(row => ({
      ...row,
      total_facturado: parseFloat(row.total_facturado),
      total_pagado:    parseFloat(row.total_pagado),
      saldo:           parseFloat(row.total_facturado) - parseFloat(row.total_pagado)
    }));

    if (filter === 'deuda') {
      rows = rows.filter(r => r.saldo > 0);
    }

    const totals = rows.reduce((acc, r) => ({
      total_facturado: acc.total_facturado + r.total_facturado,
      total_pagado:    acc.total_pagado + r.total_pagado,
      total_pendiente: acc.total_pendiente + Math.max(0, r.saldo),
    }), { total_facturado: 0, total_pagado: 0, total_pendiente: 0 });

    res.json({ clients: rows, totals });
  } catch (err) { next(err); }
}

async function recentJobs(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT j.id, j.job_number, j.status, j.created_at,
             c.full_name AS client_name, v.plate_number, v.make, v.model
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.deleted_at IS NULL
      ORDER BY j.created_at DESC LIMIT 10
    `);
    res.json(r.rows);
  } catch (err) { next(err); }
}

module.exports = { summary, revenueTrend, jobStatus, clientFinancials, recentJobs };
