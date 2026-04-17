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
