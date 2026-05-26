// Integration tests for the payment write-path against a real Postgres DB.
// Covers: recording payments, automatic close-on-fully-paid + lock, partial
// payments, overpayment, removal, and the cross-job credit validation.
//
// Skips itself (as passing no-ops) when Postgres is unreachable so the unit
// suite still runs in DB-less environments. See __tests__/helpers/db.js.

const db = require('./helpers/db');
const jobs = require('../src/controllers/jobsController');
const clients = require('../src/controllers/clientsController');

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
  client = await db.createClient('Cliente Pagos');
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

// Create a job through the controller and return its row.
async function createJob({ tax_enabled = false, tax_rate = 0.22, discount_amount = 0, discount_type = 'fixed', items = [] } = {}) {
  const res = await db.callController(jobs.create, {
    user,
    body: { client_id: client.id, vehicle_id: vehicle.id, tax_enabled, tax_rate, discount_amount, discount_type, items },
  });
  expect(res.statusCode).toBe(201);
  return res.body;
}

async function getJob(id) {
  const res = await db.callController(jobs.getOne, { user, params: { id } });
  expect(res.statusCode).toBe(200);
  return res.body;
}

async function pay(jobId, body) {
  return db.callController(jobs.addPayment, { user, params: { id: jobId }, body });
}

describe('addPayment + checkAndPay', () => {
  test('records a payment and reduces the balance', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    const res = await pay(job.id, { amount: 400, method: 'efectivo' });
    expect(res.statusCode).toBe(201);

    const detail = await getJob(job.id);
    expect(detail.financials.total).toBe(1000);
    expect(detail.financials.total_paid).toBe(400);
    expect(detail.financials.balance).toBe(600);
    expect(detail.status).toBe('abierto');
    expect(detail.is_locked).toBe(false);
  }));

  test('closes and locks the job when fully paid (including IVA)', withDb(async () => {
    const job = await createJob({ tax_enabled: true, tax_rate: 0.22, items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    // total = 1000 + 22% = 1220
    const res = await pay(job.id, { amount: 1220, method: 'transferencia' });
    expect(res.statusCode).toBe(201);

    const detail = await getJob(job.id);
    expect(detail.financials.total).toBe(1220);
    expect(detail.financials.balance).toBe(0);
    expect(detail.status).toBe('pagado');
    expect(detail.is_locked).toBe(true);
  }));

  test('does NOT close the job while a balance remains on a taxed job', withDb(async () => {
    const job = await createJob({ tax_enabled: true, tax_rate: 0.22, items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    // Paying only the pre-tax amount leaves 220 outstanding.
    await pay(job.id, { amount: 1000, method: 'efectivo' });

    const detail = await getJob(job.id);
    expect(detail.financials.balance).toBe(220);
    expect(detail.status).toBe('abierto');
  }));

  test('multiple partial payments sum up and close the job', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 600, method: 'efectivo' });
    let detail = await getJob(job.id);
    expect(detail.financials.balance).toBe(400);
    expect(detail.status).toBe('abierto');

    await pay(job.id, { amount: 400, method: 'efectivo' });
    detail = await getJob(job.id);
    expect(detail.financials.total_paid).toBe(1000);
    expect(detail.financials.balance).toBe(0);
    expect(detail.status).toBe('pagado');
  }));

  test('overpayment closes the job and yields a negative balance', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 1200, method: 'efectivo' });

    const detail = await getJob(job.id);
    expect(detail.financials.balance).toBe(-200);
    expect(detail.status).toBe('pagado');
  }));

  test('rejects a non-positive amount', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    const zero = await pay(job.id, { amount: 0 });
    expect(zero.statusCode).toBe(400);
    const neg = await pay(job.id, { amount: -50 });
    expect(neg.statusCode).toBe(400);

    const detail = await getJob(job.id);
    expect(detail.financials.total_paid).toBe(0);
  }));

  test('a discounted, taxed job closes at its exact computed total', withDb(async () => {
    const job = await createJob({
      tax_enabled: true,
      tax_rate: 0.22,
      discount_amount: 200,
      discount_type: 'fixed',
      items: [{ description: 'Item', quantity: 1, unit_price: 1000 }],
    });
    // (1000 - 200) * 1.22 = 976
    let detail = await getJob(job.id);
    expect(detail.financials.total).toBe(976);

    await pay(job.id, { amount: 976, method: 'efectivo' });
    detail = await getJob(job.id);
    expect(detail.financials.balance).toBe(0);
    expect(detail.status).toBe('pagado');
  }));
});

