'use strict';

/**
 * Tests for itemCatalogController.remove
 *
 * Sprint 0 / HU-01: borrar un ítem del catálogo NO debe borrar las
 * definiciones de alerta vinculadas — debe desactivarlas y orfanarlas
 * (catalog_item_id = NULL, enabled = false) dentro de una transacción.
 * El SELECT ... FOR UPDATE inicial cierra la ventana entre el chequeo
 * de existencia y el DELETE para evitar que una inserción concurrente
 * de una definición huérfana se cuele.
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
  test('lockea el ítem, desactiva definiciones y commitea', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                              // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: UUID1 }] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rowCount: 2 })                 // UPDATE alert_definitions
      .mockResolvedValueOnce({ rowCount: 1 })                 // DELETE FROM item_catalog
      .mockResolvedValueOnce({});                             // COMMIT

    await remove(req, res, next);

    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toMatch(/BEGIN/);
    expect(calls[1]).toMatch(/SELECT.+item_catalog.+FOR UPDATE/s);
    expect(calls[2]).toMatch(/UPDATE alert_definitions/);
    expect(calls[2]).toMatch(/enabled\s*=\s*false/);
    expect(calls[2]).toMatch(/catalog_item_id\s*=\s*NULL/);
    expect(calls[3]).toMatch(/DELETE FROM item_catalog/);
    expect(calls[4]).toMatch(/COMMIT/);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(client.release).toHaveBeenCalled();
  });

  test('rollback + 404 cuando el lock no encuentra el ítem (no existe)', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                              // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })        // SELECT ... FOR UPDATE → 0
      .mockResolvedValueOnce({});                             // ROLLBACK

    await remove(req, res, next);

    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls[calls.length - 1]).toMatch(/ROLLBACK/);
    // No debe haberse intentado UPDATE ni DELETE.
    expect(calls.find(s => /UPDATE alert_definitions/.test(s))).toBeUndefined();
    expect(calls.find(s => /DELETE FROM item_catalog/.test(s))).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('libera la conexión y emite ROLLBACK cuando una query falla', async () => {
    const { req, res, next } = ctx({ id: UUID1 });

    client.query
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: UUID1 }] })   // SELECT ... FOR UPDATE
      .mockRejectedValueOnce(new Error('boom'))                        // UPDATE falla
      .mockResolvedValueOnce({});                                      // ROLLBACK

    await remove(req, res, next);

    const calls = client.query.mock.calls.map(c => c[0]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(calls).toContainEqual(expect.stringMatching(/ROLLBACK/));
    expect(client.release).toHaveBeenCalled();
  });
});
