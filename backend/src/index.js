const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const config = require('./lib/config');
const { requireAuth } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { startReminderScheduler } = require('./services/reminders');
const { startReportScheduler } = require('./services/agendaReport');

const app = express();
// Dietro tunnel Cloudflare e Caddy: l'indirizzo del visitatore è il primo non privato in X-Forwarded-For
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
  // HTTPS obbligatorio solo quando l'agenda è pubblicata (es. tramite tunnel Cloudflare)
  strictTransportSecurity: config.isPublic,
}));
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth').router);
app.use('/api/public', require('./routes/public'));
// copia di emergenza scaricata dai PC dello studio con la loro chiave (prima del login)
app.use('/api/emergency', require('./routes/emergency').publicRouter);

// Da qui in poi tutte le API richiedono il login
app.use('/api', requireAuth);
app.use('/api/users', require('./routes/users'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/services', require('./routes/services'));
app.use('/api/patients', require('./routes/patients').router);
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/prints', require('./routes/prints'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/dental', require('./routes/dental'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/emergency', require('./routes/emergency').adminRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint non trovato' }));

// In produzione il backend serve anche il frontend compilato
const dist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Hospardo in ascolto su http://localhost:${config.port}`);
    console.log(require('./services/mailer').describeConfig());
    if (config.isPublic) console.log(`Indirizzo pubblico configurato: ${config.frontendUrl}`);
    if (process.env.DISABLE_REMINDERS !== 'true') {
      startReminderScheduler();
      startReportScheduler();
    }
  });
}

module.exports = app;
