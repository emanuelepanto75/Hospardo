/**
 * Nomi propri con l'iniziale maiuscola: "mario rossi" → "Mario Rossi", "D'AMICO" → "D'Amico",
 * "de luca-bianchi" → "De Luca-Bianchi". Spazi doppi eliminati.
 */
function titleCase(value) {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('it-IT')
    .replace(/(^|[\s'’\-.])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('it-IT'));
}

module.exports = { titleCase };
