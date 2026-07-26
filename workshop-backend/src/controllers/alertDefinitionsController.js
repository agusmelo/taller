const pool = require('../config/database');
const { evaluateAndPersist } = require('./alertsController');
const strategies = require('../services/alertStrategies');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateBody(body, { isUpdate = false } = {}) {
  const errors = [];
  const out = {};

  if (!isUpdate) {
    if (!strategies.has(body.alert_type)) {
      errors.push('"alert_type" inválido');
    } else {
      out.alert_type = body.alert_type;
    }
  }

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) errors.push('"name" es requerido');
    else if (name.length > 120) errors.push('"name" muy largo (máx 120)');
    else out.name = name;
  } else if (!isUpdate) {
    errors.push('"name" es requerido');
  }

  if (body.enabled !== undefined) out.enabled = !!body.enabled;

  const alertType = out.alert_type || body.alert_type;
  const strat = strategies.get(alertType);

  // catalog_item_id aplica a overdue_service y upcoming_service. La estrategia
  // de cada uno valida el positive case; aquí frenamos su uso en otras.
  const TYPES_WITH_CATALOG = new Set(['overdue_service', 'upcoming_service']);
  if (!TYPES_WITH_CATALOG.has(alertType) &&
      body.catalog_item_id !== undefined && body.catalog_item_id !== null) {
    errors.push('"catalog_item_id" no aplica a este tipo de alerta');
  } else if (!TYPES_WITH_CATALOG.has(alertType) && !isUpdate) {
    out.catalog_item_id = null;
  }

  if (strat) {
    strat.validate(body, { isUpdate, errors, out });
  }

  if (body.eval_interval_hours !== undefined) {
    const h = parseInt(body.eval_interval_hours, 10);
    if (!Number.isFinite(h) || h < 1 || h > 168) {
      errors.push('"eval_interval_hours" debe estar entre 1 y 168');
    } else {
      out.eval_interval_hours = h;
    }
  } else if (!isUpdate) {
    out.eval_interval_hours = 4;
  }

  return { errors, data: out };
}

async function list(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT d.*, ci.description AS catalog_item_description
       FROM alert_definitions d
       LEFT JOIN item_catalog ci ON ci.id = d.catalog_item_id
       ORDER BY d.alert_type, d.created_at`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const r = await pool.query(
      `SELECT d.*, ci.description AS catalog_item_description
       FROM alert_definitions d
       LEFT JOIN item_catalog ci ON ci.id = d.catalog_item_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { errors, data } = validateBody(req.body || {});
    if (errors.length > 0) return res.status(422).json({ error: 'Datos inválidos', detalles: errors });

    try {
      const r = await pool.query(
        `INSERT INTO alert_definitions
          (alert_type, name, enabled, catalog_item_id, threshold_days,
           bp_multiplier, bp_min_days, due_after_days, min_lifetime_value,
           eval_interval_hours, created_by)
         VALUES ($1, $2, COALESCE($3, true), $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          data.alert_type,
          data.name,
          data.enabled,
          data.catalog_item_id ?? null,
          data.threshold_days ?? null,
          data.bp_multiplier ?? null,
          data.bp_min_days ?? null,
          data.due_after_days ?? null,
          data.min_lifetime_value ?? null,
          data.eval_interval_hours,
          req.user?.id || null,
        ]
      );
      res.status(201).json(r.rows[0]);
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        return res.status(409).json({
          error: data.alert_type === 'overdue_service'
            ? 'Ya existe una definición para ese ítem del catálogo'
            : 'Ya existe una definición para ese tipo de alerta'
        });
      }
      throw dbErr;
    }
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const existing = await pool.query(
      `SELECT * FROM alert_definitions WHERE id = $1`, [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });

    const body = { ...req.body, alert_type: existing.rows[0].alert_type };
    const { errors, data } = validateBody(body, { isUpdate: true });
    if (errors.length > 0) return res.status(422).json({ error: 'Datos inválidos', detalles: errors });

    // HU-01 guard: una def basada en catalog_item_id (overdue_service /
    // upcoming_service) no puede re-habilitarse si quedó huérfana
    // (catalog_item_id=NULL tras borrar el ítem). Si lo permitiéramos el
    // evaluador correría con NULL y dispararía alertas falsas.
    const TYPES_WITH_CATALOG = new Set(['overdue_service', 'upcoming_service']);
    const willBeEnabled = data.enabled !== undefined ? data.enabled : existing.rows[0].enabled;
    if (TYPES_WITH_CATALOG.has(existing.rows[0].alert_type)
        && willBeEnabled
        && existing.rows[0].catalog_item_id === null) {
      return res.status(422).json({
        error: `No se puede habilitar una definición ${existing.rows[0].alert_type} sin catalog_item_id. Creá una nueva apuntando a un ítem del catálogo.`,
      });
    }

    const fields = [];
    const values = [];
    let idx = 1;
    for (const k of ['name', 'enabled', 'threshold_days', 'bp_multiplier', 'bp_min_days', 'due_after_days', 'min_lifetime_value', 'eval_interval_hours']) {
      if (data[k] !== undefined) {
        fields.push(`${k} = $${idx++}`);
        values.push(data[k]);
      }
    }
    if (fields.length === 0) return res.json(existing.rows[0]);
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    try {
      const r = await pool.query(
        `UPDATE alert_definitions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      res.json(r.rows[0]);
    } catch (dbErr) {
      // Los índices únicos parciales (uq_alert_def_with_item, uq_alert_def_no_item)
      // son WHERE enabled = true. Reactivar una def deshabilitada cuando ya
      // existe otra activa del mismo (alert_type, catalog_item_id) viola la
      // restricción. Espejo del manejo en create() — 409 en lugar de 500.
      if (dbErr.code === '23505') {
        return res.status(409).json({
          error: existing.rows[0].alert_type === 'overdue_service'
            ? 'Ya existe una definición habilitada para ese ítem del catálogo'
            : 'Ya existe una definición habilitada para ese tipo de alerta'
        });
      }
      throw dbErr;
    }
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const r = await pool.query(
      `DELETE FROM alert_definitions WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// POST /alert-definitions/:id/evaluate — force a re-run now
async function evaluate(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const existing = await pool.query(
      `SELECT * FROM alert_definitions WHERE id = $1`, [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });

    const { items, error } = await evaluateAndPersist(existing.rows[0]);
    const updated = await pool.query(
      `SELECT d.*, ci.description AS catalog_item_description
       FROM alert_definitions d
       LEFT JOIN item_catalog ci ON ci.id = d.catalog_item_id
       WHERE d.id = $1`, [req.params.id]
    );
    res.json({ definition: updated.rows[0], items, error });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, remove, evaluate };
