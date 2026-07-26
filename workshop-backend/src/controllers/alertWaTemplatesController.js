'use strict';

const pool = require('../config/database');
const strategies = require('../services/alertStrategies');

// Sprint 2 / HU-11: plantillas editables de WhatsApp por tipo de alerta.
// El frontend interpola las variables {client_name}, {entity_label}, {days},
// {service_name}. Si para un tipo no hay plantilla, usa el texto hardcodeado.

const MAX_TEMPLATE_LEN = 2000;
const WORKSHOP_ID = 'default'; // único taller por ahora; HU-02 lo dejará leer del req.

async function list(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT alert_type, template, updated_at
         FROM alert_wa_templates
        WHERE workshop_id = $1
        ORDER BY alert_type`,
      [WORKSHOP_ID]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function upsert(req, res, next) {
  try {
    const type = String(req.params.type || '');
    if (!strategies.has(type)) {
      return res.status(400).json({ error: '"alert_type" no es un tipo conocido' });
    }
    const template = String(req.body?.template ?? '').trim();
    if (!template) {
      return res.status(400).json({ error: '"template" es requerido' });
    }
    if (template.length > MAX_TEMPLATE_LEN) {
      return res.status(400).json({
        error: `"template" no puede exceder ${MAX_TEMPLATE_LEN} caracteres`
      });
    }

    const r = await pool.query(
      `INSERT INTO alert_wa_templates
         (alert_type, template, workshop_id, created_by, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $4, NOW())
       ON CONFLICT (alert_type) DO UPDATE
         SET template   = EXCLUDED.template,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING alert_type, template, updated_at`,
      [type, template, WORKSHOP_ID, req.user?.id || null]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const type = String(req.params.type || '');
    if (!strategies.has(type)) {
      return res.status(400).json({ error: '"alert_type" no es un tipo conocido' });
    }
    await pool.query(
      `DELETE FROM alert_wa_templates
        WHERE alert_type = $1 AND workshop_id = $2`,
      [type, WORKSHOP_ID]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { list, upsert, remove };
