const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const migrations = [
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
];

async function run() {
  console.log('Corriendo migraciones...');
  const client = await pool.connect();
  try {
    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        console.log(`  Ejecutando ${file}...`);
        const sql = fs.readFileSync(filePath, 'utf8');
        await client.query(sql);
        console.log(`  ${file} completado.`);
      }
    }
    console.log('Esquema creado correctamente.');
  } catch (err) {
    console.error('Error en migracion:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
