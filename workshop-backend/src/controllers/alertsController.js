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

// ─── Internal evaluators (no req/res) ──────────────────────────────────────

async function evalOverdueService({ catalog_item_id, threshold_days }) {
  // Guardia: una def overdue_service sin ítem del catálogo (escenario HU-01,
  // huérfana tras borrar el item) no debe evaluar — la query con $1=NULL
  // matchea "ningún job" para todos los vehículos y devolvería una alerta
  // crítica por cada vehículo del taller. El controller de definitions
  // también rechaza dejarla enabled=true, pero la defensa en profundidad acá
  // protege contra cualquier futuro camino que se saltee la validación.
  if (!catalog_item_id) return [];

  const r = await pool.query(`
    SELECT
      c.id AS client_id, c.full_name AS client_name,
      c.phone AS client_phone, c.email AS client_email,
      v.id AS vehicle_id, v.plate_number, v.make, v.model,
      MAX(j.job_date) AS last_service_date,
      CASE WHEN MAX(j.job_date) IS NULL THEN NULL
           ELSE CURRENT_DATE - MAX(j.job_date)::date END AS days_since_service
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
  `, [catalog_item_id, threshold_days]);

  return r.rows.map(row => {
    const days = row.days_since_service !== null ? parseInt(row.days_since_service) : null;
    return {
      alert_type:    'overdue_service',
      severity:      computeSeverity(days, threshold_days),
      client_id:     row.client_id,
      client_name:   row.client_name,
      client_phone:  row.client_phone  || null,
      client_email:  row.client_email  || null,
      entity_id:     row.vehicle_id,
      entity_label:  row.plate_number,
      current_value: days,
      threshold:     threshold_days,
      unit:          'days',
      context:       row.last_service_date
        ? `Último registro: ${new Date(row.last_service_date).toLocaleDateString('es-UY')}`
        : 'Sin registro previo',
      action_route:  `/vehiculos/${row.vehicle_id}`,
    };
  });
}

