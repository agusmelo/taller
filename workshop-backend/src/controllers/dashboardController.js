const pool = require('../config/database');

async function summary(req, res, next) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    const [cobradoMonth, jobsMonth, activeJobs, facturadoMonth, pendienteTotal] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_date >= $1`, [monthStart]),
      pool.query(`SELECT COUNT(*) AS total FROM jobs WHERE created_at >= $1 AND deleted_at IS NULL`, [monthStart]),
      pool.query(`SELECT COUNT(*) AS total FROM jobs WHERE status IN ('abierto','terminado') AND deleted_at IS NULL`),
      pool.query(`
        SELECT COALESCE(SUM(sub.subtotal), 0) AS total FROM (
          SELECT SUM(ji.quantity * ji.unit_price) AS subtotal
          FROM jobs j JOIN job_items ji ON ji.job_id = j.id
          WHERE j.deleted_at IS NULL AND j.created_at >= $1
          GROUP BY j.id
        ) sub`, [monthStart]),
      pool.query(`
        SELECT COALESCE(SUM(sub.balance), 0) AS total FROM (
          SELECT COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) AS balance
          FROM jobs j
          LEFT JOIN job_items ji ON ji.job_id = j.id
          LEFT JOIN (SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id) p ON p.job_id = j.id
          WHERE j.status != 'pagado' AND j.deleted_at IS NULL
          GROUP BY j.id, p.paid
          HAVING COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) > 0
        ) sub`),
    ]);

    const cobrado = parseFloat(cobradoMonth.rows[0].total);
    const facturado = parseFloat(facturadoMonth.rows[0].total);

    res.json({
      facturado_month: facturado,
      cobrado_month:   cobrado,
      pendiente_total: parseFloat(pendienteTotal.rows[0].total),
      jobs_month:      parseInt(jobsMonth.rows[0].total),
      active_jobs:     parseInt(activeJobs.rows[0].total),
      collection_rate_month: facturado > 0 ? Math.round(cobrado / facturado * 10000) / 100 : 0,
    });
  } catch (err) { next(err); }
}

async function revenueTrend(req, res, next) {
  try {
    const { granularity = 'month', date_from, date_to } = req.query;

    let format, defaultInterval;
    if (granularity === 'week') {
      format = 'IYYY-IW';        // ISO year-week
      defaultInterval = '6 months';
    } else if (granularity === 'year') {
      format = 'YYYY';
      defaultInterval = '5 years';
    } else {
      format = 'YYYY-MM';
      defaultInterval = '12 months';
    }

    const params = [];
    let dateFilter;
    if (date_from && date_to) {
      params.push(date_from, date_to);
      dateFilter = `payment_date >= $1 AND payment_date < ($2::date + 1)`;
    } else if (date_from) {
      params.push(date_from);
      dateFilter = `payment_date >= $1`;
    } else if (date_to) {
      params.push(date_to);
      dateFilter = `payment_date < ($1::date + 1)`;
    } else {
      dateFilter = `payment_date >= NOW() - INTERVAL '${defaultInterval}'`;
    }

    const r = await pool.query(`
      SELECT TO_CHAR(payment_date, '${format}') AS period,
             SUM(amount) AS total,
             COUNT(DISTINCT job_id) AS jobs_count
      FROM payments
      WHERE ${dateFilter}
      GROUP BY TO_CHAR(payment_date, '${format}')
      ORDER BY period
    `, params);
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
      SELECT j.id, j.job_number, j.status, j.job_date, j.created_at,
             c.full_name AS client_name, v.plate_number, v.make, v.model
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.deleted_at IS NULL
      ORDER BY j.job_date DESC, j.created_at DESC LIMIT 10
    `);
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function overdueDebts(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const r = await pool.query(`
      SELECT c.id, c.full_name, c.rut, c.phone,
             SUM(sub.balance) AS saldo,
             COUNT(*) AS job_count,
             MIN(sub.job_date) AS oldest_unpaid_date,
             CURRENT_DATE - MIN(sub.job_date)::date AS days_overdue
      FROM clients c
      JOIN (
        SELECT j.id, j.client_id, j.job_date,
               COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) AS balance
        FROM jobs j
        LEFT JOIN job_items ji ON ji.job_id = j.id
        LEFT JOIN (SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id) p ON p.job_id = j.id
        WHERE j.status != 'pagado' AND j.deleted_at IS NULL
        GROUP BY j.id, j.client_id, j.job_date, p.paid
        HAVING COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) > 0
      ) sub ON sub.client_id = c.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.rut, c.phone
      HAVING CURRENT_DATE - MIN(sub.job_date)::date > $1
      ORDER BY days_overdue DESC
      LIMIT 20
    `, [days]);
    res.json(r.rows.map(row => ({
      ...row,
      saldo: parseFloat(row.saldo),
      days_overdue: parseInt(row.days_overdue),
      job_count: parseInt(row.job_count)
    })));
  } catch (err) { next(err); }
}