describe('listPayments / removePayment', () => {
  test('lists payments recorded for a job', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 300, method: 'efectivo' });
    await pay(job.id, { amount: 200, method: 'cheque' });

    const res = await db.callController(jobs.listPayments, { user, params: { id: job.id } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    const total = res.body.reduce((s, p) => s + parseFloat(p.amount), 0);
    expect(total).toBe(500);
  }));

  test('removing a payment recomputes the balance', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    await pay(job.id, { amount: 600, method: 'efectivo' });
    const second = await pay(job.id, { amount: 400, method: 'efectivo' });
    const paymentId = second.body.id;

    let detail = await getJob(job.id);
    expect(detail.financials.balance).toBe(0);

    const res = await db.callController(jobs.removePayment, { user, params: { id: job.id, paymentId } });
    expect(res.statusCode).toBe(204);

    detail = await getJob(job.id);
    expect(detail.financials.total_paid).toBe(600);
    expect(detail.financials.balance).toBe(400);
  }));
});

describe('hierarchical items round-trip through the DB', () => {
  test('parent-with-children total matches calcFinancials and closes correctly', withDb(async () => {
    const job = await createJob({
      tax_enabled: true,
      tax_rate: 0.22,
      items: [
        {
          description: 'Reparacion motor',
          item_type: 'mano_de_obra',
          children: [
            { description: 'Mano de obra', unit_price: 1500 },
            { description: 'Repuesto', unit_price: 500 },
          ],
        },
        { description: 'Item suelto', quantity: 2, unit_price: 300 },
      ],
    });
    // subtotal = (1500 + 500) + (2 * 300) = 2600; total = 2600 * 1.22 = 3172
    const detail = await getJob(job.id);
    expect(detail.financials.subtotal).toBe(2600);
    expect(detail.financials.total).toBe(3172);

    await pay(job.id, { amount: 3172, method: 'efectivo' });
    const after = await getJob(job.id);
    expect(after.financials.balance).toBe(0);
    expect(after.status).toBe('pagado');
  }));
});

describe('client credit validation (method = credito)', () => {
  test('rejects a credit payment when the client has no available credit', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Item', quantity: 1, unit_price: 1000 }] });
    const res = await pay(job.id, { amount: 100, method: 'credito' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/credito disponible/i);
  }));

  test('available credit comes from an overpaid job and is exposed via getCredit', withDb(async () => {
    const jobA = await createJob({ items: [{ description: 'Item A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, { amount: 1500, method: 'efectivo' }); // overpay by 500

    const credit = await db.callController(clients.getCredit, { user, params: { id: client.id } });
    expect(credit.statusCode).toBe(200);
    expect(credit.body.credit_available).toBe(500);
  }));

  test('accepts a credit payment within available credit and rejects above it', withDb(async () => {
    const jobA = await createJob({ items: [{ description: 'Item A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, { amount: 1500, method: 'efectivo' }); // 500 credit available

    const jobB = await createJob({ items: [{ description: 'Item B', quantity: 1, unit_price: 1000 }] });

    const tooMuch = await pay(jobB.id, { amount: 600, method: 'credito' });
    expect(tooMuch.statusCode).toBe(400);

    const ok = await pay(jobB.id, { amount: 500, method: 'credito' });
    expect(ok.statusCode).toBe(201);

    const detail = await getJob(jobB.id);
    expect(detail.financials.total_paid).toBe(500);
    expect(detail.financials.balance).toBe(500);
  }));

  test('credit from a taxed overpaid job reflects the IVA-inclusive total', withDb(async () => {
    // total = 1220; paying 1500 leaves 280 of credit.
    const jobA = await createJob({ tax_enabled: true, tax_rate: 0.22, items: [{ description: 'Item A', quantity: 1, unit_price: 1000 }] });
    await pay(jobA.id, { amount: 1500, method: 'efectivo' });

    const credit = await db.callController(clients.getCredit, { user, params: { id: client.id } });
    expect(credit.body.credit_available).toBe(280);
  }));
});
