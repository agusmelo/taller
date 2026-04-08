const pool   = require('../config/database');
const bcrypt = require('bcryptjs');

async function list(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT id, username, full_name, role, is_active, created_at
       FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { username, password, full_name, role = 'recepcionista' } = req.body;
    if (!username || !password || !full_name)
      return res.status(400).json({ error: 'username, password y full_name son requeridos' });
    if (!['admin', 'recepcionista', 'mecanico'].includes(role))
      return res.status(400).json({ error: 'Rol invalido' });

    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4) RETURNING id, username, full_name, role, is_active, created_at`,
      [username, hash, full_name, role]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { full_name, role, password, is_active } = req.body;
    let hash;
    if (password) hash = await bcrypt.hash(password, 12);

    const r = await pool.query(`
      UPDATE users SET
        full_name     = COALESCE($1, full_name),
        role          = COALESCE($2, role),
        password_hash = COALESCE($3, password_hash),
        is_active     = COALESCE($4, is_active)
      WHERE id = $5 AND deleted_at IS NULL
      RETURNING id, username, full_name, role, is_active, created_at`,
      [full_name, role, hash, is_active, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await pool.query(
      `UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = $1`, [req.params.id]
    );
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
