/** Stampe: settimana del singolo medico (dati per la pagina di stampa e PDF) */
const router = require('express').Router();
const { z } = require('zod');
const { ah, HttpError, notFound } = require('../lib/errors');
const { DateTime, TZ } = require('../lib/time');
const { buildDoctorWeek, buildDoctorWeekPdf } = require('../services/doctorWeek');

const querySchema = z.object({
  doctorId: z.coerce.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function load(req) {
  const { doctorId, date } = querySchema.parse(req.query);
  // il medico può stampare solo la propria agenda
  if (req.user.role === 'MEDICO' && req.user.doctorId !== doctorId) throw new HttpError(403, 'Puoi stampare solo la tua agenda');
  const week = await buildDoctorWeek(doctorId, date || DateTime.now().setZone(TZ).toISODate());
  if (!week) throw notFound('Medico');
  return week;
}

router.get('/doctor-week', ah(async (req, res) => res.json(await load(req))));

router.get('/doctor-week.pdf', ah(async (req, res) => {
  const week = await load(req);
  const pdf = await buildDoctorWeekPdf(week);
  const slug = week.doctor.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="agenda-${slug}-${week.from}.pdf"`);
  res.send(pdf);
}));

module.exports = router;
