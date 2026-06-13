'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/controllers/alertsController', () => ({
  evaluateAndPersist: jest.fn().mockResolvedValue({ items: [], error: null }),
  evaluateDefinition: jest.fn().mockResolvedValue([]),
}));

const pool                = require('../src/config/database');
const { evaluateAndPersist } = require('../src/controllers/alertsController');
const { list, getOne, create, update, remove, evaluate } = require('../src/controllers/alertDefinitionsController');

// ─── Helpers ────────────────────────────────────────────────────────────────

function ctx(body = {}, params = {}, user = { id: 'u1', role: 'admin' }) {
  return {
    req:  { body, params, user },
    res:  { status: jest.fn().mockReturnThis(), json: jest.fn() },
    next: jest.fn(),
  };
}

const UUID1 = '00000000-0000-0000-0000-000000000001';

const DEF_ROW = {
  id: UUID1,
  alert_type: 'overdue_service',
  name: 'Aceite cada 6 meses',
  enabled: true,
  catalog_item_id: 'item1',
  catalog_item_description: 'Cambio de aceite',
  threshold_days: 180,
  bp_multiplier: null,
  bp_min_days: null,
  eval_interval_hours: 4,
  last_evaluated_at: null,
  last_result_count: 0,
  last_run_error: null,
  created_by: null,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => { pool.query.mockReset(); evaluateAndPersist.mockReset().mockResolvedValue({ items: [], error: null }); });

// ─────────────────────────────────────────────────────────────────────────────
// list
// ─────────────────────────────────────────────────────────────────────────────

