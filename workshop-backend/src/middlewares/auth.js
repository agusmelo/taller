const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token no provisto' });

  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  next();
}

function requireAdminOrRecep(req, res, next) {
  if (!['admin', 'recepcionista'].includes(req.user.role))
    return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

module.exports = { authenticate, requireAdmin, requireAdminOrRecep };
