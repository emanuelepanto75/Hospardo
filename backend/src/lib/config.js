require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-non-usare-in-produzione',
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  timezone: process.env.TIMEZONE || 'Europe/Rome',
  clinic: {
    name: process.env.CLINIC_NAME || 'Studio Medico',
    address: process.env.CLINIC_ADDRESS || '',
    phone: process.env.CLINIC_PHONE || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Studio Medico <noreply@example.com>',
  },
  reminderHoursBefore: Number(process.env.REMINDER_HOURS_BEFORE || 24),
  /// Anticipo minimo (minuti) per prenotare online
  onlineMinLeadMin: Number(process.env.ONLINE_MIN_LEAD_MIN || 120),
  /// Fino a quanti giorni avanti si può prenotare online
  onlineMaxDaysAhead: Number(process.env.ONLINE_MAX_DAYS_AHEAD || 90),
};

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET deve essere impostato in produzione');
}

module.exports = config;
