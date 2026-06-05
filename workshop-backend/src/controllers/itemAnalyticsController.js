const pool = require('../config/database');

const ITEM_TYPES = ['mano_de_obra', 'repuesto', 'otro'];

const RANKING_SORT = {
  usage_count: 'usage_count',
  units:       'units',
  revenue:     'revenue',
  last_used:   'last_used',
  label:       'label',
};

function parseTypes(raw) {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  const cleaned = arr.map(s => String(s).trim()).filter(t => ITEM_TYPES.includes(t));
  return cleaned.length > 0 ? cleaned : null;
}

function parseFilters(req) {
  const q = req.query;
  const types     = parseTypes(q.item_type);
  const origin    = ['catalog', 'adhoc', 'all'].includes(q.origin) ? q.origin : 'all';
  const hierarchy = ['parent', 'child', 'all'].includes(q.hierarchy) ? q.hierarchy : 'parent';
  const basis     = q.basis === 'collected' ? 'collected' : 'invoiced';
  return {
    date_from:  q.date_from || null,
    date_to:    q.date_to   || null,
    client_id:  q.client_id  || null,
    vehicle_id: q.vehicle_id || null,
    make:       q.make ? String(q.make).trim() : null,
    types,
    origin,
    hierarchy,
    basis,
  };
}

// Builds the shared CTE prelude:
//   filtered_jobs: jobs after client/vehicle/make/date/basis filters.
//   child_sums:    per-parent sum of children line revenues.
//   lines:         every job_item joined to its job + computed line_revenue.
//                  Applies type/origin/hierarchy filters here.
// Returns { sql, params, nextIdx } so callers can append more params.
function buildLinesCte(f) {
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };

  const fromP   = push(f.date_from);
  const toP     = push(f.date_to);
  const clientP = push(f.client_id);
  const vehP    = push(f.vehicle_id);
  const makeP   = push(f.make ? `%${f.make.replace(/[\\%_]/g, c => '\\' + c)}%` : null);
  const statusP = push(f.basis === 'collected' ? 'pagado' : null);

  const typesPlaceholder = f.types ? push(f.types) : null;

  const typeWhere = f.types
    ? `AND ji.item_type = ANY(${typesPlaceholder}::text[])`
    : '';

  const originWhere =
    f.origin === 'catalog' ? 'AND ji.catalog_item_id IS NOT NULL'
    : f.origin === 'adhoc' ? 'AND ji.catalog_item_id IS NULL'
    : '';

  const hierarchyWhere =
    f.hierarchy === 'parent' ? 'AND ji.parent_id IS NULL'
    : f.hierarchy === 'child' ? 'AND ji.parent_id IS NOT NULL'
    : '';

  const sql = `
    WITH filtered_jobs AS (
      SELECT j.id, j.job_date, j.status
      FROM jobs j
      LEFT JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.deleted_at IS NULL
        AND (${fromP}::date IS NULL OR j.job_date >= ${fromP}::date)
        AND (${toP}::date   IS NULL OR j.job_date <= ${toP}::date)
        AND (${clientP}::uuid IS NULL OR j.client_id  = ${clientP}::uuid)
        AND (${vehP}::uuid    IS NULL OR j.vehicle_id = ${vehP}::uuid)
        AND (${makeP}::text   IS NULL OR v.make ILIKE ${makeP}::text)
        AND (${statusP}::text IS NULL OR j.status = ${statusP}::text)
    ),
    child_sums AS (
      SELECT ji.parent_id,
             SUM(ji.quantity * ji.unit_price)::numeric AS children_revenue,
             SUM(ji.quantity)::numeric                 AS children_units
      FROM job_items ji
      JOIN filtered_jobs fj ON fj.id = ji.job_id
      WHERE ji.parent_id IS NOT NULL
      GROUP BY ji.parent_id
    ),
    lines AS (
      SELECT
        ji.id,
        ji.job_id,
        ji.catalog_item_id,
        ji.description,
        ji.item_type,
        ji.parent_id,
        ji.quantity,
        ji.unit_price,
        fj.job_date,
        CASE
          WHEN ji.parent_id IS NULL AND cs.children_revenue IS NOT NULL
            THEN cs.children_revenue
          ELSE ji.quantity * ji.unit_price
        END AS line_revenue,
        CASE
          WHEN ji.parent_id IS NULL AND cs.children_units IS NOT NULL
            THEN cs.children_units
          ELSE ji.quantity
        END AS line_units
      FROM job_items ji
      JOIN filtered_jobs fj ON fj.id = ji.job_id
      LEFT JOIN child_sums cs ON cs.parent_id = ji.id
      WHERE 1=1 ${typeWhere} ${originWhere} ${hierarchyWhere}
    )
  `;

  return { sql, params };
}

