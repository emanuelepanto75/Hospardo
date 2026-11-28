/**
 * Orario effettivo di un medico in una data: le eccezioni di quel giorno (se presenti)
 * sostituiscono le fasce settimanali abituali.
 */
const { hmToMin } = require('./time');

const isoOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const dateOnly = (iso) => new Date(`${iso}T00:00:00.000Z`);

/**
 * @param weekly fasce settimanali [{weekday, startTime, endTime}]
 * @param exceptions eccezioni [{date, startTime, endTime}]
 * @param isoDate 'YYYY-MM-DD' (ora locale)
 * @param weekday 1 = lunedì ... 7 = domenica
 */
function hoursForDate(weekly, exceptions, isoDate, weekday) {
  const ex = (exceptions || []).filter((e) => isoOf(e.date) === isoDate);
  const list = ex.length ? ex : (weekly || []).filter((h) => h.weekday === weekday);
  return [...list].sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime));
}

module.exports = { hoursForDate, isoOf, dateOnly };
