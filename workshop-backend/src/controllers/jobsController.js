const pool = require('../config/database');
const { JOB_SUBTOTALS_SUBQUERY, JOB_PAID_SUBQUERY, jobTotalRounded } = require('../utils/financials');

const PRICING_MODES = ['detallado', 'agregado'];

// Coerce a client-supplied pricing_mode to a valid value. Anything unknown or
// absent becomes 'detallado' — the pre-024 behavior, so old clients that never
// send the field keep working exactly as before.
function normalizePricingMode(value) {
  return PRICING_MODES.includes(value) ? value : 'detallado';
}

// A group's line total depends on its root's pricing_mode (migration 024):
//   'detallado' + has children -> SUM(children.unit_price); children carry the
//                                 prices and the root's own price is unused.
//   'agregado'                 -> root.quantity * root.unit_price; children are
//                                 descriptions only and their prices are unused.
//   no children                -> root.quantity * root.unit_price either way.
// Exported so every caller derives a group total the same way.
function groupLineTotal(root, children) {
  const detailed = root.pricing_mode !== 'agregado';
  if (detailed && children && children.length > 0) {
    return children.reduce((cs, c) => cs + parseFloat(c.unit_price), 0);
  }
  return parseFloat(root.quantity) * parseFloat(root.unit_price);
}

