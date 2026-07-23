'use strict';

const pLimit = require('p-limit');
const pool = require('../config/database');
const strategies = require('../services/alertStrategies');

const EVAL_CONCURRENCY = parseInt(process.env.ALERTS_EVAL_CONCURRENCY, 10) || 5;
const ENTITY_TYPES = ['vehicle', 'client', 'job'];

// ─── Internal evaluators ────────────────────────────────────────────────────

// Devuelve los items crudos (sin filtrar dismissals). Esto es lo que se
// cachea en alert_definitions.last_results para que el feed lea sin tocar
// las tablas de negocio.
async function evaluateRawItems(def) {
  const strat = strategies.get(def.alert_type);
  if (!strat) throw new Error(`alert_type desconocido: ${def.alert_type}`);
  return strat.evaluate(def);
}

// Aplica el filtro de dismissals activas a un set de items para una def.
// Discrimina por entity_type (HU-08): un dismissal de vehicle no oculta
// alertas de client aunque sus UUIDs colisionaran.
async function filterDismissed(definitionId, items) {
  if (items.length === 0) return items;
  const dismissed = await pool.query(
    `SELECT entity_id, entity_type
       FROM alert_dismissals
      WHERE alert_definition_id = $1 AND snooze_until > NOW()`,
    [definitionId]
  );
  if (dismissed.rows.length === 0) return items;
  const snoozed = new Set(
    dismissed.rows.map(r => `${r.entity_type}:${r.entity_id}`)
  );
  return items.filter(i => !snoozed.has(`${i.entity_type || 'vehicle'}:${i.entity_id}`));
}

// Eval en tiempo real + filtro. Sigue usándose para el endpoint per-def
// /alert-definitions/:id/evaluate (refresh manual) y para POST /alerts/evaluate-all.
async function evaluateDefinition(def) {
  const raw = await evaluateRawItems(def);
  const items = await filterDismissed(def.id, raw);
  return items.map(i => ({ ...i, definition_id: def.id }));
}

// Persiste resultados crudos en last_results para que el feed lea sin
// re-evaluar. Devuelve los items filtrados por dismissals para uso del
// caller (UI puede mostrar el resultado del refresh inmediatamente).
async function evaluateAndPersist(def) {
  try {
    const raw = await evaluateRawItems(def);
    const filtered = await filterDismissed(def.id, raw);
    // Badge counts all outstanding alerts regardless of snooze state so the
    // bell never silently drops to 0 while real problems are only temporarily
    // dismissed. The feed still applies dismissal filtering at read time.
    const criticalHigh = raw.filter(
      i => i.severity === 'critical' || i.severity === 'high'
    ).length;
    await pool.query(
      `UPDATE alert_definitions
         SET last_evaluated_at = NOW(),
             last_result_count = $1,
             last_run_error    = NULL,
             last_results      = $2::jsonb,
             updated_at        = NOW()
       WHERE id = $3`,
      [criticalHigh, JSON.stringify(raw), def.id]
    );
    return { items: filtered.map(i => ({ ...i, definition_id: def.id })), error: null };
  } catch (err) {
    await pool.query(
      `UPDATE alert_definitions
         SET last_evaluated_at = NOW(),
             last_run_error    = $1,
             updated_at        = NOW()
       WHERE id = $2`,
      [err.message.slice(0, 500), def.id]
    );
    return { items: [], error: err.message };
  }
}

// ─── Public endpoints ──────────────────────────────────────────────────────

// GET /alerts/feed — lee de last_results (caché del runner) + aplica
// dismissals actuales. O(1) por definición en términos de queries de negocio.
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
        const raw = Array.isArray(def.last_results) ? def.last_results : [];
        const items = await filterDismissed(def.id, raw);
        return {
          definition: def,
          items: items.map(i => ({ ...i, definition_id: def.id })),
          error: def.last_run_error || null,
        };
      } catch (err) {
        return { definition: def, items: [], error: err.message };
      }
    }));

    res.json(blocks);
  } catch (err) { next(err); }
}

// POST /alerts/dismiss — snooze a (definition, entity, entity_type)
async function dismiss(req, res, next) {
  try {
    const { definition_id, entity_id, entity_type, snooze_days } = req.body || {};
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!UUID_RE.test(definition_id || '')) {
      return res.status(400).json({ error: '"definition_id" debe ser un UUID válido' });
    }
    if (!UUID_RE.test(entity_id || '')) {
      return res.status(400).json({ error: '"entity_id" debe ser un UUID válido' });
    }

    // entity_type es opcional para compat con clientes viejos; default 'vehicle'.
    const etype = entity_type || 'vehicle';
    if (!ENTITY_TYPES.includes(etype)) {
      return res.status(400).json({ error: '"entity_type" inválido' });
    }

    const days = parseInt(snooze_days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: '"snooze_days" debe estar entre 1 y 365' });
    }

    await pool.query(
      `INSERT INTO alert_dismissals
         (alert_definition_id, entity_id, entity_type, dismissed_by, snooze_until)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)
       ON CONFLICT (alert_definition_id, entity_id, entity_type) DO UPDATE
         SET dismissed_by = EXCLUDED.dismissed_by,
             dismissed_at = NOW(),
             snooze_until = EXCLUDED.snooze_until`,
      [definition_id, entity_id, etype, req.user?.id || null, days.toString()]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /alerts/badge — agregado del runner
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

// POST /alerts/evaluate-all — fuerza refresh de todas las defs habilitadas.
// Concurrencia acotada (HU-06) para no saturar el pool de conexiones.
async function evaluateAll(req, res, next) {
  try {
    const defs = await pool.query(
      `SELECT * FROM alert_definitions WHERE enabled = true`
    );
    const limit = pLimit(EVAL_CONCURRENCY);
    await Promise.all(defs.rows.map(d => limit(() => evaluateAndPersist(d))));
    res.json({ ok: true, evaluated: defs.rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  // internal
  evaluateDefinition,
  evaluateAndPersist,
  evaluateRawItems,
  filterDismissed,
  // public endpoints
  feed,
  dismiss,
  badge,
  evaluateAll,
};
