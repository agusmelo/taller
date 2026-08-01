function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let response = { error: err.message || 'Error interno del servidor' };

  if (err.code === '23505') {
    status = 409;
    response = { error: 'Registro duplicado' };
  } else if (err.code === '23503') {
    status = 400;
    response = { error: 'Registro referenciado no existe' };
  } else if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  // Single JSON line per error so log shippers (Promtail/Loki) can parse
  // status/method/path/message without a fragile text parser. Stack always
  // goes to the server-side log regardless of env — only the client-facing
  // response hides it in production.
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    status,
    method: req.method,
    path: req.path,
    message: err.message || String(err),
    stack: err.stack,
  }));

  res.status(status).json(response);
}

module.exports = errorHandler;
