/**
 * Messaggi ai pazienti relativi agli appuntamenti: email + WhatsApp.
 * Ogni invio (riuscito, simulato o fallito) viene registrato nella tabella notifications.
 */
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { formatLocal } = require('../lib/time');
const { normalizePhone } = require('../lib/phone');
const { sendMail } = require('./mailer');
const { sendWhatsapp, whatsappEnabled } = require('./whatsapp');

const KINDS = ['CONFERMA', 'PROMEMORIA', 'ANNULLAMENTO', 'SPOSTAMENTO'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TEXTS = {
  CONFERMA: { subject: 'Conferma appuntamento', intro: 'il suo appuntamento è stato registrato.' },
  PROMEMORIA: { subject: 'Promemoria appuntamento', intro: 'le ricordiamo il suo prossimo appuntamento.' },
  ANNULLAMENTO: { subject: 'Appuntamento annullato', intro: 'il suo appuntamento è stato annullato.' },
  SPOSTAMENTO: { subject: 'Appuntamento modificato', intro: 'il suo appuntamento è stato spostato. Ecco i nuovi dettagli.' },
};

function details(appt) {
  return {
    patient: `${appt.patient.firstName} ${appt.patient.lastName}`,
    firstName: appt.patient.firstName,
    service: appt.service ? appt.service.name : 'Visita',
    doctor: `${appt.doctor.title} ${appt.doctor.firstName} ${appt.doctor.lastName}`.trim(),
    when: formatLocal(appt.start),
    manageUrl: `${config.frontendUrl}/appuntamento/${appt.manageToken}`,
  };
}

function buildEmail(appt, kind) {
  const d = details(appt);
  const t = TEXTS[kind];
  const intro = t.intro;
  const showLink = kind !== 'ANNULLAMENTO';
  const text = [
    `Gentile ${d.patient},`,
    intro,
    '',
    `Prestazione: ${d.service}`,
    `Medico: ${d.doctor}`,
    `Data: ${d.when}`,
    config.clinic.address ? `Indirizzo: ${config.clinic.address}` : null,
    '',
    showLink ? `Per visualizzare o annullare l'appuntamento: ${d.manageUrl}` : null,
    config.clinic.phone ? `Per informazioni: ${config.clinic.phone}` : null,
    '',
    config.clinic.name,
  ].filter((l) => l !== null).join('\n');

  const row = (k, v, bold) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td>${bold ? `<b>${esc(v)}</b>` : esc(v)}</td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937">
    <p>Gentile ${esc(d.patient)},<br>${esc(intro)}</p>
    <table style="border-collapse:collapse;margin:12px 0">
      ${row('Prestazione', d.service, true)}${row('Medico', d.doctor)}${row('Data', d.when, true)}
      ${config.clinic.address ? row('Indirizzo', config.clinic.address) : ''}
    </table>
    ${showLink ? `<p><a href="${esc(d.manageUrl)}" style="color:#0e7490">Visualizza o annulla l'appuntamento</a></p>` : ''}
    ${config.clinic.phone ? `<p style="color:#6b7280">Per informazioni: ${esc(config.clinic.phone)}</p>` : ''}
    <p>${esc(config.clinic.name)}</p></div>`;

  return { subject: `${t.subject} – ${config.clinic.name}`, text, html };
}

/** Parametri del modello WhatsApp e testo di anteprima (usato quando il canale è simulato) */
function buildWhatsapp(appt, kind) {
  const d = details(appt);
  const params = [d.firstName, d.service, d.doctor, d.when, d.manageUrl];
  const previewText = `${config.clinic.name}: ${d.firstName}, ${TEXTS[kind].intro} ${d.service} con ${d.doctor}, ${d.when}.`
    + (kind !== 'ANNULLAMENTO' ? ` Gestisci: ${d.manageUrl}` : '');
  return { params, previewText };
}

/** Testo completo per WhatsApp "con un clic" (scritto dalla segreteria, nessun modello da approvare) */
function buildWhatsappText(appt, kind) {
  const d = details(appt);
  const head = {
    CONFERMA: `Gentile ${d.firstName}, le confermiamo l'appuntamento presso ${config.clinic.name}:`,
    PROMEMORIA: `Gentile ${d.firstName}, le ricordiamo l'appuntamento presso ${config.clinic.name}:`,
    SPOSTAMENTO: `Gentile ${d.firstName}, il suo appuntamento presso ${config.clinic.name} è stato spostato:`,
    ANNULLAMENTO: `Gentile ${d.firstName}, il suo appuntamento presso ${config.clinic.name} è stato annullato:`,
  }[kind];
  const lines = [
    head,
    `📅 ${d.when}`,
    `🩺 ${d.service} – ${d.doctor}`,
    config.clinic.address && kind !== 'ANNULLAMENTO' ? `📍 ${config.clinic.address}` : null,
    '',
    kind === 'ANNULLAMENTO'
      ? `Per prenotare di nuovo può rispondere a questo messaggio${config.clinic.phone ? ` o chiamare lo ${config.clinic.phone}` : ''}.`
      : `Se non può venire, la preghiamo di avvisarci rispondendo a questo messaggio o da qui: ${d.manageUrl}`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/** Link wa.me che apre WhatsApp sulla chat del paziente con il messaggio già scritto (null se manca il cellulare) */
function whatsappLink(appt, kind) {
  const phone = normalizePhone(appt.patient.phone, config.whatsapp.defaultCountryCode);
  if (!phone) return null;
  const text = buildWhatsappText(appt, kind);
  return { phone: `+${phone}`, text, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
}

async function log(appointmentId, channel, kind, recipient, result, error) {
  await prisma.notification.create({
    data: {
      appointmentId,
      channel,
      kind,
      recipient,
      status: error ? 'ERRORE' : result.status,
      providerId: result?.providerId ?? null,
      error: error ? String(error.message || error).slice(0, 500) : null,
    },
  });
}

/**
 * Invia email e WhatsApp relativi a un appuntamento.
 * @param {number|object} apptOrId appuntamento (con patient, doctor, service) o il suo id
 * @param {'CONFERMA'|'PROMEMORIA'|'ANNULLAMENTO'|'SPOSTAMENTO'} kind
 * @returns {Promise<{email: string|null, whatsapp: string|null}>} esito per canale (null = non inviato)
 */
async function notifyAppointment(apptOrId, kind) {
  if (!KINDS.includes(kind)) throw new Error(`Tipo di notifica sconosciuto: ${kind}`);
  const appt = typeof apptOrId === 'object' && apptOrId.patient
    ? apptOrId
    : await prisma.appointment.findUnique({ where: { id: Number(apptOrId?.id ?? apptOrId) }, include: { patient: true, doctor: true, service: true } });
  if (!appt) return { email: null, whatsapp: null };
  const out = { email: null, whatsapp: null };
  const p = appt.patient;

  if (p.email && p.remindersOptIn) {
    try {
      const r = await sendMail({ to: p.email, ...buildEmail(appt, kind) });
      await log(appt.id, 'EMAIL', kind, p.email, r);
      out.email = r.status;
    } catch (err) {
      console.error(`Email (${kind}) non inviata per appuntamento ${appt.id}:`, err.message);
      await log(appt.id, 'EMAIL', kind, p.email, null, err);
      out.email = 'ERRORE';
    }
  }

  // WhatsApp automatico solo se configurato; altrimenti si usa l'invio "con un clic" dall'agenda
  const phone = normalizePhone(p.phone, config.whatsapp.defaultCountryCode);
  if (phone && p.whatsappOptIn && whatsappEnabled()) {
    try {
      const r = await sendWhatsapp({ to: phone, kind, ...buildWhatsapp(appt, kind) });
      await log(appt.id, 'WHATSAPP', kind, `+${phone}`, r);
      out.whatsapp = r.status;
    } catch (err) {
      console.error(`WhatsApp (${kind}) non inviato per appuntamento ${appt.id}:`, err.message);
      await log(appt.id, 'WHATSAPP', kind, `+${phone}`, null, err);
      out.whatsapp = 'ERRORE';
    }
  }

  if (kind === 'CONFERMA' && (out.email === 'INVIATO' || out.whatsapp === 'INVIATO')) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { confirmationSentAt: new Date() } });
  }
  return out;
}

module.exports = { notifyAppointment, buildEmail, buildWhatsapp, buildWhatsappText, whatsappLink, log, KINDS };
