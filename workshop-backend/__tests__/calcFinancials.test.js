const { calcFinancials } = require('../src/controllers/jobsController');

describe('calcFinancials', () => {
  const baseJob = {
    tax_enabled: true,
    tax_rate: 0.22,
    discount_amount: 0,
    discount_type: 'fixed'
  };

  test('basic calculation with IVA', () => {
    const items = [
      { quantity: 1, unit_price: 1000 },
      { quantity: 2, unit_price: 500 }
    ];
    const payments = [];
    const result = calcFinancials(baseJob, items, payments);

    expect(result.subtotal).toBe(2000);
    expect(result.discount).toBe(0);
    expect(result.tax).toBe(440); // 2000 * 0.22
    expect(result.total).toBe(2440);
    expect(result.total_paid).toBe(0);
    expect(result.balance).toBe(2440);
  });

  test('fixed discount applied before tax', () => {
    const job = { ...baseJob, discount_amount: 200, discount_type: 'fixed' };
    const items = [{ quantity: 1, unit_price: 1000 }];
    const result = calcFinancials(job, items, []);

    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(200);
    expect(result.tax).toBe(176); // (1000 - 200) * 0.22
    expect(result.total).toBe(976); // 800 + 176
  });

  test('percentage discount', () => {
    const job = { ...baseJob, discount_amount: 10, discount_type: 'percentage' };
    const items = [{ quantity: 1, unit_price: 1000 }];
    const result = calcFinancials(job, items, []);

    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(100); // 10% of 1000
    expect(result.tax).toBe(198); // (1000 - 100) * 0.22
    expect(result.total).toBe(1098); // 900 + 198
  });

  test('no IVA when tax_enabled is false', () => {
    const job = { ...baseJob, tax_enabled: false };
    const items = [{ quantity: 1, unit_price: 1000 }];
    const result = calcFinancials(job, items, []);

    expect(result.tax).toBe(0);
    expect(result.total).toBe(1000);
  });

  test('payments reduce balance', () => {
    const items = [{ quantity: 1, unit_price: 1000 }];
    const payments = [
      { amount: 500 },
      { amount: 300 }
    ];
    const result = calcFinancials(baseJob, items, payments);

    expect(result.total_paid).toBe(800);
    expect(result.balance).toBe(420); // 1220 - 800
  });

  test('fully paid results in zero balance', () => {
    const job = { ...baseJob, tax_enabled: false, discount_amount: 0 };
    const items = [{ quantity: 1, unit_price: 1000 }];
    const payments = [{ amount: 1000 }];
    const result = calcFinancials(job, items, payments);

    expect(result.balance).toBe(0);
  });

  test('overpayment results in negative balance', () => {
    const job = { ...baseJob, tax_enabled: false, discount_amount: 0 };
    const items = [{ quantity: 1, unit_price: 1000 }];
    const payments = [{ amount: 1200 }];
    const result = calcFinancials(job, items, payments);

    expect(result.balance).toBe(-200);
  });

  test('empty items produce zero totals', () => {
    const result = calcFinancials(baseJob, [], []);
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
    expect(result.balance).toBe(0);
  });

  test('handles string numeric values (from database)', () => {
    const items = [{ quantity: '2', unit_price: '500.50' }];
    const payments = [{ amount: '100' }];
    const result = calcFinancials(baseJob, items, payments);

    expect(result.subtotal).toBe(1001);
    expect(result.total_paid).toBe(100);
  });

  describe('hierarchical items', () => {
    const noTaxJob = { ...baseJob, tax_enabled: false };

    test('parent with children: line total = sum of children, parent unit_price ignored', () => {
      const items = [
        { id: 'p1', parent_id: null, quantity: 1, unit_price: 999 }, // unit_price ignored
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 1500 },
        { id: 'c2', parent_id: 'p1', quantity: 1, unit_price: 800 }
      ];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(2300);
      expect(result.total).toBe(2300);
    });

    test('mixed: parent-with-children + standalone item', () => {
      const items = [
        { id: 'p1', parent_id: null, quantity: 1, unit_price: 0 },
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 1500 },
        { id: 'c2', parent_id: 'p1', quantity: 1, unit_price: 500 },
        { id: 's1', parent_id: null, quantity: 2, unit_price: 300 }
      ];
      const result = calcFinancials(noTaxJob, items, []);
      // 2000 from parent + 600 from standalone = 2600
      expect(result.subtotal).toBe(2600);
    });

    test('parent with empty children list contributes only parent total', () => {
      const items = [{ id: 'p1', parent_id: null, quantity: 1, unit_price: 0 }];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(0);
    });

    test('children contribute via parent grouping, not directly to subtotal', () => {
      // Two children both belonging to same parent — must NOT be summed twice.
      const items = [
        { id: 'p1', parent_id: null, quantity: 5, unit_price: 9999 }, // qty/price ignored
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 100 },
        { id: 'c2', parent_id: 'p1', quantity: 1, unit_price: 200 }
      ];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(300);
    });

    test('child quantity is ignored: only unit_price contributes', () => {
      const items = [
        { id: 'p1', parent_id: null, quantity: 1, unit_price: 0 },
        { id: 'c1', parent_id: 'p1', quantity: 5, unit_price: 100 } // qty 5 ignored
      ];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(100);
    });

    test('parent with both a unit_price and children: parent price is ignored', () => {
      // A parent row may end up with a non-zero unit_price (e.g. a child added
      // to a previously-priced leaf). The canonical math counts only children.
      const items = [
        { id: 'p1', parent_id: null, quantity: 2, unit_price: 999 },
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 100 }
      ];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(100);
    });

    test('multiple parents each with children', () => {
      const items = [
        { id: 'p1', parent_id: null, quantity: 1, unit_price: 0 },
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 100 },
        { id: 'c2', parent_id: 'p1', quantity: 1, unit_price: 200 },
        { id: 'p2', parent_id: null, quantity: 1, unit_price: 0 },
        { id: 'c3', parent_id: 'p2', quantity: 1, unit_price: 50 }
      ];
      const result = calcFinancials(noTaxJob, items, []);
      expect(result.subtotal).toBe(350);
    });

    test('hierarchy combined with fixed discount and tax', () => {
      const job = { ...baseJob, discount_amount: 200, discount_type: 'fixed' };
      const items = [
        { id: 'p1', parent_id: null, quantity: 1, unit_price: 0 },
        { id: 'c1', parent_id: 'p1', quantity: 1, unit_price: 1500 },
        { id: 'c2', parent_id: 'p1', quantity: 1, unit_price: 500 }
      ];
      const result = calcFinancials(job, items, []);
      expect(result.subtotal).toBe(2000);
      expect(result.discount).toBe(200);
      expect(result.tax).toBe(396);  // (2000 - 200) * 0.22
      expect(result.total).toBe(2196);
    });
  });

  describe('edge cases and rounding', () => {
    test('rounds subtotal, tax and total to 2 decimals', () => {
      const items = [{ quantity: 3, unit_price: 33.33 }]; // subtotal 99.99
      const result = calcFinancials(baseJob, items, []);
      expect(result.subtotal).toBe(99.99);
      expect(result.tax).toBe(22);       // 99.99 * 0.22 = 21.9978 -> 22.00
      expect(result.total).toBe(121.99); // 99.99 + 21.9978 = 121.9878 -> 121.99
    });

    test('handles floating-point quantity * price without drift', () => {
      const job = { ...baseJob, tax_enabled: false };
      const items = [{ quantity: 3, unit_price: 0.1 }]; // 0.30000000000000004 in JS
      const result = calcFinancials(job, items, []);
      expect(result.subtotal).toBe(0.3);
      expect(result.total).toBe(0.3);
    });

    test('decimal quantity (e.g. 2.5 hours of labor)', () => {
      const job = { ...baseJob, tax_enabled: false };
      const items = [{ quantity: 2.5, unit_price: 400 }];
      const result = calcFinancials(job, items, []);
      expect(result.subtotal).toBe(1000);
    });

    test('non-default tax rate', () => {
      const job = { ...baseJob, tax_rate: 0.10 };
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calcFinancials(job, items, []);
      expect(result.tax).toBe(100);
      expect(result.total).toBe(1100);
    });

    test('percentage discount producing fractional amount, with tax', () => {
      const job = { ...baseJob, discount_amount: 33, discount_type: 'percentage' };
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calcFinancials(job, items, []);
      expect(result.discount).toBe(330);
      expect(result.tax).toBe(147.4);   // (1000 - 330) * 0.22
      expect(result.total).toBe(817.4); // 670 + 147.4
    });

    test('discount larger than subtotal yields negative taxBase/total', () => {
      const job = { ...baseJob, discount_amount: 150, discount_type: 'fixed' };
      const items = [{ quantity: 1, unit_price: 100 }];
      const result = calcFinancials(job, items, []);
      expect(result.discount).toBe(150);
      expect(result.tax).toBe(-11);   // (100 - 150) * 0.22
      expect(result.total).toBe(-61);
    });

    test('balance reflects partial payment on a taxed total', () => {
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calcFinancials(baseJob, items, [{ amount: 500 }]);
      expect(result.total).toBe(1220);
      expect(result.total_paid).toBe(500);
      expect(result.balance).toBe(720);
    });

    test('payment method does not affect the math; only amount is summed', () => {
      const job = { ...baseJob, tax_enabled: false };
      const items = [{ quantity: 1, unit_price: 1000 }];
      const payments = [
        { amount: 400, method: 'efectivo' },
        { amount: 300, method: 'transferencia' },
        { amount: 200, method: 'cheque' },
        { amount: 100, method: 'credito' }
      ];
      const result = calcFinancials(job, items, payments);
      expect(result.total_paid).toBe(1000);
      expect(result.balance).toBe(0);
    });

    test('percentage discount of 100% zeroes the taxable base', () => {
      const job = { ...baseJob, discount_amount: 100, discount_type: 'percentage' };
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calcFinancials(job, items, []);
      expect(result.discount).toBe(1000);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});
