/**
 * RUT uruguayo: XX.XXX.XXX-X
 * Pesos para digito verificador: 2,9,8,7,6,3,4 (de derecha a izquierda)
 * Algoritmo: suma(digito * peso) mod 10, si resultado = 0 -> digito = 0
 */

function clean(rut) {
  return String(rut).replace(/[.\-\s]/g, '').trim();
}

function validateRut(rut) {
  if (!rut) return true;
  const cleaned = clean(rut);
  if (!/^\d{8,9}$/.test(cleaned)) return false;

  const digits  = cleaned.slice(0, -1);
  const checker = cleaned.slice(-1);
  const weights = [2, 9, 8, 7, 6, 3, 4];
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[digits.length - 1 - i]) * weights[i];
  }

  const expected = String((10 - (sum % 10)) % 10);
  return checker === expected;
}

function formatRut(rut) {
  if (!rut) return null;
  const cleaned = clean(rut);
  const digits  = cleaned.slice(0, -1);
  const checker = cleaned.slice(-1);
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${checker}`;
}

function normalizeRut(rut) {
  if (!rut) return null;
  return clean(rut);
}

module.exports = { validateRut, formatRut, normalizeRut };
