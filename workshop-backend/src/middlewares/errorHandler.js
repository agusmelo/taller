function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === '23505')
    return res.status(409).json({ error: 'Registro duplicado', detalle: err.detail });
  if (err.code === '23503')
    return res.status(400).json({ error: 'Registro referenciado no existe', detalle: err.detail });
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
}

module.exports = errorHandler;
