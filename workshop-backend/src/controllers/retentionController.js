const pool = require('../config/database');

async function getOverdueService(req, res, next) {
  try {
    const catalogItemId = (req.query.catalog_item_id || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!catalogItemId) {
      return res.status(400).json({ error: 'El parámetro "catalog_item_id" es requerido' });
    }
    if (!UUID_RE.test(catalogItemId)) {
      return res.status(400).json({ error: 'El parámetro "catalog_item_id" no es un UUID válido' });
    }

    const threshold = parseInt(req.query.threshold_days, 10);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return res.status(400).json({ error: 'El parámetro "threshold_days" debe ser un entero positivo' });
    }

    const r = await pool.query(`
      SELECT
        c.id           AS client_id,
        c.full_name    AS client_name,
        c.phone        AS client_phone,
        c.email        AS client_email,
        v.id           AS vehicle_id,
        v.plate_number,
        v.make,
        v.model,
        v.year,
        MAX(j.job_date)                                    AS last_service_date,
        CASE
          WHEN MAX(j.job_date) IS NULL THEN NULL
          ELSE CURRENT_DATE - MAX(j.job_date)::date
        END                                                 AS days_since_service
      FROM vehicles v
      JOIN clients c ON c.id = v.client_id
      LEFT JOIN jobs j
        ON j.vehicle_id = v.id
        AND j.deleted_at IS NULL
        AND j.status IN ('terminado', 'pagado')
        AND EXISTS (
          SELECT 1 FROM job_items ji
          WHERE ji.job_id = j.id
            AND ji.catalog_item_id = $1
        )
      WHERE v.deleted_at IS NULL
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.phone, c.email,
               v.id, v.plate_number, v.make, v.model, v.year
      HAVING MAX(j.job_date) IS NULL
          OR CURRENT_DATE - MAX(j.job_date)::date > $2
      ORDER BY MAX(j.job_date) ASC NULLS FIRST
    `, [catalogItemId, threshold]);

    res.json(r.rows.map(row => ({
      client_id:          row.client_id,
      client_name:        row.client_name,
      client_phone:       row.client_phone,
      client_email:       row.client_email,
      vehicle_id:         row.vehicle_id,
      plate_number:       row.plate_number,
      make:               row.make,
      model:              row.model,
      year:               row.year ? parseInt(row.year) : null,
      last_service_date:  row.last_service_date || null,
      days_since_service: row.days_since_service !== null ? parseInt(row.days_since_service) : null,
    })));
  } catch (err) { next(err); }
}

module.exports = { getOverdueService };
