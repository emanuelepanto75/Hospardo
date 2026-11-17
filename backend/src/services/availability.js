const prisma = require('../lib/prisma');
const { hmToMin, localToDate, dayBounds, isoWeekday, overlaps, DateTime, TZ } = require('../lib/time');

const ACTIVE_STATUSES = ['PRENOTATO', 'CONFERMATO', 'IN_ATTESA', 'COMPLETATO'];

/**
 * Calcola gli slot liberi di un medico in una data (locale) per una durata.
 * @returns {Promise<{start: Date, end: Date}[]>}
 */
async function getFreeSlots({ doctorId, date, durationMin, notBefore }) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { workingHours: { where: { weekday: isoWeekday(date) } } },
  });
  if (!doctor || !doctor.active) return [];

  const { start: dayStart, end: dayEnd } = dayBounds(date);
  const [appointments, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId, status: { in: ACTIVE_STATUSES }, start: { lt: dayEnd }, end: { gt: dayStart } },
      select: { start: true, end: true },
    }),
    prisma.timeOff.findMany({
      where: { doctorId, start: { lt: dayEnd }, end: { gt: dayStart } },
      select: { start: true, end: true },
    }),
  ]);
  const busy = [...appointments, ...timeOff];

  const step = doctor.slotStepMin || 15;
  const blocks = [...doctor.workingHours].sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime));
  const slots = [];
  for (const block of blocks) {
    const blockStart = localToDate(date, block.startTime);
    const blockEnd = localToDate(date, block.endTime);
    let cursor = DateTime.fromJSDate(blockStart).setZone(TZ);
    while (true) {
      const s = cursor.toJSDate();
      const e = cursor.plus({ minutes: durationMin }).toJSDate();
      if (e > blockEnd) break;
      const free = !busy.some((b) => overlaps(s, e, b.start, b.end));
      if (free && (!notBefore || s >= notBefore)) slots.push({ start: s, end: e });
      cursor = cursor.plus({ minutes: step });
    }
  }
  return slots;
}

/**
 * Verifica che l'intervallo sia libero per il medico. Lancia un errore se c'è sovrapposizione.
 * Da chiamare dentro una transazione dopo aver acquisito il lock sul medico.
 */
async function assertFree(tx, { doctorId, start, end, excludeId }) {
  const clash = await tx.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ACTIVE_STATUSES },
      start: { lt: end },
      end: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (clash) {
    const { HttpError } = require('../lib/errors');
    throw new HttpError(409, `Orario già occupato (${clash.patient.lastName} ${clash.patient.firstName})`);
  }
}

/** Serializza le prenotazioni dello stesso medico (evita doppie prenotazioni concorrenti) */
async function lockDoctor(tx, doctorId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${doctorId}::bigint)`;
}

/** Verifica se l'intervallo cade dentro l'orario di lavoro e non in un'assenza */
async function isWithinWorkingHours({ doctorId, start, end }) {
  const local = DateTime.fromJSDate(start).setZone(TZ);
  const date = local.toISODate();
  const hours = await prisma.workingHours.findMany({ where: { doctorId, weekday: local.weekday } });
  const inHours = hours.some((h) => start >= localToDate(date, h.startTime) && end <= localToDate(date, h.endTime));
  if (!inHours) return false;
  const off = await prisma.timeOff.findFirst({ where: { doctorId, start: { lt: end }, end: { gt: start } } });
  return !off;
}

module.exports = { getFreeSlots, assertFree, lockDoctor, isWithinWorkingHours, ACTIVE_STATUSES };
