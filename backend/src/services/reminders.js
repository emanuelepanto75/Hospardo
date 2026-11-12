const cron = require('node-cron');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { sendAppointmentEmail } = require('./mailer');

/** Invia i promemoria per gli appuntamenti entro REMINDER_HOURS_BEFORE ore */
async function sendDueReminders(now = new Date()) {
  const limit = new Date(now.getTime() + config.reminderHoursBefore * 3600 * 1000);
  const due = await prisma.appointment.findMany({
    where: {
      status: { in: ['PRENOTATO', 'CONFERMATO'] },
      reminderSentAt: null,
      start: { gt: now, lte: limit },
    },
    include: { patient: true, doctor: true, service: true },
  });
  let sent = 0;
  for (const appt of due) {
    const ok = await sendAppointmentEmail(appt, 'promemoria');
    // segniamo comunque come gestito se il paziente non ha email, per non riprovare all'infinito
    if (ok || !appt.patient.email || !appt.patient.remindersOptIn) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } });
      if (ok) sent++;
    }
  }
  return sent;
}

function startReminderScheduler() {
  // ogni 15 minuti
  cron.schedule('*/15 * * * *', () => {
    sendDueReminders().then((n) => n && console.log(`Promemoria inviati: ${n}`)).catch((e) => console.error('Errore promemoria:', e));
  });
}

module.exports = { sendDueReminders, startReminderScheduler };
