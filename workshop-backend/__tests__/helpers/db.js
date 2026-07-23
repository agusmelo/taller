// Shared helpers for DB-backed integration tests.
//
// These tests need a real Postgres instance. Connection params come from the
// usual DB_* env vars, falling back to a local `workshop_test` database. When
// the database is unreachable the integration suites skip themselves so the
// unit-test run stays green in environments without Postgres.
//
// Quick local setup:
//   createdb workshop_test            # owned by the configured DB_USER
//   DB_NAME=workshop_test npm test

const fs = require('fs');
const path = require('path');

// Must be set before requiring the pool module (it reads env at load time).
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'workshop_test';
process.env.DB_USER = process.env.DB_USER || 'workshop';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'workshop123';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const pool = require('../../src/config/database');

const MIGRATIONS = [
  'schema.sql',
  '002_fase3.sql',
  '003_job_number_date.sql',
  '004_polish.sql',
  '005_settings.sql',
  '006_import_source.sql',
  '007_item_hierarchy_and_pdf_visibility.sql',
];

async function dbReachable() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Idempotently apply migrations if the core schema is missing.
async function ensureSchema() {
  const has = await pool.query(`SELECT to_regclass('public.jobs') AS t`);
  if (has.rows[0].t) return;
  const dir = path.join(__dirname, '..', '..', 'migrations');
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
  }
}

// Wipe all financial data and recreate a baseline admin user. Returns its id.
async function reset() {
  await pool.query('TRUNCATE payments, job_items, jobs, vehicles, clients RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const u = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('tester', 'x', 'Tester', 'admin') RETURNING id`
  );
  return u.rows[0].id;
}

async function createClient(name = 'Cliente Test') {
  const r = await pool.query(`INSERT INTO clients (full_name) VALUES ($1) RETURNING *`, [name]);
  return r.rows[0];
}

async function createVehicle(clientId, plate = 'TEST-' + Math.random().toString(36).slice(2, 8)) {
  const r = await pool.query(
    `INSERT INTO vehicles (plate_number, client_id, make, model) VALUES ($1,$2,'Marca','Modelo') RETURNING *`,
    [plate, clientId]
  );
  return r.rows[0];
}

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = () => res;
  return res;
}

// Invoke a controller function with a mocked req/res. Rejects on next(err) so
// unexpected controller errors surface as test failures.
function callController(fn, { params = {}, body = {}, query = {}, user } = {}) {
  return new Promise((resolve, reject) => {
    const res = mockRes();
    const next = (err) => (err ? reject(err) : resolve(res));
    Promise.resolve(fn({ params, body, query, user }, res, next)).then(
      () => resolve(res),
      reject
    );
  });
}

module.exports = {
  pool,
  dbReachable,
  ensureSchema,
  reset,
  createClient,
  createVehicle,
  mockRes,
  callController,
};
