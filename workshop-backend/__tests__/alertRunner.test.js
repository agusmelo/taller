'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/controllers/alertsController', () => ({
  evaluateAndPersist: jest.fn().mockResolvedValue({ items: [], error: null }),
  evaluateDefinition: jest.fn().mockResolvedValue([]),
}));

const pool                   = require('../src/config/database');
const { evaluateAndPersist } = require('../src/controllers/alertsController');
const alertRunner            = require('../src/services/alertRunner');

beforeEach(() => jest.clearAllMocks());
afterEach(() => alertRunner.stop()); // always clean up timers

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
  });

  test('calls evaluateAndPersist once per due definition', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });
    await alertRunner.tick();
    expect(evaluateAndPersist).toHaveBeenCalledTimes(2);
    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF_A);
    expect(evaluateAndPersist).toHaveBeenCalledWith(DEF_B);
  });

  test('continues processing remaining definitions when one fails', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_A, DEF_B] });
    evaluateAndPersist
      .mockRejectedValueOnce(new Error('DB timeout')) // DEF_A fails
      .mockResolvedValueOnce({ items: [], error: null }); // DEF_B succeeds

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
    alertRunner.start(); // second call should be ignored

    // Advance past initial timeout (15s) + one interval (5 min)
    jest.advanceTimersByTime(15_000 + 5 * 60 * 1000 + 1000);

    // pool.query should have been called at most twice (15s tick + 1 interval tick),
    // not four times (which would happen if two intervals were running)
    expect(pool.query.mock.calls.length).toBeLessThanOrEqual(2);

    alertRunner.stop();
    jest.useRealTimers();
  });

  test('stop() cancels the recurring interval', () => {
    jest.useFakeTimers();
    pool.query.mockResolvedValue({ rows: [] });

    alertRunner.start();
    alertRunner.stop();

    // Advance well past one interval period
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // The interval should not have fired (initial setTimeout may still fire)
    const intervalCallCount = pool.query.mock.calls.length;
    jest.advanceTimersByTime(5 * 60 * 1000);
    // No additional calls after stop
    expect(pool.query.mock.calls.length).toBe(intervalCallCount);

    jest.useRealTimers();
  });
});
