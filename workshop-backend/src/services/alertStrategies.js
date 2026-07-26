'use strict';

/**
 * Registry de estrategias por tipo de alerta.
 *
 * Cada estrategia encapsula:
 *   - evaluate(def, pool)  → items crudos (sin filtro de dismissals)
 *   - validate(body, ctx)  → empuja errores/campos a ctx.errors / ctx.out
 *   - entityType            → tipo de la entidad referida (para dismissals)
 *
 * Para agregar un tipo nuevo basta con un `register(...)` adicional y un
 * `ALTER TABLE ... CHECK` en migración. No hay switch que mantener.
 */

const pool = require('../config/database');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function computeSeverity(currentValue, threshold) {
  if (currentValue === null || currentValue === undefined) return 'critical';
  const ratio = currentValue / threshold;
  if (ratio >= 2.0) return 'critical';
  if (ratio >= 1.5) return 'high';
  if (ratio >= 1.2) return 'medium';
  return 'low';
}

// ── overdue_service ──────────────────────────────────────────────────────────
const overdueService = {
  entityType: 'vehicle',

  async evaluate(def) {
    // Guardia anti-huérfana: si una def overdue_service quedó sin item
    // del catálogo (escenario HU-01 cuando se borra el item y alguien la
    // reactiva), la query con $1=NULL devolvería "ningún job" para cada
    // vehículo y dispararía HAVING para todos, generando una alerta
    // crítica por vehículo del taller. Defense in depth — el controller
    // también rechaza dejarla enabled=true sin catalog_item_id.
    if (!def.catalog_item_id) return [];

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
    `, [def.catalog_item_id, def.threshold_days]);

    return r.rows.map(row => {
      const days = row.days_since_service !== null ? parseInt(row.days_since_service) : null;
      return {
        alert_type:    'overdue_service',
        severity:      computeSeverity(days, def.threshold_days),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'vehicle',
        entity_id:     row.vehicle_id,
        entity_label:  row.plate_number,
        current_value: days,
        threshold:     def.threshold_days,
        unit:          'days',
        context:       row.last_service_date
          ? `Último registro: ${new Date(row.last_service_date + 'T12:00:00').toLocaleDateString('es-UY')}`
          : 'Sin registro previo',
        action_route:  `/vehiculos/${row.vehicle_id}`,
      };
    });
  },

  validate(body, { isUpdate, errors, out }) {
    if (body.catalog_item_id !== undefined) {
      if (!UUID_RE.test(body.catalog_item_id || '')) {
        errors.push('"catalog_item_id" debe ser un UUID válido');
      } else {
        out.catalog_item_id = body.catalog_item_id;
      }
    } else if (!isUpdate) {
      errors.push('"catalog_item_id" es requerido para overdue_service');
    }
    validateThresholdDays(body, { isUpdate, errors, out });
  },
};

// ── payment_overdue ──────────────────────────────────────────────────────────
const paymentOverdue = {
  entityType: 'job',

  async evaluate(def) {
    // Replica calcFinancials() en SQL: para cada item con hijos, el aporte al
    // subtotal es la SUMA DE unit_price DE LOS HIJOS (no quantity*unit_price
    // del padre). Para items sin hijos, es quantity*unit_price. Luego aplica
    // descuento y opcionalmente IVA. La query anterior ignoraba tax/discount
    // y la lógica de padres-con-hijos: con IVA habilitado un pago entre
    // subtotal y total no disparaba la alerta.
    const r = await pool.query(`
      WITH job_subtotals AS (
        SELECT j.id AS job_id,
               COALESCE(SUM(
                 CASE
                   WHEN EXISTS (SELECT 1 FROM job_items ch WHERE ch.parent_id = it.id)
                     THEN (SELECT SUM(ch.unit_price) FROM job_items ch WHERE ch.parent_id = it.id)
                   ELSE it.quantity * it.unit_price
                 END
               ), 0) AS subtotal
        FROM jobs j
        LEFT JOIN job_items it ON it.job_id = j.id AND it.parent_id IS NULL
        WHERE j.deleted_at IS NULL
          AND j.status = 'terminado'
        GROUP BY j.id
      ),
      job_payments AS (
        SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id
      ),
      candidates AS (
        SELECT j.id, j.job_number, j.job_date,
               c.id AS client_id, c.full_name AS client_name,
               c.phone AS client_phone, c.email AS client_email,
               v.plate_number,
               -- (subtotal - discount) * (1 + tax_rate si tax_enabled)
               ((js.subtotal
                  - CASE WHEN j.discount_type = 'percentage'
                         THEN js.subtotal * (j.discount_amount / 100.0)
                         ELSE j.discount_amount
                    END)
                * (1 + CASE WHEN j.tax_enabled THEN j.tax_rate ELSE 0 END)
               ) - COALESCE(jp.paid, 0) AS balance,
               CURRENT_DATE - j.job_date::date AS days_pending
        FROM jobs j
        JOIN clients  c ON c.id = j.client_id
        JOIN vehicles v ON v.id = j.vehicle_id
        JOIN job_subtotals js ON js.job_id = j.id
        LEFT JOIN job_payments jp ON jp.job_id = j.id
        WHERE j.status = 'terminado'
          AND j.deleted_at IS NULL
          AND c.deleted_at IS NULL
      )
      SELECT * FROM candidates
      WHERE balance > 0.005     -- tolerancia para redondeo (mismo umbral que calcFinancials usa con cents)
        AND days_pending > $1
      ORDER BY days_pending DESC
    `, [def.threshold_days]);

    return r.rows.map(row => {
      const days    = parseInt(row.days_pending);
      const balance = parseFloat(row.balance);
      return {
        alert_type:    'payment_overdue',
        severity:      computeSeverity(days, def.threshold_days),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'job',
        entity_id:     row.id,
        entity_label:  row.job_number,
        current_value: days,
        threshold:     def.threshold_days,
        unit:          'days',
        context:       `Deuda: $${balance.toFixed(2)} · ${row.plate_number}`,
        action_route:  `/trabajos/${row.id}`,
      };
    });
  },

  validate(body, ctx) { validateThresholdDays(body, ctx); },
};

// ── lost_customer ────────────────────────────────────────────────────────────
const lostCustomer = {
  entityType: 'client',

  async evaluate(def) {
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
    `, [def.threshold_days]);

    return r.rows.map(row => {
      const days = row.days_since_last_job !== null ? parseInt(row.days_since_last_job) : null;
      return {
        alert_type:    'lost_customer',
        severity:      computeSeverity(days, def.threshold_days),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'client',
        entity_id:     row.client_id,
        entity_label:  row.client_name,
        current_value: days,
        threshold:     def.threshold_days,
        unit:          'days',
        context:       row.last_job_date
          ? `Última visita: ${new Date(row.last_job_date + 'T12:00:00').toLocaleDateString('es-UY')}`
          : 'Sin historial',
        action_route:  `/clientes/${row.client_id}`,
      };
    });
  },

  validate(body, ctx) { validateThresholdDays(body, ctx); },
};

