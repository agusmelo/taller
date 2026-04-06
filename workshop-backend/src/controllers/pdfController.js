const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const pool      = require('../config/database');
const { calcFinancials } = require('./jobsController');

function formatCurrency(amount) {
  return '$ ' + Number(amount).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('es-UY', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function getStatusLabel(status) {
  const labels = { abierto: 'Abierto', terminado: 'Terminado', pagado: 'Pagado' };
  return labels[status] || status;
}

function getMethodLabel(method) {
  const labels = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Credito' };
  return labels[method] || method;
}

function getItemTypeLabel(type) {
  const labels = { mano_de_obra: 'Mano de Obra', repuesto: 'Repuestos', otro: 'Otros' };
  return labels[type] || type;
}

function groupItemsByType(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.item_type]) groups[item.item_type] = [];
    groups[item.item_type].push(item);
  }
  return groups;
}

function buildHtml(job, items, payments, financials) {
  const workshopName    = process.env.WORKSHOP_NAME    || 'Taller Mecanico';
  const workshopAddress = process.env.WORKSHOP_ADDRESS || '';
  const workshopPhone   = process.env.WORKSHOP_PHONE   || '';
  const workshopEmail   = process.env.WORKSHOP_EMAIL   || '';

  let logoHtml = `<h1 style="margin:0;font-size:24px;color:#1a1a1a;">${workshopName}</h1>`;
  const logoPath = path.join(__dirname, '../../assets/logo.png');
  if (fs.existsSync(logoPath)) {
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    logoHtml = `<img src="data:image/png;base64,${logoBase64}" style="max-height:80px;max-width:300px;" alt="${workshopName}">`;
  }

  const grouped = groupItemsByType(items);
  const typeOrder = ['mano_de_obra', 'repuesto', 'otro'];

  let itemsHtml = '';
  for (const type of typeOrder) {
    if (!grouped[type]) continue;
    itemsHtml += `
      <tr><td colspan="4" style="background:#f0f0f0;font-weight:bold;padding:8px;border:1px solid #ddd;">${getItemTypeLabel(type)}</td></tr>
      <tr style="background:#f8f8f8;">
        <th style="text-align:left;padding:6px;border:1px solid #ddd;">Cant.</th>
        <th style="text-align:left;padding:6px;border:1px solid #ddd;">Descripcion</th>
        <th style="text-align:right;padding:6px;border:1px solid #ddd;">Precio unit.</th>
        <th style="text-align:right;padding:6px;border:1px solid #ddd;">Total</th>
      </tr>`;
    for (const item of grouped[type]) {
      const lineTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      itemsHtml += `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${item.quantity}</td>
          <td style="padding:6px;border:1px solid #ddd;">${item.description}${item.supplier ? ` <span style="color:#888;font-size:11px;">(${item.supplier})</span>` : ''}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(lineTotal)}</td>
        </tr>`;
    }
  }

  let paymentsHtml = '';
  if (payments.length > 0) {
    paymentsHtml = `
      <h3 style="margin-top:20px;">Pagos recibidos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="background:#f8f8f8;">
          <th style="text-align:left;padding:6px;border:1px solid #ddd;">Fecha</th>
          <th style="text-align:left;padding:6px;border:1px solid #ddd;">Metodo</th>
          <th style="text-align:left;padding:6px;border:1px solid #ddd;">Referencia</th>
          <th style="text-align:right;padding:6px;border:1px solid #ddd;">Monto</th>
        </tr>
        ${payments.map(p => `
          <tr>
            <td style="padding:6px;border:1px solid #ddd;">${formatDate(p.paid_at)}</td>
            <td style="padding:6px;border:1px solid #ddd;">${getMethodLabel(p.method)}</td>
            <td style="padding:6px;border:1px solid #ddd;">${p.reference || '-'}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(p.amount)}</td>
          </tr>
        `).join('')}
      </table>`;
  }

  const discountLabel = job.discount_type === 'percentage'
    ? `Descuento (${parseFloat(job.discount_amount)}%)`
    : 'Descuento';

  const balanceColor = financials.balance > 0 ? '#dc3545' : '#28a745';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #333; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 2px solid #333; padding-bottom: 15px; }
    .header-left { flex: 1; }
    .header-right { text-align: right; font-size: 12px; color: #666; }
    .info-section { display: flex; gap: 30px; margin-bottom: 20px; }
    .info-box { flex: 1; background: #f9f9f9; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0; }
    .info-box h3 { font-size: 13px; margin-bottom: 8px; color: #555; text-transform: uppercase; }
    .info-box p { margin: 3px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .totals { margin-top: 15px; margin-left: auto; width: 300px; }
    .totals tr td { padding: 6px 10px; }
    .totals tr:last-child { font-weight: bold; font-size: 14px; border-top: 2px solid #333; }
    .notes { margin-top: 20px; padding: 10px; background: #fffef0; border: 1px solid #e0dcc0; border-radius: 4px; font-size: 12px; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <p style="font-size:12px;color:#666;margin-top:4px;">${workshopAddress}</p>
      <p style="font-size:12px;color:#666;">${workshopPhone} | ${workshopEmail}</p>
    </div>
    <div class="header-right">
      <p style="font-size:18px;font-weight:bold;color:#333;">N.o ${job.job_number}</p>
      <p>Fecha: ${formatDate(job.created_at)}</p>
      <p>Estado: <strong>${getStatusLabel(job.status)}</strong></p>
    </div>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>Cliente</h3>
      <p><strong>${job.client_name}</strong></p>
      ${job.client_rut ? `<p>RUT: ${job.client_rut}</p>` : ''}
      ${job.client_phone ? `<p>Tel: ${job.client_phone}</p>` : ''}
      ${job.client_address ? `<p>${job.client_address}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Vehiculo</h3>
      <p><strong>${job.plate_number}</strong></p>
      <p>${job.make} ${job.model}${job.year ? ` (${job.year})` : ''}</p>
      ${job.color ? `<p>Color: ${job.color}</p>` : ''}
      ${job.mileage_at_service ? `<p>Km: ${job.mileage_at_service.toLocaleString('es-UY')}</p>` : ''}
    </div>
  </div>

  <table>
    ${itemsHtml}
  </table>

  <table class="totals">
    <tr><td>Subtotal:</td><td style="text-align:right;">${formatCurrency(financials.subtotal)}</td></tr>
    ${financials.discount > 0 ? `<tr><td>${discountLabel}:</td><td style="text-align:right;color:#dc3545;">- ${formatCurrency(financials.discount)}</td></tr>` : ''}
    ${job.tax_enabled ? `<tr><td>IVA (${Math.round(parseFloat(job.tax_rate) * 100)}%):</td><td style="text-align:right;">+ ${formatCurrency(financials.tax)}</td></tr>` : ''}
    <tr><td>TOTAL:</td><td style="text-align:right;">${formatCurrency(financials.total)}</td></tr>
    ${financials.total_paid > 0 ? `<tr><td>Pagado:</td><td style="text-align:right;">- ${formatCurrency(financials.total_paid)}</td></tr>` : ''}
    ${financials.balance !== 0 ? `<tr><td style="color:${balanceColor};font-weight:bold;">Saldo a pagar:</td><td style="text-align:right;color:${balanceColor};font-weight:bold;">${formatCurrency(financials.balance)}</td></tr>` : ''}
  </table>

  ${paymentsHtml}

  ${job.notes ? `<div class="notes"><strong>Notas:</strong> ${job.notes}</div>` : ''}

  <div class="footer">
    Generado el ${formatDate(new Date())} &middot; ${workshopName}
  </div>
</body>
</html>`;
}

async function generatePdf(req, res, next) {
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

    const job = jobRes.rows[0];
    const itemsRes = await pool.query(`SELECT * FROM job_items WHERE job_id = $1 ORDER BY item_type, created_at`, [req.params.id]);
    const paysRes  = await pool.query(`SELECT * FROM payments WHERE job_id = $1 ORDER BY paid_at`, [req.params.id]);

    const financials = calcFinancials(job, itemsRes.rows, paysRes.rows);
    const html = buildHtml(job, itemsRes.rows, paysRes.rows, financials);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="font-size:9px;text-align:center;width:100%;color:#999;">Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="trabajo-${job.job_number}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
}

module.exports = { generatePdf };
