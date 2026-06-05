const { _internal } = require('../src/controllers/itemAnalyticsController');
const { parseFilters, buildLinesCte } = _internal;

function mkReq(query = {}) { return { query }; }

describe('itemAnalytics.parseFilters', () => {
  test('defaults', () => {
    const f = parseFilters(mkReq());
    expect(f).toEqual({
      date_from: null, date_to: null,
      client_id: null, vehicle_id: null, make: null,
      types: null, origin: 'all', hierarchy: 'parent', basis: 'invoiced',
    });
  });

  test('item_type comma-separated', () => {
    const f = parseFilters(mkReq({ item_type: 'repuesto,mano_de_obra,bogus' }));
    expect(f.types).toEqual(['repuesto', 'mano_de_obra']);
  });

  test('item_type as array', () => {
    const f = parseFilters(mkReq({ item_type: ['otro', 'repuesto'] }));
    expect(f.types).toEqual(['otro', 'repuesto']);
  });

  test('only invalid types -> null (no filter)', () => {
    const f = parseFilters(mkReq({ item_type: 'foo,bar' }));
    expect(f.types).toBeNull();
  });

  test('origin/hierarchy validation falls back to defaults', () => {
    const f = parseFilters(mkReq({ origin: 'weird', hierarchy: 'foo' }));
    expect(f.origin).toBe('all');
    expect(f.hierarchy).toBe('parent');
  });

  test('basis=collected accepted', () => {
    expect(parseFilters(mkReq({ basis: 'collected' })).basis).toBe('collected');
    expect(parseFilters(mkReq({ basis: 'other' })).basis).toBe('invoiced');
  });

  test('make trimmed', () => {
    expect(parseFilters(mkReq({ make: '  Toyota  ' })).make).toBe('Toyota');
  });
});

describe('itemAnalytics.buildLinesCte', () => {
  test('all-defaults emits no extra WHERE clauses on lines', () => {
    const f = parseFilters(mkReq());
    const { sql, params } = buildLinesCte(f);
    // 6 base params: date_from, date_to, client_id, vehicle_id, make, status
    expect(params).toHaveLength(6);
    // No origin/type clauses should be present
    expect(sql).not.toMatch(/AND ji\.catalog_item_id IS NOT NULL/);
    expect(sql).not.toMatch(/AND ji\.catalog_item_id IS NULL/);
    // Default hierarchy is 'parent'
    expect(sql).toMatch(/AND ji\.parent_id IS NULL/);
    expect(sql).not.toMatch(/AND ji\.item_type = ANY/);
  });

  test('origin=catalog adds NOT NULL clause', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq({ origin: 'catalog' })));
    expect(sql).toMatch(/AND ji\.catalog_item_id IS NOT NULL/);
  });

  test('origin=adhoc adds IS NULL clause', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq({ origin: 'adhoc' })));
    expect(sql).toMatch(/AND ji\.catalog_item_id IS NULL/);
  });

  test('hierarchy=child swaps the parent_id clause', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq({ hierarchy: 'child' })));
    expect(sql).toMatch(/AND ji\.parent_id IS NOT NULL/);
    expect(sql).not.toMatch(/AND ji\.parent_id IS NULL/);
  });

  test('hierarchy=all omits parent clause entirely', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq({ hierarchy: 'all' })));
    expect(sql).not.toMatch(/AND ji\.parent_id IS NULL/);
    expect(sql).not.toMatch(/AND ji\.parent_id IS NOT NULL/);
  });

  test('types filter binds array param', () => {
    const f = parseFilters(mkReq({ item_type: 'repuesto,otro' }));
    const { sql, params } = buildLinesCte(f);
    expect(sql).toMatch(/ji\.item_type = ANY\(\$\d+::text\[\]\)/);
    // Last param should be the types array (others may be null)
    expect(params[params.length - 1]).toEqual(['repuesto', 'otro']);
  });

  test('basis=collected binds status=pagado as the 6th param', () => {
    const f = parseFilters(mkReq({ basis: 'collected' }));
    const { params } = buildLinesCte(f);
    expect(params[5]).toBe('pagado');
  });

  test('basis=invoiced leaves status param null', () => {
    const { params } = buildLinesCte(parseFilters(mkReq()));
    expect(params[5]).toBeNull();
  });

  test('make is escaped for LIKE wildcards', () => {
    const { params } = buildLinesCte(parseFilters(mkReq({ make: '50%_off' })));
    // Escaped: % and _ prefixed with backslash; wrapped in %...%
    expect(params[4]).toBe('%50\\%\\_off%');
  });

  test('children_revenue rule is present (parent qty*price ignored when has children)', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq()));
    expect(sql).toMatch(/cs\.children_revenue IS NOT NULL/);
    expect(sql).toMatch(/THEN cs\.children_revenue/);
  });

  test('line_units mirrors line_revenue rule', () => {
    const { sql } = buildLinesCte(parseFilters(mkReq()));
    expect(sql).toMatch(/cs\.children_units IS NOT NULL/);
  });
});
