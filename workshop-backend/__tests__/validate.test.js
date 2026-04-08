const express = require('express');
const request = require('supertest');

// We need supertest for testing express-validator middleware
let app;

beforeAll(async () => {
  try {
    require('supertest');
  } catch {
    // supertest may not be installed yet, skip these tests
    return;
  }
});

// Only run if supertest is available
const supertest = (() => {
  try { return require('supertest'); } catch { return null; }
})();

const conditionalDescribe = supertest ? describe : describe.skip;

conditionalDescribe('Validation middleware', () => {
  const v = require('../src/middlewares/validate');

  function createApp(path, rules, handler) {
    const a = express();
    a.use(express.json());
    a.post(path, ...rules, handler || ((req, res) => res.json({ ok: true })));
    return a;
  }

  describe('loginRules', () => {
    const app = createApp('/login', v.loginRules);

    test('accepts valid login data', async () => {
      const res = await supertest(app).post('/login').send({ username: 'admin', password: 'pass123' });
      expect(res.status).toBe(200);
    });

    test('rejects missing username', async () => {
      const res = await supertest(app).post('/login').send({ password: 'pass123' });
      expect(res.status).toBe(422);
      expect(res.body.detalles).toBeDefined();
    });

    test('rejects missing password', async () => {
      const res = await supertest(app).post('/login').send({ username: 'admin' });
      expect(res.status).toBe(422);
    });
  });

  describe('createClientRules', () => {
    const app = createApp('/client', v.createClientRules);

    test('accepts valid client', async () => {
      const res = await supertest(app).post('/client').send({ full_name: 'Test Client', type: 'individual' });
      expect(res.status).toBe(200);
    });

    test('rejects missing full_name', async () => {
      const res = await supertest(app).post('/client').send({ type: 'individual' });
      expect(res.status).toBe(422);
      expect(res.body.detalles.some(d => d.campo === 'full_name')).toBe(true);
    });

    test('rejects invalid type', async () => {
      const res = await supertest(app).post('/client').send({ full_name: 'Test', type: 'otro' });
      expect(res.status).toBe(422);
    });

    test('rejects invalid email', async () => {
      const res = await supertest(app).post('/client').send({ full_name: 'Test', email: 'not-an-email' });
      expect(res.status).toBe(422);
    });

    test('allows empty email', async () => {
      const res = await supertest(app).post('/client').send({ full_name: 'Test', email: '' });
      expect(res.status).toBe(200);
    });
  });

  describe('createUserRules', () => {
    const app = createApp('/user', v.createUserRules);

    test('rejects short username', async () => {
      const res = await supertest(app).post('/user').send({ username: 'ab', password: 'pass123', full_name: 'Test' });
      expect(res.status).toBe(422);
    });

    test('rejects short password', async () => {
      const res = await supertest(app).post('/user').send({ username: 'admin', password: '12', full_name: 'Test' });
      expect(res.status).toBe(422);
    });

    test('rejects invalid role', async () => {
      const res = await supertest(app).post('/user').send({ username: 'admin', password: 'pass123', full_name: 'Test', role: 'superadmin' });
      expect(res.status).toBe(422);
    });
  });

  describe('addPaymentRules', () => {
    const app = createApp('/jobs/:id/payments', v.addPaymentRules);

    test('rejects zero amount', async () => {
      const res = await supertest(app).post('/jobs/550e8400-e29b-41d4-a716-446655440000/payments').send({ amount: 0 });
      expect(res.status).toBe(422);
    });

    test('rejects negative amount', async () => {
      const res = await supertest(app).post('/jobs/550e8400-e29b-41d4-a716-446655440000/payments').send({ amount: -100 });
      expect(res.status).toBe(422);
    });

    test('rejects invalid payment method', async () => {
      const res = await supertest(app).post('/jobs/550e8400-e29b-41d4-a716-446655440000/payments').send({ amount: 100, method: 'bitcoin' });
      expect(res.status).toBe(422);
    });
  });
});
