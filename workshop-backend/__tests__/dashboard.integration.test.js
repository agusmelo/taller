// Integration tests for the dashboard financial aggregations against a real
// Postgres DB. These verify the dashboard reports IVA- and discount-inclusive
// totals/balances consistent with the job detail (calcFinancials).
//
// Skips itself when Postgres is unreachable. See __tests__/helpers/db.js.

const db = require('./helpers/db');
const jobs = require('../src/controllers/jobsController');
const dashboard = require('../src/controllers/dashboardController');

let dbUp = false;
let userId, user, client, vehicle;

beforeAll(async () => {
  dbUp = await db.dbReachable();
  if (dbUp) await db.ensureSchema();
});

afterAll(async () => {
  await db.pool.end();
});

beforeEach(async () => {
  if (!dbUp) return;
  userId = await db.reset();
  user = { id: userId, role: 'admin' };
  client = await db.createClient('Cliente Dashboard');
  vehicle = await db.createVehicle(client.id);
});

function withDb(fn) {
  return async () => {
    if (!dbUp) {
      console.warn('[skip] Postgres unreachable — integration test skipped');
      return;
    }
    await fn();
  };
}

async function createJob({ tax_enabled = false, discount_amount = 0, discount_type = 'fixed', items = [] } = {}) {
  const res = await db.callController(jobs.create, {
    user,
    body: { client_id: client.id, vehicle_id: vehicle.id, tax_enabled, tax_rate: 0.22, discount_amount, discount_type, items },
  });
  expect(res.statusCode).toBe(201);
  return res.body;
}

async function pay(jobId, amount, method = 'efectivo') {
  const res = await db.callController(jobs.addPayment, { user, params: { id: jobId }, body: { amount, method } });
  expect(res.statusCode).toBe(201);
}

async function setJobDate(jobId, daysAgo) {
  await db.pool.query(`UPDATE jobs SET job_date = CURRENT_DATE - ($1 || ' days')::interval WHERE id = $2`, [daysAgo, jobId]);
}

async function setStatus(jobId, status) {
  await db.pool.query(`UPDATE jobs SET status = $1 WHERE id = $2`, [status, jobId]);
}

describe('dashboard summary', () => {
  test('facturado/cobrado/pendiente include IVA', withDb(async () => {
    const jobA = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, 220); // total 1220, balance 1000, still open

    const jobB = await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 500 }] });
    await pay(jobB.id, 500); // total 500, fully paid -> pagado

    const res = await db.callController(dashboard.summary, { user });
    expect(res.statusCode).toBe(200);
    const s = res.body;
    expect(s.facturado_month).toBe(1720); // 1220 + 500
    expect(s.cobrado_month).toBe(720);    // 220 + 500
    expect(s.pendiente_total).toBe(1000); // only jobA
    expect(s.jobs_month).toBe(2);
    expect(s.active_jobs).toBe(1);
    expect(s.collection_rate_month).toBe(41.86); // 720 / 1720
  }));
});

describe('dashboard clientFinancials', () => {
  test('total_facturado and saldo include IVA', withDb(async () => {
    const jobA = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, 220);
    const jobB = await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 500 }] });
    await pay(jobB.id, 500);

    const res = await db.callController(dashboard.clientFinancials, { user, query: {} });
    expect(res.statusCode).toBe(200);
    const row = res.body.clients.find(c => c.id === client.id);
    expect(row.total_facturado).toBe(1720);
    expect(row.total_pagado).toBe(720);
    expect(row.saldo).toBe(1000);
    expect(Number(row.job_count)).toBe(2);

    expect(res.body.totals.total_facturado).toBe(1720);
    expect(res.body.totals.total_pagado).toBe(720);
    expect(res.body.totals.total_pendiente).toBe(1000);
  }));
});

describe('dashboard unpaidJobs', () => {
  test('reports IVA-inclusive total and balance for overdue terminado jobs', withDb(async () => {
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, 220);        // balance 1000 on a 1220 total
    await setStatus(job.id, 'terminado');
    await setJobDate(job.id, 40);

    const res = await db.callController(dashboard.unpaidJobs, { user, query: {} });
    expect(res.statusCode).toBe(200);
    const row = res.body.find(r => r.id === job.id);
    expect(row.total).toBe(1220);
    expect(row.paid).toBe(220);
    expect(row.balance).toBe(1000);
    expect(row.days_pending).toBe(40);
  }));
});

describe('dashboard overdueDebts', () => {
  test('aggregates IVA-inclusive saldo per client', withDb(async () => {
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, 220); // balance 1000
    await setJobDate(job.id, 40);

    const res = await db.callController(dashboard.overdueDebts, { user, query: {} });
    expect(res.statusCode).toBe(200);
    const row = res.body.find(r => r.id === client.id);
    expect(row.saldo).toBe(1000);
    expect(row.job_count).toBe(1);
  }));
});

describe('dashboard monthlyClosing', () => {
  test('applies the real tax rate and discount, split by IVA flag', withDb(async () => {
    // Taxed + discounted: subtotal 1000, discount 200, taxBase 800, tax 176, total 976
    const jobA = await createJob({
      tax_enabled: true,
      discount_amount: 200,
      discount_type: 'fixed',
      items: [{ description: 'A', quantity: 1, unit_price: 1000 }],
    });
    await pay(jobA.id, 476); // balance 500

    // No IVA: subtotal 500, total 500
    await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 500 }] });

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    expect(res.statusCode).toBe(200);

    expect(res.body.all).toMatchObject({
      count: 2, subtotal: 1500, discount: 200, tax: 176, total: 1476, paid: 476, balance: 1000,
    });
    expect(res.body.iva).toMatchObject({
      count: 1, subtotal: 1000, discount: 200, tax: 176, total: 976, paid: 476, balance: 500,
    });
    expect(res.body.no_iva).toMatchObject({
      count: 1, subtotal: 500, discount: 0, tax: 0, total: 500, paid: 0, balance: 500,
    });
  }));

  test('does not hardcode 22%: respects a custom tax rate', withDb(async () => {
    // tax_rate 0.10 -> total 1100
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await db.pool.query(`UPDATE jobs SET tax_rate = 0.10 WHERE id = $1`, [job.id]);

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    const row = res.body.jobs.find(j => j.id === job.id);
    expect(row.tax).toBe(100);
    expect(row.total).toBe(1100);
  }));
});