async function ranking(req, res, next) {
  try {
    const f = parseFilters(req);
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.page_size) || 10));
    const sortCol  = RANKING_SORT[req.query.sort] || 'usage_count';
    const order    = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const offset   = (page - 1) * pageSize;

    const { sql: cte, params } = buildLinesCte(f);

    // Use $-placeholders consistent with cte's params accumulator.
    const push = (v) => { params.push(v); return `$${params.length}`; };
    const limitP  = push(pageSize);
    const offsetP = push(offset);

    const q = `
      ${cte},
      grouped AS (
        SELECT
          COALESCE(catalog_item_id::text, '__ADHOC__') AS group_key,
          catalog_item_id,
          (array_agg(description ORDER BY job_date DESC))[1] AS sample_description,
          MODE() WITHIN GROUP (ORDER BY item_type) AS item_type_mode,
          COUNT(*)::int       AS usage_count,
          SUM(line_units)     AS units,
          SUM(line_revenue)   AS revenue,
          MAX(job_date)       AS last_used
        FROM lines
        GROUP BY COALESCE(catalog_item_id::text, '__ADHOC__'), catalog_item_id
      ),
      labeled AS (
        SELECT
          g.group_key,
          g.catalog_item_id,
          CASE
            WHEN g.catalog_item_id IS NULL THEN 'Ad-hoc'
            ELSE COALESCE(ic.description, g.sample_description)
          END AS label,
          COALESCE(ic.item_type, g.item_type_mode) AS item_type,
          CASE WHEN g.catalog_item_id IS NULL THEN 'adhoc' ELSE 'catalog' END AS origin,
          g.usage_count,
          g.units,
          g.revenue,
          g.last_used
        FROM grouped g
        LEFT JOIN item_catalog ic ON ic.id = g.catalog_item_id
      )
      SELECT
        *,
        COUNT(*)        OVER () AS total_count,
        SUM(revenue)    OVER () AS revenue_total
      FROM labeled
      ORDER BY ${sortCol} ${order} NULLS LAST, label ASC
      LIMIT ${limitP} OFFSET ${offsetP}
    `;

    const r = await pool.query(q, params);
    const totalCount = r.rows[0] ? parseInt(r.rows[0].total_count) : 0;
    const revenueTotal = r.rows[0] ? parseFloat(r.rows[0].revenue_total) : 0;

    res.json({
      page,
      page_size: pageSize,
      total: totalCount,
      revenue_total: revenueTotal,
      rows: r.rows.map(row => ({
        group_key:    row.group_key,
        catalog_item_id: row.catalog_item_id,
        label:        row.label,
        item_type:    row.item_type,
        origin:       row.origin,
        usage_count:  parseInt(row.usage_count),
        units:        parseFloat(row.units) || 0,
        revenue:      parseFloat(row.revenue) || 0,
        revenue_pct:  revenueTotal > 0
          ? Math.round((parseFloat(row.revenue) / revenueTotal) * 10000) / 100
          : 0,
        last_used:    row.last_used,
      })),
    });
  } catch (err) { next(err); }
}

async function mix(req, res, next) {
  try {
    const f = parseFilters(req);
    const { sql: cte, params } = buildLinesCte(f);

    const q = `
      ${cte},
      by_type AS (
        SELECT item_type,
               COUNT(*)::int     AS usage_count,
               SUM(line_revenue) AS revenue
        FROM lines
        GROUP BY item_type
      ),
      by_month AS (
        SELECT TO_CHAR(job_date, 'YYYY-MM') AS month,
               item_type,
               SUM(line_revenue) AS revenue
        FROM lines
        GROUP BY TO_CHAR(job_date, 'YYYY-MM'), item_type
      )
      SELECT
        json_build_object(
          'by_type', COALESCE((
            SELECT json_agg(json_build_object(
              'item_type',   item_type,
              'usage_count', usage_count,
              'revenue',     revenue
            ) ORDER BY revenue DESC) FROM by_type
          ), '[]'::json),
          'monthly', COALESCE((
            SELECT json_agg(json_build_object(
              'month',     month,
              'item_type', item_type,
              'revenue',   revenue
            ) ORDER BY month ASC, item_type ASC) FROM by_month
          ), '[]'::json)
        ) AS payload
    `;

    const r = await pool.query(q, params);
    const payload = r.rows[0]?.payload || { by_type: [], monthly: [] };

    payload.by_type = (payload.by_type || []).map(row => ({
      item_type:   row.item_type,
      usage_count: parseInt(row.usage_count),
      revenue:     parseFloat(row.revenue) || 0,
    }));
    payload.monthly = (payload.monthly || []).map(row => ({
      month:     row.month,
      item_type: row.item_type,
      revenue:   parseFloat(row.revenue) || 0,
    }));
    res.json(payload);
  } catch (err) { next(err); }
}

