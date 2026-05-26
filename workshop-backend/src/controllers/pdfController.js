const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const pool      = require('../config/database');
const { calcFinancials } = require('./jobsController');

// ---------------------------------------------------------------------------
// Design tokens (matches the "Bold Industrial" reference)
// ---------------------------------------------------------------------------
const RED   = '#CC1B1B';
const INK   = '#1a1a1a';
const MUTED = '#8a8a8a';
const LINE  = '#e4e4e4';
const PAGE_BG = '#f0efed';

// ---------------------------------------------------------------------------
// Embedded fonts. Google serves a single variable woff2 per subset, so one
// file covers the whole weight range. Loaded + base64-encoded once at startup
// so every PDF renders identically regardless of system fonts in the container.
// ---------------------------------------------------------------------------
const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const RANGE_LATIN     = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const RANGE_LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

function fontFace(family, file, weightRange, range) {
  const p = path.join(FONT_DIR, file);
  if (!fs.existsSync(p)) return '';
  const b64 = fs.readFileSync(p).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weightRange};font-display:swap;`
       + `src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range};}`;
}

const FONT_CSS = [
  fontFace('Inter',         'Inter-latin.woff2',         '100 900', RANGE_LATIN),
  fontFace('Inter',         'Inter-latin-ext.woff2',     '100 900', RANGE_LATIN_EXT),
  fontFace('Space Grotesk', 'SpaceGrotesk-latin.woff2',  '300 700', RANGE_LATIN),
  fontFace('Space Grotesk', 'SpaceGrotesk-latin-ext.woff2', '300 700', RANGE_LATIN_EXT),
].join('');

const SANS    = "'Inter','DejaVu Sans',Arial,sans-serif";
const DISPLAY = "'Space Grotesk','Inter','DejaVu Sans',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function formatCurrency(amount) {
  return '$ ' + Number(amount).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getItemTypeLabel(type) {
  const labels = { mano_de_obra: 'Mano de obra', repuesto: 'Repuestos', otro: 'Otros' };
  return labels[type] || type;
}

function groupItemsByType(items) {
  const childrenByParent = new Map();
  for (const item of items) {
    if (item.parent_id) {
      const arr = childrenByParent.get(item.parent_id) || [];
      arr.push(item);
      childrenByParent.set(item.parent_id, arr);
    }
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  const roots = items
    .filter(i => !i.parent_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const groups = {};
  for (const root of roots) {
    if (!groups[root.item_type]) groups[root.item_type] = [];
    groups[root.item_type].push({ ...root, _children: childrenByParent.get(root.id) || [] });
  }
  return groups;
}

function lineTotal(rootItem) {
  if (rootItem._children && rootItem._children.length > 0) {
    return rootItem._children.reduce((s, c) => s + parseFloat(c.unit_price), 0);
  }
  return parseFloat(rootItem.quantity) * parseFloat(rootItem.unit_price);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
function buildHeader(job, logoHtml, workshopAddress, workshopPhone) {
  const contact = [workshopAddress, workshopPhone].filter(Boolean).map(esc).join(' · ');
  return `
  <header class="hdr">
    <div class="hdr-brand">
      ${logoHtml}
      ${contact ? `<div class="hdr-contact">${contact}</div>` : ''}
    </div>
    <div class="hdr-meta">
      <span class="hdr-meta-label">Hoja de servicio</span>
      <span class="hdr-meta-num">N.° ${esc(job.job_number)}</span>
    </div>
  </header>
  <div class="hdr-rule"></div>`;
}

function infoRow(label, value) {
  return `<div class="info-row"><span class="info-label">${esc(label)}</span><span class="info-value">${value}</span></div>`;
}

function buildParties(job) {
  const clientRows = [
    infoRow('Nombre', esc(job.client_name)),
    job.client_rut     ? infoRow('RUT', esc(job.client_rut))         : '',
    job.client_phone   ? infoRow('Teléfono', esc(job.client_phone))  : '',
    job.client_address ? infoRow('Dirección', esc(job.client_address)) : '',
    infoRow('Fecha', formatDate(job.job_date || job.created_at)),
  ].join('');

  const vehicleName = `${esc(job.make)} ${esc(job.model)}${job.year ? ` (${esc(job.year)})` : ''}`.trim();
  const vehicleRows = [
    `<div class="info-row"><span class="info-label">Matrícula</span><span class="info-value info-plate">${esc(job.plate_number)}</span></div>`,
    infoRow('Modelo', vehicleName),
    job.color ? infoRow('Color', esc(job.color)) : '',
    job.mileage_at_service ? infoRow('Kilometraje', `${Number(job.mileage_at_service).toLocaleString('es-UY')} km`) : '',
  ].join('');

  return `
  <section class="parties">
    <div class="party">
      <div class="party-title">Cliente</div>
      ${clientRows}
    </div>
    <div class="party">
      <div class="party-title">Vehículo</div>
      ${vehicleRows}
    </div>
  </section>`;
}

function buildItems(job, items) {
  const grouped = groupItemsByType(items);
  const typeOrder = ['mano_de_obra', 'repuesto', 'otro'];
  const showDetailsPricing = job.show_item_details_pricing !== false;

  // Render one line item (parent row + its child rows).
  function itemRows(item) {
    const hasChildren = item._children && item._children.length > 0;
    const total = lineTotal(item);
    const qty = hasChildren ? 1 : item.quantity;
    const unitCell = hasChildren ? '—' : formatCurrency(item.unit_price);

    let rows = `
        <tr class="item-row${hasChildren ? ' has-children' : ''}">
          <td class="c-qty">${esc(qty)}</td>
          <td class="c-desc">${esc(item.description)}</td>
          <td class="c-unit">${unitCell}</td>
          <td class="c-total">${formatCurrency(total)}</td>
        </tr>`;

    if (hasChildren) {
      item._children.forEach((child, i) => {
        let childUnit = '';
        if (showDetailsPricing) {
          childUnit = parseFloat(child.unit_price) > 0 ? formatCurrency(child.unit_price) : '—';
        }
        const last = i === item._children.length - 1;
        rows += `
        <tr class="child-row${last ? ' child-last' : ''}">
          <td class="c-qty"></td>
          <td class="c-desc c-child-desc"><span class="child-guide"></span><span class="child-arrow">↳</span>${esc(child.description)}</td>
          <td class="c-unit c-child-unit">${childUnit}</td>
          <td class="c-total"></td>
        </tr>`;
      });
    }
    return rows;
  }

  let body = '';
  for (const type of typeOrder) {
    if (!grouped[type]) continue;
    const sectionItems = grouped[type];
    const secRow = `<tr class="sec-row"><td colspan="4" class="sec-cell">${esc(getItemTypeLabel(type))}</td></tr>`;

    sectionItems.forEach((item, idx) => {
      // The section header is glued to its first line item so it never lands
      // orphaned at the bottom of a page. Each line item is a break-avoid unit
      // so a parent and its children are never split across pages.
      const lead = idx === 0 ? secRow : '';
      body += `<tbody class="item-group">${lead}${itemRows(item)}</tbody>`;
    });
  }

  return `
  <table class="items">
    <thead>
      <tr class="items-head">
        <th class="c-qty">Cant.</th>
        <th class="c-desc">Descripción</th>
        <th class="c-unit">P. unit.</th>
        <th class="c-total">Total</th>
      </tr>
    </thead>
    ${body}
  </table>`;
}

function buildTotals(job, financials) {
  const rows = [];
  rows.push(`<div class="tot-row"><span>Subtotal</span><span>${formatCurrency(financials.subtotal)}</span></div>`);

  if (financials.discount > 0) {
    const label = job.discount_type === 'percentage'
      ? `Descuento (${parseFloat(job.discount_amount)}%)`
      : 'Descuento';
    rows.push(`<div class="tot-row"><span>${esc(label)}</span><span>− ${formatCurrency(financials.discount)}</span></div>`);
  }
  if (job.tax_enabled) {
    rows.push(`<div class="tot-row"><span>IVA (${Math.round(parseFloat(job.tax_rate) * 100)}%)</span><span>+ ${formatCurrency(financials.tax)}</span></div>`);
  }

  let paidBalance = '';
  if (financials.total_paid > 0) {
    paidBalance += `<div class="tot-row tot-paid"><span>Pagado</span><span>− ${formatCurrency(financials.total_paid)}</span></div>`;
  }
  const owes = financials.balance > 0;
  paidBalance += `<div class="tot-balance ${owes ? 'is-owed' : 'is-clear'}">
      <span>Saldo pendiente</span><span>${formatCurrency(Math.max(financials.balance, 0))}</span>
    </div>`;

  return `
  <section class="summary">
    <div class="totals">
      ${rows.join('')}
      <div class="tot-grand"><span>Total</span><span>${formatCurrency(financials.total)}</span></div>
      ${paidBalance}
    </div>
  </section>`;
}

function buildNotes(job) {
  if (!job.notes || !String(job.notes).trim()) return '';
  return `
  <section class="notes">
    <div class="notes-title">Notas</div>
    <div class="notes-body">${esc(job.notes).replace(/\n/g, '<br>')}</div>
  </section>`;
}

function buildHtml(job, items, financials) {
  const workshopName    = process.env.WORKSHOP_NAME    || 'Taller Mecánico';
  const workshopAddress = process.env.WORKSHOP_ADDRESS || '';
  const workshopPhone   = process.env.WORKSHOP_PHONE   || '';

  let logoHtml = `<div class="brand-name">${esc(workshopName)}</div>`;
  const logoPath = path.join(__dirname, '../../assets/logo.png');
  if (fs.existsSync(logoPath)) {
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    logoHtml = `<img class="brand-logo" src="data:image/png;base64,${logoBase64}" alt="${esc(workshopName)}">`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  ${FONT_CSS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: ${PAGE_BG}; }
  body {
    font-family: ${SANS};
    color: ${INK};
    font-size: 11.5px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { padding: 34px 40px 8px; }

  /* Header */
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand-name {
    font-family: ${DISPLAY}; font-weight: 700; font-size: 30px;
    letter-spacing: .5px; color: ${RED}; text-transform: uppercase; line-height: 1;
  }
  .brand-logo { max-height: 64px; max-width: 280px; }
  .hdr-contact { margin-top: 8px; font-size: 10px; color: ${MUTED}; letter-spacing: .2px; }
  .hdr-meta { text-align: right; white-space: nowrap; padding-top: 4px; }
  .hdr-meta-label { font-size: 10.5px; color: ${MUTED}; letter-spacing: .4px; }
  .hdr-meta-num { font-family: ${DISPLAY}; font-weight: 700; font-size: 14px; color: ${INK}; margin-left: 10px; letter-spacing: .5px; }
  .hdr-rule { height: 4px; background: ${RED}; margin: 14px 0 22px; }

  /* Parties */
  .parties { display: flex; gap: 48px; margin-bottom: 24px; }
  .party { flex: 1; }
  .party-title {
    font-family: ${DISPLAY}; font-weight: 700; font-size: 10.5px; color: ${RED};
    text-transform: uppercase; letter-spacing: 2.5px; padding-left: 10px;
    border-left: 3px solid ${RED}; margin-bottom: 11px; line-height: 1.1;
  }
  .info-row { display: flex; padding: 2.5px 0; }
  .info-label { width: 92px; flex: none; color: ${MUTED}; font-size: 11px; }
  .info-value { font-weight: 500; }
  .info-plate { font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; color: ${RED}; letter-spacing: .5px; }

  /* Items table */
  .items { width: 100%; border-collapse: collapse; }
  .items-head th {
    background: #ebebeb; color: #6b6b6b; font-weight: 700; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 1.2px; padding: 9px 12px; text-align: left;
  }
  .items-head th.c-unit, .items-head th.c-total { text-align: right; }
  .c-qty   { width: 46px; text-align: center; }
  .c-unit  { width: 110px; text-align: right; white-space: nowrap; }
  .c-total { width: 120px; text-align: right; white-space: nowrap; }
  .items-head th.c-qty { text-align: center; }

  .sec-cell {
    font-family: ${DISPLAY}; font-weight: 700; font-size: 10px; color: ${RED};
    text-transform: uppercase; letter-spacing: 2px; padding: 13px 12px 6px;
  }
  .item-row td { padding: 9px 12px; border-bottom: 1px solid ${LINE}; vertical-align: top; }
  .item-row .c-desc   { font-weight: 600; }
  .item-row .c-total  { font-weight: 700; }
  .item-row .c-unit   { color: #555; }

  .item-row.has-children td { border-bottom: 0; }
  .child-row td { padding: 3px 12px; border: 0; }
  .c-child-desc { color: #6f6f6f; font-size: 11px; padding-left: 38px !important; position: relative; }
  .child-guide { position: absolute; left: 13px; top: -3px; bottom: -3px; width: 1px; background: #dcdcdc; }
  .child-arrow { position: absolute; left: 20px; color: #c4c4c4; }
  .c-child-unit { color: #8a8a8a; font-size: 11px; }
  /* close each item group with the divider line under its last row */
  .child-row.child-last td { border-bottom: 1px solid ${LINE}; padding-bottom: 9px; }

  /* a line item (header + parent + its children) is one unit that never splits */
  .item-group { break-inside: avoid; }

  /* Summary (totals) */
  .summary { display: flex; justify-content: flex-end; margin-top: 18px; break-inside: avoid; }
  .totals { width: 300px; }
  .tot-row { display: flex; justify-content: space-between; padding: 5px 14px; color: #555; }
  .tot-row span:last-child { font-variant-numeric: tabular-nums; }
  .tot-paid { color: #555; }
  .tot-grand {
    display: flex; justify-content: space-between; align-items: center;
    background: #b3b3b3; color: #fff; padding: 11px 14px; margin-top: 8px;
  }
  .tot-grand span:first-child { font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; }
  .tot-grand span:last-child  { font-family: ${DISPLAY}; font-weight: 700; font-size: 19px; }
  .tot-balance {
    display: flex; justify-content: space-between; align-items: center;
    background: #e4e4e4; padding: 9px 14px; color: #555;
  }
  .tot-balance span:last-child { font-family: ${DISPLAY}; font-weight: 700; font-size: 14px; }
  .tot-balance.is-owed span:last-child  { color: ${RED}; }
  .tot-balance.is-clear span:last-child { color: #2e7d32; }

  /* Notes */
  .notes { margin-top: 22px; break-inside: avoid; border-left: 3px solid ${RED}; padding: 2px 0 2px 12px; }
  .notes-title { font-family: ${DISPLAY}; font-weight: 700; font-size: 10px; color: ${RED}; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
  .notes-body { font-size: 11px; color: #444; line-height: 1.5; }
</style>
</head>
<body>
  <div class="sheet">
    ${buildHeader(job, logoHtml, workshopAddress, workshopPhone)}
    ${buildParties(job)}
    ${buildItems(job, items)}
    ${buildTotals(job, financials)}
    ${buildNotes(job)}
  </div>
</body>
</html>`;
}

