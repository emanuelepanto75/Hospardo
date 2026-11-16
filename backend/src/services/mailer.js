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

/** Invia un'email. Se SMTP non è configurato la stampa nel log. Ritorna { status, providerId } */
async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.log(`[email simulata] A: ${to}\nOggetto: ${subject}\n${text}\n`);
    return { status: 'SIMULATO' };
  }
  const info = await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
  return { status: 'INVIATO', providerId: info.messageId };
}

module.exports = { sendMail, emailEnabled };
