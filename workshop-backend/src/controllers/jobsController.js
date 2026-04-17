const pool = require('../config/database');

function calcFinancials(job, items, payments) {
  const subtotal = items.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.unit_price), 0);
  const discount = job.discount_type === 'percentage'
    ? subtotal * (parseFloat(job.discount_amount) / 100)
    : parseFloat(job.discount_amount);
  const taxBase  = subtotal - discount;
  const tax      = job.tax_enabled ? taxBase * parseFloat(job.tax_rate) : 0;
  const total    = taxBase + tax;
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
    total_paid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((total - totalPaid) * 100) / 100
  };
}

async function checkAndPay(client, jobId) {
  const itemsRes = await client.query(
    `SELECT quantity, unit_price FROM job_items WHERE job_id = $1`, [jobId]);
  const paysRes  = await client.query(
    `SELECT amount FROM payments WHERE job_id = $1`, [jobId]);
  const jobRes   = await client.query(
    `SELECT tax_enabled, tax_rate, discount_amount, discount_type FROM jobs WHERE id = $1`, [jobId]);

  const { balance } = calcFinancials(jobRes.rows[0], itemsRes.rows, paysRes.rows);
  if (balance <= 0) {
    await client.query(
      `UPDATE jobs SET status = 'pagado', is_locked = TRUE WHERE id = $1 AND status != 'pagado'`, [jobId]);
  }
}

