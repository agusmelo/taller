function errorHandler(err, req, res, next) {
  console.error(err.stack || err);

  if (err.code === '23505')
    return res.status(409).json({ error: 'Registro duplicado' });
  if (err.code === '23503')
    return res.status(400).json({ error: 'Registro referenciado no existe' });

  const status = err.status || 500;
  const response = { error: err.message || 'Error interno del servidor' };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }
  res.status(status).json(response);
}

module.exports = errorHandler;
