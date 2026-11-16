const cron = require('node-cron');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { DateTime, TZ, hmToMin } = require('../lib/time');
const { notifyAppointment } = require('./notify');

/** Non manda il promemoria se l'appuntamento è stato creato da meno di queste ore (ha appena ricevuto la conferma) */
const SKIP_IF_CREATED_WITHIN_H = 6;

/** Intervallo di inizio degli appuntamenti a cui va mandato il promemoria adesso */
function reminderWindow(now) {
  if (config.reminderMode === 'hours') {
    return { from: now, to: new Date(now.getTime() + config.reminderHoursBefore * 3600 * 1000) };
  }
  // "day_before": dall'ora REMINDER_TIME di oggi si avvisano gli appuntamenti di domani (e quelli rimasti di oggi).
  // Prima di quell'ora non si invia nulla, per non scrivere ai pazienti di notte.
  const local = DateTime.fromJSDate(now).setZone(TZ);
  if (local.hour * 60 + local.minute < hmToMin(config.reminderTime)) return null;
  return { from: now, to: local.plus({ days: 1 }).endOf('day').toJSDate() };
}

/** Invia i promemoria dovuti. Ritorna il numero di appuntamenti gestiti. */
async function sendDueReminders(now = new Date()) {
  const win = reminderWindow(now);
  if (!win) return 0;
  const { from, to } = win;
  const due = await prisma.appointment.findMany({
    where: { status: { in: ['PRENOTATO', 'CONFERMATO'] }, reminderSentAt: null, start: { gt: from, lte: to } },
    include: { patient: true, doctor: true, service: true },
    orderBy: { start: 'asc' },
  });
  let handled = 0;
  for (const appt of due) {
    // segna subito come gestito per non inviare due volte se il ciclo successivo parte prima della fine
    const claimed = await prisma.appointment.updateMany({ where: { id: appt.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const recent = now - appt.createdAt < SKIP_IF_CREATED_WITHIN_H * 3600 * 1000;
    if (!recent) await notifyAppointment(appt, 'PROMEMORIA');
    handled++;
  }
  return handled;
}

function startReminderScheduler() {
  // ogni 15 minuti
  cron.schedule('*/15 * * * *', () => {
    sendDueReminders().then((n) => n && console.log(`Promemoria gestiti: ${n}`)).catch((e) => console.error('Errore promemoria:', e));
  }, { timezone: TZ });
}

module.exports = { sendDueReminders, startReminderScheduler, reminderWindow };
