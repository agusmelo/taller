const pool = require('../config/database');

function checkJobLocked(options = {}) {
  const { allowPaymentsOnTerminado = false } = options;
  return async function(req, res, next) {
    try {
      const jobId = req.params.id;
      const r = await pool.query(
        `SELECT is_locked, status FROM jobs WHERE id = $1 AND deleted_at IS NULL`, [jobId]
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });
      if (r.rows[0].is_locked) {
        if (allowPaymentsOnTerminado && r.rows[0].status === 'terminado') {
          return next();
        }
        return res.status(403).json({
          error: 'Trabajo bloqueado',
          detalles: [{ campo: 'is_locked', mensaje: 'Este trabajo esta bloqueado para edicion. Solo un administrador puede desbloquearlo.' }]
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { checkJobLocked };