async function evalPaymentOverdue({ threshold_days }) {
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
  `, [threshold_days]);

  return r.rows.map(row => {
    const days    = parseInt(row.days_pending);
    const balance = parseFloat(row.balance);
    return {
      alert_type:    'payment_overdue',
      severity:      computeSeverity(days, threshold_days),
      client_id:     row.client_id,
      client_name:   row.client_name,
      client_phone:  row.client_phone || null,
      client_email:  row.client_email || null,
      entity_id:     row.id,
      entity_label:  row.job_number,
      current_value: days,
      threshold:     threshold_days,
      unit:          'days',
      context:       `Deuda: $${balance.toFixed(2)} · ${row.plate_number}`,
      action_route:  `/trabajos/${row.id}`,
    };
  });
}

async function evalLostCustomer({ threshold_days }) {
  const r = await pool.query(`
    SELECT
      c.id AS client_id, c.full_name AS client_name,
      c.phone AS client_phone, c.email AS client_email,
      MAX(j.job_date) AS last_job_date,
      CASE WHEN MAX(j.job_date) IS NULL THEN NULL
           ELSE CURRENT_DATE - MAX(j.job_date)::date END AS days_since_last_job
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
  `, [threshold_days]);

  return r.rows.map(row => {
    const days = row.days_since_last_job !== null ? parseInt(row.days_since_last_job) : null;
    return {
      alert_type:    'lost_customer',
      severity:      computeSeverity(days, threshold_days),
      client_id:     row.client_id,
      client_name:   row.client_name,
      client_phone:  row.client_phone || null,
      client_email:  row.client_email || null,
      entity_id:     row.client_id,
      entity_label:  row.client_name,
      current_value: days,
      threshold:     threshold_days,
      unit:          'days',
      context:       row.last_job_date
        ? `Última visita: ${new Date(row.last_job_date).toLocaleDateString('es-UY')}`
        : 'Sin historial',
      action_route:  `/clientes/${row.client_id}`,
    };
  });
}

async function evalBrokenPattern({ bp_multiplier, bp_min_days }) {
  const r = await pool.query(`
    WITH recent_jobs AS (
      SELECT j.client_id, j.job_date::date AS job_date,
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
      SELECT client_id,
             COUNT(*) + 1              AS job_count,
             ROUND(AVG(gap_days))::int AS avg_interval_days
      FROM client_intervals
      GROUP BY client_id
      HAVING COUNT(*) >= 2 AND AVG(gap_days) > 0
    ),
    last_visit AS (
      SELECT DISTINCT ON (client_id)
        client_id,
        job_date                            AS last_job_date,
        (CURRENT_DATE - job_date)::int      AS days_since_last
      FROM recent_jobs
      ORDER BY client_id, job_date DESC
    )
    SELECT
      c.id AS client_id, c.full_name AS client_name,
      c.phone AS client_phone, c.email AS client_email,
      lv.last_job_date, lv.days_since_last,
      cs.avg_interval_days, cs.job_count
    FROM client_stats cs
    JOIN last_visit lv ON lv.client_id = cs.client_id
    JOIN clients c     ON c.id = cs.client_id
    WHERE c.deleted_at IS NULL
      AND lv.days_since_last > GREATEST((cs.avg_interval_days * $1::numeric)::int, COALESCE($2::int, 0))
    ORDER BY (lv.days_since_last::float / cs.avg_interval_days) DESC
    LIMIT 100
  `, [bp_multiplier, bp_min_days]);

  return r.rows.map(row => {
    const days      = parseInt(row.days_since_last);
    const avgInt    = parseInt(row.avg_interval_days);
    const minDays   = parseInt(bp_min_days) || 0;
    const threshold = Math.max(Math.round(avgInt * parseFloat(bp_multiplier)), minDays);
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
  });
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

async function evaluateDefinition(def) {
  let items;
  switch (def.alert_type) {
    case 'overdue_service':
      items = await evalOverdueService({
        catalog_item_id: def.catalog_item_id,
        threshold_days:  def.threshold_days,
      });
      break;
    case 'payment_overdue':
      items = await evalPaymentOverdue({ threshold_days: def.threshold_days });
      break;
    case 'lost_customer':
      items = await evalLostCustomer({ threshold_days: def.threshold_days });
      break;
    case 'broken_pattern':
      items = await evalBrokenPattern({
        bp_multiplier: def.bp_multiplier,
        bp_min_days:   def.bp_min_days,
      });
      break;
    default:
      throw new Error(`alert_type desconocido: ${def.alert_type}`);
  }

  // Filter out items snoozed for this definition
  const dismissed = await pool.query(
    `SELECT entity_id FROM alert_dismissals
     WHERE alert_definition_id = $1 AND snooze_until > NOW()`,
    [def.id]
  );
  if (dismissed.rows.length > 0) {
    const snoozed = new Set(dismissed.rows.map(r => r.entity_id));
    items = items.filter(i => !snoozed.has(i.entity_id));
  }

  return items.map(i => ({ ...i, definition_id: def.id }));
}

// Updates metadata after evaluation; returns the items so callers can use them.
async function evaluateAndPersist(def) {
  try {
    const items = await evaluateDefinition(def);
    const criticalHigh = items.filter(i => i.severity === 'critical' || i.severity === 'high').length;
    await pool.query(
      `UPDATE alert_definitions
         SET last_evaluated_at = NOW(),
             last_result_count = $1,
             last_run_error    = NULL,
             updated_at        = NOW()
       WHERE id = $2`,
      [criticalHigh, def.id]
    );
    return { items, error: null };
  } catch (err) {
    await pool.query(
      `UPDATE alert_definitions
         SET last_run_error = $1,
             updated_at     = NOW()
       WHERE id = $2`,
      [err.message.slice(0, 500), def.id]
    );
    return { items: [], error: err.message };
  }
}

// ─── Public endpoints ──────────────────────────────────────────────────────

// GET /alerts/feed — fresh queries without touching runner metadata
async function feed(req, res, next) {
  try {
    const defs = await pool.query(
      `SELECT d.*, ci.description AS catalog_item_description
       FROM alert_definitions d
       LEFT JOIN item_catalog ci ON ci.id = d.catalog_item_id
       WHERE d.enabled = true ORDER BY d.created_at ASC`
    );
    const blocks = await Promise.all(defs.rows.map(async def => {
      try {
        const items = await evaluateDefinition(def);
        return { definition: def, items, error: null };
      } catch (err) {
        return { definition: def, items: [], error: err.message };
      }
    }));
    res.json(blocks);
  } catch (err) { next(err); }
}

// POST /alerts/dismiss — snooze a (definition, entity)
async function dismiss(req, res, next) {
  try {
    const { definition_id, entity_id, snooze_days } = req.body || {};
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(definition_id || '')) {
      return res.status(400).json({ error: '"definition_id" debe ser un UUID válido' });
    }
    if (!UUID_RE.test(entity_id || '')) {
      return res.status(400).json({ error: '"entity_id" debe ser un UUID válido' });
    }
    const days = parseInt(snooze_days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: '"snooze_days" debe estar entre 1 y 365' });
    }

    await pool.query(
      `INSERT INTO alert_dismissals (alert_definition_id, entity_id, dismissed_by, snooze_until)
       VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
       ON CONFLICT (alert_definition_id, entity_id) DO UPDATE
         SET dismissed_by = EXCLUDED.dismissed_by,
             dismissed_at = NOW(),
             snooze_until = EXCLUDED.snooze_until`,
      [definition_id, entity_id, req.user?.id || null, days.toString()]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /alerts/badge — sum of critical+high counts from runner metadata
async function badge(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT COALESCE(SUM(last_result_count), 0)::int AS count,
              MAX(last_evaluated_at)                  AS last_runner_tick
       FROM alert_definitions
       WHERE enabled = true`
    );
    res.json({
      critical_high_count: r.rows[0].count,
      last_runner_tick:    r.rows[0].last_runner_tick,
    });
  } catch (err) { next(err); }
}

// POST /alerts/evaluate-all — force a runner tick for every enabled def
async function evaluateAll(req, res, next) {
  try {
    const defs = await pool.query(
      `SELECT * FROM alert_definitions WHERE enabled = true`
    );
    await Promise.all(defs.rows.map(d => evaluateAndPersist(d)));
    res.json({ ok: true, evaluated: defs.rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  // internal (used by runner + definitions controller)
  evaluateDefinition,
  evaluateAndPersist,
  // public endpoints
  feed,
  dismiss,
  badge,
  evaluateAll,
};