describe('list', () => {
  test('returns all definitions ordered by type', async () => {
    const { req, res, next } = ctx();
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] });

    await list(req, res, next);

    expect(res.json).toHaveBeenCalledWith([DEF_ROW]);
    expect(pool.query.mock.calls[0][0]).toContain('SELECT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOne
// ─────────────────────────────────────────────────────────────────────────────

describe('getOne', () => {
  test('returns 400 for non-UUID id', async () => {
    const { req, res, next } = ctx({}, { id: 'not-uuid' });
    await getOne(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when definition not found', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getOne(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns definition when found', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] });
    await getOne(req, res, next);
    expect(res.json).toHaveBeenCalledWith(DEF_ROW);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// create — validation
// ─────────────────────────────────────────────────────────────────────────────

describe('create — validation', () => {
  test('422 when name is missing', async () => {
    const { req, res, next } = ctx({ alert_type: 'lost_customer', threshold_days: 180 });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].detalles).toContain('"name" es requerido');
  });

  test('422 when alert_type is invalid', async () => {
    const { req, res, next } = ctx({ name: 'Test', alert_type: 'unknown', threshold_days: 90 });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('422 when overdue_service lacks catalog_item_id', async () => {
    const { req, res, next } = ctx({ name: 'Test', alert_type: 'overdue_service', threshold_days: 90 });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].detalles.some(e => e.includes('catalog_item_id'))).toBe(true);
  });

  test('422 when overdue_service lacks threshold_days', async () => {
    const { req, res, next } = ctx({
      name: 'Test', alert_type: 'overdue_service', catalog_item_id: UUID1,
    });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('422 when threshold_days < 1', async () => {
    const { req, res, next } = ctx({ name: 'Test', alert_type: 'lost_customer', threshold_days: 0 });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('422 when eval_interval_hours < 1', async () => {
    const { req, res, next } = ctx({
      name: 'Test', alert_type: 'lost_customer', threshold_days: 90, eval_interval_hours: 0,
    });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('422 when catalog_item_id sent for non-overdue_service type', async () => {
    const { req, res, next } = ctx({
      name: 'Test', alert_type: 'lost_customer', threshold_days: 90, catalog_item_id: UUID1,
    });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('broken_pattern defaults bp_multiplier=1.5 and bp_min_days=0', async () => {
    const { req, res, next } = ctx({ name: 'Test', alert_type: 'broken_pattern' });
    pool.query.mockResolvedValueOnce({ rows: [{ ...DEF_ROW, alert_type: 'broken_pattern' }] });

    await create(req, res, next);

    const insertArgs = pool.query.mock.calls[0][1];
    // bp_multiplier is $6, bp_min_days is $7
    expect(insertArgs[5]).toBe(1.5); // bp_multiplier default
    expect(insertArgs[6]).toBe(0);   // bp_min_days default
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// create — happy path and conflict
// ─────────────────────────────────────────────────────────────────────────────

describe('create — happy path and conflict', () => {
  test('201 with new definition on valid overdue_service payload', async () => {
    const { req, res, next } = ctx({
      name: 'Aceite',
      alert_type: 'overdue_service',
      catalog_item_id: UUID1,
      threshold_days: 180,
    });
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] });

    await create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(DEF_ROW);
  });

  test('201 with valid lost_customer payload', async () => {
    const { req, res, next } = ctx({
      name: 'Clientes perdidos',
      alert_type: 'lost_customer',
      threshold_days: 365,
    });
    pool.query.mockResolvedValueOnce({ rows: [{ ...DEF_ROW, alert_type: 'lost_customer' }] });
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('409 on unique constraint violation (duplicate definition)', async () => {
    const { req, res, next } = ctx({
      name: 'Aceite',
      alert_type: 'overdue_service',
      catalog_item_id: UUID1,
      threshold_days: 180,
    });
    const dbErr = new Error('duplicate key');
    dbErr.code = '23505';
    pool.query.mockRejectedValueOnce(dbErr);

    await create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('Ya existe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

describe('update', () => {
  test('400 for non-UUID id', async () => {
    const { req, res, next } = ctx({ name: 'New' }, { id: 'bad-id' });
    await update(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 when definition does not exist', async () => {
    const { req, res, next } = ctx({ name: 'New' }, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [] });
    await update(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns existing row unchanged when body is empty', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] }); // SELECT existing
    await update(req, res, next);
    expect(res.json).toHaveBeenCalledWith(DEF_ROW);
    // No UPDATE query should be issued
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('updates only the provided fields (name + enabled)', async () => {
    const { req, res, next } = ctx({ name: 'Updated', enabled: false }, { id: UUID1 });
    pool.query
      .mockResolvedValueOnce({ rows: [DEF_ROW] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [{ ...DEF_ROW, name: 'Updated', enabled: false }] }); // UPDATE ... RETURNING

    await update(req, res, next);

    const updateSQL = pool.query.mock.calls[1][0];
    expect(updateSQL).toContain('UPDATE alert_definitions');
    expect(updateSQL).toContain('name');
    expect(updateSQL).toContain('enabled');
    expect(updateSQL).not.toContain('catalog_item_id'); // not updatable
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));
  });

  test('locks alert_type — uses existing type for validation', async () => {
    // Send catalog_item_id for a non-overdue_service definition — should be rejected
    const existingDef = { ...DEF_ROW, alert_type: 'lost_customer' };
    const { req, res, next } = ctx({ catalog_item_id: UUID1 }, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [existingDef] });

    await update(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  // Sprint 0 / fix code-review #1: re-habilitar una def overdue_service
  // huérfana (catalog_item_id=NULL) haría que el evaluador dispare una
  // alerta crítica por cada vehículo. El update debe rechazarlo.
  test('422 al intentar habilitar overdue_service huérfana (catalog_item_id NULL)', async () => {
    const orphan = { ...DEF_ROW, catalog_item_id: null, enabled: false };
    const { req, res, next } = ctx({ enabled: true }, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [orphan] });

    await update(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toMatch(/catalog_item_id/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  // Sprint 0 / fix code-review #2: el índice único parcial WHERE enabled=true
  // hace que reactivar una def deshabilitada cuando ya existe otra activa
  // del mismo tipo viole 23505. update debe mapear a 409.
  test('409 cuando UPDATE viola unique index (23505) — espejo de create', async () => {
    const { req, res, next } = ctx({ enabled: true }, { id: UUID1 });
    const dbErr = new Error('duplicate key value violates unique constraint');
    dbErr.code = '23505';
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...DEF_ROW, alert_type: 'lost_customer', catalog_item_id: null, enabled: false }] })
      .mockRejectedValueOnce(dbErr);

    await update(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toMatch(/Ya existe/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────────────

describe('remove', () => {
  test('400 for non-UUID id', async () => {
    const { req, res, next } = ctx({}, { id: 'bad' });
    await remove(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 when definition does not exist', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [] });
    await remove(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns ok:true when definition exists', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID1 }] });
    await remove(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluate (per-definition force re-run)
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluate', () => {
  test('400 for non-UUID id', async () => {
    const { req, res, next } = ctx({}, { id: 'bad' });
    await evaluate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 when definition not found', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    pool.query.mockResolvedValueOnce({ rows: [] });
    await evaluate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('calls evaluateAndPersist and returns updated definition', async () => {
    const { req, res, next } = ctx({}, { id: UUID1 });
    const updatedDef = { ...DEF_ROW, last_result_count: 3 };

    pool.query
      .mockResolvedValueOnce({ rows: [DEF_ROW] })    // SELECT existing
      .mockResolvedValueOnce({ rows: [updatedDef] }); // SELECT after evaluateAndPersist

    evaluateAndPersist.mockResolvedValueOnce({ items: [{ severity: 'critical' }], error: null });

    await evaluate(req, res, next);

    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF_ROW);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: updatedDef,
        items: [{ severity: 'critical' }],
        error: null,
      })
    );
  });
});
