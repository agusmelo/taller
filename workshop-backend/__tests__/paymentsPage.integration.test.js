// Integration tests for the payments-page aggregations (summary, balances,
// aging, debtors, recent payments) against a real Postgres DB.
//
// These exercise the SQL grouping/bucketing/joins. Most scenarios use jobs
// without IVA/discount, where the page's subtotal-based math is exact. One
// test documents a KNOWN divergence: the payments page computes balances from
// the pre-tax subtotal, so for taxed/discounted jobs its numbers do not match
// the IVA-inclusive totals shown on the job detail (calcFinancials).
//
// Skips itself when Postgres is unreachable. See __tests__/helpers/db.js.

const db = require('./helpers/db');
const jobs = require('../src/controllers/jobsController');
const paymentsPage = require('../src/controllers/paymentsPageController');

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
  client = await db.createClient('Cliente Resumen');
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

async function pay(jobId, body) {
  const res = await db.callController(jobs.addPayment, { user, params: { id: jobId }, body });
  expect(res.statusCode).toBe(201);
  return res.body;
}

async function setJobDate(jobId, daysAgo) {
  await db.pool.query(`UPDATE jobs SET job_date = CURRENT_DATE - ($1 || ' days')::interval WHERE id = $2`, [daysAgo, jobId]);
}

describe('paymentsSummary', () => {
  test('aggregates collected, pending, debtors and by-method', withDb(async () => {
    const jobA = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, { amount: 400, method: 'efectivo' });   // balance 600, still open

    const jobB = await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 500 }] });
    await pay(jobB.id, { amount: 500, method: 'transferencia' }); // fully paid -> pagado

    const res = await db.callController(paymentsPage.paymentsSummary, { user });
    expect(res.statusCode).toBe(200);
    const s = res.body;

    expect(s.cobrado_month).toBe(900);     // 400 + 500
    expect(s.pendiente_total).toBe(600);   // only jobA still owes
    expect(s.deudores_count).toBe(1);

    const byMethod = Object.fromEntries(s.by_method.map(m => [m.method, m]));
    expect(byMethod.efectivo).toMatchObject({ total: 400, count: 1 });
    expect(byMethod.transferencia).toMatchObject({ total: 500, count: 1 });
  }));

  test('pending total is zero when every job is fully paid', withDb(async () => {
    const job = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 1000, method: 'efectivo' });

    const res = await db.callController(paymentsPage.paymentsSummary, { user });
    expect(res.body.pendiente_total).toBe(0);
    expect(res.body.deudores_count).toBe(0);
    expect(res.body.cobrado_month).toBe(1000);
  }));
});

describe('jobsWithBalances', () => {
  test('returns per-job totals, paid and balance', withDb(async () => {
    const job = await createJob({ items: [{ description: 'A', quantity: 2, unit_price: 500 }] });
    await pay(job.id, { amount: 300, method: 'efectivo' });

    const res = await db.callController(paymentsPage.jobsWithBalances, { user, query: {} });
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    const row = res.body.data[0];
    expect(row.total).toBe(1000);
    expect(row.total_paid).toBe(300);
    expect(row.balance).toBe(700);
  }));

  test('filters by status', withDb(async () => {
    const open = await createJob({ items: [{ description: 'open', quantity: 1, unit_price: 1000 }] });
    await pay(open.id, { amount: 100, method: 'efectivo' });
    const paid = await createJob({ items: [{ description: 'paid', quantity: 1, unit_price: 500 }] });
    await pay(paid.id, { amount: 500, method: 'efectivo' }); // -> pagado

    const res = await db.callController(paymentsPage.jobsWithBalances, { user, query: { status: 'abierto' } });
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].id).toBe(open.id);
  }));

  test('respects pagination limit while reporting the full count', withDb(async () => {
    await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 100 }] });
    await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 200 }] });

    const res = await db.callController(paymentsPage.jobsWithBalances, { user, query: { limit: 1, page: 1 } });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(2);
  }));
});

