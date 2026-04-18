const pool = require('../config/database');

async function getAll(req, res, next) {
  try {
    const r = await pool.query(`SELECT key, value FROM settings ORDER BY key`);
    const settings = {};
    r.rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const entries = Object.entries(req.body);
    if (!entries.length) return res.status(400).json({ error: 'No settings provided' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, String(value)]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const r = await pool.query(`SELECT key, value FROM settings ORDER BY key`);
    const settings = {};
    r.rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (err) { next(err); }
}

module.exports = { getAll, update };
