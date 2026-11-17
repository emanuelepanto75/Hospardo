/**
 * Normalizza un numero di telefono in formato internazionale senza "+" (es. 393331234567).
 * Restituisce null se il numero non è utilizzabile.
 */
function normalizePhone(raw, defaultCountryCode = '39') {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().\/]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else s = defaultCountryCode + s;
  if (!/^\d{8,15}$/.test(s)) return null;
  return s;
}

module.exports = { normalizePhone };