describe('recentPayments', () => {
  test('returns recorded payments with numeric amounts', withDb(async () => {
    const job = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 300, method: 'efectivo' });
    await pay(job.id, { amount: 200, method: 'cheque' });

    const res = await db.callController(paymentsPage.recentPayments, { user, query: {} });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every(p => typeof p.amount === 'number')).toBe(true);
    expect(res.body.reduce((s, p) => s + p.amount, 0)).toBe(500);
  }));
});

describe('agingReport', () => {
  test('places an unpaid job in the correct age bucket', withDb(async () => {
    const job = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await setJobDate(job.id, 45); // 31-60 bucket

    const res = await db.callController(paymentsPage.agingReport, { user });
    expect(res.statusCode).toBe(200);
    expect(res.body['31-60']).toMatchObject({ job_count: 1, total_balance: 1000, client_count: 1 });
    expect(res.body['0-30']).toMatchObject({ job_count: 0, total_balance: 0 });
  }));

  test('excludes fully paid jobs from aging', withDb(async () => {
    const job = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 1000, method: 'efectivo' }); // pagado
    await setJobDate(job.id, 45);

    const res = await db.callController(paymentsPage.agingReport, { user });
    for (const bucket of ['0-30', '31-60', '61-90', '90+']) {
      expect(res.body[bucket]).toMatchObject({ job_count: 0, total_balance: 0 });
    }
  }));
});

describe('debtors', () => {
  test('aggregates outstanding balance per client', withDb(async () => {
    const jobA = await createJob({ items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, { amount: 200, method: 'efectivo' }); // balance 800
    await setJobDate(jobA.id, 20);
    const jobB = await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 300 }] });
    await setJobDate(jobB.id, 5); // unpaid, balance 300

    const res = await db.callController(paymentsPage.debtors, { user });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    const d = res.body[0];
    expect(d.id).toBe(client.id);
    expect(d.total_debt).toBe(1100); // 800 + 300
    expect(d.unpaid_jobs).toBe(2);
  }));
});

describe('payments-page totals include IVA and discount (match job detail)', () => {
  // The payments page must agree with the job detail (calcFinancials), which is
  // the source of truth and includes IVA + discount.
  test('a fully-paid taxed job shows total = job total and balance 0', withDb(async () => {
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 1220, method: 'efectivo' }); // full IVA-inclusive total

    const detail = await db.callController(jobs.getOne, { user, params: { id: job.id } });
    expect(detail.body.financials.total).toBe(1220);
    expect(detail.body.financials.balance).toBe(0);

    const res = await db.callController(paymentsPage.jobsWithBalances, { user, query: {} });
    const row = res.body.data.find(r => r.id === job.id);
    expect(row.total).toBe(1220);
    expect(row.total).toBe(detail.body.financials.total);
    expect(row.balance).toBe(0);
  }));

  test('a partially-paid discounted+taxed job reports the IVA-inclusive balance', withDb(async () => {
    const job = await createJob({
      tax_enabled: true,
      discount_amount: 200,
      discount_type: 'fixed',
      items: [{ description: 'A', quantity: 1, unit_price: 1000 }],
    });
    // total = (1000 - 200) * 1.22 = 976
    await pay(job.id, { amount: 476, method: 'efectivo' });

    const detail = await db.callController(jobs.getOne, { user, params: { id: job.id } });
    expect(detail.body.financials.total).toBe(976);
    expect(detail.body.financials.balance).toBe(500);

    const res = await db.callController(paymentsPage.jobsWithBalances, { user, query: {} });
    const row = res.body.data.find(r => r.id === job.id);
    expect(row.total).toBe(976);
    expect(row.balance).toBe(500);
  }));

  test('pending total and aging use IVA-inclusive balances', withDb(async () => {
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 220, method: 'efectivo' }); // balance 1000 (total 1220 - 220)
    await setJobDate(job.id, 45);

    const summary = await db.callController(paymentsPage.paymentsSummary, { user });
    expect(summary.body.pendiente_total).toBe(1000);

    const aging = await db.callController(paymentsPage.agingReport, { user });
    expect(aging.body['31-60']).toMatchObject({ job_count: 1, total_balance: 1000 });
  }));
});
