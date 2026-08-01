'use strict';

/**
 * Integration tests for the alerts HTTP layer.
 * Uses a minimal Express app (no server binding) + mocked DB pool.
 * Tests auth enforcement, routing, validation, and response shape.
 */

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV   = 'test';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const jwt    = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');

const pool   = require('../src/config/database');
const routes = require('../src/routes/index');
const errorHandler = require('../src/middlewares/errorHandler');

// Build a minimal test app that mirrors the production setup (no listen)
const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

// ─── Helpers ────────────────────────────────────────────────────────────────

function token(role = 'admin') {
  return `Bearer ${jwt.sign({ id: 'u1', role, full_name: 'Test User', username: 'test' }, 'test-secret')}`;
}

const UUID1 = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';

const DEF_ROW = {
  id: UUID1,
  alert_type: 'overdue_service',
  name: 'Aceite',
  enabled: true,
  catalog_item_id: UUID2,
  catalog_item_description: 'Cambio de aceite',
  threshold_days: 180,
  bp_multiplier: null,
  bp_min_days: null,
  eval_interval_hours: 4,
  last_evaluated_at: null,
  last_result_count: 0,
  last_run_error: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

beforeEach(() => pool.query.mockReset());

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/feed
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/alerts/feed', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/api/alerts/feed');
    expect(res.status).toBe(401);
  });

  test('403 for mecanico role', async () => {
    const res = await request(app)
      .get('/api/alerts/feed')
      .set('Authorization', token('mecanico'));
    expect(res.status).toBe(403);
  });

  test('200 for admin — returns array of blocks', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [DEF_ROW] }) // SELECT definitions
      .mockResolvedValueOnce({ rows: [] })          // eval query (overdue_service)
      .mockResolvedValueOnce({ rows: [] });         // dismissals

    const res = await request(app)
      .get('/api/alerts/feed')
      .set('Authorization', token('admin'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ definition: expect.objectContaining({ id: UUID1 }), items: [], error: null });
  });

  test('200 for recepcionista role', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }); // no definitions

    const res = await request(app)
      .get('/api/alerts/feed')
      .set('Authorization', token('recepcionista'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts/dismiss
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/alerts/dismiss', () => {
  test('401 without token', async () => {
    const res = await request(app).post('/api/alerts/dismiss').send({});
    expect(res.status).toBe(401);
  });

  test('403 for mecanico', async () => {
    const res = await request(app)
      .post('/api/alerts/dismiss')
      .set('Authorization', token('mecanico'))
      .send({ definition_id: UUID1, entity_id: UUID2, snooze_days: 30 });
    expect(res.status).toBe(403);
  });

  test('400 when definition_id is not a UUID', async () => {
    const res = await request(app)
      .post('/api/alerts/dismiss')
      .set('Authorization', token('admin'))
      .send({ definition_id: 'bad-id', entity_id: UUID2, snooze_days: 7 });
    expect(res.status).toBe(400);
  });

  test('400 when snooze_days is out of range', async () => {
    const res = await request(app)
      .post('/api/alerts/dismiss')
      .set('Authorization', token('admin'))
      .send({ definition_id: UUID1, entity_id: UUID2, snooze_days: 0 });
    expect(res.status).toBe(400);
  });

  test('200 on valid payload', async () => {
    // dismiss() first checks the definition exists and that entity_id is
    // present in its cached last_results (ownership check), then upserts.
    pool.query
      .mockResolvedValueOnce({ rows: [{ last_results: [{ entity_id: UUID2, entity_type: 'vehicle' }] }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/alerts/dismiss')
      .set('Authorization', token('admin'))
      .send({ definition_id: UUID1, entity_id: UUID2, snooze_days: 30 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: 'snoozed' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/badge
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/alerts/badge', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/api/alerts/badge');
    expect(res.status).toBe(401);
  });

  test('200 returns critical_high_count', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 3, last_runner_tick: null }] });
    const res = await request(app)
      .get('/api/alerts/badge')
      .set('Authorization', token('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ critical_high_count: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts/evaluate-all
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/alerts/evaluate-all', () => {
  test('401 without token', async () => {
    const res = await request(app).post('/api/alerts/evaluate-all');
    expect(res.status).toBe(401);
  });

  test('403 for mecanico', async () => {
    const res = await request(app)
      .post('/api/alerts/evaluate-all')
      .set('Authorization', token('mecanico'));
    expect(res.status).toBe(403);
  });

  test('200 for admin — returns evaluated count', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no definitions → evaluates 0
    const res = await request(app)
      .post('/api/alerts/evaluate-all')
      .set('Authorization', token('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, evaluated: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alert-definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/alert-definitions', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/api/alert-definitions');
    expect(res.status).toBe(401);
  });

  test('403 for recepcionista — admin-only route', async () => {
    const res = await request(app)
      .get('/api/alert-definitions')
      .set('Authorization', token('recepcionista'));
    expect(res.status).toBe(403);
  });

  test('200 for admin — returns definitions array', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] });
    const res = await request(app)
      .get('/api/alert-definitions')
      .set('Authorization', token('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([DEF_ROW]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alert-definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/alert-definitions', () => {
  test('401 without token', async () => {
    const res = await request(app).post('/api/alert-definitions').send({});
    expect(res.status).toBe(401);
  });

  test('422 when body is invalid (missing name)', async () => {
    const res = await request(app)
      .post('/api/alert-definitions')
      .set('Authorization', token('admin'))
      .send({ alert_type: 'lost_customer', threshold_days: 365 });
    expect(res.status).toBe(422);
  });

  test('422 when overdue_service missing catalog_item_id', async () => {
    const res = await request(app)
      .post('/api/alert-definitions')
      .set('Authorization', token('admin'))
      .send({ name: 'Test', alert_type: 'overdue_service', threshold_days: 90 });
    expect(res.status).toBe(422);
  });

  test('201 on valid overdue_service payload', async () => {
    pool.query.mockResolvedValueOnce({ rows: [DEF_ROW] });
    const res = await request(app)
      .post('/api/alert-definitions')
      .set('Authorization', token('admin'))
      .send({ name: 'Aceite', alert_type: 'overdue_service', catalog_item_id: UUID2, threshold_days: 180 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(UUID1);
  });

  test('409 on duplicate definition', async () => {
    const dbErr = new Error('duplicate key');
    dbErr.code = '23505';
    pool.query.mockRejectedValueOnce(dbErr);
    const res = await request(app)
      .post('/api/alert-definitions')
      .set('Authorization', token('admin'))
      .send({ name: 'Aceite', alert_type: 'overdue_service', catalog_item_id: UUID2, threshold_days: 180 });
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alert-definitions/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/alert-definitions/:id', () => {
  test('400 for non-UUID id', async () => {
    const res = await request(app)
      .patch('/api/alert-definitions/not-uuid')
      .set('Authorization', token('admin'))
      .send({ name: 'Updated' });
    expect(res.status).toBe(400);
  });

  test('404 when definition not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch(`/api/alert-definitions/${UUID1}`)
      .set('Authorization', token('admin'))
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('200 on valid update', async () => {
    const updated = { ...DEF_ROW, name: 'Updated' };
    pool.query
      .mockResolvedValueOnce({ rows: [DEF_ROW] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [updated] }); // UPDATE RETURNING
    const res = await request(app)
      .patch(`/api/alert-definitions/${UUID1}`)
      .set('Authorization', token('admin'))
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alert-definitions/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/alert-definitions/:id', () => {
  test('403 for recepcionista', async () => {
    const res = await request(app)
      .delete(`/api/alert-definitions/${UUID1}`)
      .set('Authorization', token('recepcionista'));
    expect(res.status).toBe(403);
  });

  test('404 when not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete(`/api/alert-definitions/${UUID1}`)
      .set('Authorization', token('admin'));
    expect(res.status).toBe(404);
  });

  test('200 on successful deletion', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID1 }] });
    const res = await request(app)
      .delete(`/api/alert-definitions/${UUID1}`)
      .set('Authorization', token('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alert-definitions/:id/evaluate
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/alert-definitions/:id/evaluate', () => {
  test('401 without token', async () => {
    const res = await request(app)
      .post(`/api/alert-definitions/${UUID1}/evaluate`);
    expect(res.status).toBe(401);
  });

  test('403 for mecanico — requireAdminOrRecep', async () => {
    const res = await request(app)
      .post(`/api/alert-definitions/${UUID1}/evaluate`)
      .set('Authorization', token('mecanico'));
    expect(res.status).toBe(403);
  });

  test('200 for recepcionista — allowed by requireAdminOrRecep', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [DEF_ROW] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [] })          // eval query (sin rows → skip dismissals)
      .mockResolvedValueOnce({ rows: [] })          // UPDATE (evaluateAndPersist)
      .mockResolvedValueOnce({ rows: [DEF_ROW] });  // SELECT after persist

    const res = await request(app)
      .post(`/api/alert-definitions/${UUID1}/evaluate`)
      .set('Authorization', token('recepcionista'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ definition: expect.objectContaining({ id: UUID1 }) });
  });

  test('404 when definition not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post(`/api/alert-definitions/${UUID1}/evaluate`)
      .set('Authorization', token('admin'));
    expect(res.status).toBe(404);
  });
});
