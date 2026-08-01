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

async function pay(jobId, amount, method = 'efectivo', payment_date) {
  const body = payment_date ? { amount, method, payment_date } : { amount, method };
  const res = await db.callController(jobs.addPayment, { user, params: { id: jobId }, body });
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

// DATE columns come back from pg as Date objects (no custom type parser
// registered in this app) — normalize to YYYY-MM-DD for comparisons.
function dateOnly(d) { return new Date(d).toISOString().slice(0, 10); }

describe('dashboard monthlyClosing', () => {
  test('only includes fully-paid jobs, with correct math split by IVA flag', withDb(async () => {
    // Taxed + discounted: subtotal 1000, discount 200, taxBase 800, tax 176, total 976
    const jobA = await createJob({
      tax_enabled: true,
      discount_amount: 200,
      discount_type: 'fixed',
      items: [{ description: 'A', quantity: 1, unit_price: 1000 }],
    });
    await pay(jobA.id, 976); // fully paid -> pagado

    // No IVA: subtotal 500, total 500, fully paid
    const jobB = await createJob({ items: [{ description: 'B', quantity: 1, unit_price: 500 }] });
    await pay(jobB.id, 500);

    // Never paid — must be excluded regardless of job_date
    await createJob({ items: [{ description: 'C', quantity: 1, unit_price: 300 }] });

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    expect(res.statusCode).toBe(200);

    expect(res.body.all).toMatchObject({
      count: 2, subtotal: 1500, discount: 200, tax: 176, total: 1476, paid: 1476, balance: 0,
    });
    expect(res.body.iva).toMatchObject({
      count: 1, subtotal: 1000, discount: 200, tax: 176, total: 976, paid: 976, balance: 0,
    });
    expect(res.body.no_iva).toMatchObject({
      count: 1, subtotal: 500, discount: 0, tax: 0, total: 500, paid: 500, balance: 0,
    });
  }));

  test('does not hardcode 22%: respects a custom tax rate', withDb(async () => {
    // tax_rate 0.10 -> total 1100
    const job = await createJob({ tax_enabled: true, items: [{ description: 'A', quantity: 1, unit_price: 1000 }] });
    await db.pool.query(`UPDATE jobs SET tax_rate = 0.10 WHERE id = $1`, [job.id]);
    await pay(job.id, 1100); // fully paid -> pagado

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    const row = res.body.jobs.find(j => j.id === job.id);
    expect(row.tax).toBe(100);
    expect(row.total).toBe(1100);
  }));

  test('excludes abierto/terminado jobs regardless of job_date', withDb(async () => {
    const openJob = await createJob({ items: [{ description: 'Open', quantity: 1, unit_price: 200 }] });
    await pay(openJob.id, 100); // partial -> still abierto, balance 100

    const doneJob = await createJob({ items: [{ description: 'Done', quantity: 1, unit_price: 300 }] });
    await setStatus(doneJob.id, 'terminado');

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    const ids = res.body.jobs.map(j => j.id);
    expect(ids).not.toContain(openJob.id);
    expect(ids).not.toContain(doneJob.id);
  }));

  test('attributes a job to the month of its completing payment, not job_date or an earlier partial payment', withDb(async () => {
    // subtotal 100, no tax/discount -> total 100
    const job = await createJob({ items: [{ description: 'Split', quantity: 1, unit_price: 100 }] });
    await pay(job.id, 50, 'efectivo', '2026-05-15'); // partial, in May
    await pay(job.id, 50, 'efectivo', '2026-07-10'); // completes it, in July -> pagado

    const may = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2026-05' } });
    expect(may.body.jobs.map(j => j.id)).not.toContain(job.id);

    const july = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2026-07' } });
    const row = july.body.jobs.find(j => j.id === job.id);
    expect(row).toBeDefined();
    expect(row.total).toBe(100);
    expect(row.paid).toBe(100);
    expect(row.balance).toBe(0);
    expect(dateOnly(row.last_payment_date)).toBe('2026-07-10');
  }));

  test("attributes a job paid in full by a single payment to that payment's month", withDb(async () => {
    const job = await createJob({ items: [{ description: 'Single', quantity: 1, unit_price: 300 }] });
    await pay(job.id, 300, 'efectivo', '2026-06-20');

    const june = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2026-06' } });
    expect(june.body.jobs.map(j => j.id)).toContain(job.id);

    const july = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2026-07' } });
    expect(july.body.jobs.map(j => j.id)).not.toContain(job.id);
  }));
});

// ---------------------------------------------------------------------------
// Revenue breakdown by item_type. See spec/monthly-closing-by-item-type.md.
//
// Two invariants under test everywhere:
//   * subtotal_by_type sums to the job's / period's `subtotal` (gross split, an
//     exact regrouping of the same item line totals);
//   * total_by_type sums to the job's / period's `total` EXACTLY (discount and
//     IVA are job-level, so they are apportioned pro-rata by each type's share
//     of the subtotal, with the rounding residue forced onto the largest share).
//
// item_type is a group-level property since migration 024, so a group's WHOLE
// line total lands in exactly one bucket — the one on its root row.
// ---------------------------------------------------------------------------

const ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro'];
const round2 = (n) => Math.round(n * 100) / 100;
const sumTypes = (byType) => round2(ITEM_TYPES.reduce((s, t) => s + byType[t], 0));

// Both invariants at once, for a job row or for a period bucket.
function expectReconciles(bucket) {
  expect(Object.keys(bucket.subtotal_by_type).sort()).toEqual([...ITEM_TYPES].sort());
  expect(Object.keys(bucket.total_by_type).sort()).toEqual([...ITEM_TYPES].sort());
  expect(sumTypes(bucket.subtotal_by_type)).toBe(round2(bucket.subtotal));
  expect(sumTypes(bucket.total_by_type)).toBe(round2(bucket.total));
}

async function closingRow(jobId) {
  const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
  expect(res.statusCode).toBe(200);
  const row = res.body.jobs.find(j => j.id === jobId);
  expect(row).toBeDefined();
  return row;
}

describe('dashboard monthlyClosing — revenue by item_type', () => {
  test('splits a job with all three types, and both vectors reconcile', withDb(async () => {
    const job = await createJob({
      items: [
        { description: 'Mano de obra', item_type: 'mano_de_obra', quantity: 1, unit_price: 1000 },
        { description: 'Filtro', item_type: 'repuesto', quantity: 1, unit_price: 500 },
        { description: 'Insumos', item_type: 'otro', quantity: 1, unit_price: 300 },
      ],
    });
    await pay(job.id, 1800); // no tax, no discount -> total 1800

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(1800);
    expect(row.total).toBe(1800);
    // No discount and no IVA, so the apportioned split equals the gross split.
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 1000, repuesto: 500, otro: 300 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 1000, repuesto: 500, otro: 300 });
    expectReconciles(row);
  }));

  test("an 'agregado' group lands wholly in its root's bucket", withDb(async () => {
    const job = await createJob({
      items: [
        {
          description: 'Revision 20.000 km', item_type: 'repuesto', pricing_mode: 'agregado',
          quantity: 1, unit_price: 4500,
          children: [{ description: 'Cambio de aceite' }, { description: 'Filtro de aire' }],
        },
        { description: 'Diagnostico', item_type: 'mano_de_obra', quantity: 1, unit_price: 500 },
      ],
    });
    await pay(job.id, 5000);

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(5000);
    // The whole group total is on the root's type; its children add nothing.
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 500, repuesto: 4500, otro: 0 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 500, repuesto: 4500, otro: 0 });
    expectReconciles(row);
  }));

  test("a 'detallado' group's children land in the ROOT's bucket, not their own", withDb(async () => {
    const job = await createJob({
      items: [
        {
          description: 'Frenos delanteros', item_type: 'repuesto', pricing_mode: 'detallado',
          children: [{ description: 'Pastillas', unit_price: 1200 }, { description: 'Discos', unit_price: 800 }],
        },
        { description: 'Mano de obra', item_type: 'mano_de_obra', quantity: 1, unit_price: 500 },
      ],
    });
    await pay(job.id, 2500);

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(2500);
    // 1200 + 800 attributed to the group's type, even though the money is on
    // rows that carry no item_type of their own.
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 500, repuesto: 2000, otro: 0 });
    expectReconciles(row);
  }));

  test("a stale price forced onto an 'agregado' child changes no bucket", withDb(async () => {
    const job = await createJob({
      items: [{
        description: 'Paquete', item_type: 'otro', pricing_mode: 'agregado',
        quantity: 1, unit_price: 1000,
        children: [{ description: 'Detalle A' }, { description: 'Detalle B' }],
      }],
    });
    // Behind the controllers' back: the exclusion must be structural, not a
    // consequence of the row happening to hold 0.
    await db.pool.query(
      `UPDATE job_items SET unit_price = 999 WHERE job_id = $1 AND parent_id IS NOT NULL`, [job.id]);
    await pay(job.id, 1000);

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(1000);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 0, repuesto: 0, otro: 1000 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 0, repuesto: 0, otro: 1000 });
    expectReconciles(row);
  }));

  test('a FIXED discount is apportioned and the buckets sum to total exactly', withDb(async () => {
    // subtotal 300 (100 per type), fixed discount 200 -> total 100.
    // 100/3 = 33.3333 -> three parts of 33.33 sum to 99.99, so the +0.01
    // residue must land on the largest share (a 3-way tie -> mano_de_obra).
    const job = await createJob({
      discount_amount: 200, discount_type: 'fixed',
      items: [
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 100 },
        { description: 'RP', item_type: 'repuesto', quantity: 1, unit_price: 100 },
        { description: 'OT', item_type: 'otro', quantity: 1, unit_price: 100 },
      ],
    });
    await pay(job.id, 100);

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(300);
    expect(row.discount).toBe(200);
    expect(row.total).toBe(100);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 100, repuesto: 100, otro: 100 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 33.34, repuesto: 33.33, otro: 33.33 });
    expect(sumTypes(row.total_by_type)).toBe(100);
    expectReconciles(row);
  }));

  test('a PERCENTAGE discount plus IVA reconciles, negative residue included', withDb(async () => {
    // subtotal 300 (100 per type); discount 10.01% -> 30.03; taxBase 269.97;
    // tax 59.3934 -> 59.39; total round2(329.3634) = 329.36.
    // 329.36/3 = 109.7867 -> three parts of 109.79 sum to 329.37, so a -0.01
    // residue must come OFF the largest share (tie -> mano_de_obra).
    const job = await createJob({
      tax_enabled: true, discount_amount: 10.01, discount_type: 'percentage',
      items: [
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 100 },
        { description: 'RP', item_type: 'repuesto', quantity: 1, unit_price: 100 },
        { description: 'OT', item_type: 'otro', quantity: 1, unit_price: 100 },
      ],
    });
    await pay(job.id, 329.36);

    const row = await closingRow(job.id);
    expect(row.subtotal).toBe(300);
    expect(row.discount).toBe(30.03);
    expect(row.tax).toBe(59.39);
    expect(row.total).toBe(329.36);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 100, repuesto: 100, otro: 100 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 109.78, repuesto: 109.79, otro: 109.79 });
    expect(sumTypes(row.total_by_type)).toBe(329.36);
    expectReconciles(row);
  }));

  test('with tax_enabled = false, total_by_type is the post-discount split', withDb(async () => {
    // subtotal 1000 (800 MO / 200 RP), 10% discount -> total 900, no IVA.
    const job = await createJob({
      tax_enabled: false, discount_amount: 10, discount_type: 'percentage',
      items: [
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 800 },
        { description: 'RP', item_type: 'repuesto', quantity: 1, unit_price: 200 },
      ],
    });
    await pay(job.id, 900);

    const row = await closingRow(job.id);
    expect(row.tax).toBe(0);
    expect(row.total).toBe(900);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 800, repuesto: 200, otro: 0 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 720, repuesto: 180, otro: 0 });
    expectReconciles(row);
  }));

  test('with tax_enabled = true, IVA is included in total_by_type', withDb(async () => {
    // subtotal 1000 (800 MO / 200 RP), no discount, 22% -> total 1220.
    const job = await createJob({
      tax_enabled: true,
      items: [
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 800 },
        { description: 'RP', item_type: 'repuesto', quantity: 1, unit_price: 200 },
      ],
    });
    await pay(job.id, 1220);

    const row = await closingRow(job.id);
    expect(row.total).toBe(1220);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 800, repuesto: 200, otro: 0 });
    expect(row.total_by_type).toEqual({ mano_de_obra: 976, repuesto: 244, otro: 0 });
    expectReconciles(row);
  }));

  test('period buckets all/iva/no_iva reconcile with their own subtotal and total', withDb(async () => {
    // Taxed + fixed discount: subtotal 300, discount 200, taxBase 100, total 122.
    const taxed = await createJob({
      tax_enabled: true, discount_amount: 200, discount_type: 'fixed',
      items: [
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 100 },
        { description: 'RP', item_type: 'repuesto', quantity: 1, unit_price: 100 },
        { description: 'OT', item_type: 'otro', quantity: 1, unit_price: 100 },
      ],
    });
    await pay(taxed.id, 122);

    // Untaxed, with a detailed group so children are folded into their root.
    const untaxed = await createJob({
      items: [
        {
          description: 'Frenos', item_type: 'repuesto', pricing_mode: 'detallado',
          children: [{ description: 'Pastillas', unit_price: 700 }, { description: 'Discos', unit_price: 300 }],
        },
        { description: 'MO', item_type: 'mano_de_obra', quantity: 1, unit_price: 250 },
      ],
    });
    await pay(untaxed.id, 1250);

    const res = await db.callController(dashboard.monthlyClosing, { user, query: {} });
    expect(res.body.all.count).toBe(2);

    for (const bucket of [res.body.all, res.body.iva, res.body.no_iva]) expectReconciles(bucket);

    // iva/no_iva partition all, per type.
    for (const t of ITEM_TYPES) {
      expect(round2(res.body.iva.subtotal_by_type[t] + res.body.no_iva.subtotal_by_type[t]))
        .toBe(res.body.all.subtotal_by_type[t]);
      expect(round2(res.body.iva.total_by_type[t] + res.body.no_iva.total_by_type[t]))
        .toBe(res.body.all.total_by_type[t]);
    }

    expect(res.body.no_iva.subtotal_by_type).toEqual({ mano_de_obra: 250, repuesto: 1000, otro: 0 });
  }));

  test('an item with no item_type defaults to mano_de_obra, and an empty month is all zeros', withDb(async () => {
    const job = await createJob({ items: [{ description: 'Sin tipo', quantity: 1, unit_price: 400 }] });
    await pay(job.id, 400, 'efectivo', '2026-06-10');

    const june = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2026-06' } });
    const row = june.body.jobs.find(j => j.id === job.id);
    expect(row.subtotal_by_type).toEqual({ mano_de_obra: 400, repuesto: 0, otro: 0 });

    // A month with no closed jobs still returns fully-populated zero buckets, so
    // consumers never have to guard for a missing key.
    const empty = await db.callController(dashboard.monthlyClosing, { user, query: { month: '2020-01' } });
    expect(empty.body.all.count).toBe(0);
    expect(empty.body.all.subtotal_by_type).toEqual({ mano_de_obra: 0, repuesto: 0, otro: 0 });
    expect(empty.body.all.total_by_type).toEqual({ mano_de_obra: 0, repuesto: 0, otro: 0 });
    expect(empty.body.no_iva.total_by_type).toEqual({ mano_de_obra: 0, repuesto: 0, otro: 0 });
  }));
});
