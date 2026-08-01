'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';
process.env.ALERTS_RUNNER_JITTER_MS = '0'; // deterministic delay para timers

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
jest.mock('../src/controllers/alertsController', () => ({
  evaluateAndPersist: jest.fn().mockResolvedValue({ items: [], error: null }),
  evaluateDefinition: jest.fn().mockResolvedValue([]),
}));

const pool                   = require('../src/config/database');
const client                 = pool.__client;
const { evaluateAndPersist } = require('../src/controllers/alertsController');
const alertRunner            = require('../src/services/alertRunner');

// Helper: setea el lock client para devolver "locked: true" por default
function mockLockAcquired() {
  client.query.mockImplementation(async (sql) => {
    if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return {};
    if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ locked: true }] };
    return { rows: [] };
  });
}

function mockLockRejected() {
  client.query.mockImplementation(async (sql) => {
    if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return {};
    if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ locked: false }] };
    return { rows: [] };
  });
}

beforeEach(() => {
  pool.query.mockReset();
  client.query.mockReset();
  client.release.mockReset();
  evaluateAndPersist.mockReset().mockResolvedValue({ items: [], error: null });
});
afterEach(() => alertRunner.stop());

// ─────────────────────────────────────────────────────────────────────────────
// tick — due definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('tick()', () => {
  const DEF_A = { id: 'def1', alert_type: 'overdue_service', threshold_days: 90 };
  const DEF_B = { id: 'def2', alert_type: 'lost_customer',   threshold_days: 180 };

  test('does nothing when no definitions are due', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await alertRunner.tick();
    expect(evaluateAndPersist).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('calls evaluateAndPersist once per due definition (with lock acquired)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });
    mockLockAcquired();

    await alertRunner.tick();

    expect(evaluateAndPersist).toHaveBeenCalledTimes(2);
    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF_A);
    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF_B);
    // Cada eval abre y libera su propia conexión.
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  test('skips definitions where pg_try_advisory_xact_lock returns false', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });
    mockLockRejected();

    await alertRunner.tick();

    expect(evaluateAndPersist).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  test('continues processing remaining definitions when one fails', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });
    mockLockAcquired();
    evaluateAndPersist
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({ items: [], error: null });

    await expect(alertRunner.tick()).resolves.not.toThrow();
    expect(evaluateAndPersist).toHaveBeenCalledTimes(2);
  });

  test('does not throw when the definitions query itself fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(alertRunner.tick()).resolves.not.toThrow();
    expect(evaluateAndPersist).not.toHaveBeenCalled();
  });

  test('passes the full definition object to evaluateAndPersist', async () => {
    const richDef = { ...DEF_A, catalog_item_id: 'item1', eval_interval_hours: 4 };
    pool.query.mockResolvedValueOnce({ rows: [richDef] });
    mockLockAcquired();

    await alertRunner.tick();
    expect(evaluateAndPersist).toHaveBeenCalledWith(richDef);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// start / stop lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('start() / stop()', () => {
  test('stop() is a no-op when not started', () => {
    expect(() => alertRunner.stop()).not.toThrow();
  });

  test('start() is idempotent — second call does not create a second interval', () => {
    jest.useFakeTimers();
    pool.query.mockResolvedValue({ rows: [] });

    alertRunner.start();
    alertRunner.start(); // segunda llamada debería ser ignorada

    jest.advanceTimersByTime(15_000 + 5 * 60 * 1000 + 1000);

    expect(pool.query.mock.calls.length).toBeLessThanOrEqual(2);

    alertRunner.stop();
    jest.useRealTimers();
  });

  test('stop() cancels the recurring interval', () => {
    jest.useFakeTimers();
    pool.query.mockResolvedValue({ rows: [] });

    alertRunner.start();
    alertRunner.stop();

    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    const intervalCallCount = pool.query.mock.calls.length;
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(pool.query.mock.calls.length).toBe(intervalCallCount);

    jest.useRealTimers();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateWithLock — HU-05
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateWithLock()', () => {
  const DEF = { id: 'def1', alert_type: 'overdue_service' };

  test('abre transacción, valida lock y commitea cuando se adquiere', async () => {
    mockLockAcquired();
    const result = await alertRunner.evaluateWithLock(DEF);
    expect(result.skipped).toBe(false);
    const sqls = client.query.mock.calls.map(c => c[0]);
    expect(sqls[0]).toMatch(/BEGIN/);
    expect(sqls[1]).toMatch(/pg_try_advisory_xact_lock/);
    expect(sqls[sqls.length - 1]).toMatch(/COMMIT/);
    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF);
  });

  test('rollbackea y skip cuando el lock está tomado por otra instancia', async () => {
    mockLockRejected();
    const result = await alertRunner.evaluateWithLock(DEF);
    expect(result.skipped).toBe(true);
    expect(evaluateAndPersist).not.toHaveBeenCalled();
    const sqls = client.query.mock.calls.map(c => c[0]);
    expect(sqls[sqls.length - 1]).toMatch(/ROLLBACK/);
  });

  test('libera la conexión incluso si evaluateAndPersist throws', async () => {
    mockLockAcquired();
    evaluateAndPersist.mockRejectedValueOnce(new Error('boom'));
    await expect(alertRunner.evaluateWithLock(DEF)).rejects.toThrow('boom');
    expect(client.release).toHaveBeenCalled();
  });
});
