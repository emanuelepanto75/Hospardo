require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-non-usare-in-produzione',
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  /// indirizzo pubblico per i pazienti (pagina web, prenotazione, link nelle email); default = FRONTEND_URL
  publicUrl: (process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  timezone: process.env.TIMEZONE || 'Europe/Rome',
  clinic: {
    name: process.env.CLINIC_NAME || 'Studio Medico',
    address: process.env.CLINIC_ADDRESS || '',
    phone: process.env.CLINIC_PHONE || '',
    // mostrati nella pagina web pubblica
    email: process.env.CLINIC_EMAIL || '',
    hours: process.env.CLINIC_HOURS || '',
    // informativa privacy (titolare del trattamento): ragione sociale, P.IVA, PEC, email privacy, DPO se nominato
    legalName: process.env.PRIVACY_CONTROLLER || process.env.CLINIC_NAME || '',
    vatNumber: process.env.PRIVACY_VAT || '',
    pec: process.env.PRIVACY_PEC || '',
    privacyEmail: process.env.PRIVACY_EMAIL || process.env.CLINIC_EMAIL || '',
    dpo: process.env.PRIVACY_DPO || '',
    description: process.env.CLINIC_DESCRIPTION || '',
    showPrices: process.env.SITE_SHOW_PRICES !== 'false',
    showDurations: process.env.SITE_SHOW_DURATIONS !== 'false',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    // se non indicato: connessione cifrata diretta sulla porta 465 (es. Aruba smtps.aruba.it), STARTTLS sulle altre
    // la porta 465 richiede sempre la connessione cifrata diretta (es. Aruba smtps.aruba.it); sulle altre STARTTLS
    secure: Number(process.env.SMTP_PORT || 587) === 465 || String(process.env.SMTP_SECURE).trim() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Studio Medico <noreply@example.com>',
  },
  /// Promemoria: "day_before" = il giorno prima all'ora REMINDER_TIME; "hours" = REMINDER_HOURS_BEFORE ore prima
  reminderMode: process.env.REMINDER_MODE === 'hours' ? 'hours' : 'day_before',
  reminderTime: process.env.REMINDER_TIME || '10:00',
  reminderHoursBefore: Number(process.env.REMINDER_HOURS_BEFORE || 24),
  /// Richieste di prenotazione dal sito: a chi arriva l'avviso di nuova richiesta
  requests: {
    notifyEmail: (process.env.REQUESTS_EMAIL || process.env.REPORT_EMAIL || process.env.CLINIC_EMAIL || '').trim(),
  },
  /// Riepilogo serale via email (Excel + calendario) dei prossimi giorni lavorativi
  report: {
    email: (process.env.REPORT_EMAIL || '').trim(),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(process.env.REPORT_TIME || '') ? process.env.REPORT_TIME : '22:00',
    days: Math.min(Math.max(Number(process.env.REPORT_DAYS) || 6, 1), 14),
  },
  whatsapp: {
    /// "meta" (WhatsApp Cloud API), "twilio" oppure vuoto = disattivato (messaggi solo registrati)
    provider: (process.env.WHATSAPP_PROVIDER || '').toLowerCase(),
    defaultCountryCode: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '39').replace(/\D/g, ''),
    language: process.env.WHATSAPP_TEMPLATE_LANG || 'it',
    templates: {
      CONFERMA: process.env.WHATSAPP_TEMPLATE_CONFERMA || '',
      PROMEMORIA: process.env.WHATSAPP_TEMPLATE_PROMEMORIA || '',
      ANNULLAMENTO: process.env.WHATSAPP_TEMPLATE_ANNULLAMENTO || '',
      SPOSTAMENTO: process.env.WHATSAPP_TEMPLATE_SPOSTAMENTO || process.env.WHATSAPP_TEMPLATE_CONFERMA || '',
    },
    meta: {
      token: process.env.WHATSAPP_META_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID || '',
      apiVersion: process.env.WHATSAPP_META_API_VERSION || 'v21.0',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_WHATSAPP_FROM || '',
    },
  },
  /// Anticipo minimo (minuti) per prenotare online
  onlineMinLeadMin: Number(process.env.ONLINE_MIN_LEAD_MIN || 120),
  // preavviso minimo (ore) perché il paziente possa annullare o chiedere di spostare dal link ricevuto
  cancelMinHours: Number(process.env.CANCEL_MIN_HOURS ?? 24),
  /// Fino a quanti giorni avanti si può prenotare online
  onlineMaxDaysAhead: Number(process.env.ONLINE_MAX_DAYS_AHEAD || 90),
};

const PLACEHOLDER_SECRETS = ['', 'cambia-questa-stringa-con-una-lunga-e-casuale'];
const weakSecret = PLACEHOLDER_SECRETS.includes(process.env.JWT_SECRET || '') || (process.env.JWT_SECRET || '').length < 32;
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.frontendUrl);
config.isPublic = !isLocal;

if (weakSecret && (process.env.NODE_ENV === 'production' || !isLocal)) {
  throw new Error('JWT_SECRET non impostato o troppo debole: esegui "npm run setup" nella cartella backend '
    + '(con Docker: "docker compose run --rm app npm run setup") prima di pubblicare l\'agenda.');
}
if (weakSecret) console.warn('ATTENZIONE: JWT_SECRET di prova. Esegui "npm run setup" prima di usare dati reali.');

module.exports = config;
