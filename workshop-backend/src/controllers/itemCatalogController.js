const pool = require('../config/database');

const ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro'];

function normalizeType(t) {
  return ITEM_TYPES.includes(t) ? t : null;
}

// Escape PG LIKE/ILIKE metacharacters so user input matches literally.
function escapeLike(s) {
  return s.replace(/[\\%_]/g, c => '\\' + c);
}

function sanitizeChildren(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c, idx) => ({
      description: (c?.description || '').toString().trim(),
      sort_order: Number.isFinite(c?.sort_order) ? c.sort_order : idx,
    }))
    .filter(c => c.description);
}

async function fetchChildren(parentIds) {
  if (parentIds.length === 0) return new Map();
  const r = await pool.query(
    `SELECT id, parent_id, description, sort_order
     FROM item_catalog
     WHERE parent_id = ANY($1::uuid[])
     ORDER BY parent_id, sort_order, description`,
    [parentIds]
  );
  const byParent = new Map();
  for (const row of r.rows) {
    const arr = byParent.get(row.parent_id) || [];
    arr.push({ id: row.id, description: row.description, sort_order: row.sort_order });
    byParent.set(row.parent_id, arr);
  }
  return byParent;
}

async function attachChildren(parents) {
  const byParent = await fetchChildren(parents.map(p => p.id));
  return parents.map(p => ({ ...p, children: byParent.get(p.id) || [] }));
}

