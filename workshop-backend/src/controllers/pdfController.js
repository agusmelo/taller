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
  const labels = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Credito', cheque: 'Cheque' };
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
  const workshopName     = process.env.WORKSHOP_NAME     || 'Taller Mecanico';
  const workshopAddress  = process.env.WORKSHOP_ADDRESS  || '';
  const workshopPhone    = process.env.WORKSHOP_PHONE    || '';
  const workshopEmail    = process.env.WORKSHOP_EMAIL    || '';
  const workshopServices = process.env.WORKSHOP_SERVICES || '';

  let logoHtml = `<h1 style="margin:0;font-size:22px;color:#C41E2A;">${workshopName}</h1>`;
  const logoPath = path.join(__dirname, '../../assets/logo.png');
  if (fs.existsSync(logoPath)) {
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    logoHtml = `<img src="data:image/png;base64,${logoBase64}" style="max-height:70px;max-width:250px;" alt="${workshopName}">`;
  }

  const grouped = groupItemsByType(items);
  const typeOrder = ['mano_de_obra', 'repuesto', 'otro'];

  let rowIndex = 0;
  let itemsHtml = '';
  for (const type of typeOrder) {
    if (!grouped[type]) continue;
    itemsHtml += `
      <tr><td colspan="4" style="background:#C41E2A;color:white;font-weight:bold;padding:8px 10px;font-size:12px;">${getItemTypeLabel(type)}</td></tr>`;
    for (const item of grouped[type]) {
      const lineTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      const bgColor = rowIndex % 2 === 0 ? '#ffffff' : '#fff0f0';
      itemsHtml += `
        <tr style="background:${bgColor};">
          <td style="padding:7px 10px;border-bottom:1px solid #eee;width:50px;text-align:center;">${item.quantity}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;">${item.description}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;width:110px;">${formatCurrency(item.unit_price)}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;width:110px;">${formatCurrency(lineTotal)}</td>
        </tr>`;
      rowIndex++;
    }
  }

  let paymentsHtml = '';
  if (payments.length > 0) {
    paymentsHtml = `
      <div style="margin-top:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#C41E2A;color:white;">
            <th style="text-align:left;padding:7px 10px;">Fecha</th>
            <th style="text-align:left;padding:7px 10px;">Metodo</th>
            <th style="text-align:left;padding:7px 10px;">Referencia</th>
            <th style="text-align:right;padding:7px 10px;">Monto</th>
          </tr>
          ${payments.map((p, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fff0f0'};">
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">${formatDate(p.paid_at)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">${getMethodLabel(p.method)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.reference || '-'}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(p.amount)}</td>
            </tr>
          `).join('')}
        </table>
      </div>`;
  }

  const discountLabel = job.discount_type === 'percentage'
    ? `Descuento (${parseFloat(job.discount_amount)}%)`
    : 'Descuento';

  const balanceColor = financials.balance > 0 ? '#C41E2A' : '#28a745';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #333; padding: 25px 30px; }
  </style>
</head>
<body>
  <!-- Header -->
  <table style="width:100%;margin-bottom:5px;">
    <tr>
      <td style="width:250px;vertical-align:middle;">${logoHtml}</td>
      <td style="text-align:center;vertical-align:middle;">
        <div style="font-size:20px;font-weight:bold;color:#C41E2A;letter-spacing:1px;">HOJA DE SERVICIO</div>
      </td>
      <td style="width:160px;text-align:right;vertical-align:middle;">
        <div style="font-size:16px;font-weight:bold;color:#333;">N.o ${job.job_number}</div>
        <div style="font-size:11px;color:#666;">Estado: ${getStatusLabel(job.status)}</div>
      </td>
    </tr>
  </table>
  <div style="border-top:3px solid #C41E2A;margin-bottom:18px;"></div>

  <!-- Client & Vehicle Info -->
  <table style="width:100%;font-size:12px;margin-bottom:18px;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:15px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 8px;background:#f5f5f5;font-weight:bold;color:#C41E2A;border:1px solid #ddd;" colspan="2">CLIENTE</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;border:1px solid #eee;width:70px;color:#666;">Nombre</td>
            <td style="padding:4px 8px;border:1px solid #eee;font-weight:500;">${job.client_name}</td>
          </tr>
          ${job.client_rut ? `<tr><td style="padding:4px 8px;border:1px solid #eee;color:#666;">RUT</td><td style="padding:4px 8px;border:1px solid #eee;">${job.client_rut}</td></tr>` : ''}
          ${job.client_phone ? `<tr><td style="padding:4px 8px;border:1px solid #eee;color:#666;">Tel</td><td style="padding:4px 8px;border:1px solid #eee;">${job.client_phone}</td></tr>` : ''}
          ${job.client_address ? `<tr><td style="padding:4px 8px;border:1px solid #eee;color:#666;">Dir</td><td style="padding:4px 8px;border:1px solid #eee;">${job.client_address}</td></tr>` : ''}
          <tr>
            <td style="padding:4px 8px;border:1px solid #eee;color:#666;">Fecha</td>
            <td style="padding:4px 8px;border:1px solid #eee;">${formatDate(job.job_date || job.created_at)}</td>
          </tr>
        </table>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:15px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 8px;background:#f5f5f5;font-weight:bold;color:#C41E2A;border:1px solid #ddd;" colspan="2">VEHICULO</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;border:1px solid #eee;width:70px;color:#666;">Mat.</td>
            <td style="padding:4px 8px;border:1px solid #eee;font-weight:bold;">${job.plate_number}</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;border:1px solid #eee;color:#666;">Vehiculo</td>
            <td style="padding:4px 8px;border:1px solid #eee;">${job.make} ${job.model}${job.year ? ` (${job.year})` : ''}</td>
          </tr>
          ${job.color ? `<tr><td style="padding:4px 8px;border:1px solid #eee;color:#666;">Color</td><td style="padding:4px 8px;border:1px solid #eee;">${job.color}</td></tr>` : ''}
          ${job.mileage_at_service ? `<tr><td style="padding:4px 8px;border:1px solid #eee;color:#666;">Kmts</td><td style="padding:4px 8px;border:1px solid #eee;">${job.mileage_at_service.toLocaleString('es-UY')} km</td></tr>` : ''}
        </table>
      </td>
    </tr>
  </table>

  <!-- Items Table -->
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr style="background:#C41E2A;color:white;">
      <th style="padding:8px 10px;text-align:center;width:50px;">Cant.</th>
      <th style="padding:8px 10px;text-align:left;">Descripcion</th>
      <th style="padding:8px 10px;text-align:right;width:110px;">Precio unit.</th>
      <th style="padding:8px 10px;text-align:right;width:110px;">Total</th>
    </tr>
    ${itemsHtml}
  </table>

  <!-- Totals -->
  <table style="margin-top:15px;margin-left:auto;width:280px;font-size:12px;">
    <tr><td style="padding:5px 10px;">Subtotal:</td><td style="text-align:right;padding:5px 10px;">${formatCurrency(financials.subtotal)}</td></tr>
    ${financials.discount > 0 ? `<tr><td style="padding:5px 10px;">${discountLabel}:</td><td style="text-align:right;padding:5px 10px;color:#C41E2A;">- ${formatCurrency(financials.discount)}</td></tr>` : ''}
    ${job.tax_enabled ? `<tr><td style="padding:5px 10px;">IVA (${Math.round(parseFloat(job.tax_rate) * 100)}%):</td><td style="text-align:right;padding:5px 10px;">+ ${formatCurrency(financials.tax)}</td></tr>` : ''}
    <tr style="border-top:2px solid #C41E2A;"><td style="padding:8px 10px;font-weight:bold;font-size:14px;">TOTAL:</td><td style="text-align:right;padding:8px 10px;font-weight:bold;font-size:14px;">${formatCurrency(financials.total)}</td></tr>
    ${financials.total_paid > 0 ? `<tr><td style="padding:5px 10px;">Pagado:</td><td style="text-align:right;padding:5px 10px;">- ${formatCurrency(financials.total_paid)}</td></tr>` : ''}
    ${financials.balance > 0 ? `<tr><td style="padding:5px 10px;color:${balanceColor};font-weight:bold;">Saldo:</td><td style="text-align:right;padding:5px 10px;color:${balanceColor};font-weight:bold;">${formatCurrency(financials.balance)}</td></tr>` : ''}
  </table>

  ${paymentsHtml}

  ${job.notes ? `<div style="margin-top:18px;padding:10px;background:#fffef0;border:1px solid #e0dcc0;border-radius:4px;font-size:12px;"><strong>Notas:</strong> ${job.notes}</div>` : ''}

  <!-- Footer -->
  <div style="margin-top:30px;border-top:3px solid #C41E2A;padding-top:10px;text-align:center;">
    ${workshopServices ? `<p style="font-size:10px;color:#C41E2A;margin-bottom:6px;">${workshopServices}</p>` : ''}
    <p style="font-size:10px;color:#666;">${workshopAddress} | ${workshopPhone} | ${workshopEmail}</p>
    <p style="font-size:9px;color:#999;margin-top:4px;">Generado el ${formatDate(new Date())}</p>
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
