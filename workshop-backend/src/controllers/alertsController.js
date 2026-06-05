const pool = require('../config/database');

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

function computeSeverity(currentValue, threshold) {
  if (currentValue === null || currentValue === undefined) return 'critical';
  const ratio = currentValue / threshold;
  if (ratio >= 2.0) return 'critical';
  if (ratio >= 1.5) return 'high';
  if (ratio >= 1.2) return 'medium';
  return 'low';
}

// Vehicles that haven't had a specific catalog item service in threshold_days
async function getOverdueServiceAlerts(req, res, next) {
  try {
    const catalogItemId = (req.query.catalog_item_id || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!catalogItemId) {
      return res.status(400).json({ error: '"catalog_item_id" es requerido' });
    }
    if (!UUID_RE.test(catalogItemId)) {
      return res.status(400).json({ error: '"catalog_item_id" no es un UUID válido' });
    }
    const threshold = parseInt(req.query.threshold_days, 10);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return res.status(400).json({ error: '"threshold_days" debe ser un entero positivo' });
    }

    const r = await pool.query(`
      SELECT
        c.id           AS client_id,
        c.full_name    AS client_name,
        c.phone        AS client_phone,
        c.email        AS client_email,
        v.id           AS vehicle_id,
        v.plate_number,
        v.make, v.model,
        MAX(j.job_date) AS last_service_date,
        CASE
          WHEN MAX(j.job_date) IS NULL THEN NULL
          ELSE CURRENT_DATE - MAX(j.job_date)::date
        END AS days_since_service
      FROM vehicles v
      JOIN clients c ON c.id = v.client_id
      LEFT JOIN jobs j
        ON j.vehicle_id = v.id
        AND j.deleted_at IS NULL
        AND j.status IN ('terminado', 'pagado')
        AND EXISTS (
          SELECT 1 FROM job_items ji
          WHERE ji.job_id = j.id AND ji.catalog_item_id = $1
        )
      WHERE v.deleted_at IS NULL AND c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.phone, c.email,
               v.id, v.plate_number, v.make, v.model
      HAVING MAX(j.job_date) IS NULL
          OR CURRENT_DATE - MAX(j.job_date)::date > $2
      ORDER BY MAX(j.job_date) ASC NULLS FIRST
    `, [catalogItemId, threshold]);

    res.json(r.rows.map(row => {
      const days = row.days_since_service !== null ? parseInt(row.days_since_service) : null;
      return {
        alert_type:    'overdue_service',
        severity:      computeSeverity(days, threshold),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone  || null,
        client_email:  row.client_email  || null,
        entity_id:     row.vehicle_id,
        entity_label:  row.plate_number,
        current_value: days,
        threshold,
        unit:          'days',
        context:       row.last_service_date
          ? `Último registro: ${new Date(row.last_service_date).toLocaleDateString('es-UY')}`
          : 'Sin registro previo',
        action_route: `/vehiculos/${row.vehicle_id}`,
      };
    }));
  } catch (err) { next(err); }
}

// Jobs with outstanding balance unpaid for more than threshold_days
async function getPaymentOverdueAlerts(req, res, next) {
  try {
    const threshold = parseInt(req.query.threshold_days, 10);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return res.status(400).json({ error: '"threshold_days" debe ser un entero positivo' });
    }

    const r = await pool.query(`
      SELECT j.id, j.job_number, j.job_date,
             c.id AS client_id, c.full_name AS client_name,
             c.phone AS client_phone, c.email AS client_email,
             v.plate_number,
             COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) AS balance,
             CURRENT_DATE - j.job_date::date AS days_pending
      FROM jobs j
      JOIN clients  c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN job_items ji ON ji.job_id = j.id
      LEFT JOIN (
        SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id
      ) p ON p.job_id = j.id
      WHERE j.status = 'terminado'
        AND j.deleted_at IS NULL
        AND c.deleted_at IS NULL
      GROUP BY j.id, j.job_number, j.job_date,
               c.id, c.full_name, c.phone, c.email,
               v.plate_number, p.paid
      HAVING COALESCE(SUM(ji.quantity * ji.unit_price), 0) - COALESCE(p.paid, 0) > 0
         AND CURRENT_DATE - j.job_date::date > $1
      ORDER BY days_pending DESC
      LIMIT 100
    `, [threshold]);

    res.json(r.rows.map(row => {
      const days = parseInt(row.days_pending);
      const balance = parseFloat(row.balance);
      return {
        alert_type:    'payment_overdue',
        severity:      computeSeverity(days, threshold),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_id:     row.id,
        entity_label:  row.job_number,
        current_value: days,
        threshold,
        unit:          'days',
        context:       `Deuda: $${balance.toFixed(2)} · ${row.plate_number}`,
        action_route:  `/trabajos/${row.id}`,
      };
    }));
  } catch (err) { next(err); }
}

