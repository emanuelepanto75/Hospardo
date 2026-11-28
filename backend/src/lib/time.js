const { DateTime } = require('luxon');
const config = require('./config');

const TZ = config.timezone;

/** "HH:mm" -> minuti dalla mezzanotte */
function hmToMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Data locale "YYYY-MM-DD" + "HH:mm" -> Date UTC */
function localToDate(dateStr, hm) {
  const dt = DateTime.fromISO(`${dateStr}T${hm}`, { zone: TZ });
  if (!dt.isValid) throw new Error(`Data/ora non valida: ${dateStr} ${hm}`);
  return dt.toJSDate();
}

/** Inizio e fine (esclusa) della giornata locale come Date UTC */
function dayBounds(dateStr) {
  const start = DateTime.fromISO(dateStr, { zone: TZ }).startOf('day');
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

function isoWeekday(dateStr) {
  return DateTime.fromISO(dateStr, { zone: TZ }).weekday; // 1 = lunedì
}

function formatLocal(date, fmt = "cccc d LLLL yyyy 'alle' HH:mm") {
  return DateTime.fromJSDate(date).setZone(TZ).setLocale('it').toFormat(fmt);
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

module.exports = { TZ, hmToMin, localToDate, dayBounds, isoWeekday, formatLocal, overlaps, DateTime };
