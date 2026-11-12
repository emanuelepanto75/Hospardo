const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./lib/config');
const { requireAuth } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { startReminderScheduler } = require('./services/reminders');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth').router);
app.use('/api/public', require('./routes/public'));

// Da qui in poi tutte le API richiedono il login
app.use('/api', requireAuth);
app.use('/api/users', require('./routes/users'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/services', require('./routes/services'));
app.use('/api/patients', require('./routes/patients').router);
app.use('/api/appointments', require('./routes/appointments'));
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
    console.log(`Hospardo API in ascolto su http://localhost:${config.port}`);
    if (process.env.DISABLE_REMINDERS !== 'true') startReminderScheduler();
  });
}

module.exports = app;
