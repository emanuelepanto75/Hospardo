const router = require('express').Router();
const { requireRole } = require('../middleware/auth');
const { ah } = require('../lib/errors');
const config = require('../lib/config');
const { buildReport, sendAgendaReport } = require('../services/agendaReport');

router.use(requireRole('ADMIN', 'SEGRETERIA'));

/** Download del file Excel dei prossimi giorni (stesso contenuto dell'email serale) */
router.get('/agenda.xlsx', ah(async (req, res) => {
  const { xlsx, filenames } = await buildReport();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenames.xlsx}"`);
  res.send(xlsx);
}));

router.get('/agenda.ics', ah(async (req, res) => {
  const { ics, filenames } = await buildReport();
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenames.ics}"`);
  res.send(ics);
}));

router.get('/agenda/settings', (req, res) => res.json({ email: config.report.email || null, time: config.report.time, days: config.report.days }));

/** Invio immediato dell'email di riepilogo (per prova) */
router.post('/agenda/send', requireRole('ADMIN'), ah(async (req, res) => {
  res.json(await sendAgendaReport());
}));

module.exports = router;