async function list(req, res, next) {
  try {
    const q = (req.query.q || '').toString().trim();
    const type = normalizeType(req.query.item_type);
    const params = [];
    const conds = ['parent_id IS NULL'];
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conds.push(`description ILIKE $${params.length}`);
    }
    if (type) {
      params.push(type);
      conds.push(`item_type = $${params.length}`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;
    const r = await pool.query(
      `SELECT id, description, item_type, created_at, updated_at
       FROM item_catalog
       ${where}
       ORDER BY description ASC`,
      params
    );
    res.json(await attachChildren(r.rows));
  } catch (err) { next(err); }
}

async function search(req, res, next) {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const r = await pool.query(
      `SELECT id, description, item_type
       FROM item_catalog
       WHERE parent_id IS NULL AND description ILIKE $1
       ORDER BY description ASC
       LIMIT $2`,
      [`%${escapeLike(q)}%`, limit]
    );
    res.json(await attachChildren(r.rows));
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT id, description, item_type, created_at, updated_at
       FROM item_catalog
       WHERE id = $1 AND parent_id IS NULL`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Item no encontrado' });
    const [withChildren] = await attachChildren(r.rows);
    res.json(withChildren);
  } catch (err) { next(err); }
}

async function suggestions(req, res, next) {
  try {
    // Group historical job_items (parents) together with their exact set of
    // children descriptions. Two groups with the same parent description but
    // different child sets count separately.
    //
    // Children are serialized as a single string with a unit-separator (U+001F)
    // to avoid array_agg-of-empty-arrays type inference issues in Postgres.
    const SEP = '';
    const r = await pool.query(
      `WITH per_parent AS (
         SELECT
           p.id,
           TRIM(p.description) AS parent_desc,
           p.item_type,
           COALESCE(
             string_agg(LOWER(TRIM(c.description)), '|' ORDER BY LOWER(TRIM(c.description)))
               FILTER (WHERE c.description IS NOT NULL AND TRIM(c.description) <> ''),
             ''
           ) AS children_key,
           COALESCE(
             string_agg(TRIM(c.description), $1 ORDER BY LOWER(TRIM(c.description)))
               FILTER (WHERE c.description IS NOT NULL AND TRIM(c.description) <> ''),
             ''
           ) AS children_str
         FROM job_items p
         LEFT JOIN job_items c ON c.parent_id = p.id
         WHERE p.parent_id IS NULL AND TRIM(p.description) <> ''
         GROUP BY p.id, p.description, p.item_type
       ),
       grouped AS (
         SELECT
           parent_desc,
           children_key,
           MODE() WITHIN GROUP (ORDER BY item_type) AS item_type,
           (array_agg(children_str))[1] AS children_str,
           COUNT(*)::int AS uses
         FROM per_parent
         GROUP BY parent_desc, children_key
       )
       SELECT parent_desc AS description, item_type, children_str, uses
       FROM grouped
       WHERE LOWER(parent_desc) NOT IN (
         SELECT LOWER(TRIM(description)) FROM item_catalog WHERE parent_id IS NULL
       )
       ORDER BY uses DESC, description ASC
       LIMIT 10`,
      [SEP]
    );
    res.json(r.rows.map(row => {
      const parts = row.children_str ? row.children_str.split(SEP).filter(Boolean) : [];
      return {
        description: row.description,
        item_type: row.item_type,
        uses: row.uses,
        children: parts.map((d, i) => ({ description: d, sort_order: i })),
      };
    }));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const client = await pool.connect();
  try {
    const description = (req.body.description || '').toString().trim();
    const item_type = normalizeType(req.body.item_type) || 'mano_de_obra';
    const children = sanitizeChildren(req.body.children);
    if (!description) return res.status(400).json({ error: 'description es requerido' });

    await client.query('BEGIN');
    const parent = await client.query(
      `INSERT INTO item_catalog (description, item_type)
       VALUES ($1, $2)
       RETURNING id, description, item_type, created_at, updated_at`,
      [description, item_type]
    );
    const parentId = parent.rows[0].id;
    const insertedChildren = [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const r = await client.query(
        `INSERT INTO item_catalog (description, item_type, parent_id, sort_order)
         VALUES ($1, 'mano_de_obra', $2, $3)
         RETURNING id, description, sort_order`,
        [c.description, parentId, c.sort_order ?? i]
      );
      insertedChildren.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...parent.rows[0], children: insertedChildren });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un item con esa descripcion' });
    }
    next(err);
  } finally {
    client.release();
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
      const children = sanitizeChildren(raw?.children);
      if (!description) { skipped.push({ description, reason: 'empty' }); continue; }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const parent = await client.query(
          `INSERT INTO item_catalog (description, item_type)
           VALUES ($1, $2)
           RETURNING id, description, item_type, created_at, updated_at`,
          [description, item_type]
        );
        const parentId = parent.rows[0].id;
        const childRows = [];
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          const r = await client.query(
            `INSERT INTO item_catalog (description, item_type, parent_id, sort_order)
             VALUES ($1, 'mano_de_obra', $2, $3)
             RETURNING id, description, sort_order`,
            [c.description, parentId, c.sort_order ?? i]
          );
          childRows.push(r.rows[0]);
        }
        await client.query('COMMIT');
        inserted.push({ ...parent.rows[0], children: childRows });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e.code === '23505') {
          skipped.push({ description, reason: 'duplicate' });
        } else {
          throw e;
        }
      } finally {
        client.release();
      }
    }
    res.status(201).json({ inserted, skipped });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  const client = await pool.connect();
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
    const hasChildrenField = req.body.children !== undefined;
    const children = hasChildrenField ? sanitizeChildren(req.body.children) : null;

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE item_catalog SET
         description = COALESCE($1, description),
         item_type   = COALESCE($2, item_type)
       WHERE id = $3 AND parent_id IS NULL
       RETURNING id, description, item_type, created_at, updated_at`,
      [description, item_type, req.params.id]
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    if (hasChildrenField) {
      await client.query(`DELETE FROM item_catalog WHERE parent_id = $1`, [req.params.id]);
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        await client.query(
          `INSERT INTO item_catalog (description, item_type, parent_id, sort_order)
           VALUES ($1, 'mano_de_obra', $2, $3)`,
          [c.description, req.params.id, c.sort_order ?? i]
        );
      }
    }
    await client.query('COMMIT');
    const [withChildren] = await attachChildren(upd.rows);
    res.json(withChildren);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un item con esa descripcion' });
    }
    next(err);
  } finally {
    client.release();
  }
}