async function unpaidJobs(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const r = await pool.query(`
      SELECT j.id, j.job_number, j.job_date,
             COALESCE(SUM(ji.quantity * ji.unit_price), 0) AS total,
             COALESCE(p.paid, 0) AS paid,
             COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) AS balance,
             CURRENT_DATE - j.job_date::date AS days_pending,
             c.full_name AS client_name, c.id AS client_id,
             v.plate_number
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN job_items ji ON ji.job_id = j.id
      LEFT JOIN (SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id) p ON p.job_id = j.id
      WHERE j.status = 'terminado' AND j.deleted_at IS NULL
      GROUP BY j.id, j.job_number, j.job_date, c.full_name, c.id, v.plate_number, p.paid
      HAVING COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) > 0
        AND CURRENT_DATE - j.job_date::date > $1
      ORDER BY days_pending DESC
      LIMIT 20
    `, [days]);
    res.json(r.rows.map(row => ({
      ...row,
      total: parseFloat(row.total),
      paid: parseFloat(row.paid),
      balance: parseFloat(row.balance),
      days_pending: parseInt(row.days_pending)
    })));
  } catch (err) { next(err); }
}

async function topClients(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const r = await pool.query(`
      SELECT c.id, c.full_name, c.rut,
             SUM(p.amount) AS total_paid,
             COUNT(DISTINCT j.id) AS job_count
      FROM clients c
      JOIN jobs j ON j.client_id = c.id AND j.deleted_at IS NULL
      JOIN payments p ON p.job_id = j.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.rut
      ORDER BY total_paid DESC
      LIMIT $1
    `, [limit]);
    res.json(r.rows.map(row => ({
      ...row,
      total_paid: parseFloat(row.total_paid),
      job_count: parseInt(row.job_count)
    })));
  } catch (err) { next(err); }
}

async function paymentMethods(req, res, next) {
  try {
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    const r = await pool.query(`
      SELECT method, SUM(amount) AS total, COUNT(*) AS count
      FROM payments
      WHERE payment_date >= $1
      GROUP BY method
      ORDER BY total DESC
    `, [monthStart]);
    res.json(r.rows.map(row => ({
      method: row.method,
      total: parseFloat(row.total),
      count: parseInt(row.count)
    })));
  } catch (err) { next(err); }
}

async function newClients(req, res, next) {
  try {
    const now = new Date();
    const monthStart = now.toISOString().slice(0, 7) + '-01';
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = prevMonth.toISOString().slice(0, 7) + '-01';

    const [current, previous] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM clients WHERE deleted_at IS NULL AND created_at >= $1`, [monthStart]),
      pool.query(`SELECT COUNT(*) AS total FROM clients WHERE deleted_at IS NULL AND created_at >= $1 AND created_at < $2`, [prevMonthStart, monthStart]),
    ]);
    res.json({
      current_month: parseInt(current.rows[0].total),
      previous_month: parseInt(previous.rows[0].total),
    });
  } catch (err) { next(err); }
}

async function monthlyClosing(req, res, next) {
  try {
    const { month } = req.query;
    let monthStart, monthEnd;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      monthStart = month + '-01';
      const [y, m] = month.split('-').map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      monthEnd = nextMonth;
    } else {
      const now = new Date();
      monthStart = now.toISOString().slice(0, 7) + '-01';
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    }

    const r = await pool.query(`
      SELECT
        j.id, j.job_number, j.tax_enabled, j.status, j.job_date,
        c.full_name AS client_name,
        COALESCE(SUM(ji.quantity * ji.unit_price), 0) AS subtotal,
        COALESCE(p.paid, 0) AS total_paid
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      LEFT JOIN job_items ji ON ji.job_id = j.id
      LEFT JOIN (SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id) p ON p.job_id = j.id
      WHERE j.deleted_at IS NULL
        AND j.job_date >= $1 AND j.job_date < $2
      GROUP BY j.id, j.job_number, j.tax_enabled, j.status, j.job_date, c.full_name, p.paid
      ORDER BY j.job_date
    `, [monthStart, monthEnd]);

    const jobs = r.rows.map(row => {
      const subtotal = parseFloat(row.subtotal);
      const tax = row.tax_enabled ? Math.round(subtotal * 0.22 * 100) / 100 : 0;
      const total = subtotal + tax;
      const paid = parseFloat(row.total_paid);
      return {
        id: row.id,
        job_number: row.job_number,
        client_name: row.client_name,
        job_date: row.job_date,
        status: row.status,
        tax_enabled: row.tax_enabled,
        subtotal,
        tax,
        total,
        paid,
        balance: Math.round((total - paid) * 100) / 100,
      };
    });

    const calc = (list) => ({
      count: list.length,
      subtotal: list.reduce((s, j) => s + j.subtotal, 0),
      tax: list.reduce((s, j) => s + j.tax, 0),
      total: list.reduce((s, j) => s + j.total, 0),
      paid: list.reduce((s, j) => s + j.paid, 0),
      balance: list.reduce((s, j) => s + j.balance, 0),
    });

    const ivaJobs = jobs.filter(j => j.tax_enabled);
    const noIvaJobs = jobs.filter(j => !j.tax_enabled);

    res.json({
      month: monthStart.slice(0, 7),
      all: calc(jobs),
      iva: calc(ivaJobs),
      no_iva: calc(noIvaJobs),
      jobs,
    });
  } catch (err) { next(err); }
}

module.exports = { summary, revenueTrend, jobStatus, clientFinancials, recentJobs, overdueDebts, unpaidJobs, topClients, paymentMethods, newClients, monthlyClosing };