// ── broken_pattern ───────────────────────────────────────────────────────────
const brokenPattern = {
  entityType: 'client',

  async evaluate(def) {
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
        HAVING COUNT(*) >= 1 AND AVG(gap_days) > 0
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
    `, [def.bp_multiplier, def.bp_min_days]);

    return r.rows.map(row => {
      const days      = parseInt(row.days_since_last);
      const avgInt    = parseInt(row.avg_interval_days);
      const minDays   = parseInt(def.bp_min_days) || 0;
      const threshold = Math.max(Math.round(avgInt * parseFloat(def.bp_multiplier)), minDays);
      return {
        alert_type:    'broken_pattern',
        severity:      computeSeverity(days, threshold),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'client',
        entity_id:     row.client_id,
        entity_label:  row.client_name,
        current_value: days,
        threshold,
        unit:          'days',
        context:       `Promedio personal: ${avgInt}d · ${row.job_count} visitas (18m)`,
        action_route:  `/clientes/${row.client_id}`,
      };
    });
  },

  validate(body, { isUpdate, errors, out }) {
    if (body.bp_multiplier !== undefined) {
      const m = parseFloat(body.bp_multiplier);
      if (!Number.isFinite(m) || m < 1.0 || m > 5.0) {
        errors.push('"bp_multiplier" debe estar entre 1.0 y 5.0');
      } else {
        out.bp_multiplier = m;
      }
    } else if (!isUpdate) {
      out.bp_multiplier = 1.5;
    }

    if (body.bp_min_days !== undefined) {
      const m = parseInt(body.bp_min_days, 10);
      if (!Number.isFinite(m) || m < 0 || m > 3650) {
        errors.push('"bp_min_days" debe estar entre 0 y 3650');
      } else {
        out.bp_min_days = m;
      }
    } else if (!isUpdate) {
      out.bp_min_days = 0;
    }
  },
};

// ── quote_pending (Sprint 3 / HU-14) ────────────────────────────────────────
// Presupuestos (jobs.status = 'presupuesto') que llevan más de threshold_days
// sin convertirse en trabajo. Entidad: el job en sí.
const quotePending = {
  entityType: 'job',

  async evaluate(def) {
    const r = await pool.query(`
      SELECT
        j.id AS job_id, j.job_number, j.job_date,
        c.id AS client_id, c.full_name AS client_name,
        c.phone AS client_phone, c.email AS client_email,
        v.plate_number,
        (CURRENT_DATE - j.job_date::date) AS days_pending
      FROM jobs j
      JOIN clients  c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.status = 'presupuesto'
        AND j.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND v.deleted_at IS NULL
        AND j.job_date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
      ORDER BY j.job_date ASC
      LIMIT 100
    `, [def.threshold_days]);

    return r.rows.map(row => {
      const days = parseInt(row.days_pending);
      return {
        alert_type:    'quote_pending',
        severity:      computeSeverity(days, def.threshold_days),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'job',
        entity_id:     row.job_id,
        entity_label:  `${row.plate_number} — ${new Date(row.job_date).toLocaleDateString('es-UY')}`,
        current_value: days,
        threshold:     def.threshold_days,
        unit:          'days',
        context:       `Presupuesto #${row.job_number} sin cerrar`,
        action_route:  `/trabajos/${row.job_id}`,
      };
    });
  },

  validate(body, ctx) { validateThresholdDays(body, ctx); },
};

