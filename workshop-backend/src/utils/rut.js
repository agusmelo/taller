/**
 * RUT uruguayo: XX.XXX.XXX-X
 * Pesos para digito verificador: 2,9,8,7,6,3,4 (de derecha a izquierda)
 * Algoritmo: suma(digito * peso) mod 10, si resultado = 0 -> digito = 0
 */

function clean(rut) {
  return String(rut).replace(/[.\-\s]/g, '').trim();
}

function validateRut(rut) {
  try {
    if (!rut || rut.length !== 12) {
      return false;
    }

    const digitC = Number.parseInt(rut.substr(11, 1));
    const rest = rut.substr(0, 11);

    let total = 0;
    let factor = 2;

    for (let i = 10; i >= 0; i--) {
      const n = Number.parseInt(rest.substr(i, 1));
      total += factor * n;
      if (factor === 9) {
        factor = 2;
      } else {
        factor++;
      }
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
