/** Calcolo del codice fiscale e ricerca del luogo di nascita (comuni italiani e stati esteri) */
const COMUNI = require('../data/comuni.json');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
const SMALL = new Set(['di', 'de', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'da', 'in', 'sul', 'sulla', 'sui', 'al', 'alla', 'allo', 'ai', 'e', 'con', 'su', 'nel', 'nella', 'sotto', 'sopra']);
/** "SANT'AGATA DI MILITELLO" → "Sant'Agata di Militello" */
const pretty = (s) => s.toLowerCase()
  .replace(/(^|[\s'\-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/ (\p{L}+)(?=[ '])/gu, (m, w) => (SMALL.has(w.toLowerCase()) ? ` ${w.toLowerCase()}` : m));

/** Etichetta salvata nel paziente: "Messina (ME)", per l'estero "Germania (EE)" */
const labelOf = (row) => `${pretty(row[2])} (${row[1]})`;

const INDEX = COMUNI.map((r) => ({ row: r, key: norm(r[2]) }));

/** Suggerimenti per il campo "luogo di nascita" */
function searchPlaces(q, limit = 15) {
  const k = norm(q);
  if (k.length < 2) return [];
  const starts = INDEX.filter((e) => e.key.startsWith(k));
  const contains = starts.length >= limit ? [] : INDEX.filter((e) => !e.key.startsWith(k) && e.key.includes(k));
  return [...starts, ...contains]
    // prima i comuni esistenti, poi quelli soppressi e gli stati esteri; a parità, il nome più vicino
    .sort((a, b) => b.key.startsWith(k) - a.key.startsWith(k) || b.row[3] - a.row[3] || (a.row[1] === 'EE') - (b.row[1] === 'EE') || (b.key === k) - (a.key === k) || a.key.length - b.key.length)
    .slice(0, limit)
    .map(({ row }) => ({
      label: labelOf(row),
      code: row[0],
      foreign: row[1] === 'EE',
      // comune soppresso o accorpato: va scelto per chi è nato prima della soppressione
      historic: row[3] === 0 && row[1] !== 'EE',
    }));
}

/** Codice catastale da "Messina (ME)" (o solo "Messina") */
function placeCode(label) {
  const m = /^(.*?)\s*\(([A-Za-z]{2})\)\s*$/.exec(String(label || ''));
  const name = norm(m ? m[1] : label);
  const prov = m ? m[2].toUpperCase() : null;
  const matches = INDEX.filter((e) => e.key === name && (!prov || e.row[1] === prov));
  if (!matches.length) return null;
  return (matches.find((e) => e.row[3] === 1) || matches[0]).row[0];
}

const VOWELS = /[AEIOU]/;
const letters = (s) => norm(s).split('');
const consonants = (s) => letters(s).filter((c) => !VOWELS.test(c));
const vowels = (s) => letters(s).filter((c) => VOWELS.test(c));
const pad3 = (arr) => (arr.join('') + 'XXX').slice(0, 3);

const surnameCode = (s) => pad3([...consonants(s), ...vowels(s)]);
function nameCode(s) {
  const c = consonants(s);
  if (c.length >= 4) return c[0] + c[2] + c[3];
  return pad3([...c, ...vowels(s)]);
}

const MONTHS = 'ABCDEHLMPRST';
const ODD = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const evenValue = (ch) => (/\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65);

function checkChar(code15) {
  let sum = 0;
  for (let i = 0; i < 15; i += 1) sum += i % 2 === 0 ? ODD[code15[i]] : evenValue(code15[i]);
  return String.fromCharCode(65 + (sum % 26));
}

/**
 * @param {{lastName, firstName, birthDate: 'YYYY-MM-DD', gender: 'M'|'F', birthPlace: string}} p
 * @returns {{code?: string, missing?: string[], error?: string}}
 */
function computeFiscalCode({ lastName, firstName, birthDate, gender, birthPlace }) {
  const missing = [];
  if (!norm(lastName)) missing.push('cognome');
  if (!norm(firstName)) missing.push('nome');
  if (!/^\d{4}-\d{2}-\d{2}/.test(birthDate || '')) missing.push('data di nascita');
  if (gender !== 'M' && gender !== 'F') missing.push('sesso (M o F)');
  if (!birthPlace) missing.push('luogo di nascita');
  if (missing.length) return { missing };
  const place = placeCode(birthPlace);
  if (!place) return { error: `Luogo di nascita "${birthPlace}" non trovato: sceglilo dall'elenco` };
  const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number);
  const day = String(gender === 'F' ? d + 40 : d).padStart(2, '0');
  const code15 = surnameCode(lastName) + nameCode(firstName) + String(y % 100).padStart(2, '0') + MONTHS[m - 1] + day + place;
  return { code: code15 + checkChar(code15) };
}

/** Verifica formale (carattere di controllo) */
const isValidFiscalCode = (cf) => /^[A-Z0-9]{16}$/.test(cf || '') && checkChar(cf.slice(0, 15)) === cf[15];

module.exports = { searchPlaces, placeCode, computeFiscalCode, isValidFiscalCode };
