// Integration tests for group-level item_type + group pricing mode, against a
// real Postgres DB. See spec/job-item-group-type-and-pricing.md and
// migrations/024_group_item_type_and_pricing_mode.sql.
//
// Two invariants are under test:
//   1. item_type and pricing_mode are properties of the GROUP (the root row).
//      Children never carry them — enforced by CHECK constraints, not just by
//      controller convention (migration 007's comment said the same thing for
//      four migrations while the code drifted away from it).
//   2. A group's line total follows its pricing_mode: 'detallado' sums the
//      children, 'agregado' uses the root's own quantity * unit_price. The SQL
//      aggregation (utils/financials.js) and the JS one (calcFinancials) must
//      agree on every case.
//
// Skips itself (as passing no-ops) when Postgres is unreachable so the unit
// suite still runs in DB-less environments. See __tests__/helpers/db.js.

const db = require('./helpers/db');
const jobs = require('../src/controllers/jobsController');

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
  client = await db.createClient('Cliente Grupos');
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

async function createJob(items = []) {
  const res = await db.callController(jobs.create, {
    user,
    body: { client_id: client.id, vehicle_id: vehicle.id, tax_enabled: false, items },
  });
  expect(res.statusCode).toBe(201);
  return res.body;
}

async function getJob(jobId) {
  const res = await db.callController(jobs.getOne, { user, params: { id: jobId } });
  expect(res.statusCode).toBe(200);
  return res.body;
}

// The subtotal the SQL aggregation reports for this job (jobs.list uses the
// shared JOB_SUBTOTALS_SUBQUERY). Must always equal financials.subtotal, which
// comes from the JS calcFinancials.
async function sqlSubtotal(jobId) {
  const res = await db.callController(jobs.list, { user, query: {} });
  const row = res.body.data.find(j => j.id === jobId);
  return parseFloat(row.subtotal);
}

function rootOf(job, description) {
  return job.items.find(i => !i.parent_id && i.description === description);
}
function childrenOf(job, rootId) {
  return job.items.filter(i => i.parent_id === rootId);
}

