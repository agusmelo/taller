const pool = require('../config/database');
const { validateRut, formatRut } = require('../utils/rut');

async function list(req, res, next) {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = q ? [`%${q}%`, parseInt(limit), parseInt(offset)] : [parseInt(limit), parseInt(offset)];
    const whereClause = q
      ? `AND (c.full_name ILIKE $1 OR c.phone ILIKE $1 OR c.rut ILIKE $1 OR c.email ILIKE $1)`
      : '';
    const r = await pool.query(`
      SELECT c.*, COUNT(DISTINCT v.id) AS vehicle_count
      FROM clients c
      LEFT JOIN vehicles v ON v.client_id = c.id AND v.deleted_at IS NULL
      WHERE c.deleted_at IS NULL ${whereClause}
      GROUP BY c.id ORDER BY c.full_name
      LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}
    `, params);
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT c.*, COUNT(DISTINCT v.id) AS vehicle_count, COUNT(DISTINCT j.id) AS job_count
       FROM clients c
       LEFT JOIN vehicles v ON v.client_id = c.id AND v.deleted_at IS NULL
       LEFT JOIN jobs j ON j.client_id = c.id AND j.deleted_at IS NULL
       WHERE c.id = $1 AND c.deleted_at IS NULL GROUP BY c.id`, [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function getByRut(req, res, next) {
  try {
    const rut = formatRut(req.params.rut);
    const r = await pool.query(
      `SELECT * FROM clients WHERE rut = $1 AND deleted_at IS NULL`, [rut]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function checkDuplicate(req, res, next) {
  try {
    const { name, rut } = req.query;
    const result = { rut_match: null, name_matches: [] };

    if (rut) {
      const formattedRut = formatRut(rut);
      if (formattedRut) {
        const r = await pool.query(
          `SELECT id, full_name, rut, phone FROM clients WHERE rut = $1 AND deleted_at IS NULL`, [formattedRut]);
        if (r.rows[0]) result.rut_match = r.rows[0];
      }
    }

    if (name && name.length >= 3) {
      const r = await pool.query(
        `SELECT id, full_name, rut, phone FROM clients
         WHERE full_name ILIKE $1 AND deleted_at IS NULL
         ORDER BY full_name LIMIT 5`,
        [`%${name}%`]);
      result.name_matches = r.rows;
    }

    res.json(result);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { type = 'individual', full_name, rut, phone, email, address, notes } = req.body;
    if (!full_name) return res.status(400).json({ error: 'full_name es requerido' });
    if (rut && !validateRut(rut))
      return res.status(400).json({ error: 'RUT invalido' });
    const formattedRut = rut ? formatRut(rut) : null;
    const r = await pool.query(
      `INSERT INTO clients (type, full_name, rut, phone, email, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, full_name, formattedRut, phone || null, email || null, address || null, notes || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { type, full_name, rut, phone, email, address, notes } = req.body;
    if (rut && !validateRut(rut))
      return res.status(400).json({ error: 'RUT invalido' });
    const formattedRut = rut ? formatRut(rut) : undefined;
    const r = await pool.query(
      `UPDATE clients SET
        type      = COALESCE($1, type),
        full_name = COALESCE($2, full_name),
        rut       = COALESCE($3, rut),
        phone     = COALESCE($4, phone),
        email     = COALESCE($5, email),
        address   = COALESCE($6, address),
        notes     = COALESCE($7, notes)
       WHERE id = $8 AND deleted_at IS NULL RETURNING *`,
      [type, full_name, formattedRut, phone, email, address, notes, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await pool.query(`UPDATE clients SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function getVehicles(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT * FROM vehicles WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getJobs(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT j.*, v.plate_number, v.make, v.model FROM jobs j
       JOIN vehicles v ON v.id = j.vehicle_id
       WHERE j.client_id = $1 AND j.deleted_at IS NULL ORDER BY j.created_at DESC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

module.exports = { list, getOne, getByRut, checkDuplicate, create, update, remove, getVehicles, getJobs };