function buildFooter() {
  const workshopName     = process.env.WORKSHOP_NAME     || '';
  const workshopAddress  = process.env.WORKSHOP_ADDRESS  || '';
  const workshopPhone    = process.env.WORKSHOP_PHONE    || '';
  const workshopEmail    = process.env.WORKSHOP_EMAIL    || '';
  const workshopServices = process.env.WORKSHOP_SERVICES || '';

  const contactRight = [workshopPhone, workshopEmail].filter(Boolean).map(esc).join(' · ');
  // Footer templates render in an isolated context that ignores @font-face,
  // so we use a system sans here. It is small grey text, so the difference
  // from Inter is negligible.
  return `
  <div style="width:100%;font-family:Arial,Helvetica,sans-serif;color:#999;padding:0 40px;">
    <div style="border-top:1px solid #d8d8d8;padding-top:7px;"></div>
    ${workshopServices ? `<div style="font-size:7px;color:#9a9a9a;letter-spacing:.2px;line-height:1.35;margin-bottom:5px;">${esc(workshopServices)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:8px;color:#777;">
      <span>${esc(workshopAddress || workshopName)}</span>
      <span>${contactRight}</span>
    </div>
    <div style="text-align:right;font-size:7px;color:#b0b0b0;margin-top:3px;">
      Generado el ${formatDate(new Date())} · Página <span class="pageNumber"></span> de <span class="totalPages"></span>
    </div>
  </div>`;
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
    const itemsRes = await pool.query(
      `SELECT * FROM job_items WHERE job_id = $1
       ORDER BY (parent_id IS NULL) DESC, sort_order, created_at`,
      [req.params.id]
    );
    const paysRes  = await pool.query(`SELECT * FROM payments WHERE job_id = $1 ORDER BY paid_at`, [req.params.id]);

    const financials = calcFinancials(job, itemsRes.rows, paysRes.rows);
    const html = buildHtml(job, itemsRes.rows, financials);

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
      margin: { top: '0mm', right: '0mm', bottom: '30mm', left: '0mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: buildFooter()
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

module.exports = { generatePdf, buildHtml, buildFooter };
