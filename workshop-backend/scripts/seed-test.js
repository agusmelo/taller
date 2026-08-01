// Seeds a dedicated test database with a fixed, realistic dataset for manual
// QA of dashboard/monthly-closing/alerts features. Not for production or dev
// data — it TRUNCATEs the target database before writing.
//
// Usage: with db-test up (docker compose -f docker-compose.test.yml up -d db-test),
//   npm run seed:test
// Credentials come from ../.env.test — override any of them by exporting the
// env var yourself before running (exported vars win over the file).
//
// Dates are computed relative to "today" (days-ago offsets) rather than
// fixed calendar dates, so the dashboard's "this month" / trend views stay
// meaningful no matter when the seed is run. Re-running wipes and rebuilds
// the same dataset (see reset() below) — that's the "fixed seed" part.

const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');
const path      = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Refuses to run against anything that isn't obviously a test database —
// this script TRUNCATEs every table it touches.
function assertTestDatabase() {
  const name = process.env.DB_NAME || '';
  if (!/test/i.test(name)) {
    console.error(
      `Refusing to run: DB_NAME="${name}" doesn't look like a test database ` +
      `(expected it to contain "test"). Point DB_NAME at your test DB before ` +
      `running this script — it truncates everything.`
    );
    process.exit(1);
  }
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Mirrors calcFinancials()/financials.js exactly so seeded jobs' status and
// payments agree with what the dashboard/monthly-closing endpoints compute.
function jobTotal(items, discountType, discountAmount, taxEnabled, taxRate) {
  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const discount = discountType === 'percentage' ? subtotal * (discountAmount / 100) : discountAmount;
  const taxBase = subtotal - discount;
  const tax = taxEnabled ? taxBase * taxRate : 0;
  return round2(taxBase + tax);
}

const ITEM_CATALOG = [
  { description: 'Cambio de aceite 5W-30',          item_type: 'mano_de_obra' },
  { description: 'Filtro de aceite',                 item_type: 'repuesto' },
  { description: 'Filtro de aire',                   item_type: 'repuesto' },
  { description: 'Pastillas de freno delanteras',     item_type: 'repuesto' },
  { description: 'Revision de frenos',                item_type: 'mano_de_obra' },
  { description: 'Correa de distribucion',            item_type: 'repuesto' },
  { description: 'Bujias (juego x4)',                 item_type: 'repuesto' },
  { description: 'Bateria 12V 60Ah',                  item_type: 'repuesto' },
  { description: 'Alineacion y balanceo',             item_type: 'mano_de_obra' },
  { description: 'Diagnostico computarizado',         item_type: 'mano_de_obra' },
];

const IT = {
  OIL:        { description: 'Cambio de aceite 5W-30',            quantity: 1, unit_price: 800,  item_type: 'mano_de_obra' },
  OILFILTER:  { description: 'Filtro de aceite',                   quantity: 1, unit_price: 320,  item_type: 'repuesto' },
  AIRFILTER:  { description: 'Filtro de aire',                     quantity: 1, unit_price: 450,  item_type: 'repuesto' },
  BRAKEPADS:  { description: 'Pastillas de freno delanteras',       quantity: 1, unit_price: 1200, item_type: 'repuesto' },
  BRAKECHECK: { description: 'Revision de frenos',                  quantity: 1, unit_price: 500,  item_type: 'mano_de_obra' },
  TIMINGBELT: { description: 'Correa de distribucion',              quantity: 1, unit_price: 3500, item_type: 'repuesto' },
  SPARKPLUGS: { description: 'Bujias (juego x4)',                   quantity: 1, unit_price: 900,  item_type: 'repuesto' },
  BATTERY:    { description: 'Bateria 12V 60Ah',                    quantity: 1, unit_price: 4200, item_type: 'repuesto' },
  ALIGN:      { description: 'Alineacion y balanceo',               quantity: 1, unit_price: 1100, item_type: 'mano_de_obra' },
  DIAG:       { description: 'Diagnostico computarizado',           quantity: 1, unit_price: 600,  item_type: 'mano_de_obra' },
  TIRES:      { description: 'Cubiertas 195/65 R15 (juego x4)',     quantity: 4, unit_price: 2800, item_type: 'repuesto' },
  CLUTCH:     { description: 'Kit de embrague',                     quantity: 1, unit_price: 6500, item_type: 'repuesto' },
  SUSPENSION: { description: 'Amortiguadores delanteros (par)',     quantity: 1, unit_price: 5200, item_type: 'repuesto' },
};

const CLIENTS = [
  { type: 'individual', full_name: 'Carlos Rodriguez',      rut: '1.234.567-8',  phone: '+598 91 111 111', email: 'carlos@mail.com' },
  { type: 'individual', full_name: 'Ana Martinez',          rut: '2.345.678-9',  phone: '+598 92 222 222', email: 'ana@mail.com' },
  { type: 'empresa',    full_name: 'Transportes del Sur SA',rut: '21.345.678-9', phone: '+598 2 333 3333', email: 'info@transportesdelsur.com' },
  { type: 'individual', full_name: 'Lucia Fernandez',       rut: '3.456.789-0',  phone: '+598 93 444 444', email: 'lucia@mail.com' },
  { type: 'individual', full_name: 'Pedro Gonzalez',        rut: '4.567.890-1',  phone: '+598 94 555 555', email: 'pedro@mail.com' },
  { type: 'empresa',    full_name: 'Distribuidora Norte SRL',rut: '22.456.789-0',phone: '+598 2 666 6666', email: 'compras@distnorte.com' },
  { type: 'individual', full_name: 'Marta Silva',           rut: '5.678.901-2',  phone: '+598 95 777 777', email: 'marta@mail.com' },
  { type: 'individual', full_name: 'Jose Alvarez',          rut: null,           phone: '+598 96 888 888', email: null },
  { type: 'empresa',    full_name: 'Constructora ABC SA',   rut: '23.567.890-1', phone: '+598 2 999 9999', email: 'admin@constructoraabc.com' },
  { type: 'individual', full_name: 'Diego Perez',           rut: '6.789.012-3',  phone: '+598 97 000 000', email: 'diego@mail.com' },
];

// Vehicles grouped by client index (matches CLIENTS above).
const VEHICLES_BY_CLIENT = [
  [{ plate_number: 'ABC1234', make: 'Toyota',      model: 'Corolla',  year: 2019 }, { plate_number: 'ABC5678', make: 'Toyota', model: 'Hilux', year: 2020 }],
  [{ plate_number: 'XYZ9999', make: 'Renault',     model: 'Logan',    year: 2021 }],
  [{ plate_number: 'STB2201', make: 'Mercedes-Benz', model: 'Sprinter', year: 2018 }, { plate_number: 'STB2202', make: 'Mercedes-Benz', model: 'Sprinter', year: 2019 }],
  [{ plate_number: 'LUF4321', make: 'Volkswagen',  model: 'Gol',      year: 2017 }],
  [{ plate_number: 'PED8765', make: 'Chevrolet',   model: 'Onix',     year: 2022 }],
  [{ plate_number: 'DNS1001', make: 'Ford',        model: 'Transit',  year: 2020 }],
  [{ plate_number: 'MAR3344', make: 'Peugeot',     model: '208',      year: 2016 }],
  [{ plate_number: 'JOS7788', make: 'Fiat',        model: 'Uno',      year: 2015 }],
  [{ plate_number: 'CON9900', make: 'Toyota',      model: 'Hilux',    year: 2021 }, { plate_number: 'CON9901', make: 'Ford', model: 'Ranger', year: 2019 }],
  [{ plate_number: 'DIE5566', make: 'Nissan',      model: 'Versa',    year: 2014 }, { plate_number: 'DIE5567', make: 'Chevrolet', model: 'Spin', year: 2018 }],
];

// clientIdx / vehicleIdx index into CLIENTS / VEHICLES_BY_CLIENT[clientIdx].
// daysAgoJob is the job_date offset; payments (if any) use their own
// days-ago offsets (must be <= daysAgoJob, i.e. on/after the job date).
const JOBS = [
  { clientIdx: 0, vehicleIdx: 0, daysAgoJob: 3,   status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.OIL, IT.OILFILTER], payments: [{ daysAgo: 3, method: 'efectivo' }] },
  { clientIdx: 1, vehicleIdx: 0, daysAgoJob: 7,   status: 'pagado',   taxEnabled: true,  discountType: 'percentage', discountAmount: 10,
    items: [IT.BRAKEPADS, IT.BRAKECHECK], payments: [{ daysAgo: 7, method: 'transferencia' }] },
  { clientIdx: 0, vehicleIdx: 1, daysAgoJob: 10,  status: 'terminado',taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.TIMINGBELT], payments: [{ amount: 2000, daysAgo: 9, method: 'efectivo' }] },
  { clientIdx: 3, vehicleIdx: 0, daysAgoJob: 15,  status: 'abierto',  taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.DIAG], payments: [] },
  // Quote sitting unanswered for a while -> quote_pending alert candidate.
  { clientIdx: 3, vehicleIdx: 0, daysAgoJob: 50,  status: 'presupuesto', taxEnabled: true, discountType: 'fixed',   discountAmount: 0,
    items: [IT.TIMINGBELT, IT.DIAG], payments: [] },
  { clientIdx: 4, vehicleIdx: 0, daysAgoJob: 20,  status: 'pagado',   taxEnabled: false, discountType: 'fixed',      discountAmount: 0,
    items: [IT.OIL, IT.OILFILTER, IT.AIRFILTER], payments: [{ daysAgo: 19, method: 'credito' }] },
  { clientIdx: 2, vehicleIdx: 0, daysAgoJob: 25,  status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 500,
    items: [IT.BRAKEPADS, IT.BRAKECHECK, IT.ALIGN], payments: [{ amount: 1500, daysAgo: 25, method: 'transferencia' }, { daysAgo: 22, method: 'efectivo' }] },
  { clientIdx: 2, vehicleIdx: 1, daysAgoJob: 35,  status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.SUSPENSION], payments: [{ daysAgo: 34, method: 'transferencia' }] },
  { clientIdx: 4, vehicleIdx: 0, daysAgoJob: 40,  status: 'terminado',taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.CLUTCH], payments: [] },
  { clientIdx: 5, vehicleIdx: 0, daysAgoJob: 45,  status: 'pagado',   taxEnabled: true,  discountType: 'percentage', discountAmount: 5,
    items: [IT.TIRES], payments: [{ daysAgo: 44, method: 'cheque' }] },
  { clientIdx: 9, vehicleIdx: 0, daysAgoJob: 65,  status: 'terminado',taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.BATTERY, IT.DIAG], payments: [] },
  { clientIdx: 9, vehicleIdx: 1, daysAgoJob: 75,  status: 'terminado',taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.BRAKEPADS, IT.BRAKECHECK], payments: [] },
  { clientIdx: 7, vehicleIdx: 0, daysAgoJob: 85,  status: 'abierto',  taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.OIL], payments: [] },
  { clientIdx: 8, vehicleIdx: 0, daysAgoJob: 110, status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.TIRES, IT.ALIGN], payments: [{ daysAgo: 109, method: 'transferencia' }] },
  { clientIdx: 8, vehicleIdx: 1, daysAgoJob: 130, status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 300,
    items: [IT.SUSPENSION], payments: [{ daysAgo: 128, method: 'efectivo' }] },
  { clientIdx: 1, vehicleIdx: 0, daysAgoJob: 160, status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.OIL, IT.OILFILTER], payments: [{ daysAgo: 159, method: 'transferencia' }] },
  // Marta Silva's only job: >180 days ago and nothing since -> lost_customer candidate.
  { clientIdx: 6, vehicleIdx: 0, daysAgoJob: 190, status: 'pagado',   taxEnabled: true,  discountType: 'fixed',      discountAmount: 0,
    items: [IT.SPARKPLUGS], payments: [{ daysAgo: 189, method: 'efectivo' }] },
];

