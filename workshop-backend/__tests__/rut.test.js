const { validateRut, formatRut, normalizeRut } = require('../src/utils/rut');

describe('RUT Validation (DGI, 12 digitos)', () => {
  test('RUT real valido pasa', () => {
    // 070194990010: suma ponderada 231, 231 % 11 == 0 -> dv 0
    expect(validateRut('070194990010')).toBe(true);
  });

  test('RUT valido con separadores pasa', () => {
    expect(validateRut('07.019.499.001-0')).toBe(true);
    expect(validateRut(' 070194990010 ')).toBe(true);
  });

  test('otros RUT validos pasan', () => {
    expect(validateRut('211003420017')).toBe(true);
    expect(validateRut('450303670012')).toBe(true);
  });

  test('digito verificador incorrecto falla', () => {
    expect(validateRut('070194990011')).toBe(false);
    // fixture del fix anterior: solo valida con el algoritmo de cedula
    expect(validateRut('450303670014')).toBe(false);
  });

  test('11 digitos (falta verificador) falla', () => {
    expect(validateRut('07019499001')).toBe(false);
  });
});

describe('CI Validation (cedula, 8 digitos)', () => {
  test('CI valida pasa', () => {
    expect(validateRut('21100344')).toBe(true);
    expect(validateRut('40985731')).toBe(true);
  });

  test('CI valida con separadores pasa', () => {
    expect(validateRut('2.110.034-4')).toBe(true);
  });

  test('digito verificador incorrecto falla', () => {
    expect(validateRut('21100348')).toBe(false);
    expect(validateRut('21100349')).toBe(false);
  });
});

describe('RUT Validation - casos borde', () => {
  test('null/vacio devuelve true (campo opcional)', () => {
    expect(validateRut(null)).toBe(true);
    expect(validateRut('')).toBe(true);
    expect(validateRut(undefined)).toBe(true);
  });

  test('largo invalido falla', () => {
    expect(validateRut('1234')).toBe(false);
    expect(validateRut('1234567890')).toBe(false);
    expect(validateRut('0701949900100')).toBe(false);
  });

  test('caracteres no numericos fallan', () => {
    expect(validateRut('ABCDEFGH')).toBe(false);
    expect(validateRut('0701949900A0')).toBe(false);
  });
});

describe('RUT Formatting', () => {
  test('formats digits into X.XXX.XXX-X', () => {
    expect(formatRut('21100348')).toBe('2.110.034-8');
  });

  test('formats already-formatted RUT correctly', () => {
    expect(formatRut('2.110.034-8')).toBe('2.110.034-8');
  });

  test('formateo es idempotente para RUT de 12 digitos', () => {
    const once = formatRut('070194990010');
    expect(formatRut(once)).toBe(once);
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
