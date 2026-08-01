'use strict';

/**
 * Sprint 3 — pruebas para los tres nuevos tipos de alerta.
 *
 * Cada estrategia se prueba directamente (sin pasar por evaluateDefinition)
 * para verificar la query y el shape del ítem retornado.
 */

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const pool = require('../src/config/database');
const strategies = require('../src/services/alertStrategies');

beforeEach(() => pool.query.mockReset());

// ── quote_pending ───────────────────────────────────────────────────────────
describe('strategies.quote_pending', () => {
  const strat = strategies.get('quote_pending');
  const DEF = { id: 'def1', alert_type: 'quote_pending', threshold_days: 7 };

  test('returns items mapped from query rows', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        job_id: 'j1', job_number: 'T-100', job_date: '2025-01-01',
        client_id: 'c1', client_name: 'Cliente A',
        client_phone: '099000000', client_email: 'a@x.com',
        plate_number: 'ABC 1234',
        days_pending: '12',
      }],
    });

    const items = await strat.evaluate(DEF);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      alert_type: 'quote_pending',
      entity_type: 'job',
      entity_id: 'j1',
      current_value: 12,
      threshold: 7,
      action_route: '/trabajos/j1',
    });
    expect(items[0].entity_label).toContain('ABC 1234');
    expect(items[0].context).toContain('T-100');
  });

  test('SQL filters by status=presupuesto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await strat.evaluate(DEF);
    expect(pool.query.mock.calls[0][0]).toContain("status = 'presupuesto'");
  });

  test('validate requires threshold_days on create', () => {
    const ctx = { isUpdate: false, errors: [], out: {} };
    strat.validate({}, ctx);
    expect(ctx.errors.length).toBeGreaterThan(0);
  });

  test('entityType is job', () => {
    expect(strat.entityType).toBe('job');
  });
});

// ── upcoming_service ────────────────────────────────────────────────────────
describe('strategies.upcoming_service', () => {
  const strat = strategies.get('upcoming_service');
  const DEF = {
    id: 'def2', alert_type: 'upcoming_service',
    catalog_item_id: 'item1', threshold_days: 14, due_after_days: 90,
  };

  test('returns empty array when catalog_item_id is missing', async () => {
    const items = await strat.evaluate({ ...DEF, catalog_item_id: null });
    expect(items).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns empty array when due_after_days is missing', async () => {
    const items = await strat.evaluate({ ...DEF, due_after_days: null });
    expect(items).toEqual([]);
  });

  test('SQL filters by days_since_service BETWEEN (due - window) AND due', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await strat.evaluate(DEF);
    expect(pool.query.mock.calls[0][0]).toContain('BETWEEN');
    // Parametros: [catalog_item_id, due_after_days, threshold_days]
    expect(pool.query.mock.calls[0][1]).toEqual(['item1', 90, 14]);
  });

  test('maps row to AlertItem shape', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        client_id: 'c1', client_name: 'María',
        client_phone: null, client_email: null,
        vehicle_id: 'v1', plate_number: 'XYZ 999',
        last_service_date: '2025-01-01',
        days_since_service: '83',
      }],
    });
    const items = await strat.evaluate(DEF);
    expect(items[0]).toMatchObject({
      alert_type: 'upcoming_service',
      entity_type: 'vehicle',
      entity_id: 'v1',
      entity_label: 'XYZ 999',
      threshold: 90,
      current_value: 83,
    });
    // 90-83=7 → medium severity
    expect(items[0].severity).toBe('medium');
  });

  test('validate requires catalog_item_id, threshold_days, due_after_days on create', () => {
    const ctx = { isUpdate: false, errors: [], out: {} };
    strat.validate({}, ctx);
    expect(ctx.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ── high_value_lost ─────────────────────────────────────────────────────────
describe('strategies.high_value_lost', () => {
  const strat = strategies.get('high_value_lost');
  const DEF = {
    id: 'def3', alert_type: 'high_value_lost',
    threshold_days: 90, min_lifetime_value: 5000,
  };

  test('passes min_lifetime_value and threshold_days as params', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await strat.evaluate(DEF);
    expect(pool.query.mock.calls[0][1]).toEqual([5000, 90]);
  });

  test('treats null min_lifetime_value as 0', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await strat.evaluate({ ...DEF, min_lifetime_value: null });
    expect(pool.query.mock.calls[0][1]).toEqual([0, 90]);
  });

  test('maps row to AlertItem with revenue in context', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        client_id: 'c1', client_name: 'Pedro VIP',
        client_phone: '099000000', client_email: null,
        last_job_date: '2024-01-01',
        total_revenue: '12345.67',
        days_since_last_job: '180',
      }],
    });
    const items = await strat.evaluate(DEF);
    expect(items[0]).toMatchObject({
      alert_type: 'high_value_lost',
      entity_type: 'client',
      entity_id: 'c1',
      current_value: 180,
      threshold: 90,
    });
    expect(items[0].context).toContain('12345.67');
  });

  test('validate requires threshold_days; min_lifetime_value defaults to 0', () => {
    const ctx = { isUpdate: false, errors: [], out: {} };
    strat.validate({ threshold_days: 90 }, ctx);
    expect(ctx.errors).toHaveLength(0);
    expect(ctx.out.min_lifetime_value).toBe(0);
  });

  test('validate rejects negative min_lifetime_value', () => {
    const ctx = { isUpdate: false, errors: [], out: {} };
    strat.validate({ threshold_days: 90, min_lifetime_value: -1 }, ctx);
    expect(ctx.errors.length).toBeGreaterThan(0);
  });
});

// ── registry sanity ────────────────────────────────────────────────────────
describe('strategy registry after Sprint 3', () => {
  test('listTypes() includes the 7 alert types', () => {
    const types = strategies.listTypes();
    expect(types).toEqual(expect.arrayContaining([
      'overdue_service', 'payment_overdue', 'lost_customer', 'broken_pattern',
      'quote_pending', 'upcoming_service', 'high_value_lost',
    ]));
    expect(types).toHaveLength(7);
  });
});
