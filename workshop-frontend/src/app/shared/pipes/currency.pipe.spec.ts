import { AppCurrencyPipe } from './currency.pipe';

describe('AppCurrencyPipe', () => {
  let pipe: AppCurrencyPipe;

  beforeEach(() => {
    pipe = new AppCurrencyPipe();
  });

  test('formats a number with two decimals', () => {
    const result = pipe.transform(1500);
    expect(result).toContain('1.500');
    expect(result).toContain('00');
    expect(result).toMatch(/^\$/);
  });

  test('formats a string number', () => {
    const result = pipe.transform('2500.5');
    expect(result).toContain('2.500');
    expect(result).toContain('50');
  });

  test('returns $ 0,00 for null', () => {
    expect(pipe.transform(null)).toBe('$ 0,00');
  });

  test('returns $ 0,00 for undefined', () => {
    expect(pipe.transform(undefined)).toBe('$ 0,00');
  });

  test('formats zero correctly', () => {
    const result = pipe.transform(0);
    expect(result).toContain('0');
    expect(result).toMatch(/^\$/);
  });

  test('formats decimal values', () => {
    const result = pipe.transform(99.9);
    expect(result).toContain('99');
    expect(result).toContain('90');
  });
});
