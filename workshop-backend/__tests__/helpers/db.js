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
  '008_item_catalog.sql',
  '009_item_catalog_children.sql',
  '010_item_catalog_backfill.sql',
  '011_catalog_item_ref.sql',
  '012_catalog_analytics_index.sql',
  '013_jobs_job_date_index.sql',
  '014_alert_definitions.sql',
  '015_alert_workshop_and_cascade.sql',
  '016_seed_alert_definitions.sql',
  '017_alert_results_cache.sql',
  '018_jobs_vehicle_date_index.sql',
  '019_alert_dismissals_entity_type.sql',
  '020_item_model_and_audit.sql',
  '021_alert_dismissal_status.sql',
  '022_alert_wa_templates.sql',
  '023_alert_sprint3_types.sql',
  '024_group_item_type_and_pricing_mode.sql',
];

async function dbReachable() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Apply any migration this database hasn't seen yet, tracked in a ledger table.
//
// This used to short-circuit on `to_regclass('public.jobs')` — i.e. "if the
// schema exists at all, assume it's current". That silently ran the whole suite
// against a stale schema whenever a new migration was added to an existing
// workshop_test database, which is exactly as misleading as a suite that never
// reaches Postgres at all. The ledger makes the check per-migration instead, so
// adding a file to MIGRATIONS is enough — no manual dropdb required.
async function ensureSchema() {
  const dir = path.join(__dirname, '..', '..', 'migrations');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  // A pre-existing database built before the ledger existed has the schema but
  // no record of it. Backfill it as "everything up to the newest migration whose
  // effect is already visible" — detected via a column each one adds.
  const applied = await pool.query(`SELECT filename FROM schema_migrations`);
  if (applied.rows.length === 0) {
    const hasJobs = await pool.query(`SELECT to_regclass('public.jobs') AS t`);
    if (hasJobs.rows[0].t) {
      const known = await pool.query(`
        SELECT
          to_regclass('public.alert_wa_templates')  IS NOT NULL AS thru_022,
          EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'job_items' AND column_name = 'pricing_mode') AS thru_024`);
      const { thru_022, thru_024 } = known.rows[0];
      const upTo = thru_024 ? '024' : (thru_022 ? '023' : '021');
      const seen = MIGRATIONS.filter(f => f.slice(0, 3) <= upTo || f === 'schema.sql');
      for (const file of seen) {
        await pool.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
      }
    }
  }

  for (const file of MIGRATIONS) {
    const done = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (done.rows.length > 0) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
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
