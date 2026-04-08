function errorHandler(err, req, res, next) {
  console.error(err.stack || err);

  if (err.code === '23505')
    return res.status(409).json({ error: 'Registro duplicado', detalles: [{ campo: 'duplicado', mensaje: err.detail }] });
  if (err.code === '23503')
    return res.status(400).json({ error: 'Registro referenciado no existe', detalles: [{ campo: 'referencia', mensaje: err.detail }] });

  const status = err.status || 500;
  const response = { error: err.message || 'Error interno del servidor' };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }
  res.status(status).json(response);
}

module.exports = errorHandler;