describe('job_items: item_type and pricing_mode are group-level', () => {
  test('CHECK constraint rejects a child that carries item_type', withDb(async () => {
    const job = await createJob([
      { description: 'Servicio', item_type: 'mano_de_obra', children: [{ description: 'Detalle', unit_price: 100 }] },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Servicio');

    await expect(db.pool.query(
      `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, parent_id)
       VALUES ($1, 'Hijo tipado', 1, 50, 'repuesto', $2)`,
      [job.id, root.id]
    )).rejects.toThrow(/job_items_type_on_root_only/);
  }));

  test('CHECK constraint rejects a child that carries pricing_mode', withDb(async () => {
    const job = await createJob([
      { description: 'Servicio', item_type: 'mano_de_obra', children: [{ description: 'Detalle', unit_price: 100 }] },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Servicio');

    await expect(db.pool.query(
      `INSERT INTO job_items (job_id, description, quantity, unit_price, pricing_mode, parent_id)
       VALUES ($1, 'Hijo con modo', 1, 50, 'detallado', $2)`,
      [job.id, root.id]
    )).rejects.toThrow(/job_items_pricing_mode_on_root_only/);
  }));

  test('CHECK constraint rejects a root without item_type', withDb(async () => {
    const job = await createJob([]);
    await expect(db.pool.query(
      `INSERT INTO job_items (job_id, description, quantity, unit_price, pricing_mode)
       VALUES ($1, 'Sin tipo', 1, 50, 'detallado')`,
      [job.id]
    )).rejects.toThrow(/job_items_type_on_root_only/);
  }));

  test('create: children inherit nothing — item_type and pricing_mode are NULL', withDb(async () => {
    const job = await createJob([
      {
        description: 'Revision 10.000 km',
        item_type: 'repuesto',
        children: [
          { description: 'Filtro de aceite', unit_price: 300 },
          { description: 'Filtro de aire', unit_price: 200 },
        ],
      },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Revision 10.000 km');
    const kids = childrenOf(full, root.id);

    expect(root.item_type).toBe('repuesto');
    expect(root.pricing_mode).toBe('detallado');
    expect(kids).toHaveLength(2);
    for (const c of kids) {
      expect(c.item_type).toBeNull();
      expect(c.pricing_mode).toBeNull();
    }
  }));

  test('addItem discards an item_type sent for a child', withDb(async () => {
    const job = await createJob([
      { description: 'Grupo', item_type: 'mano_de_obra', children: [{ description: 'A', unit_price: 100 }] },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Grupo');

    // A stale client insisting on a per-child type must not be able to set one.
    const res = await db.callController(jobs.addItem, {
      user,
      params: { id: job.id },
      body: { description: 'B', unit_price: 50, item_type: 'repuesto', parent_id: root.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.item_type).toBeNull();
    expect(res.body.pricing_mode).toBeNull();
  }));

  test('updateItem rejects item_type on a child row', withDb(async () => {
    const job = await createJob([
      { description: 'Grupo', item_type: 'mano_de_obra', children: [{ description: 'A', unit_price: 100 }] },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Grupo');
    const child = childrenOf(full, root.id)[0];

    const res = await db.callController(jobs.updateItem, {
      user,
      params: { id: job.id, itemId: child.id },
      body: { item_type: 'repuesto' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/propiedad del grupo/);
  }));

  test('updateItem changes the whole group category from the root', withDb(async () => {
    const job = await createJob([
      { description: 'Grupo', item_type: 'otro', children: [{ description: 'A', unit_price: 100 }] },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Grupo');

    const res = await db.callController(jobs.updateItem, {
      user,
      params: { id: job.id, itemId: root.id },
      body: { item_type: 'mano_de_obra' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.item_type).toBe('mano_de_obra');
  }));
});

describe('job_items: pricing_mode drives the group line total', () => {
  test("'detallado' group sums its children (unchanged behavior)", withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo detallado',
        item_type: 'mano_de_obra',
        pricing_mode: 'detallado',
        unit_price: 9999, // ignored: the total comes from the children
        children: [
          { description: 'A', unit_price: 1500 },
          { description: 'B', unit_price: 800 },
        ],
      },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Grupo detallado');

    expect(parseFloat(root.unit_price)).toBe(0); // phantom price zeroed on write
    expect(full.financials.subtotal).toBe(2300);
    expect(await sqlSubtotal(job.id)).toBe(2300);
  }));

  test("'agregado' group uses the root price and ignores child prices", withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo agregado',
        item_type: 'repuesto',
        pricing_mode: 'agregado',
        quantity: 1,
        unit_price: 4500,
        children: [
          { description: 'Cambio de aceite', unit_price: 999 }, // dropped on write
          { description: 'Filtro de aire', unit_price: 888 },
        ],
      },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Grupo agregado');
    const kids = childrenOf(full, root.id);

    expect(root.pricing_mode).toBe('agregado');
    expect(parseFloat(root.unit_price)).toBe(4500);
    // Sub-item descriptions are kept; their prices are not tracked at all.
    expect(kids.map(c => c.description).sort()).toEqual(['Cambio de aceite', 'Filtro de aire']);
    for (const c of kids) expect(parseFloat(c.unit_price)).toBe(0);

    expect(full.financials.subtotal).toBe(4500);
    expect(await sqlSubtotal(job.id)).toBe(4500);
  }));

  test("'agregado' group honours quantity on the root", withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo por cantidad',
        item_type: 'otro',
        pricing_mode: 'agregado',
        quantity: 3,
        unit_price: 1000,
        children: [{ description: 'Detalle', unit_price: 0 }],
      },
    ]);
    const full = await getJob(job.id);
    expect(full.financials.subtotal).toBe(3000);
    expect(await sqlSubtotal(job.id)).toBe(3000);
  }));

  test('a stale child price can never leak into an aggregate total', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo agregado',
        item_type: 'otro',
        pricing_mode: 'agregado',
        unit_price: 1000,
        children: [{ description: 'Detalle', unit_price: 0 }],
      },
    ]);
    const full = await getJob(job.id);
    const root = rootOf(full, 'Grupo agregado');
    const child = childrenOf(full, root.id)[0];

    // Force a price onto the child behind the controllers' back. The subtotal
    // rule excludes it structurally, not because it happens to be zero.
    await db.pool.query(`UPDATE job_items SET unit_price = 7777 WHERE id = $1`, [child.id]);

    const after = await getJob(job.id);
    expect(after.financials.subtotal).toBe(1000);
    expect(await sqlSubtotal(job.id)).toBe(1000);
  }));

  test('mixed job: aggregate group + detailed group + simple item agree in SQL and JS', withDb(async () => {
    const job = await createJob([
      {
        description: 'Agregado', item_type: 'mano_de_obra', pricing_mode: 'agregado',
        quantity: 1, unit_price: 2000,
        children: [{ description: 'x' }, { description: 'y' }],
      },
      {
        description: 'Detallado', item_type: 'repuesto', pricing_mode: 'detallado',
        children: [{ description: 'p', unit_price: 300 }, { description: 'q', unit_price: 250 }],
      },
      { description: 'Simple', item_type: 'otro', quantity: 2, unit_price: 125 },
    ]);
    const full = await getJob(job.id);

    // 2000 + (300 + 250) + (2 * 125) = 2800
    expect(full.financials.subtotal).toBe(2800);
    expect(await sqlSubtotal(job.id)).toBe(2800);
  }));

  test('addItem with children[] respects agregado', withDb(async () => {
    const job = await createJob([]);
    const res = await db.callController(jobs.addItem, {
      user,
      params: { id: job.id },
      body: {
        description: 'Grupo nuevo', item_type: 'repuesto', pricing_mode: 'agregado',
        quantity: 1, unit_price: 1800,
        children: [{ description: 'A', unit_price: 500 }, { description: 'B', unit_price: 600 }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(parseFloat(res.body.unit_price)).toBe(1800);

    const full = await getJob(job.id);
    expect(full.financials.subtotal).toBe(1800);
    expect(await sqlSubtotal(job.id)).toBe(1800);
  }));

  test('adding a child to an agregado group preserves the group total', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo agregado', item_type: 'otro', pricing_mode: 'agregado',
        quantity: 1, unit_price: 3000,
        children: [{ description: 'A' }],
      },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Grupo agregado');

    const res = await db.callController(jobs.addItem, {
      user,
      params: { id: job.id },
      body: { description: 'B', unit_price: 400, parent_id: root.id },
    });
    expect(res.statusCode).toBe(201);
    expect(parseFloat(res.body.unit_price)).toBe(0); // child price not tracked

    full = await getJob(job.id);
    // The root's price is the group total and must survive the new child; a
    // 'detallado' parent would have been zeroed here instead.
    expect(parseFloat(rootOf(full, 'Grupo agregado').unit_price)).toBe(3000);
    expect(full.financials.subtotal).toBe(3000);
    expect(await sqlSubtotal(job.id)).toBe(3000);
  }));

  test('adding a child to a detallado simple item still zeroes its phantom price', withDb(async () => {
    const job = await createJob([
      { description: 'Item simple', item_type: 'mano_de_obra', quantity: 1, unit_price: 1200 },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Item simple');

    await db.callController(jobs.addItem, {
      user,
      params: { id: job.id },
      body: { description: 'Detalle', unit_price: 700, parent_id: root.id },
    });

    full = await getJob(job.id);
    expect(parseFloat(rootOf(full, 'Item simple').unit_price)).toBe(0);
    expect(full.financials.subtotal).toBe(700);
    expect(await sqlSubtotal(job.id)).toBe(700);
  }));
});

describe('job_items: switching a group between pricing modes', () => {
  test('detallado -> agregado drops child prices and applies the root price', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo', item_type: 'mano_de_obra', pricing_mode: 'detallado',
        children: [{ description: 'A', unit_price: 400 }, { description: 'B', unit_price: 350 }],
      },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Grupo');
    expect(full.financials.subtotal).toBe(750);

    const res = await db.callController(jobs.updateItem, {
      user,
      params: { id: job.id, itemId: root.id },
      body: { pricing_mode: 'agregado', quantity: 1, unit_price: 900 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.pricing_mode).toBe('agregado');

    full = await getJob(job.id);
    for (const c of childrenOf(full, root.id)) expect(parseFloat(c.unit_price)).toBe(0);
    expect(full.financials.subtotal).toBe(900);
    expect(await sqlSubtotal(job.id)).toBe(900);
  }));

  test('agregado -> detallado clears the root price so it cannot double-count', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo', item_type: 'otro', pricing_mode: 'agregado',
        quantity: 1, unit_price: 5000,
        children: [{ description: 'A' }, { description: 'B' }],
      },
    ]);
    let full = await getJob(job.id);
    const root = rootOf(full, 'Grupo');
    expect(full.financials.subtotal).toBe(5000);

    const res = await db.callController(jobs.updateItem, {
      user,
      params: { id: job.id, itemId: root.id },
      body: { pricing_mode: 'detallado' },
    });
    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.unit_price)).toBe(0);

    full = await getJob(job.id);
    // Children have no prices yet, so the group now contributes nothing — the
    // shop has to fill in the breakdown it just claimed to have.
    expect(full.financials.subtotal).toBe(0);
    expect(await sqlSubtotal(job.id)).toBe(0);
  }));
});

describe('job_items: closing a job with unpriced rows', () => {
  async function tryClose(jobId) {
    return db.callController(jobs.update, {
      user, params: { id: jobId }, body: { status: 'terminado' },
    });
  }

  test('an agregado group closes even though its children have no prices', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo agregado', item_type: 'otro', pricing_mode: 'agregado',
        quantity: 1, unit_price: 2500,
        children: [{ description: 'A' }, { description: 'B' }],
      },
    ]);
    const res = await tryClose(job.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('terminado');
  }));

  test('an agregado group with no price on the root is still blocked', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo agregado', item_type: 'otro', pricing_mode: 'agregado',
        quantity: 1, unit_price: 0,
        children: [{ description: 'A' }],
      },
    ]);
    const res = await tryClose(job.id);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/sin precio asignado/);
  }));

  test('a detallado group with an unpriced child is still blocked', withDb(async () => {
    const job = await createJob([
      {
        description: 'Grupo detallado', item_type: 'otro', pricing_mode: 'detallado',
        children: [{ description: 'A', unit_price: 100 }, { description: 'B', unit_price: 0 }],
      },
    ]);
    const res = await tryClose(job.id);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/1 item\(s\) sin precio asignado/);
  }));
});
