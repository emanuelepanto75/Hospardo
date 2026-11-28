/** Iniziali maiuscole: "mario rossi" → "Mario Rossi", "D'AMICO" → "D'Amico" */
export function titleCase(value) {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('it-IT')
    .replace(/(^|[\s'’\-.])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('it-IT'));
}
