const jwt = require('jsonwebtoken');

// Set JWT_SECRET before requiring the module
process.env.JWT_SECRET = 'test-secret-key';
const { authenticate, requireAdmin, requireAdminOrRecep } = require('../src/middlewares/auth');

describe('authenticate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('rejects request without Authorization header', () => {
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token no provisto' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects request with malformed Authorization header', () => {
    req.headers.authorization = 'Basic abc123';
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid token', () => {
    req.headers.authorization = 'Bearer invalid-token';
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalido o expirado' });
  });

  test('accepts valid token and sets req.user', () => {
    const payload = { id: 'user-1', username: 'admin', role: 'admin', full_name: 'Admin' };
    const token = jwt.sign(payload, 'test-secret-key');
    req.headers.authorization = `Bearer ${token}`;

    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject(payload);
  });

  test('rejects expired token', () => {
    const token = jwt.sign({ id: '1' }, 'test-secret-key', { expiresIn: '-1s' });
    req.headers.authorization = `Bearer ${token}`;

    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireAdmin middleware', () => {
  let req, res, next;

  beforeEach(() => {
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('allows admin role', () => {
    req = { user: { role: 'admin' } };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects recepcionista role', () => {
    req = { user: { role: 'recepcionista' } };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('rejects mecanico role', () => {
    req = { user: { role: 'mecanico' } };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireAdminOrRecep middleware', () => {
  let req, res, next;

  beforeEach(() => {
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('allows admin role', () => {
    req = { user: { role: 'admin' } };
    requireAdminOrRecep(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows recepcionista role', () => {
    req = { user: { role: 'recepcionista' } };
    requireAdminOrRecep(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects mecanico role', () => {
    req = { user: { role: 'mecanico' } };
    requireAdminOrRecep(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
