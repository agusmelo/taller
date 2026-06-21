/**
 * RUT uruguayo: XX.XXX.XXX/XXXXX.XXX-X
 * Pesos para digito verificador: [2,9,8,7,6,3,4] ciclicos de izquierda a derecha
 * Algoritmo: suma(digito * peso) mod 11, digitV = 11 - resultado
 */

function clean(rut) {
  return String(rut).replace(/[.\-\s]/g, '').trim();
}

function validateRut(rut) {
  try {
    if (rut == null || rut === '') return true;

    const cleaned = clean(rut);
    if (!cleaned || cleaned.length < 8) return false;

    const digitC = Number.parseInt(cleaned.slice(-1));
    const body = cleaned.slice(0, -1);

    const weights = [2, 9, 8, 7, 6, 3, 4];
    let total = 0;

    for (let i = 0; i < body.length; i++) {
      total += weights[i % weights.length] * Number.parseInt(body[i]);
    }

    let digitV = 11 - (total % 11);
    if (digitV === 11) {
      digitV = 0;
    } else if (digitV === 10) {
      digitV = 1;
    }

    return digitV === digitC;
  } catch {
    return false;
  }
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
