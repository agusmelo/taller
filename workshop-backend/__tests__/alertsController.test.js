'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const pool = require('../src/config/database');
const {
  evaluateDefinition,
  evaluateAndPersist,
  feed,
  dismiss,
  badge,
  evaluateAll,
} = require('../src/controllers/alertsController');

// ─── Helpers ────────────────────────────────────────────────────────────────

function ctx(body = {}, user = { id: 'u1', role: 'admin' }) {
  return {
    req:  { body, user },
    res:  { status: jest.fn().mockReturnThis(), json: jest.fn() },
    next: jest.fn(),
  };
}

const UUID1 = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';

const BASE_VEHICLE_ROW = {
  client_id: 'cid1', client_name: 'Juan García',
  client_phone: '099111111', client_email: 'juan@test.com',
  vehicle_id: 'vid1', plate_number: 'ABC 1234',
  make: 'Toyota', model: 'Corolla',
};

beforeEach(() => pool.query.mockReset());

// ─────────────────────────────────────────────────────────────────────────────
// evaluateDefinition — overdue_service
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateDefinition — overdue_service', () => {
  const DEF = {
    id: 'def1',
    alert_type: 'overdue_service',
    catalog_item_id: 'item1',
    threshold_days: 100,
  };

  function mockEval(days, extra = {}) {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ ...BASE_VEHICLE_ROW, last_service_date: '2025-01-01', days_since_service: days, ...extra }],
      })
      .mockResolvedValueOnce({ rows: [] }); // no dismissals
  }

  test('maps row to AlertItem shape', async () => {
    mockEval('200');
    const [item] = await evaluateDefinition(DEF);
    expect(item.alert_type).toBe('overdue_service');
    expect(item.client_id).toBe('cid1');
    expect(item.client_name).toBe('Juan García');
    expect(item.entity_id).toBe('vid1');
    expect(item.entity_label).toBe('ABC 1234');
    expect(item.unit).toBe('days');
    expect(item.definition_id).toBe('def1');
    expect(item.action_route).toBe('/vehiculos/vid1');
  });

  test('severity = critical when ratio >= 2.0 (200d / 100d)', async () => {
    mockEval('200');
    const [item] = await evaluateDefinition(DEF);
    expect(item.severity).toBe('critical');
    expect(item.current_value).toBe(200);
    expect(item.threshold).toBe(100);
  });

  test('severity = high when 1.5 <= ratio < 2.0 (150d / 100d)', async () => {
    mockEval('150');
    const [item] = await evaluateDefinition(DEF);
    expect(item.severity).toBe('high');
  });

  test('severity = medium when 1.2 <= ratio < 1.5 (130d / 100d)', async () => {
    mockEval('130');
    const [item] = await evaluateDefinition(DEF);
    expect(item.severity).toBe('medium');
  });

  test('severity = low when ratio < 1.2 (110d / 100d)', async () => {
    mockEval('110');
    const [item] = await evaluateDefinition(DEF);
    expect(item.severity).toBe('low');
  });

  test('null days_since_service → current_value=null, severity=critical', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...BASE_VEHICLE_ROW, last_service_date: null, days_since_service: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const [item] = await evaluateDefinition(DEF);
    expect(item.current_value).toBeNull();
    expect(item.severity).toBe('critical');
    expect(item.context).toContain('Sin registro');
  });

  test('filters out entity_ids that are currently snoozed', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...BASE_VEHICLE_ROW, last_service_date: '2025-01-01', days_since_service: '200' }] })
      .mockResolvedValueOnce({ rows: [{ entity_id: 'vid1', entity_type: 'vehicle' }] }); // vid1 snoozed
    const items = await evaluateDefinition(DEF);
    expect(items).toHaveLength(0);
  });

  test('keeps items whose entity_id is not dismissed', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          { ...BASE_VEHICLE_ROW, vehicle_id: 'vid1', plate_number: 'AAA 1', last_service_date: '2025-01-01', days_since_service: '200' },
          { ...BASE_VEHICLE_ROW, vehicle_id: 'vid2', plate_number: 'BBB 2', last_service_date: '2025-01-01', days_since_service: '200' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ entity_id: 'vid1', entity_type: 'vehicle' }] }); // only vid1 dismissed
    const items = await evaluateDefinition(DEF);
    expect(items).toHaveLength(1);
    expect(items[0].entity_id).toBe('vid2');
  });

  // Sprint 0 / fix code-review #1: guardia anti-huérfana en la estrategia
  // overdueService. Si catalog_item_id es null (def quedó huérfana tras
  // borrar el item y alguien la reactivó), no debe evaluar — la query con
  // $1=NULL matchea "ningún job" para cada vehículo y devolvería una
  // alerta crítica por vehículo del taller.
  test('catalog_item_id null → no evalúa la query de vehículos', async () => {
    const orphanDef = { ...DEF, catalog_item_id: null };
    pool.query.mockResolvedValueOnce({ rows: [] }); // dismissals (única query esperada)

    const items = await evaluateDefinition(orphanDef);

    expect(items).toEqual([]);
    // Ningún call debe ser el SELECT de vehículos (que dispararía la alerta
    // por vehículo); el único call permitido es el de dismissals.
    const sqls = pool.query.mock.calls.map(c => c[0]);
    expect(sqls.find(s => /FROM vehicles/.test(s))).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateDefinition — broken_pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateDefinition — broken_pattern', () => {
  const BP_ROW = {
    client_id: 'cid1', client_name: 'María López',
    client_phone: null, client_email: null,
    last_job_date: '2025-01-01',
    days_since_last: '300',
    avg_interval_days: '100',
    job_count: '5',
  };

  function mockBP(rows) {
    pool.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [] });
  }

  test('threshold = max(avg*multiplier, bp_min_days)', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '2.0', bp_min_days: '0' };
    mockBP([BP_ROW]);
    const [item] = await evaluateDefinition(def);
    expect(item.threshold).toBe(200); // max(100*2.0, 0) = 200
    expect(item.current_value).toBe(300);
    expect(item.severity).toBe('high'); // 300/200 = 1.5 → high
  });

  test('bp_min_days wins when larger than avg*multiplier', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '1.5', bp_min_days: '250' };
    mockBP([BP_ROW]);
    const [item] = await evaluateDefinition(def);
    expect(item.threshold).toBe(250); // max(100*1.5=150, 250) = 250
  });

  test('null bp_min_days treated as 0 — does not break threshold computation', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '2.0', bp_min_days: null };
    mockBP([BP_ROW]);
    const [item] = await evaluateDefinition(def);
    // parseInt(null) || 0 = 0, max(200, 0) = 200
    expect(item.threshold).toBe(200);
    expect(Number.isNaN(item.threshold)).toBe(false);
  });

  test('context includes avg interval and job count', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '1.5', bp_min_days: '0' };
    mockBP([BP_ROW]);
    const [item] = await evaluateDefinition(def);
    expect(item.context).toContain('100d');
    expect(item.context).toContain('5 visitas');
  });

  test('entity_id and client_id both point to the client', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '1.5', bp_min_days: '0' };
    mockBP([BP_ROW]);
    const [item] = await evaluateDefinition(def);
    expect(item.entity_id).toBe('cid1');
    expect(item.client_id).toBe('cid1');
    expect(item.action_route).toBe('/clientes/cid1');
  });

  test('returns empty array when evaluator returns no rows', async () => {
    const def = { id: 'def1', alert_type: 'broken_pattern', bp_multiplier: '1.5', bp_min_days: '0' };
    mockBP([]);
    const items = await evaluateDefinition(def);
    expect(items).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateDefinition — unknown type
// ─────────────────────────────────────────────────────────────────────────────

test('evaluateDefinition throws for unknown alert_type', async () => {
  const def = { id: 'def1', alert_type: 'nonexistent' };
  await expect(evaluateDefinition(def)).rejects.toThrow('desconocido');
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAndPersist
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAndPersist', () => {
  const DEF = { id: 'def1', alert_type: 'overdue_service', catalog_item_id: 'item1', threshold_days: 100 };

  test('returns items and updates metadata with critical+high count', async () => {
    // Call 1: evalOverdueService SQL (returns 1 critical row: 200d / 100d threshold)
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...BASE_VEHICLE_ROW, days_since_service: '200', last_service_date: '2025-01-01' }] })
      .mockResolvedValueOnce({ rows: [] })  // dismissals
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const { items, error } = await evaluateAndPersist(DEF);

    expect(error).toBeNull();
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('critical');

    const updateArgs = pool.query.mock.calls[2];
    expect(updateArgs[0]).toContain('UPDATE alert_definitions');
    expect(updateArgs[0]).toContain('last_results');
    expect(updateArgs[1][0]).toBe(1); // 1 critical item counted
    // Params: [criticalHigh, JSON.stringify(rawItems), defId]
    expect(updateArgs[1][2]).toBe('def1');
    expect(JSON.parse(updateArgs[1][1])).toHaveLength(1);
  });

  test('counts only critical + high items in metadata', async () => {
    // Two rows: 200d (critical) + 110d (low)
    pool.query
      .mockResolvedValueOnce({
        rows: [
          { ...BASE_VEHICLE_ROW, vehicle_id: 'vid1', days_since_service: '200', last_service_date: '2025-01-01' },
          { ...BASE_VEHICLE_ROW, vehicle_id: 'vid2', days_since_service: '110', last_service_date: '2025-01-01' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { items } = await evaluateAndPersist(DEF);
    expect(items).toHaveLength(2);

    const updateArgs = pool.query.mock.calls[2][1];
    expect(updateArgs[0]).toBe(1); // only the critical one, low doesn't count
  });

  test('stores error message when evaluator throws, returns empty items', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce({ rows: [] }); // UPDATE for error path

    const { items, error } = await evaluateAndPersist(DEF);

    expect(items).toHaveLength(0);
    expect(error).toBe('DB connection lost');

    const updateArgs = pool.query.mock.calls[1];
    expect(updateArgs[0]).toContain('last_run_error');
    expect(updateArgs[1][0]).toBe('DB connection lost');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feed endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('feed endpoint', () => {
  const DEF = {
    id: 'def1', alert_type: 'overdue_service', catalog_item_id: 'item1',
    threshold_days: 100, enabled: true, created_at: new Date(),
    last_results: [], last_run_error: null,
  };

  // Sprint 1 / HU-04: el feed ya no evalúa en tiempo real, lee de
  // alert_definitions.last_results (cacheado por el runner).

  test('reads items from def.last_results and filters dismissals', async () => {
    const { req, res, next } = ctx();
    const cached = [{
      alert_type: 'overdue_service', entity_type: 'vehicle',
      entity_id: 'vid1', severity: 'critical',
    }];
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...DEF, last_results: cached }] })
      .mockResolvedValueOnce({ rows: [] }); // dismissals query (items > 0)

    await feed(req, res, next);

    const blocks = res.json.mock.calls[0][0];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].items).toHaveLength(1);
    expect(blocks[0].items[0].definition_id).toBe('def1');
    expect(blocks[0].error).toBeNull();
  });

  test('returns empty items when cache is empty (no dismissals query)', async () => {
    const { req, res, next } = ctx();
    pool.query.mockResolvedValueOnce({ rows: [DEF] });

    await feed(req, res, next);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ definition: DEF, items: [], error: null }),
    ]);
    // Solo se hizo la query de SELECT definitions; sin items no se consulta dismissals.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('block surfaces last_run_error from the runner', async () => {
    const { req, res, next } = ctx();
    const defWithError = { ...DEF, last_run_error: 'DB timeout en último tick' };
    pool.query.mockResolvedValueOnce({ rows: [defWithError] });

    await feed(req, res, next);

    const [block] = res.json.mock.calls[0][0];
    expect(block.error).toBe('DB timeout en último tick');
    expect(block.items).toHaveLength(0);
  });

  test('hides items whose (entity_id, entity_type) is dismissed', async () => {
    const { req, res, next } = ctx();
    const cached = [
      { entity_type: 'vehicle', entity_id: 'vid1' },
      { entity_type: 'vehicle', entity_id: 'vid2' },
    ];
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...DEF, last_results: cached }] })
      .mockResolvedValueOnce({ rows: [{ entity_id: 'vid1', entity_type: 'vehicle' }] });

    await feed(req, res, next);

    const [block] = res.json.mock.calls[0][0];
    expect(block.items).toHaveLength(1);
    expect(block.items[0].entity_id).toBe('vid2');
  });

  test('returns empty array when no definitions exist', async () => {
    const { req, res, next } = ctx();
    pool.query.mockResolvedValueOnce({ rows: [] });

    await feed(req, res, next);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test('calls next(err) on query failure for definitions fetch', async () => {
    const { req, res, next } = ctx();
    const err = new Error('pool down');
    pool.query.mockRejectedValueOnce(err);

    await feed(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dismiss endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('dismiss endpoint', () => {
  const VALID = { definition_id: UUID1, entity_id: UUID2, snooze_days: 30 };

  test('returns 400 for non-UUID definition_id', async () => {
    const { req, res, next } = ctx({ ...VALID, definition_id: 'not-a-uuid' });
    await dismiss(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('returns 400 for non-UUID entity_id', async () => {
    const { req, res, next } = ctx({ ...VALID, entity_id: 'bad' });
    await dismiss(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for snooze_days = 0', async () => {
    const { req, res, next } = ctx({ ...VALID, snooze_days: 0 });
    await dismiss(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for snooze_days > 365', async () => {
    const { req, res, next } = ctx({ ...VALID, snooze_days: 366 });
    await dismiss(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for missing definition_id', async () => {
    const { req, res, next } = ctx({ entity_id: UUID2, snooze_days: 30 });
    await dismiss(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('upserts dismissal record on valid input', async () => {
    const { req, res, next } = ctx(VALID);
    pool.query.mockResolvedValueOnce({ rows: [] });

    await dismiss(req, res, next);

    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO alert_dismissals');
    expect(pool.query.mock.calls[0][1]).toContain(UUID1);
    expect(pool.query.mock.calls[0][1]).toContain(UUID2);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// badge endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('badge endpoint', () => {
  test('returns critical_high_count from SUM of last_result_count', async () => {
    const { req, res, next } = ctx();
    pool.query.mockResolvedValueOnce({
      rows: [{ count: 7, last_runner_tick: '2025-01-01T00:00:00Z' }],
    });

    await badge(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      critical_high_count: 7,
      last_runner_tick: '2025-01-01T00:00:00Z',
    });
  });

  test('returns 0 when no definitions exist', async () => {
    const { req, res, next } = ctx();
    pool.query.mockResolvedValueOnce({ rows: [{ count: 0, last_runner_tick: null }] });

    await badge(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ critical_high_count: 0, last_runner_tick: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAll endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAll endpoint', () => {
  test('runs evaluateAndPersist for every enabled definition', async () => {
    const { req, res, next } = ctx();
    const DEF_A = { id: 'def1', alert_type: 'overdue_service', catalog_item_id: 'i1', threshold_days: 90 };
    const DEF_B = { id: 'def2', alert_type: 'lost_customer', threshold_days: 180 };

    // SELECT all enabled definitions
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });

    // For DEF_A: evalOverdueService + dismissals + UPDATE
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // eval
      .mockResolvedValueOnce({ rows: [] }) // dismissals
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    // For DEF_B: evalLostCustomer + dismissals + UPDATE
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // eval
      .mockResolvedValueOnce({ rows: [] }) // dismissals
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    await evaluateAll(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true, evaluated: 2 });
  });
});
