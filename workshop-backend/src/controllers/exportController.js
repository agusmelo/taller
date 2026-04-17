const pool = require('../config/database');

function toCsv(rows, columns) {
  if (!rows.length) return columns.map(c => c.label).join(',') + '\n';
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      let val = row[c.key];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
      return val;
    }).join(',')
  ).join('\n');
  return header + '\n' + body + '\n';
}

async function exportJobs(req, res, next) {
  try {
    const { date_from, date_to } = req.query;
    const params = [];
    const conditions = ['j.deleted_at IS NULL'];

    if (date_from) {
      params.push(date_from);
      conditions.push(`j.job_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`j.job_date <= $${params.length}`);
    }

    const r = await pool.query(`
      SELECT j.job_number, j.job_date, j.status,
             c.full_name AS client_name, c.rut AS client_rut,
             v.plate_number, v.make, v.model,
             j.mileage_at_service,
             COALESCE(it.subtotal, 0) AS subtotal,
             COALESCE(py.paid, 0) AS total_paid,
             COALESCE(it.subtotal, 0) - COALESCE(py.paid, 0) AS saldo,
             j.notes
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN (SELECT job_id, SUM(quantity * unit_price) AS subtotal FROM job_items GROUP BY job_id) it ON it.job_id = j.id
      LEFT JOIN (SELECT job_id, SUM(amount) AS paid FROM payments GROUP BY job_id) py ON py.job_id = j.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY j.job_date DESC, j.created_at DESC
    `, params);

    const csv = toCsv(r.rows, [
      { key: 'job_number', label: 'Numero' },
      { key: 'job_date', label: 'Fecha' },
      { key: 'status', label: 'Estado' },
      { key: 'client_name', label: 'Cliente' },
      { key: 'client_rut', label: 'RUT' },
      { key: 'plate_number', label: 'Patente' },
      { key: 'make', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'mileage_at_service', label: 'Kilometraje' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'total_paid', label: 'Pagado' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'notes', label: 'Notas' },
    ]);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="trabajos.csv"'
    });
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
}

async function exportClients(req, res, next) {
  try {
    const r = await pool.query(`
      SELECT c.full_name, c.rut, c.phone, c.email, c.address, c.type,
             COUNT(DISTINCT j.id) AS job_count,
             COALESCE(SUM(DISTINCT it.subtotal_per_job), 0) AS total_facturado,
             COALESCE(SUM(DISTINCT py.paid_per_job), 0) AS total_pagado
      FROM clients c
      LEFT JOIN jobs j ON j.client_id = c.id AND j.deleted_at IS NULL
      LEFT JOIN (SELECT job_id, SUM(quantity * unit_price) AS subtotal_per_job FROM job_items GROUP BY job_id) it ON it.job_id = j.id
      LEFT JOIN (SELECT job_id, SUM(amount) AS paid_per_job FROM payments GROUP BY job_id) py ON py.job_id = j.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.rut, c.phone, c.email, c.address, c.type
      ORDER BY c.full_name
    `);

    const csv = toCsv(r.rows.map(row => ({
      ...row,
      saldo: (parseFloat(row.total_facturado) - parseFloat(row.total_pagado)).toFixed(2)
    })), [
      { key: 'full_name', label: 'Nombre' },
      { key: 'rut', label: 'RUT' },
      { key: 'phone', label: 'Telefono' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Direccion' },
      { key: 'type', label: 'Tipo' },
      { key: 'job_count', label: 'Trabajos' },
      { key: 'total_facturado', label: 'Total facturado' },
      { key: 'total_pagado', label: 'Total pagado' },
      { key: 'saldo', label: 'Saldo' },
    ]);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clientes.csv"'
    });
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
}

module.exports = { exportJobs, exportClients };
