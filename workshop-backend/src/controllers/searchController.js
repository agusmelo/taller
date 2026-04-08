const pool = require('../config/database');

async function search(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2)
      return res.status(400).json({ error: 'Minimo 2 caracteres para buscar' });

    const term = `%${q}%`;

    const [clients, vehicles, jobs] = await Promise.all([
      pool.query(
        `SELECT id, full_name, rut, phone, 'client' AS type
         FROM clients WHERE deleted_at IS NULL
         AND (full_name ILIKE $1 OR rut ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)
         LIMIT 5`, [term]
      ),
      pool.query(
        `SELECT v.id, v.plate_number, v.make, v.model, c.full_name AS client_name, 'vehicle' AS type
         FROM vehicles v JOIN clients c ON c.id = v.client_id
         WHERE v.deleted_at IS NULL
         AND (v.plate_number ILIKE $1 OR v.make ILIKE $1 OR v.model ILIKE $1)
         LIMIT 5`, [term]
      ),
      pool.query(
        `SELECT j.id, j.job_number, j.status, c.full_name AS client_name, v.plate_number, 'job' AS type
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         JOIN vehicles v ON v.id = j.vehicle_id
         WHERE j.deleted_at IS NULL
         AND (j.job_number ILIKE $1 OR c.full_name ILIKE $1 OR v.plate_number ILIKE $1)
         LIMIT 5`, [term]
      )
    ]);

    res.json({
      clients:  clients.rows,
      vehicles: vehicles.rows,
      jobs:     jobs.rows
    });
  } catch (err) { next(err); }
}

module.exports = { search };
