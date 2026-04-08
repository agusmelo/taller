const pool = require('../config/database');

async function list(req, res, next) {
  try {
    const { q, client_id } = req.query;
    const where = ['v.deleted_at IS NULL'];
    const params = [];
    if (client_id) { params.push(client_id); where.push(`v.client_id = $${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(v.plate_number ILIKE $${params.length} OR v.make ILIKE $${params.length} OR v.model ILIKE $${params.length})`); }
    const r = await pool.query(
      `SELECT v.*, c.full_name AS client_name, c.phone AS client_phone
       FROM vehicles v JOIN clients c ON c.id = v.client_id
       WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC`, params
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT v.*, c.full_name AS client_name, c.phone AS client_phone, c.rut AS client_rut
       FROM vehicles v JOIN clients c ON c.id = v.client_id
       WHERE v.id = $1 AND v.deleted_at IS NULL`, [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Vehiculo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function getByPlate(req, res, next) {
  try {
    const plate = req.params.plate.toUpperCase().replace(/\s/g, '');
    const r = await pool.query(
      `SELECT v.*, c.id AS client_id, c.full_name AS client_name,
              c.phone AS client_phone, c.rut AS client_rut,
              c.email AS client_email, c.address AS client_address
       FROM vehicles v JOIN clients c ON c.id = v.client_id
       WHERE UPPER(REPLACE(v.plate_number,' ','')) = $1 AND v.deleted_at IS NULL`,
      [plate]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Vehiculo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function getOwnershipHistory(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT h.*, c.full_name AS client_name, c.rut AS client_rut, c.phone AS client_phone
       FROM vehicle_ownership_history h
       JOIN clients c ON c.id = h.client_id
       WHERE h.vehicle_id = $1
       ORDER BY h.started_at DESC`, [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const db = await pool.connect();
  try {
    const { plate_number, client_id, make, model, year, color, mileage, notes } = req.body;
    if (!plate_number || !client_id || !make || !model)
      return res.status(400).json({ error: 'plate_number, client_id, make, model son requeridos' });

    await db.query('BEGIN');
    const r = await db.query(
      `INSERT INTO vehicles (plate_number, client_id, make, model, year, color, mileage, notes)
       VALUES (UPPER($1),$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [plate_number, client_id, make, model, year || null, color || null, mileage || null, notes || null]
    );
    await db.query(
      `INSERT INTO vehicle_ownership_history (vehicle_id, client_id, transferred_by)
       VALUES ($1, $2, $3)`,
      [r.rows[0].id, client_id, req.user.id]
    );
    await db.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    next(err);
  } finally { db.release(); }
}

async function transferOwnership(req, res, next) {
  const db = await pool.connect();
  try {
    const { new_client_id, transfer_notes } = req.body;
    if (!new_client_id)
      return res.status(400).json({ error: 'new_client_id es requerido' });

    await db.query('BEGIN');
    await db.query(
      `UPDATE vehicle_ownership_history SET ended_at = NOW()
       WHERE vehicle_id = $1 AND ended_at IS NULL`, [req.params.id]
    );
    await db.query(
      `UPDATE vehicles SET client_id = $1 WHERE id = $2`, [new_client_id, req.params.id]
    );
    await db.query(
      `INSERT INTO vehicle_ownership_history (vehicle_id, client_id, transfer_notes, transferred_by)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, new_client_id, transfer_notes || null, req.user.id]
    );
    await db.query('COMMIT');
    res.json({ message: 'Propiedad transferida correctamente' });
  } catch (err) {
    await db.query('ROLLBACK');
    next(err);
  } finally { db.release(); }
}

async function update(req, res, next) {
  try {
    const { make, model, year, color, mileage, notes } = req.body;
    const r = await pool.query(
      `UPDATE vehicles SET
        make    = COALESCE($1, make),   model  = COALESCE($2, model),
        year    = COALESCE($3, year),   color  = COALESCE($4, color),
        mileage = COALESCE($5, mileage), notes = COALESCE($6, notes)
       WHERE id = $7 AND deleted_at IS NULL RETURNING *`,
      [make, model, year, color, mileage, notes, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Vehiculo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await pool.query(`UPDATE vehicles SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, getOne, getByPlate, getOwnershipHistory, create, transferOwnership, update, remove };
