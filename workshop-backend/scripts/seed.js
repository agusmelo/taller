const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  console.log('Insertando datos de prueba...');
  try {
    await client.query('BEGIN');

    // Usuarios
    const adminHash = await bcrypt.hash('admin123', 12);
    const recepHash = await bcrypt.hash('recep123', 12);
    const mecHash   = await bcrypt.hash('mec123', 12);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES
        ('admin',          $1, 'Administrador',   'admin'),
        ('recepcionista1', $2, 'Maria Recepcion', 'recepcionista'),
        ('mecanico1',      $3, 'Juan Mecanico',   'mecanico')
      ON CONFLICT (username) DO NOTHING
    `, [adminHash, recepHash, mecHash]);

    // Clientes
    const cRes = await client.query(`
      INSERT INTO clients (type, full_name, rut, phone, email, address)
      VALUES
        ('individual', 'Carlos Rodriguez', '12.345.678-9', '+598 91 111 111', 'carlos@mail.com', 'Av. Italia 1234'),
        ('individual', 'Ana Martinez',     '98.765.432-1', '+598 92 222 222', 'ana@mail.com',    'Br. Artigas 567'),
        ('empresa',    'Transportes SA',   '21.345.678-9', '+598 2 333 3333', 'info@trans.com',  'Ruta 8 km 15')
      ON CONFLICT DO NOTHING
      RETURNING id, full_name
    `);

    if (cRes.rows.length > 0) {
      const [carlos, ana] = cRes.rows;

      // Vehiculos
      const vRes = await client.query(`
        INSERT INTO vehicles (plate_number, client_id, make, model, year, color, mileage)
        VALUES
          ('ABC1234', $1, 'Toyota',  'Corolla', 2019, 'Blanco', 85000),
          ('XYZ9999', $2, 'Renault', 'Logan',   2021, 'Gris',   32000)
        ON CONFLICT (plate_number) DO NOTHING
        RETURNING id, plate_number, client_id
      `, [carlos.id, ana.id]);

      if (vRes.rows.length > 0) {
        // Registrar propiedad inicial
        for (const v of vRes.rows) {
          await client.query(`
            INSERT INTO vehicle_ownership_history (vehicle_id, client_id)
            VALUES ($1, $2)
          `, [v.id, v.client_id]);
        }

        // Trabajo de ejemplo
        const jRes = await client.query(`
          INSERT INTO jobs
            (job_number, client_id, vehicle_id, mileage_at_service,
             status, tax_enabled, tax_rate, notes)
          VALUES
            (generate_job_number(), $1, $2, 85100,
             'terminado', true, 0.22, 'Mantenimiento general')
          RETURNING id
        `, [vRes.rows[0].client_id, vRes.rows[0].id]);

        const jobId = jRes.rows[0].id;

        await client.query(`
          INSERT INTO job_items (job_id, description, quantity, unit_price, item_type)
          VALUES
            ($1, 'Cambio de aceite 5W-30', 1, 800,  'mano_de_obra'),
            ($1, 'Filtro de aceite',       1, 320,  'repuesto'),
            ($1, 'Revision de frenos',     1, 500,  'mano_de_obra')
        `, [jobId]);
      }
    }

    await client.query('COMMIT');
    console.log('Seed completado.');
    console.log('   admin / admin123');
    console.log('   recepcionista1 / recep123');
    console.log('   mecanico1 / mec123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