async function list(req, res, next) {
  try {
    const { status, client_id, vehicle_id, q, date_from, date_to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = []; const where = ['j.deleted_at IS NULL'];
    if (status)     { params.push(status);     where.push(`j.status = $${params.length}`); }
    if (client_id)  { params.push(client_id);  where.push(`j.client_id = $${params.length}`); }
    if (vehicle_id) { params.push(vehicle_id); where.push(`j.vehicle_id = $${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(j.job_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR v.plate_number ILIKE $${params.length})`); }
    if (date_from) { params.push(date_from); where.push(`j.job_date >= $${params.length}`); }
    if (date_to)   { params.push(date_to);   where.push(`j.job_date <= $${params.length}`); }
    params.push(parseInt(limit), parseInt(offset));
    const r = await pool.query(`
      SELECT j.*, c.full_name AS client_name, c.rut AS client_rut,
             v.plate_number, v.make, v.model,
             COALESCE(it.subtotal, 0) AS subtotal,
             COALESCE(py.total_paid, 0) AS total_paid,
             COUNT(*) OVER() AS total_count
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN (SELECT job_id, SUM(quantity * unit_price) AS subtotal FROM job_items GROUP BY job_id) it ON it.job_id = j.id
      LEFT JOIN (SELECT job_id, SUM(amount) AS total_paid FROM payments GROUP BY job_id) py ON py.job_id = j.id
      WHERE ${where.join(' AND ')}
      ORDER BY j.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const total = r.rows.length > 0 ? parseInt(r.rows[0].total_count) : 0;
    const data = r.rows.map(row => { const { total_count, ...rest } = row; return rest; });
    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const jobRes = await pool.query(`
      SELECT j.*, c.full_name AS client_name, c.rut AS client_rut,
             c.phone AS client_phone, c.email AS client_email, c.address AS client_address,
             v.plate_number, v.make, v.model, v.year, v.color
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.id = $1 AND j.deleted_at IS NULL`, [req.params.id]
    );
    if (!jobRes.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });

    const itemsRes = await pool.query(`SELECT * FROM job_items WHERE job_id = $1 ORDER BY created_at`, [req.params.id]);
    const paysRes  = await pool.query(`SELECT * FROM payments WHERE job_id = $1 ORDER BY paid_at`, [req.params.id]);

    const job = jobRes.rows[0];
    if (req.user.role === 'mecanico') {
      delete job.client_phone;
      delete job.client_email;
      delete job.client_address;
      delete job.client_rut;
    }

    res.json({
      ...job,
      items:      itemsRes.rows,
      payments:   paysRes.rows,
      financials: calcFinancials(job, itemsRes.rows, paysRes.rows)
    });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const db = await pool.connect();
  try {
    const { client_id, vehicle_id, mileage_at_service, tax_enabled = true,
            tax_rate = 0.22, discount_amount = 0, discount_type = 'fixed',
            notes, items = [], job_date } = req.body;
    if (!client_id || !vehicle_id)
      return res.status(400).json({ error: 'client_id y vehicle_id son requeridos' });

    // Validate mileage >= vehicle's current mileage
    if (mileage_at_service) {
      const veh = await db.query(`SELECT mileage FROM vehicles WHERE id = $1`, [vehicle_id]);
      if (veh.rows[0] && veh.rows[0].mileage && mileage_at_service < veh.rows[0].mileage) {
        return res.status(400).json({
          error: `El kilometraje (${mileage_at_service}) no puede ser menor al registrado anteriormente (${veh.rows[0].mileage} km)`
        });
      }
    }

    await db.query('BEGIN');
    const effectiveJobDate = job_date || new Date().toISOString().split('T')[0];
    const r = await db.query(`
      INSERT INTO jobs (job_number, client_id, vehicle_id, mileage_at_service,
                        tax_enabled, tax_rate, discount_amount, discount_type, notes, created_by, job_date)
      VALUES (generate_job_number(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [client_id, vehicle_id, mileage_at_service || null, tax_enabled, tax_rate,
       discount_amount, discount_type, notes || null, req.user.id, effectiveJobDate]
    );
    const job = r.rows[0];
    for (const item of items) {
      await db.query(
        `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, supplier)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [job.id, item.description, item.quantity || 1, item.unit_price || 0,
         item.item_type || 'mano_de_obra', item.supplier || null]
      );
    }
    // Update vehicle mileage
    if (mileage_at_service) {
      await db.query(
        `UPDATE vehicles SET mileage = $1 WHERE id = $2 AND (mileage IS NULL OR mileage < $1)`,
        [mileage_at_service, vehicle_id]
      );
    }
    await db.query('COMMIT');
    res.status(201).json(job);
  } catch (err) { await db.query('ROLLBACK'); next(err); }
  finally { db.release(); }
}

async function update(req, res, next) {
  try {
    const { mileage_at_service, status, tax_enabled, tax_rate,
            discount_amount, discount_type, notes, internal_notes, job_date } = req.body;

    // Validate all items have price before closing
    if (status === 'terminado' || status === 'pagado') {
      const itemCheck = await pool.query(
        `SELECT COUNT(*) AS zero_count FROM job_items WHERE job_id = $1 AND (unit_price IS NULL OR unit_price = 0)`,
        [req.params.id]
      );
      const zeroCount = parseInt(itemCheck.rows[0].zero_count);
      if (zeroCount > 0) {
        return res.status(400).json({
          error: `No se puede cerrar el trabajo: ${zeroCount} item(s) sin precio asignado. Asigne precio a todos los items antes de continuar.`
        });
      }
    }

    // Auto-lock when transitioning to terminado or pagado
    let is_locked = undefined;
    if (status === 'terminado' || status === 'pagado') {
      is_locked = true;
    }

    const r = await pool.query(`
      UPDATE jobs SET
        mileage_at_service = COALESCE($1, mileage_at_service),
        status             = COALESCE($2, status),
        tax_enabled        = COALESCE($3, tax_enabled),
        tax_rate           = COALESCE($4, tax_rate),
        discount_amount    = COALESCE($5, discount_amount),
        discount_type      = COALESCE($6, discount_type),
        notes              = COALESCE($7, notes),
        internal_notes     = COALESCE($8, internal_notes),
        job_date           = COALESCE($9, job_date),
        is_locked          = COALESCE($10, is_locked)
      WHERE id = $11 AND deleted_at IS NULL RETURNING *`,
      [mileage_at_service, status, tax_enabled, tax_rate,
       discount_amount, discount_type, notes, internal_notes, job_date, is_locked, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function lockJob(req, res, next) {
  try {
    const r = await pool.query(
      `UPDATE jobs SET is_locked = TRUE WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function unlockJob(req, res, next) {
  try {
    const r = await pool.query(
      `UPDATE jobs SET is_locked = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await pool.query(`UPDATE jobs SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

// Items
async function listItems(req, res, next) {
  try {
    const r = await pool.query(`SELECT * FROM job_items WHERE job_id = $1 ORDER BY created_at`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function addItem(req, res, next) {
  try {
    const { description, quantity = 1, unit_price = 0, item_type = 'mano_de_obra', supplier } = req.body;
    if (!description) return res.status(400).json({ error: 'description es requerido' });
    const r = await pool.query(
      `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, supplier)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, description, quantity, unit_price, item_type, supplier || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    const { description, quantity, unit_price, item_type, supplier } = req.body;
    const r = await pool.query(`
      UPDATE job_items SET
        description = COALESCE($1, description), quantity   = COALESCE($2, quantity),
        unit_price  = COALESCE($3, unit_price),  item_type  = COALESCE($4, item_type),
        supplier    = COALESCE($5, supplier)
      WHERE id = $6 AND job_id = $7 RETURNING *`,
      [description, quantity, unit_price, item_type, supplier, req.params.itemId, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Item no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

async function removeItem(req, res, next) {
  try {
    await pool.query(`DELETE FROM job_items WHERE id = $1 AND job_id = $2`, [req.params.itemId, req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

// Payments
async function listPayments(req, res, next) {
  try {
    const r = await pool.query(`SELECT * FROM payments WHERE job_id = $1 ORDER BY payment_date DESC, paid_at DESC`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function addPayment(req, res, next) {
  const db = await pool.connect();
  try {
    const { amount, method = 'efectivo', reference, notes, payment_date } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });

    // Validate credit payments against available client credit
    if (method === 'credito') {
      const jobRes = await db.query(`SELECT client_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!jobRes.rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado' });
      const clientId = jobRes.rows[0].client_id;
      const creditRes = await db.query(`
        SELECT COALESCE(SUM(GREATEST(sub.total_paid - sub.total, 0)), 0) AS credit_available
        FROM (
          SELECT j.id,
                 COALESCE((SELECT SUM(quantity * unit_price) FROM job_items WHERE job_id = j.id), 0)
                   - CASE WHEN j.discount_type = 'percentage'
                     THEN COALESCE((SELECT SUM(quantity * unit_price) FROM job_items WHERE job_id = j.id), 0) * (j.discount_amount / 100)
                     ELSE j.discount_amount END
                   + CASE WHEN j.tax_enabled
                     THEN (COALESCE((SELECT SUM(quantity * unit_price) FROM job_items WHERE job_id = j.id), 0)
                           - CASE WHEN j.discount_type = 'percentage'
                             THEN COALESCE((SELECT SUM(quantity * unit_price) FROM job_items WHERE job_id = j.id), 0) * (j.discount_amount / 100)
                             ELSE j.discount_amount END) * j.tax_rate
                     ELSE 0 END AS total,
                 COALESCE((SELECT SUM(amount) FROM payments WHERE job_id = j.id), 0) AS total_paid
          FROM jobs j
          WHERE j.client_id = $1 AND j.deleted_at IS NULL
        ) sub
        WHERE sub.total_paid > sub.total
      `, [clientId]);
      const creditAvailable = parseFloat(creditRes.rows[0].credit_available) || 0;
      if (amount > creditAvailable) {
        return res.status(400).json({ error: `El monto excede el credito disponible del cliente ($${creditAvailable.toFixed(2)})` });
      }
    }

    await db.query('BEGIN');
    const r = await db.query(
      `INSERT INTO payments (job_id, amount, method, reference, notes, payment_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, amount, method, reference || null, notes || null,
       payment_date || new Date().toISOString().split('T')[0], req.user.id]
    );
    await checkAndPay(db, req.params.id);
    await db.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) { await db.query('ROLLBACK'); next(err); }
  finally { db.release(); }
}

async function removePayment(req, res, next) {
  try {
    await pool.query(`DELETE FROM payments WHERE id = $1 AND job_id = $2`, [req.params.paymentId, req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  list, getOne, create, update, remove,
  lockJob, unlockJob,
  listItems, addItem, updateItem, removeItem,
  listPayments, addPayment, removePayment,
  calcFinancials
};