async function reset(client) {
  await client.query(
    'TRUNCATE payments, job_items, jobs, vehicle_ownership_history, vehicles, clients, item_catalog, users RESTART IDENTITY CASCADE'
  );
}

async function seedUsers(client) {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const recepPassword = process.env.SEED_RECEP_PASSWORD || 'recep123';
  const mecPassword   = process.env.SEED_MECH_PASSWORD  || 'mec123';
  const [adminHash, recepHash, mecHash] = await Promise.all(
    [adminPassword, recepPassword, mecPassword].map(p => bcrypt.hash(p, 12))
  );
  const r = await client.query(`
    INSERT INTO users (username, password_hash, full_name, role)
    VALUES
      ('admin',          $1, 'Administrador',   'admin'),
      ('recepcionista1', $2, 'Maria Recepcion', 'recepcionista'),
      ('mecanico1',      $3, 'Juan Mecanico',   'mecanico')
    RETURNING id, username
  `, [adminHash, recepHash, mecHash]);
  return r.rows.find(u => u.username === 'admin').id;
}

async function seedItemCatalog(client) {
  for (const item of ITEM_CATALOG) {
    await client.query(
      `INSERT INTO item_catalog (description, item_type) VALUES ($1, $2)`,
      [item.description, item.item_type]
    );
  }
}