// Clients with no completed job in the last threshold_days
async function getLostCustomerAlerts(req, res, next) {
  try {
    const threshold = parseInt(req.query.threshold_days, 10);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return res.status(400).json({ error: '"threshold_days" debe ser un entero positivo' });
    }

    const r = await pool.query(`
      SELECT
        c.id AS client_id, c.full_name AS client_name,
        c.phone AS client_phone, c.email AS client_email,
        MAX(j.job_date) AS last_job_date,
        CASE
          WHEN MAX(j.job_date) IS NULL THEN NULL
          ELSE CURRENT_DATE - MAX(j.job_date)::date
        END AS days_since_last_job
      FROM clients c
      LEFT JOIN jobs j
        ON j.client_id = c.id
        AND j.deleted_at IS NULL
        AND j.status IN ('terminado', 'pagado')
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.phone, c.email
      HAVING MAX(j.job_date) IS NULL
          OR CURRENT_DATE - MAX(j.job_date)::date > $1
      ORDER BY MAX(j.job_date) ASC NULLS FIRST
    `, [threshold]);

    res.json(r.rows.map(row => {
      const days = row.days_since_last_job !== null ? parseInt(row.days_since_last_job) : null;
      return {
        alert_type:    'lost_customer',
        severity:      computeSeverity(days, threshold),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_id:     row.client_id,
        entity_label:  row.client_name,
        current_value: days,
        threshold,
        unit:          'days',
        context:       row.last_job_date
          ? `Última visita: ${new Date(row.last_job_date).toLocaleDateString('es-UY')}`
          : 'Sin historial',
        action_route:  `/clientes/${row.client_id}`,
      };
    }));
  } catch (err) { next(err); }
}

// Clients who broke their own visit pattern (3+ jobs, absent > 1.5× personal avg interval)
async function getBrokenPatternAlerts(req, res, next) {
  try {
    const r = await pool.query(`
      WITH recent_jobs AS (
        SELECT
          j.client_id,
          j.job_date::date                                              AS job_date,
          ROW_NUMBER() OVER (PARTITION BY j.client_id ORDER BY j.job_date) AS rn
        FROM jobs j
        WHERE j.deleted_at IS NULL
          AND j.status IN ('terminado', 'pagado')
          AND j.job_date >= CURRENT_DATE - INTERVAL '18 months'
      ),
      client_intervals AS (
        SELECT a.client_id, (b.job_date - a.job_date)::int AS gap_days
        FROM recent_jobs a
        JOIN recent_jobs b ON b.client_id = a.client_id AND b.rn = a.rn + 1
      ),
      client_stats AS (
        SELECT
          client_id,
          COUNT(*) + 1               AS job_count,
          ROUND(AVG(gap_days))::int  AS avg_interval_days
        FROM client_intervals
        GROUP BY client_id
        HAVING COUNT(*) >= 2          -- requires 3+ jobs
           AND AVG(gap_days) > 0
      ),
      last_visit AS (
        SELECT DISTINCT ON (client_id)
          client_id,
          job_date                              AS last_job_date,
          (CURRENT_DATE - job_date)::int        AS days_since_last
        FROM recent_jobs
        ORDER BY client_id, job_date DESC
      )
      SELECT
        c.id            AS client_id,
        c.full_name     AS client_name,
        c.phone         AS client_phone,
        c.email         AS client_email,
        lv.last_job_date,
        lv.days_since_last,
        cs.avg_interval_days,
        cs.job_count
      FROM client_stats cs
      JOIN last_visit lv ON lv.client_id = cs.client_id
      JOIN clients c     ON c.id = cs.client_id
      WHERE c.deleted_at IS NULL
        AND lv.days_since_last > cs.avg_interval_days * 1.5
      ORDER BY (lv.days_since_last::float / cs.avg_interval_days) DESC
      LIMIT 100
    `);

    res.json(r.rows.map(row => {
      const days      = parseInt(row.days_since_last);
      const avgInt    = parseInt(row.avg_interval_days);
      const threshold = Math.round(avgInt * 1.5);
      return {
        alert_type:    'broken_pattern',
        severity:      computeSeverity(days, threshold),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone  || null,
        client_email:  row.client_email  || null,
        entity_id:     row.client_id,
        entity_label:  row.client_name,
        current_value: days,
        threshold,
        unit:          'days',
        context:       `Promedio personal: ${avgInt}d · ${row.job_count} visitas (18m)`,
        action_route:  `/clientes/${row.client_id}`,
      };
    }));
  } catch (err) { next(err); }
}

module.exports = { getOverdueServiceAlerts, getPaymentOverdueAlerts, getLostCustomerAlerts, getBrokenPatternAlerts };