function calcFinancials(job, items, payments) {
  // Mirrors JOB_SUBTOTALS_SUBQUERY in utils/financials.js — keep both in sync.
  const childrenByParent = new Map();
  for (const item of items) {
    if (item.parent_id) {
      const arr = childrenByParent.get(item.parent_id) || [];
      arr.push(item);
      childrenByParent.set(item.parent_id, arr);
    }
  }
  const roots = items.filter(i => !i.parent_id);
  const subtotal = roots.reduce(
    (s, root) => s + groupLineTotal(root, childrenByParent.get(root.id)), 0);
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
    `SELECT id, parent_id, quantity, unit_price, pricing_mode FROM job_items WHERE job_id = $1`, [jobId]);
  const paysRes  = await client.query(
    `SELECT amount FROM payments WHERE job_id = $1`, [jobId]);
  const jobRes   = await client.query(
    `SELECT tax_enabled, tax_rate, discount_amount, discount_type FROM jobs WHERE id = $1`, [jobId]);

  const { balance } = calcFinancials(jobRes.rows[0], itemsRes.rows, paysRes.rows);
  if (balance <= 0) {
    await client.query(
      `UPDATE jobs SET status = 'pagado', is_locked = TRUE, paid_at = NOW()
       WHERE id = $1 AND status != 'pagado'`, [jobId]);
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
      LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
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

    const itemsRes = await pool.query(
      `SELECT * FROM job_items
       WHERE job_id = $1
       ORDER BY (parent_id IS NULL) DESC, sort_order, created_at`,
      [req.params.id]
    );
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
    let parentSortOrder = 0;
    for (const item of items) {
      const itemType = item.item_type || 'mano_de_obra';
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const pricingMode = normalizePricingMode(item.pricing_mode);
      // A 'detallado' group's price lives on its children, so the root's own
      // price is meaningless; an 'agregado' group is the reverse. Zero out
      // whichever side is unused so no stale number can be read back later.
      const aggregate = pricingMode === 'agregado';
      const parentR = await db.query(
        `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, pricing_mode, supplier, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [job.id, item.description,
         hasChildren && !aggregate ? 1 : (item.quantity || 1),
         hasChildren && !aggregate ? 0 : (item.unit_price || 0),
         itemType, pricingMode, item.supplier || null, parentSortOrder++]
      );
      if (hasChildren) {
        const parentId = parentR.rows[0].id;
        let childSortOrder = 0;
        for (const child of item.children) {
          // item_type and pricing_mode are root-only (migration 024): a child
          // belongs to its group's category, it does not have one of its own.
          await db.query(
            `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, pricing_mode, supplier, parent_id, sort_order)
             VALUES ($1,$2,1,$3,NULL,NULL,NULL,$4,$5)`,
            [job.id, child.description,
             aggregate ? 0 : (child.unit_price || 0),
             parentId, childSortOrder++]
          );
        }
      }
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
            discount_amount, discount_type, notes, internal_notes, job_date,
            show_item_details_pricing } = req.body;

    // Validate all priced rows before closing. A row is exempt when its price
    // is structurally unused (the same two "shadow" cases as the subtotal in
    // utils/financials.js):
    //   * the root of a 'detallado' group with children — total comes from them;
    //   * any child of an 'agregado' group — the group total is on the root.
    // Every other row (leaf roots, 'agregado' roots, children of a 'detallado'
    // group) must carry unit_price > 0.
    if (status === 'terminado' || status === 'pagado') {
      const itemCheck = await pool.query(
        `SELECT COUNT(*) AS zero_count FROM job_items i
         WHERE i.job_id = $1
           AND (i.unit_price IS NULL OR i.unit_price = 0)
           AND NOT (i.parent_id IS NULL
                    AND i.pricing_mode = 'detallado'
                    AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id))
           AND NOT (i.parent_id IS NOT NULL
                    AND EXISTS (SELECT 1 FROM job_items p
                                 WHERE p.id = i.parent_id
                                   AND p.pricing_mode = 'agregado'))`,
        [req.params.id]
      );
      const zeroCount = parseInt(itemCheck.rows[0].zero_count);
      if (zeroCount > 0) {
        return res.status(400).json({
          error: `No se puede cerrar el trabajo: ${zeroCount} item(s) sin precio asignado. Asigne precio a todos los items antes de continuar.`
        });
      }
    }

    // Auto-lock + record transition timestamps when status changes
    let is_locked = undefined;
    let finished_at_expr = 'finished_at';
    let paid_at_expr = 'paid_at';
    if (status === 'terminado') {
      is_locked = true;
      finished_at_expr = 'COALESCE(finished_at, NOW())';
    } else if (status === 'pagado') {
      is_locked = true;
      finished_at_expr = 'COALESCE(finished_at, NOW())';
      paid_at_expr = 'COALESCE(paid_at, NOW())';
    }

    const r = await pool.query(`
      UPDATE jobs SET
        mileage_at_service        = COALESCE($1, mileage_at_service),
        status                    = COALESCE($2, status),
        tax_enabled               = COALESCE($3, tax_enabled),
        tax_rate                  = COALESCE($4, tax_rate),
        discount_amount           = COALESCE($5, discount_amount),
        discount_type             = COALESCE($6, discount_type),
        notes                     = COALESCE($7, notes),
        internal_notes            = COALESCE($8, internal_notes),
        job_date                  = COALESCE($9, job_date),
        is_locked                 = COALESCE($10, is_locked),
        show_item_details_pricing = COALESCE($11, show_item_details_pricing),
        finished_at               = ${finished_at_expr},
        paid_at                   = ${paid_at_expr}
      WHERE id = $12 AND deleted_at IS NULL RETURNING *`,
      [mileage_at_service, status, tax_enabled, tax_rate,
       discount_amount, discount_type, notes, internal_notes, job_date, is_locked,
       show_item_details_pricing, req.params.id]
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
    const r = await pool.query(
      `SELECT * FROM job_items
       WHERE job_id = $1
       ORDER BY (parent_id IS NULL) DESC, sort_order, created_at`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function addItem(req, res, next) {
  const client = await pool.connect();
  try {
    const { description, quantity, unit_price, item_type, supplier, parent_id,
            sort_order, children, catalog_item_id, pricing_mode } = req.body;
    if (!description) return res.status(400).json({ error: 'description es requerido' });

    let finalParentId = null;
    // item_type and pricing_mode are root-only attributes (migration 024) and
    // stay NULL for children — a sub-item belongs to its group's category and
    // pricing mode, it never carries its own.
    let finalItemType = item_type || 'mano_de_obra';
    let finalPricingMode = normalizePricingMode(pricing_mode);
    let finalQuantity = quantity != null ? quantity : 1;
    let finalSupplier = supplier || null;
    // Only top-level items carry a catalog reference; cleared for children below.
    let finalCatalogItemId = catalog_item_id != null ? catalog_item_id : null;
    // Set when the new row is a child: its group's pricing mode, which decides
    // whether the child may carry a price at all.
    let parentPricingMode = null;

    if (parent_id) {
      const parentRes = await client.query(
        `SELECT id, item_type, pricing_mode, parent_id, job_id FROM job_items WHERE id = $1`, [parent_id]
      );
      const parent = parentRes.rows[0];
      if (!parent) return res.status(400).json({ error: 'parent_id no existe' });
      if (parent.job_id !== req.params.id) return res.status(400).json({ error: 'parent_id pertenece a otro trabajo' });
      if (parent.parent_id !== null) return res.status(400).json({ error: 'No se admite anidamiento mayor a 1 nivel' });
      finalParentId = parent_id;
      finalItemType = null;
      finalPricingMode = null;
      finalQuantity = 1;
      finalSupplier = null;
      finalCatalogItemId = null;
      parentPricingMode = parent.pricing_mode;
    }

    const cleanChildren = !finalParentId && Array.isArray(children)
      ? children
          .map(c => ({
            description: (c?.description || '').toString().trim(),
            unit_price: Number(c?.unit_price) || 0,
          }))
          .filter(c => c.description)
      : [];
    // A 'detallado' group derives its total from its children, so the root row
    // gets quantity 1 / price 0. An 'agregado' group is priced on the root, so
    // the root keeps the submitted quantity and price even with children.
    const aggregate = finalPricingMode === 'agregado';
    if (cleanChildren.length > 0 && !aggregate) {
      finalQuantity = 1;
    }

    let finalSortOrder = sort_order;
    if (finalSortOrder == null) {
      const maxRes = finalParentId
        ? await client.query(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM job_items
             WHERE job_id = $1 AND parent_id = $2`,
            [req.params.id, finalParentId])
        : await client.query(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM job_items
             WHERE job_id = $1 AND parent_id IS NULL`,
            [req.params.id]);
      finalSortOrder = maxRes.rows[0].next;
    }

    // A child of a 'detallado' group carries the price; a child of an
    // 'agregado' group never does (the group total lives on the root).
    const childPriceAllowed = parentPricingMode !== 'agregado';
    // Root price: unused for a 'detallado' group with children, otherwise the
    // submitted value.
    const rootPrice = cleanChildren.length > 0 && !aggregate
      ? 0
      : (unit_price != null ? unit_price : 0);

    await client.query('BEGIN');
    // Adding the first child to a previously simple 'detallado' item makes its
    // own price phantom data — the total now comes from the children. For an
    // 'agregado' parent the price is the group total, so it must be preserved.
    if (finalParentId && childPriceAllowed) {
      await client.query(
        `UPDATE job_items SET unit_price = 0 WHERE id = $1 AND pricing_mode = 'detallado'`,
        [finalParentId]);
    }
    const r = await client.query(
      `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, pricing_mode, supplier, parent_id, sort_order, catalog_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, description, finalQuantity,
       finalParentId && !childPriceAllowed ? 0 : rootPrice,
       finalItemType, finalPricingMode, finalSupplier, finalParentId,
       finalSortOrder, finalCatalogItemId]
    );
    const created = r.rows[0];
    for (let i = 0; i < cleanChildren.length; i++) {
      const c = cleanChildren[i];
      await client.query(
        `INSERT INTO job_items (job_id, description, quantity, unit_price, item_type, pricing_mode, supplier, parent_id, sort_order)
         VALUES ($1,$2,1,$3,NULL,NULL,NULL,$4,$5)`,
        [req.params.id, c.description, aggregate ? 0 : c.unit_price, created.id, i]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(created);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function updateItem(req, res, next) {
  const client = await pool.connect();
  try {
    const { description, quantity, unit_price, item_type, supplier, sort_order,
            parent_id, pricing_mode } = req.body;
    if (parent_id !== undefined) {
      return res.status(400).json({ error: 'No se admite re-asignar parent_id; eliminar y volver a crear' });
    }

    const currentRes = await client.query(
      `SELECT i.id, i.parent_id, i.pricing_mode,
              EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = i.id) AS has_children,
              (SELECT p.pricing_mode FROM job_items p WHERE p.id = i.parent_id) AS parent_pricing_mode
         FROM job_items i WHERE i.id = $1 AND i.job_id = $2`,
      [req.params.itemId, req.params.id]
    );
    const current = currentRes.rows[0];
    if (!current) return res.status(404).json({ error: 'Item no encontrado' });
    const isChild = current.parent_id !== null;

    // item_type and pricing_mode describe the group as a whole and live only on
    // the root row (migration 024). Rejecting instead of silently ignoring so a
    // stale client that still sends them fails loudly rather than appearing to
    // categorize a sub-item.
    if (isChild && item_type !== undefined) {
      return res.status(400).json({
        error: 'El tipo de item es una propiedad del grupo: editelo en el item principal'
      });
    }
    if (isChild && pricing_mode !== undefined) {
      return res.status(400).json({
        error: 'El modo de precio es una propiedad del grupo: editelo en el item principal'
      });
    }

    const newPricingMode = pricing_mode !== undefined
      ? normalizePricingMode(pricing_mode)
      : current.pricing_mode;
    const modeChanged = !isChild && newPricingMode !== current.pricing_mode;

    // Whichever side of the group doesn't hold the price must stay at 0, so a
    // value left behind by the other mode can never resurface in a total.
    let safeUnitPrice = unit_price;
    if (!isChild && current.has_children && newPricingMode === 'detallado') {
      // Total is derived from the children; the root's own price is phantom.
      if (unit_price != null || modeChanged) safeUnitPrice = 0;
    }
    if (isChild && current.parent_pricing_mode === 'agregado') {
      // Group is priced in aggregate; children carry descriptions only.
      if (unit_price != null) safeUnitPrice = 0;
    }

    await client.query('BEGIN');
    const r = await client.query(`
      UPDATE job_items SET
        description  = COALESCE($1, description), quantity   = COALESCE($2, quantity),
        unit_price   = COALESCE($3, unit_price),  item_type  = COALESCE($4, item_type),
        supplier     = COALESCE($5, supplier),    sort_order = COALESCE($6, sort_order),
        pricing_mode = COALESCE($7, pricing_mode)
      WHERE id = $8 AND job_id = $9 RETURNING *`,
      [description, quantity, safeUnitPrice, isChild ? null : item_type, supplier,
       sort_order, isChild ? null : (pricing_mode !== undefined ? newPricingMode : null),
       req.params.itemId, req.params.id]
    );

    // Switching a group to 'agregado' drops the per-child prices it no longer
    // tracks; the group total now lives on the root instead.
    if (modeChanged && newPricingMode === 'agregado') {
      await client.query(
        `UPDATE job_items SET unit_price = 0 WHERE parent_id = $1`, [req.params.itemId]);
    }
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
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
          SELECT ${jobTotalRounded('j', 'COALESCE(it.subtotal, 0)')} AS total,
                 COALESCE(p.paid, 0) AS total_paid
          FROM jobs j
          LEFT JOIN ( ${JOB_SUBTOTALS_SUBQUERY} ) it ON it.job_id = j.id
          LEFT JOIN ( ${JOB_PAID_SUBQUERY} ) p ON p.job_id = j.id
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
  calcFinancials, groupLineTotal, normalizePricingMode
};
