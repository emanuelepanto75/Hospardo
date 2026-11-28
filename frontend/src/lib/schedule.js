import { hmToMin } from './time';

/** Fasce orarie del medico in una data: le eccezioni di quel giorno sostituiscono l'orario settimanale */
export function hoursForDate(doctor, dt) {
  const iso = dt.toISODate();
  const ex = (doctor.scheduleExceptions || []).filter((e) => e.date.slice(0, 10) === iso);
  const list = ex.length ? ex : (doctor.workingHours || []).filter((h) => h.weekday === dt.weekday);
  return [...list].sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime));
}
export const hasException = (doctor, dt) => (doctor.scheduleExceptions || []).some((e) => e.date.slice(0, 10) === dt.toISODate());
