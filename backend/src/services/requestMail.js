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

const svc = (r) => r.service?.name || 'Appuntamento';

/** Al paziente: richiesta ricevuta, verrà confermata dallo studio */
function sendRequestReceived(r) {
  if (r.moveOf) {
    return safeSend(r.email, `Richiesta di spostamento ricevuta – ${config.clinic.name}`, [
      `Gentile ${r.firstName} ${r.lastName},`,
      'abbiamo ricevuto la sua richiesta di spostare l\'appuntamento. Fino alla nostra conferma resta valido quello attuale:',
      `${formatLocal(r.moveOf.start)} – ${svc(r)} con ${docName(r.doctor)}.`,
      '',
      `Nuovo orario richiesto: ${when(r)}`,
      'La contatteremo al più presto con la conferma via email e WhatsApp.',
      '',
      config.clinic.phone ? `Per informazioni: ${config.clinic.phone}` : null,
      config.clinic.name,
    ]);
  }
  return safeSend(r.email, `Richiesta di prenotazione ricevuta – ${config.clinic.name}`, [
    `Gentile ${r.firstName} ${r.lastName},`,
    'abbiamo ricevuto la sua richiesta di prenotazione. Non è ancora una prenotazione confermata:',
    'la contatteremo al più presto con la conferma via email e WhatsApp.',
    '',
    `Prestazione: ${svc(r)}`,
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
  if (r.moveOf) {
    return safeSend(to, `Richiesta di spostamento: ${r.lastName} ${r.firstName}`, [
      'Un paziente chiede di spostare un appuntamento (dal link ricevuto nel messaggio).',
      '',
      `Paziente: ${r.lastName} ${r.firstName}`,
      `Telefono: ${r.phone}`,
      `Appuntamento attuale: ${formatLocal(r.moveOf.start)} – ${svc(r)} con ${docName(r.doctor)}`,
      `Nuovo orario richiesto: ${when(r)}`,
      r.notes ? `Note: ${r.notes}` : null,
      '',
      `Per confermare o rifiutare: ${config.frontendUrl}/richieste`,
    ]);
  }
  return safeSend(to, `Nuova richiesta di prenotazione: ${r.lastName} ${r.firstName}`, [
    'È arrivata una nuova richiesta di prenotazione dal sito.',
    '',
    `Paziente: ${r.lastName} ${r.firstName}`,
    `Telefono: ${r.phone}`,
    `Email: ${r.email}`,
    `Prestazione: ${svc(r)}`,
    `Medico: ${docName(r.doctor)}`,
    `Data richiesta: ${when(r)}`,
    r.notes ? `Note: ${r.notes}` : null,
    '',
    `Per confermarla o rifiutarla: ${config.frontendUrl}/richieste`,
  ]);
}

/** Al paziente: la richiesta non può essere accolta */
function sendRequestRejected(r, reason) {
  if (r.moveOf) {
    return safeSend(r.email, `Richiesta di spostamento non accolta – ${config.clinic.name}`, [
      `Gentile ${r.firstName} ${r.lastName},`,
      'non possiamo spostare il suo appuntamento all\'orario richiesto.',
      reason ? `Motivo: ${reason}` : null,
      `Resta valido l'appuntamento del ${formatLocal(r.moveOf.start)} – ${svc(r)} con ${docName(r.doctor)}.`,
      '',
      config.clinic.phone ? `Per concordare un altro orario ci chiami allo ${config.clinic.phone}.` : null,
      '',
      config.clinic.name,
    ]);
  }
  return safeSend(r.email, `Richiesta di prenotazione non confermata – ${config.clinic.name}`, [
    `Gentile ${r.firstName} ${r.lastName},`,
    `non possiamo confermare la sua richiesta di prenotazione per ${svc(r)} con ${docName(r.doctor)}.`,
    reason ? `Motivo: ${reason}` : null,
    '',
    `Può inviare una nuova richiesta da ${config.publicUrl}/prenota${config.clinic.phone ? ` o chiamarci allo ${config.clinic.phone}` : ''}.`,
    '',
    config.clinic.name,
  ]);
}

/** Allo studio: un paziente ha annullato dal link ricevuto nel messaggio */
function sendCancellationAlert(a, reason) {
  return safeSend(config.requests.notifyEmail, `Appuntamento annullato dal paziente: ${a.patient.lastName} ${a.patient.firstName}`, [
    'Un paziente ha annullato il suo appuntamento dal link ricevuto nel messaggio. L\'orario ora è libero.',
    '',
    `Paziente: ${a.patient.lastName} ${a.patient.firstName}`,
    a.patient.phone ? `Telefono: ${a.patient.phone}` : null,
    `Appuntamento: ${formatLocal(a.start)} – ${a.service?.name || 'Appuntamento'} con ${docName(a.doctor)}`,
    reason ? `Motivo: ${reason}` : 'Motivo: non indicato',
    '',
    `Elenco degli annullamenti: ${config.frontendUrl}/richieste?vista=annullati`,
  ]);
}

module.exports = { sendRequestReceived, sendStudioAlert, sendRequestRejected, sendCancellationAlert };
