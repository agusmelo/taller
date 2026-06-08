'use strict';

/**
 * Tests for itemCatalogController.remove
 *
 * Sprint 0 / HU-01: borrar un ítem del catálogo NO debe borrar las
 * definiciones de alerta vinculadas — debe desactivarlas y orfanarlas
 * (catalog_item_id = NULL, enabled = false) dentro de una transacción.
 */

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';

jest.mock('../src/config/database', () => {
  const client = {
    query:   jest.fn(),
    release: jest.fn(),
  };
  return {
    query:   jest.fn(),
    connect: jest.fn().mockResolvedValue(client),
    __client: client,
  };
});

const pool   = require('../src/config/database');
const client = pool.__client;
const { remove } = require('../src/controllers/itemCatalogController');

const UUID1 = '00000000-0000-0000-0000-000000000001';

function ctx(params = {}, user = { id: 'u1', role: 'admin' }) {
  return {
    req:  { params, user, body: {} },
    res:  { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() },
    next: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  client.query.mockReset();
  client.release.mockReset();
});

describe('itemCatalogController.remove — Sprint 0 / HU-01', () => {
  test('desactiva definiciones de alerta vinculadas antes de borrar el ítem', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                              // BEGIN
      .mockResolvedValueOnce({ rowCount: 2 })                 // UPDATE alert_definitions
      .mockResolvedValueOnce({ rowCount: 1 })                 // DELETE FROM item_catalog
      .mockResolvedValueOnce({});                             // COMMIT

    await remove(req, res, next);

    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toMatch(/BEGIN/);
    expect(calls[1]).toMatch(/UPDATE alert_definitions/);
    expect(calls[1]).toMatch(/enabled\s*=\s*false/);
    expect(calls[1]).toMatch(/catalog_item_id\s*=\s*NULL/);
    expect(calls[2]).toMatch(/DELETE FROM item_catalog/);
    expect(calls[3]).toMatch(/COMMIT/);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(client.release).toHaveBeenCalled();
  });

  test('rollback + 404 cuando el ítem no existe', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                              // BEGIN
      .mockResolvedValueOnce({ rowCount: 0 })                 // UPDATE: ninguna def lo referenciaba
      .mockResolvedValueOnce({ rowCount: 0 })                 // DELETE no encuentra ítem raíz
      .mockResolvedValueOnce({});                             // ROLLBACK

    await remove(req, res, next);

    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls[calls.length - 1]).toMatch(/ROLLBACK/);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('libera la conexión incluso si una query falla', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                              // BEGIN
      .mockRejectedValueOnce(new Error('boom'))               // UPDATE falla
      .mockResolvedValueOnce({});                             // ROLLBACK (best-effort)

    await remove(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(client.release).toHaveBeenCalled();
  });
});