async function priceDispersion(req, res, next) {
  try {
    // Force origin=catalog and hierarchy=parent: dispersion only makes sense
    // for catalog-tracked parent items.
    const f = { ...parseFilters(req), origin: 'catalog', hierarchy: 'parent' };
    const { sql: cte, params } = buildLinesCte(f);

    const q = `
      ${cte},
      stats AS (
        SELECT
          catalog_item_id,
          COUNT(*)::int                                       AS n_uses,
          ROUND(AVG(unit_price)::numeric, 2)                  AS avg_price,
          MIN(unit_price)                                     AS min_price,
          MAX(unit_price)                                     AS max_price,
          ROUND(COALESCE(STDDEV_SAMP(unit_price), 0)::numeric, 2) AS stddev_price,
          MAX(job_date)                                       AS last_used
        FROM lines
        WHERE catalog_item_id IS NOT NULL
        GROUP BY catalog_item_id
      )
      SELECT
        s.catalog_item_id,
        ic.description AS label,
        ic.item_type,
        s.n_uses,
        s.avg_price,
        s.min_price,
        s.max_price,
        s.stddev_price,
        s.last_used,
        CASE
          WHEN s.avg_price > 0 THEN ROUND((s.stddev_price / s.avg_price)::numeric, 4)
          ELSE 0
        END AS cv
      FROM stats s
      JOIN item_catalog ic ON ic.id = s.catalog_item_id
      ORDER BY n_uses DESC, ic.description ASC
    `;

    const r = await pool.query(q, params);
    res.json({
      items: r.rows.map(row => {
        const avg = parseFloat(row.avg_price) || 0;
        const min = parseFloat(row.min_price) || 0;
        const max = parseFloat(row.max_price) || 0;
        const stddev = parseFloat(row.stddev_price) || 0;
        const cv = parseFloat(row.cv) || 0;
        const n = parseInt(row.n_uses);
        const isOutlier = n >= 2 && (cv > 0.3 || (min > 0 && max >= 2 * min));
        return {
          catalog_item_id: row.catalog_item_id,
          label:        row.label,
          item_type:    row.item_type,
          n_uses:       n,
          avg_price:    avg,
          min_price:    min,
          max_price:    max,
          stddev_price: stddev,
          cv,
          last_used:    row.last_used,
          is_outlier:   isOutlier,
        };
      }),
    });
  } catch (err) { next(err); }
}

async function adhocCandidates(req, res, next) {
  try {
    // Always parent-level ad-hoc items, regardless of incoming hierarchy/origin.
    const f = { ...parseFilters(req), origin: 'adhoc', hierarchy: 'parent' };
    const { sql: cte, params } = buildLinesCte(f);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));

    const q = `
      ${cte}
      SELECT
        LOWER(TRIM(description)) AS normalized_description,
        (array_agg(description ORDER BY job_date DESC))[1] AS sample_description,
        MODE() WITHIN GROUP (ORDER BY item_type) AS item_type,
        COUNT(*)::int                          AS usage_count,
        COUNT(DISTINCT job_id)::int            AS distinct_jobs,
        ROUND(AVG(unit_price)::numeric, 2)     AS avg_price,
        SUM(line_revenue)                      AS revenue,
        MAX(job_date)                          AS last_used
      FROM lines
      WHERE description IS NOT NULL AND TRIM(description) <> ''
      GROUP BY LOWER(TRIM(description))
      ORDER BY usage_count DESC, revenue DESC NULLS LAST
      LIMIT ${limit}
    `;

    const r = await pool.query(q, params);
    res.json({
      candidates: r.rows.map(row => ({
        normalized_description: row.normalized_description,
        sample_description:     row.sample_description,
        item_type:              row.item_type,
        usage_count:            parseInt(row.usage_count),
        distinct_jobs:          parseInt(row.distinct_jobs),
        avg_price:              parseFloat(row.avg_price) || 0,
        revenue:                parseFloat(row.revenue) || 0,
        last_used:              row.last_used,
      })),
    });
  } catch (err) { next(err); }
}

module.exports = {
  ranking, mix, priceDispersion, adhocCandidates,
  // exported for tests
  _internal: { parseFilters, buildLinesCte, ITEM_TYPES, RANKING_SORT },
};
