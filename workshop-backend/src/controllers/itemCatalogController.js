const pool = require('../config/database');

const ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro'];

function normalizeType(t) {
  return ITEM_TYPES.includes(t) ? t : null;
}

async function list(req, res, next) {
  try {
    const q = (req.query.q || '').toString().trim();
    const type = normalizeType(req.query.item_type);
    const params = [];
    const conds = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(`description ILIKE $${params.length}`);
    }
    if (type) {
      params.push(type);
      conds.push(`item_type = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT id, description, item_type, created_at, updated_at
       FROM item_catalog
       ${where}
       ORDER BY description ASC`,
      params
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function search(req, res, next) {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const r = await pool.query(
      `SELECT id, description, item_type
       FROM item_catalog
       WHERE description ILIKE $1
       ORDER BY description ASC
       LIMIT $2`,
      [`%${q}%`, limit]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function suggestions(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT TRIM(j.description) AS description,
              MODE() WITHIN GROUP (ORDER BY j.item_type) AS item_type,
              COUNT(*)::int AS uses
       FROM job_items j
       WHERE j.parent_id IS NULL
         AND TRIM(j.description) <> ''
         AND LOWER(TRIM(j.description)) NOT IN (
           SELECT LOWER(TRIM(description)) FROM item_catalog
         )
       GROUP BY TRIM(j.description)
       ORDER BY uses DESC, description ASC
       LIMIT 10`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const description = (req.body.description || '').toString().trim();
    const item_type = normalizeType(req.body.item_type) || 'mano_de_obra';
    if (!description) return res.status(400).json({ error: 'description es requerido' });

    const r = await pool.query(
      `INSERT INTO item_catalog (description, item_type)
       VALUES ($1, $2)
       RETURNING id, description, item_type, created_at, updated_at`,
      [description, item_type]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un item con esa descripcion' });
    }
    next(err);
  }
}

async function bulkCreate(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'items es requerido' });

    const inserted = [];
    const skipped = [];
    for (const raw of items) {
      const description = (raw?.description || '').toString().trim();
      const item_type = normalizeType(raw?.item_type) || 'mano_de_obra';
      if (!description) { skipped.push({ description, reason: 'empty' }); continue; }
      try {
        const r = await pool.query(
          `INSERT INTO item_catalog (description, item_type)
           VALUES ($1, $2)
           RETURNING id, description, item_type, created_at, updated_at`,
          [description, item_type]
        );
        inserted.push(r.rows[0]);
      } catch (e) {
        if (e.code === '23505') {
          skipped.push({ description, reason: 'duplicate' });
        } else {
          throw e;
        }
      }
    }
    res.status(201).json({ inserted, skipped });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const description = req.body.description != null
      ? req.body.description.toString().trim()
      : null;
    const item_type = req.body.item_type != null
      ? normalizeType(req.body.item_type)
      : null;
    if (req.body.item_type != null && !item_type) {
      return res.status(400).json({ error: 'item_type invalido' });
    }
    if (description === '') {
      return res.status(400).json({ error: 'description no puede ser vacia' });
    }
    const r = await pool.query(
      `UPDATE item_catalog SET
         description = COALESCE($1, description),
         item_type   = COALESCE($2, item_type)
       WHERE id = $3
       RETURNING id, description, item_type, created_at, updated_at`,
      [description, item_type, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Item no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un item con esa descripcion' });
    }
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const r = await pool.query(
      `DELETE FROM item_catalog WHERE id = $1`, [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, search, suggestions, create, bulkCreate, update, remove };