async function seedClientsAndVehicles(client) {
  const clientIds = [];
  const vehicleIdsByClient = [];

  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i];
    const r = await client.query(
      `INSERT INTO clients (type, full_name, rut, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [c.type, c.full_name, c.rut, c.phone, c.email, 'Direccion de prueba ' + (i + 1)]
    );
    const clientId = r.rows[0].id;
    clientIds.push(clientId);

    const vehIds = [];
    for (const v of VEHICLES_BY_CLIENT[i]) {
      const vr = await client.query(
        `INSERT INTO vehicles (plate_number, client_id, make, model, year)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [v.plate_number, clientId, v.make, v.model, v.year]
      );
      const vehicleId = vr.rows[0].id;
      vehIds.push(vehicleId);
      await client.query(
        `INSERT INTO vehicle_ownership_history (vehicle_id, client_id) VALUES ($1, $2)`,
        [vehicleId, clientId]
      );
    }
    vehicleIdsByClient.push(vehIds);
  }

  return { clientIds, vehicleIdsByClient };
}

async function seedJobs(client, { clientIds, vehicleIdsByClient, adminId }) {
  for (const job of JOBS) {
    const clientId  = clientIds[job.clientIdx];
    const vehicleId = vehicleIdsByClient[job.clientIdx][job.vehicleIdx];
    const jobDate   = daysAgo(job.daysAgoJob);
    const taxRate   = 0.22;

    const total = jobTotal(job.items, job.discountType, job.discountAmount, job.taxEnabled, taxRate);

    const finishedAt = job.status !== 'abierto' ? jobDate : null;
    const paidAt = job.status === 'pagado' ? jobDate : null;

    const jr = await client.query(
      `INSERT INTO jobs
         (job_number, client_id, vehicle_id, job_date, status, tax_enabled, tax_rate,
          discount_amount, discount_type, created_by, finished_at, paid_at)
       VALUES (generate_job_number(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [clientId, vehicleId, jobDate, job.status, job.taxEnabled, taxRate,
       job.discountAmount, job.discountType, adminId, finishedAt, paidAt]
    );
    const jobId = jr.rows[0].id;

    for (const item of job.items) {
      await client.query(
        `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, pricing_mode)
         VALUES ($1, $2, $3, $4, $5, 'detallado')`,
        [jobId, item.description, item.quantity, item.unit_price, item.item_type]
      );
    }

    // A payment with no explicit `amount` pays off whatever remains of the
    // total at that point (used for single full payments and the final
    // installment of a split payment).
    let runningPaid = 0;
    for (const p of job.payments) {
      const amount = p.amount != null ? p.amount : round2(total - runningPaid);
      runningPaid = round2(runningPaid + amount);
      await client.query(
        `INSERT INTO payments (job_id, amount, method, payment_date, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [jobId, amount, p.method, daysAgo(p.daysAgo), adminId]
      );
    }
  }
}

async function seed() {
  assertTestDatabase();
  console.log(`Seeding ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT} ...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await reset(client);
    const adminId = await seedUsers(client);
    await seedItemCatalog(client);
    const { clientIds, vehicleIdsByClient } = await seedClientsAndVehicles(client);
    await seedJobs(client, { clientIds, vehicleIdsByClient, adminId });
    await client.query('COMMIT');
    console.log(
      `Seed completo: 3 usuarios, ${ITEM_CATALOG.length} items de catalogo, ` +
      `${CLIENTS.length} clientes, ${VEHICLES_BY_CLIENT.flat().length} vehiculos, ${JOBS.length} ordenes.`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
