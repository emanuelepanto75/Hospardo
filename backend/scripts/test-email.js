// Prova l'invio delle email. Uso: npm run email:test -- destinatario@esempio.it
require('dotenv').config();
const config = require('../src/lib/config');
const { describeConfig, explainError, getTransporter } = require('../src/services/mailer');

(async () => {
  const to = process.argv[2];
  console.log(describeConfig());
  const t = getTransporter();
  if (!t) { console.log('\nImposta SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e MAIL_FROM in backend/.env.'); process.exit(1); }
  try {
    process.stdout.write('\n1. Connessione e accesso al server SMTP… ');
    await t.verify();
    console.log('OK');
    if (!to) { console.log('\nPer inviare anche un messaggio di prova: npm run email:test -- tuo@indirizzo.it'); return; }
    process.stdout.write(`2. Invio di un messaggio di prova a ${to}… `);
    const info = await t.sendMail({
      from: config.smtp.from, to,
      subject: `Prova email – ${config.clinic.name}`,
      text: `Questo è un messaggio di prova inviato dall'agenda Hospardo.\nSe lo ricevi, le email ai pazienti funzionano.\n\n${config.clinic.name}`,
    });
    console.log('OK');
    console.log(`\nInviato (id ${info.messageId}). Controlla la casella ${to}, anche nella posta indesiderata.`);
  } catch (err) {
    console.log('ERRORE');
    console.log(`\n${err.message}`);
    const hint = explainError(err);
    if (hint) console.log(`\nSuggerimento: ${hint}`);
    process.exitCode = 1;
  }
})();