// ── upcoming_service (Sprint 3 / HU-15) ─────────────────────────────────────
// Vehículos con un servicio próximo a vencer (ventana threshold_days antes
// del día estimado de vencimiento due_after_days desde el último servicio).
// Entidad: vehicle.
const upcomingService = {
  entityType: 'vehicle',

  async evaluate(def) {
    if (!def.catalog_item_id) return [];
    const dueAfter = def.due_after_days;
    const window = def.threshold_days;
    if (!dueAfter || !window) return [];

    const r = await pool.query(`
      SELECT
        c.id AS client_id, c.full_name AS client_name,
        c.phone AS client_phone, c.email AS client_email,
        v.id AS vehicle_id, v.plate_number,
        MAX(j.job_date) AS last_service_date,
        (CURRENT_DATE - MAX(j.job_date)::date) AS days_since_service
      FROM vehicles v
      JOIN clients c ON c.id = v.client_id
      JOIN jobs j
        ON j.vehicle_id = v.id
        AND j.deleted_at IS NULL
        AND j.status IN ('terminado', 'pagado')
        AND EXISTS (
          SELECT 1 FROM job_items ji
          WHERE ji.job_id = j.id AND ji.catalog_item_id = $1
        )
      WHERE v.deleted_at IS NULL AND c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.phone, c.email,
               v.id, v.plate_number
      HAVING (CURRENT_DATE - MAX(j.job_date)::date)
             BETWEEN ($2::int - $3::int) AND $2::int
      ORDER BY MAX(j.job_date) ASC
      LIMIT 100
    `, [def.catalog_item_id, dueAfter, window]);

    return r.rows.map(row => {
      const days = parseInt(row.days_since_service);
      const daysUntilDue = dueAfter - days;
      return {
        alert_type:    'upcoming_service',
        severity:      daysUntilDue <= 3 ? 'high' : daysUntilDue <= 7 ? 'medium' : 'low',
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'vehicle',
        entity_id:     row.vehicle_id,
        entity_label:  row.plate_number,
        current_value: days,
        threshold:     dueAfter,
        unit:          'days',
        context:       `Vence en ~${daysUntilDue}d (último: ${new Date(row.last_service_date).toLocaleDateString('es-UY')})`,
        action_route:  `/vehiculos/${row.vehicle_id}`,
      };
    });
  },

  validate(body, { isUpdate, errors, out }) {
    if (body.catalog_item_id !== undefined) {
      if (!UUID_RE.test(body.catalog_item_id || '')) {
        errors.push('"catalog_item_id" debe ser un UUID válido');
      } else {
        out.catalog_item_id = body.catalog_item_id;
      }
    } else if (!isUpdate) {
      errors.push('"catalog_item_id" es requerido para upcoming_service');
    }
    validateThresholdDays(body, { isUpdate, errors, out });

    if (body.due_after_days !== undefined) {
      const v = parseInt(body.due_after_days, 10);
      if (!Number.isFinite(v) || v < 1 || v > 3650) {
        errors.push('"due_after_days" debe estar entre 1 y 3650');
      } else {
        out.due_after_days = v;
      }
    } else if (!isUpdate) {
      errors.push('"due_after_days" es requerido para upcoming_service');
    }
  },
};

