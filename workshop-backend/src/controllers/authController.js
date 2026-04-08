const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/database');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contrasena requeridos' });

    const r = await pool.query(
      `SELECT id, username, password_hash, full_name, role, is_active
       FROM users WHERE username = $1 AND deleted_at IS NULL`, [username]
    );
    const user = r.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciales invalidas' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
    });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT id, username, full_name, role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

module.exports = { login, me };