async function replaceChildren(req, res, next) {
  const client = await pool.connect();
  try {
    const parentId = req.params.id;
    const children = sanitizeChildren(req.body?.children);

    await client.query('BEGIN');
    const parent = await client.query(
      `SELECT id FROM item_catalog WHERE id = $1 AND parent_id IS NULL FOR UPDATE`,
      [parentId]
    );
    if (!parent.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    await client.query(`DELETE FROM item_catalog WHERE parent_id = $1`, [parentId]);
    const inserted = [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const r = await client.query(
        `INSERT INTO item_catalog (description, item_type, parent_id, sort_order)
         VALUES ($1, 'mano_de_obra', $2, $3)
         RETURNING id, description, sort_order`,
        [c.description, parentId, c.sort_order ?? i]
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ children: inserted });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    next(err);
  } finally {
    client.release();
  }
}

async function remove(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Orfanar y desactivar definiciones de alerta que apuntan a este ítem,
    // antes de borrarlo. El FK con ON DELETE SET NULL preserva la fila igual,
    // pero el UPDATE explícito garantiza que la definición quede enabled=false
    // (el runner no la evalúa) y registra el cambio en updated_at.
    await client.query(
      `UPDATE alert_definitions
         SET enabled         = false,
             catalog_item_id = NULL,
             updated_at      = NOW()
       WHERE catalog_item_id = $1`,
      [req.params.id]
    );

    const r = await client.query(
      `DELETE FROM item_catalog WHERE id = $1 AND parent_id IS NULL`,
      [req.params.id]
    );

    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function analytics(req, res, next) {
  try {
    const clientId  = req.query.client_id  || null;
    const vehicleId = req.query.vehicle_id || null;
    const from      = req.query.from       || null;
    const to        = req.query.to         || null;
    const itemType  = normalizeType(req.query.item_type);
    const minJobs   = Math.max(0, parseInt(req.query.min_jobs) || 0);

    const SORT_MAP = {
      jobs_count:    'jobs_count',
      avg_price:     'avg_price',
      total_revenue: 'total_revenue',
      last_used_at:  'last_used_at',
      description:   'ic.description',
    };
    const sortCol = SORT_MAP[req.query.sort] || 'jobs_count';
    const order   = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const params = [clientId, vehicleId, from, to];
    let typeFilter = '';
    if (itemType) {
      params.push(itemType);
      typeFilter = ` AND ic.item_type = $${params.length}`;
    }

    const r = await pool.query(`
      WITH filtered_jobs AS (
        SELECT id, job_date, client_id, vehicle_id
        FROM jobs
        WHERE ($1::uuid IS NULL OR client_id  = $1::uuid)
          AND ($2::uuid IS NULL OR vehicle_id = $2::uuid)
          AND ($3::date IS NULL OR job_date  >= $3::date)
          AND ($4::date IS NULL OR job_date  <= $4::date)
      ),
      catalog_uses AS (
        SELECT ji.catalog_item_id,
               ji.unit_price,
               ji.quantity,
               fj.job_date,
               fj.id        AS job_id,
               fj.client_id,
               fj.vehicle_id
        FROM job_items ji
        JOIN filtered_jobs fj ON fj.id = ji.job_id
        WHERE ji.catalog_item_id IS NOT NULL
      ),
      -- Deduplicate per (item, date, client, vehicle) so multiple entries of
      -- the same catalog item within one job don't produce spurious intervals.
      deduped_uses AS (
        SELECT DISTINCT catalog_item_id, job_date, client_id, vehicle_id
        FROM catalog_uses
      ),
      -- Compute intervals within each client+vehicle history, never across clients.
      intervals AS (
        SELECT catalog_item_id,
               client_id,
               vehicle_id,
               job_date - LAG(job_date) OVER (
                 PARTITION BY catalog_item_id, client_id, vehicle_id ORDER BY job_date
               ) AS days
        FROM deduped_uses
      ),
      -- One average per (item, client, vehicle) pair.
      per_client_avg AS (
        SELECT catalog_item_id,
               AVG(days) AS client_avg
        FROM intervals
        WHERE days IS NOT NULL
        GROUP BY catalog_item_id, client_id, vehicle_id
      ),
      -- Global avg-of-averages: "clients who use this item come back every X days".
      -- When filtered by client+vehicle this collapses to that client's own average.
      avg_intervals AS (
        SELECT catalog_item_id,
               ROUND(AVG(client_avg)::numeric, 1) AS avg_client_interval_days
        FROM per_client_avg
        GROUP BY catalog_item_id
      )
      SELECT
        ic.id,
        ic.description,
        ic.item_type,
        COUNT(DISTINCT cu.job_id)::int                      AS jobs_count,
        MAX(cu.job_date)                                    AS last_used_at,
        ROUND(AVG(cu.unit_price)::numeric, 2)               AS avg_price,
        MIN(cu.unit_price)                                  AS min_price,
        MAX(cu.unit_price)                                  AS max_price,
        ROUND(SUM(cu.quantity * cu.unit_price)::numeric, 2) AS total_revenue,
        ai.avg_client_interval_days,
        CASE
          WHEN COUNT(DISTINCT cu.job_id) >= 3 THEN 'high'
          WHEN COUNT(DISTINCT cu.job_id) =  2 THEN 'low'
          ELSE NULL
        END AS interval_confidence
      FROM item_catalog ic
      LEFT JOIN catalog_uses cu ON cu.catalog_item_id = ic.id
      LEFT JOIN avg_intervals ai ON ai.catalog_item_id = ic.id
      WHERE ic.parent_id IS NULL${typeFilter}
      GROUP BY ic.id, ic.description, ic.item_type, ai.avg_client_interval_days
      HAVING COUNT(DISTINCT cu.job_id) >= ${minJobs}
      ORDER BY ${sortCol} ${order} NULLS LAST, ic.description ASC
    `, params);

    res.json(r.rows);
  } catch (err) { next(err); }
}

module.exports = {
  list, search, getOne, suggestions, analytics,
  create, bulkCreate, update, replaceChildren, remove,
};
