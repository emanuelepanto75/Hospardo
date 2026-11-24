/**
 * Email legate alle richieste di prenotazione dal sito:
 * ricevuta al paziente, avviso allo studio, rifiuto al paziente.
 */
const config = require('../lib/config');
const { formatLocal } = require('../lib/time');
const { sendMail } = require('./mailer');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');

function when(r) {
  if (r.preferredStart) return formatLocal(r.preferredStart);
  return r.preferences ? `nessun orario preciso – preferenza: ${r.preferences}` : 'nessuna preferenza di orario';
}

function wrap(lines) {
  const text = lines.filter((l) => l !== null).join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937">${lines.filter((l) => l !== null).map((l) => (l === '' ? '<br>' : `<div>${esc(l)}</div>`)).join('')}</div>`;
  return { text, html };
}

async function safeSend(to, subject, lines) {
  if (!to) return null;
  try {
    return (await sendMail({ to, subject, ...wrap(lines) })).status;
  } catch (err) {
    console.error(`Email "${subject}" non inviata a ${to}:`, err.message);
    return 'ERRORE';
  }
}

/** Al paziente: richiesta ricevuta, verrà confermata dallo studio */
function sendRequestReceived(r) {
  return safeSend(r.email, `Richiesta di prenotazione ricevuta – ${config.clinic.name}`, [
    `Gentile ${r.firstName} ${r.lastName},`,
    'abbiamo ricevuto la sua richiesta di prenotazione. Non è ancora una prenotazione confermata:',
    'la contatteremo al più presto con la conferma via email e WhatsApp.',
    '',
    `Prestazione: ${r.service.name}`,
    `Medico: ${docName(r.doctor)}`,
    `Data richiesta: ${when(r)}`,
    '',
    config.clinic.phone ? `Per informazioni: ${config.clinic.phone}` : null,
    config.clinic.name,
  ]);
}

/** Allo studio: è arrivata una nuova richiesta */
function sendStudioAlert(r) {
  const to = config.requests.notifyEmail;
  return safeSend(to, `Nuova richiesta di prenotazione: ${r.lastName} ${r.firstName}`, [
    'È arrivata una nuova richiesta di prenotazione dal sito.',
    '',
    `Paziente: ${r.lastName} ${r.firstName}`,
    `Telefono: ${r.phone}`,
    `Email: ${r.email}`,
    `Prestazione: ${r.service.name}`,
    `Medico: ${docName(r.doctor)}`,
    `Data richiesta: ${when(r)}`,
    r.notes ? `Note: ${r.notes}` : null,
    '',
    `Per confermarla o rifiutarla: ${config.frontendUrl}/richieste`,
  ]);
}

/** Al paziente: la richiesta non può essere accolta */
function sendRequestRejected(r, reason) {
  return safeSend(r.email, `Richiesta di prenotazione non confermata – ${config.clinic.name}`, [
    `Gentile ${r.firstName} ${r.lastName},`,
    `non possiamo confermare la sua richiesta di prenotazione per ${r.service.name} con ${docName(r.doctor)}.`,
    reason ? `Motivo: ${reason}` : null,
    '',
    `Può inviare una nuova richiesta da ${config.publicUrl}/prenota${config.clinic.phone ? ` o chiamarci allo ${config.clinic.phone}` : ''}.`,
    '',
    config.clinic.name,
  ]);
}

module.exports = { sendRequestReceived, sendStudioAlert, sendRequestRejected };
