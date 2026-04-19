const pool = require('../config/database');

function parseExcelDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const num = parseInt(serial);
  if (num < 1000) return null;
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

function parsePlateFromDoc(docField) {
  if (!docField) return null;
  const match = docField.match(/^([A-Z]{2,3}\d{4}|[A-Z]{3}\s?\d{4})/i);
  return match ? match[1].replace(/\s/g, '').toUpperCase() : null;
}

function parseDescription(docField) {
  if (!docField) return 'Trabajo importado';
  const plate = parsePlateFromDoc(docField);
  if (plate) {
    const rest = docField.slice(plate.length).trim();
    return rest || 'Trabajo importado';
  }
  return docField;
}

function mapPaymentMethod(method) {
  if (!method) return 'efectivo';
  const lower = method.toLowerCase().trim();
  if (lower.includes('credito') || lower.includes('crédito')) return 'credito';
  if (lower.includes('transfer')) return 'transferencia';
  if (lower.includes('cheque')) return 'cheque';
  return 'efectivo';
}

function parseCsvRows(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim());
    if (cols.length < 6) continue;
    const clientName = cols[0];
    if (!clientName) continue;
    rows.push({
      client_name: clientName,
      date_raw: cols[1],
      doc_field: cols[2],
      payment_method: cols[3],
      total: parseFloat(cols[4]) || 0,
      paid: parseFloat(cols[5]) || 0,
    });
  }
  return rows;
}

async function preview(req, res, next) {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'No se envio contenido CSV' });

    const rows = parseCsvRows(content);
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas validas en el CSV' });

    const preview = rows.map(r => ({
      client_name: r.client_name,
      date: parseExcelDate(r.date_raw) || r.date_raw,
      plate: parsePlateFromDoc(r.doc_field) || '(no detectada)',
      description: parseDescription(r.doc_field),
      payment_method: mapPaymentMethod(r.payment_method),
      total: r.total,
      paid: r.paid,
      balance: r.total - r.paid,
    }));

    const clients = [...new Set(rows.map(r => r.client_name))];
    const plates = [...new Set(rows.map(r => parsePlateFromDoc(r.doc_field)).filter(Boolean))];

    res.json({
      row_count: rows.length,
      unique_clients: clients.length,
      unique_plates: plates.length,
      clients,
      plates,
      rows: preview,
    });
  } catch (err) { next(err); }
}

async function execute(req, res, next) {
  const client = await pool.connect();
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'No se envio contenido CSV' });

    const rows = parseCsvRows(content);
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas validas' });

    await client.query('BEGIN');

    const results = {
      clients_created: 0,
      clients_matched: 0,
      vehicles_created: 0,
      vehicles_matched: 0,
      jobs_created: 0,
      payments_created: 0,
      errors: [],
    };

    const clientCache = {};
    const vehicleCache = {};

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      try {
        let clientId = clientCache[row.client_name.toUpperCase()];
        if (!clientId) {
          const existing = await client.query(
            `SELECT id FROM clients WHERE UPPER(full_name) = $1 AND deleted_at IS NULL LIMIT 1`,
            [row.client_name.toUpperCase()]
          );
          if (existing.rows.length > 0) {
            clientId = existing.rows[0].id;
            results.clients_matched++;
          } else {
            const newClient = await client.query(
              `INSERT INTO clients (full_name) VALUES ($1) RETURNING id`,
              [row.client_name]
            );
            clientId = newClient.rows[0].id;
            results.clients_created++;
          }
          clientCache[row.client_name.toUpperCase()] = clientId;
        }

        const plate = parsePlateFromDoc(row.doc_field);
        let vehicleId = null;
        if (plate) {
          vehicleId = vehicleCache[plate];
          if (!vehicleId) {
            const existingV = await client.query(
              `SELECT id, client_id FROM vehicles WHERE UPPER(plate_number) = $1 AND deleted_at IS NULL LIMIT 1`,
              [plate.toUpperCase()]
            );
            if (existingV.rows.length > 0) {
              vehicleId = existingV.rows[0].id;
              if (existingV.rows[0].client_id !== clientId) {
                await client.query(
                  `UPDATE vehicles SET client_id = $1 WHERE id = $2`,
                  [clientId, vehicleId]
                );
              }
              results.vehicles_matched++;
            } else {
              const newV = await client.query(
                `INSERT INTO vehicles (plate_number, client_id) VALUES ($1, $2) RETURNING id`,
                [plate.toUpperCase(), clientId]
              );
              vehicleId = newV.rows[0].id;
              results.vehicles_created++;
            }
            vehicleCache[plate] = vehicleId;
          }
        } else {
          const placeholderPlate = `IMP-${String(idx + 1).padStart(4, '0')}`;
          const newV = await client.query(
            `INSERT INTO vehicles (plate_number, client_id, make) VALUES ($1, $2, 'Importado') RETURNING id`,
            [placeholderPlate, clientId]
          );
          vehicleId = newV.rows[0].id;
          results.vehicles_created++;
        }

        const jobDate = parseExcelDate(row.date_raw) || new Date().toISOString().split('T')[0];

        const jobResult = await client.query(
          `INSERT INTO jobs (job_number, client_id, vehicle_id, job_date, status, source)
           VALUES (generate_job_number(), $1, $2, $3, $4, 'import') RETURNING id, job_number`,
          [clientId, vehicleId, jobDate, row.paid >= row.total && row.total > 0 ? 'pagado' : (row.paid > 0 ? 'terminado' : 'abierto')]
        );
        const jobId = jobResult.rows[0].id;
        results.jobs_created++;

        const description = parseDescription(row.doc_field);
        await client.query(
          `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type)
           VALUES ($1, $2, 1, $3, 'otro')`,
          [jobId, description, row.total]
        );

        if (row.paid > 0) {
          const method = mapPaymentMethod(row.payment_method);
          await client.query(
            `INSERT INTO payments (job_id, amount, method, payment_date)
             VALUES ($1, $2, $3, $4)`,
            [jobId, row.paid, method, jobDate]
          );
          results.payments_created++;
        }

        if (row.paid >= row.total && row.total > 0) {
          await client.query(`UPDATE jobs SET is_locked = true WHERE id = $1`, [jobId]);
        }
      } catch (rowErr) {
        results.errors.push({ row: idx + 2, client: row.client_name, error: rowErr.message });
      }
    }

    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { preview, execute };
