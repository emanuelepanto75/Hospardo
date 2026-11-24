const nodemailer = require('nodemailer');
const config = require('../lib/config');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

const emailEnabled = () => !!transporter;

function describeConfig() {
  if (!transporter) return 'Email non configurata (SMTP_HOST vuoto): i messaggi vengono solo scritti nel log';
  return `Email: invio tramite ${config.smtp.host}:${config.smtp.port} (${config.smtp.secure ? 'SSL' : 'STARTTLS'}) come ${config.smtp.from}`;
}

/** Spiegazione in italiano degli errori SMTP più comuni */
function explainError(err) {
  const m = `${err.code || ''} ${err.message || ''}`;
  if (/EAUTH|535|authentication|Invalid login/i.test(m)) return 'Utente o password SMTP non accettati: controlla SMTP_USER (l\'indirizzo email completo) e SMTP_PASS.';
  if (/wrong version number|ssl3_get_record|EPROTO/i.test(m)) return 'Tipo di connessione sbagliato: con la porta 465 serve SMTP_SECURE=true, con la 587 SMTP_SECURE=false.';
  if (/ETIMEDOUT|ECONNREFUSED|ECONNECTION|ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Server SMTP non raggiungibile: controlla SMTP_HOST e SMTP_PORT e che la connessione internet del server funzioni.';
  if (/sender|from|553|550 5\.7/i.test(m)) return 'Mittente non accettato: MAIL_FROM deve usare lo stesso indirizzo di SMTP_USER.';
  return null;
}

/** Invia un'email. Se SMTP non è configurato la stampa nel log. Ritorna { status, providerId } */
async function sendMail({ to, subject, text, html, attachments }) {
  if (!transporter) {
    const att = attachments?.length ? `\nAllegati: ${attachments.map((a) => a.filename).join(', ')}` : '';
    console.log(`[email simulata] A: ${to}\nOggetto: ${subject}\n${text}${att}\n`);
    return { status: 'SIMULATO' };
  }
  const info = await transporter.sendMail({ from: config.smtp.from, to, subject, text, html, attachments });
  return { status: 'INVIATO', providerId: info.messageId };
}

module.exports = { sendMail, emailEnabled, describeConfig, explainError, getTransporter: () => transporter };
