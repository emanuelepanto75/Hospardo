const nodemailer = require('nodemailer');
const config = require('../lib/config');
const { formatLocal } = require('../lib/time');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return false;
  if (!transporter) {
    console.log(`[email simulata] A: ${to}\nOggetto: ${subject}\n${text}\n`);
    return true;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
  return true;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function appointmentEmail(appt, kind) {
  const when = formatLocal(appt.start);
  const doctor = `${appt.doctor.title} ${appt.doctor.firstName} ${appt.doctor.lastName}`;
  const service = appt.service ? appt.service.name : 'Visita';
  const manageUrl = `${config.frontendUrl}/appuntamento/${appt.manageToken}`;
  const intro = {
    conferma: 'il suo appuntamento è stato registrato.',
    promemoria: 'le ricordiamo il suo prossimo appuntamento.',
    annullamento: 'il suo appuntamento è stato annullato.',
  }[kind];
  const subject = {
    conferma: `Conferma appuntamento – ${config.clinic.name}`,
    promemoria: `Promemoria appuntamento – ${config.clinic.name}`,
    annullamento: `Appuntamento annullato – ${config.clinic.name}`,
  }[kind];

  const lines = [
    `Gentile ${appt.patient.firstName} ${appt.patient.lastName},`,
    intro,
    '',
    `Prestazione: ${service}`,
    `Medico: ${doctor}`,
    `Data: ${when}`,
    config.clinic.address ? `Indirizzo: ${config.clinic.address}` : null,
    '',
    kind !== 'annullamento' ? `Per visualizzare o annullare l'appuntamento: ${manageUrl}` : null,
    config.clinic.phone ? `Per informazioni: ${config.clinic.phone}` : null,
    '',
    config.clinic.name,
  ].filter((l) => l !== null);

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937">
    <p>Gentile ${esc(appt.patient.firstName)} ${esc(appt.patient.lastName)},<br>${esc(intro)}</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Prestazione</td><td><b>${esc(service)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Medico</td><td>${esc(doctor)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Data</td><td><b>${esc(when)}</b></td></tr>
      ${config.clinic.address ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Indirizzo</td><td>${esc(config.clinic.address)}</td></tr>` : ''}
    </table>
    ${kind !== 'annullamento' ? `<p><a href="${esc(manageUrl)}" style="color:#2563eb">Visualizza o annulla l'appuntamento</a></p>` : ''}
    ${config.clinic.phone ? `<p style="color:#6b7280">Per informazioni: ${esc(config.clinic.phone)}</p>` : ''}
    <p>${esc(config.clinic.name)}</p></div>`;

  return { subject, text: lines.join('\n'), html };
}

/** Invia l'email relativa a un appuntamento (appt deve includere patient, doctor, service) */
async function sendAppointmentEmail(appt, kind) {
  if (!appt.patient.email || !appt.patient.remindersOptIn) return false;
  try {
    return await sendMail({ to: appt.patient.email, ...appointmentEmail(appt, kind) });
  } catch (err) {
    console.error(`Invio email (${kind}) fallito per appuntamento ${appt.id}:`, err.message);
    return false;
  }
}

module.exports = { sendMail, sendAppointmentEmail, appointmentEmail };
