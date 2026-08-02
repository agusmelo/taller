/**
 * Documento uruguayo del cliente: RUT (DGI, 12 digitos) o CI (8 digitos).
 * Son dos algoritmos distintos, no uno solo.
 *
 * RUT: 11 digitos de cuerpo + verificador.
 *      Pesos [4,3,2,9,8,7,6,5,4,3,2] de izquierda a derecha
 *      (equivale a 2..9 ciclicos de derecha a izquierda).
 *      digitV = 11 - (suma mod 11), con 11 -> 0. Si da 10, DGI no lo emite.
 *
 * CI:  7 digitos de cuerpo + verificador.
 *      Pesos [2,9,8,7,6,3,4] de izquierda a derecha.
 *      digitV = (10 - (suma mod 10)) mod 10.
 */

const RUT_WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CI_WEIGHTS  = [2, 9, 8, 7, 6, 3, 4];

function clean(rut) {
  return String(rut).replace(/[.\-\s]/g, '').trim();
}

function weightedSum(body, weights) {
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    total += weights[i] * Number.parseInt(body[i], 10);
  }
  return total;
}

function validateRut(rut) {
  if (rut == null || rut === '') return true; // campo opcional

  const cleaned = clean(rut);
  if (!/^\d+$/.test(cleaned)) return false;

  const digitC = Number.parseInt(cleaned.slice(-1), 10);

  if (cleaned.length === 12) {
    const digitV = (11 - (weightedSum(cleaned.slice(0, 11), RUT_WEIGHTS) % 11)) % 11;
    return digitV === digitC;
  }

  if (cleaned.length === 8) {
    const digitV = (10 - (weightedSum(cleaned.slice(0, 7), CI_WEIGHTS) % 10)) % 10;
    return digitV === digitC;
  }

  return false;
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