// ── high_value_lost (Sprint 3 / HU-16) ──────────────────────────────────────
// Clientes con gasto histórico > min_lifetime_value que llevan más de
// threshold_days sin visita. Entidad: client.
const highValueLost = {
  entityType: 'client',

  async evaluate(def) {
    const minValue = def.min_lifetime_value ?? 0;
    const r = await pool.query(`
      WITH client_revenue AS (
        SELECT j.client_id,
               SUM(
                 CASE
                   WHEN EXISTS (SELECT 1 FROM job_items ch WHERE ch.parent_id = it.id)
                     THEN (SELECT SUM(ch.unit_price) FROM job_items ch WHERE ch.parent_id = it.id)
                   ELSE it.quantity * it.unit_price
                 END
               ) AS total_revenue,
               MAX(j.job_date) AS last_job_date
        FROM jobs j
        JOIN job_items it ON it.job_id = j.id AND it.parent_id IS NULL
        WHERE j.deleted_at IS NULL
          AND j.status IN ('terminado', 'pagado')
        GROUP BY j.client_id
      )
      SELECT
        c.id AS client_id, c.full_name AS client_name,
        c.phone AS client_phone, c.email AS client_email,
        cr.last_job_date,
        cr.total_revenue,
        (CURRENT_DATE - cr.last_job_date::date) AS days_since_last_job
      FROM clients c
      JOIN client_revenue cr ON cr.client_id = c.id
      WHERE c.deleted_at IS NULL
        AND cr.total_revenue >= $1::numeric
        AND (CURRENT_DATE - cr.last_job_date::date) > $2::int
      ORDER BY cr.total_revenue DESC, cr.last_job_date ASC
      LIMIT 100
    `, [minValue, def.threshold_days]);

    return r.rows.map(row => {
      const days = parseInt(row.days_since_last_job);
      const revenue = parseFloat(row.total_revenue);
      return {
        alert_type:    'high_value_lost',
        severity:      computeSeverity(days, def.threshold_days),
        client_id:     row.client_id,
        client_name:   row.client_name,
        client_phone:  row.client_phone || null,
        client_email:  row.client_email || null,
        entity_type:   'client',
        entity_id:     row.client_id,
        entity_label:  row.client_name,
        current_value: days,
        threshold:     def.threshold_days,
        unit:          'days',
        context:       `Gasto histórico: $${revenue.toFixed(2)} · última visita ${new Date(row.last_job_date).toLocaleDateString('es-UY')}`,
        action_route:  `/clientes/${row.client_id}`,
      };
    });
  },

  validate(body, { isUpdate, errors, out }) {
    validateThresholdDays(body, { isUpdate, errors, out });

    if (body.min_lifetime_value !== undefined) {
      const v = parseFloat(body.min_lifetime_value);
      if (!Number.isFinite(v) || v < 0) {
        errors.push('"min_lifetime_value" debe ser ≥ 0');
      } else {
        out.min_lifetime_value = v;
      }
    } else if (!isUpdate) {
      out.min_lifetime_value = 0;
    }
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────
function validateThresholdDays(body, { isUpdate, errors, out }) {
  if (body.threshold_days !== undefined) {
    const t = parseInt(body.threshold_days, 10);
    if (!Number.isFinite(t) || t < 1 || t > 3650) {
      errors.push('"threshold_days" debe estar entre 1 y 3650');
    } else {
      out.threshold_days = t;
    }
  } else if (!isUpdate) {
    errors.push('"threshold_days" es requerido');
  }
}

// ── registry ─────────────────────────────────────────────────────────────────
const STRATEGIES = new Map();

function register(type, impl) {
  if (!impl || typeof impl.evaluate !== 'function' || typeof impl.validate !== 'function') {
    throw new Error(`Strategy "${type}" debe exponer evaluate() y validate()`);
  }
  STRATEGIES.set(type, impl);
}

register('overdue_service',  overdueService);
register('payment_overdue',  paymentOverdue);
register('lost_customer',    lostCustomer);
register('broken_pattern',   brokenPattern);
register('quote_pending',    quotePending);
register('upcoming_service', upcomingService);
register('high_value_lost',  highValueLost);

function get(type) { return STRATEGIES.get(type); }
function has(type) { return STRATEGIES.has(type); }
function listTypes() { return Array.from(STRATEGIES.keys()); }

module.exports = { register, get, has, listTypes, computeSeverity };
