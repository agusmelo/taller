const { validateRut, formatRut, normalizeRut } = require('../src/utils/rut');

describe('RUT Validation', () => {
  test('valid RUT passes', () => {
    // 2.110.034-8 computed with weights [2,9,8,7,6,3,4]
    expect(validateRut('21100348')).toBe(true);
  });

  test('valid formatted RUT passes', () => {
    expect(validateRut('2.110.034-8')).toBe(true);
  });

  test('valid 8-digit body RUT passes', () => {
    // 12.345.67-6
    expect(validateRut('12345676')).toBe(true);
  });

  test('null/empty RUT returns true (optional)', () => {
    expect(validateRut(null)).toBe(true);
    expect(validateRut('')).toBe(true);
    expect(validateRut(undefined)).toBe(true);
  });

  test('invalid check digit fails', () => {
    expect(validateRut('211003420')).toBe(false);
  });

  test('too short RUT fails', () => {
    expect(validateRut('1234')).toBe(false);
  });

  test('too long RUT fails', () => {
    expect(validateRut('1234567890')).toBe(false);
  });

  test('non-numeric characters fail', () => {
    expect(validateRut('ABCDEFGH')).toBe(false);
  });
});

describe('RUT Formatting', () => {
  test('formats digits into X.XXX.XXX-X', () => {
    expect(formatRut('21100348')).toBe('2.110.034-8');
  });

  test('formats already-formatted RUT correctly', () => {
    expect(formatRut('2.110.034-8')).toBe('2.110.034-8');
  });

  test('null returns null', () => {
    expect(formatRut(null)).toBeNull();
  });

  test('empty returns null', () => {
    expect(formatRut('')).toBeNull();
  });
});

describe('RUT Normalize', () => {
  test('removes dots and dashes', () => {
    expect(normalizeRut('2.110.034-8')).toBe('21100348');
  });

  test('null returns null', () => {
    expect(normalizeRut(null)).toBeNull();
  });
});
