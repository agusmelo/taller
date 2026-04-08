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
});
