const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { hmToMin } = require('../lib/time');

const doctorSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: z.string().optional(),
  specialty: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bio: z.string().nullable().optional(),
  active: z.boolean().optional(),
  bookableOnline: z.boolean().optional(),
  slotStepMin: z.number().int().min(5).max(120).optional(),
  serviceIds: z.array(z.number().int()).optional(),
});

const include = {
  services: { select: { serviceId: true } },
  workingHours: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
};
const out = (d) => ({ ...d, services: undefined, serviceIds: d.services.map((s) => s.serviceId) });

/** Il medico può modificare solo i propri orari/assenze; admin e segreteria tutti */
function canManageDoctor(user, doctorId) {
  return user.role === 'ADMIN' || user.role === 'SEGRETERIA' || user.doctorId === doctorId;
}

router.get('/', ah(async (req, res) => {
  const doctors = await prisma.doctor.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], include });
  res.json(doctors.map(out));
}));

/** Assenze di tutti i medici in un intervallo (per l'agenda) */
router.get('/time-off', ah(async (req, res) => {
  const { from, to } = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
  res.json(await prisma.timeOff.findMany({ where: { start: { lt: to }, end: { gt: from } }, orderBy: { start: 'asc' } }));
}));

router.get('/:id', ah(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!doctor) throw notFound('Medico');
  res.json(out(doctor));
}));

router.post('/', requireRole('ADMIN'), ah(async (req, res) => {
  const { serviceIds = [], ...data } = doctorSchema.parse(req.body);
  const doctor = await prisma.doctor.create({
    data: { ...data, services: { create: serviceIds.map((serviceId) => ({ serviceId })) } },
    include,
  });
  res.status(201).json(out(doctor));
}));

router.put('/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const { serviceIds, ...data } = doctorSchema.partial().parse(req.body);
  const doctor = await prisma.$transaction(async (tx) => {
    if (serviceIds) {
      await tx.doctorService.deleteMany({ where: { doctorId: id } });
      await tx.doctorService.createMany({ data: serviceIds.map((serviceId) => ({ serviceId, doctorId: id })) });
    }
    return tx.doctor.update({ where: { id }, data, include });
  });
  res.json(out(doctor));
}));

// ---- Orari settimanali ----
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato orario HH:mm');
const hoursSchema = z.array(z.object({ weekday: z.number().int().min(1).max(7), startTime: hm, endTime: hm }));

router.put('/:id/hours', ah(async (req, res) => {
  const doctorId = Number(req.params.id);
  if (!canManageDoctor(req.user, doctorId)) throw new HttpError(403, 'Permessi insufficienti');
  const hours = hoursSchema.parse(req.body);
  for (const h of hours) {
    if (hmToMin(h.endTime) <= hmToMin(h.startTime)) throw new HttpError(400, `Fascia non valida: ${h.startTime}-${h.endTime}`);
  }
  // controlla sovrapposizioni tra fasce dello stesso giorno
  for (let d = 1; d <= 7; d++) {
    const day = hours.filter((h) => h.weekday === d).sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime));
    for (let i = 1; i < day.length; i++) {
      if (hmToMin(day[i].startTime) < hmToMin(day[i - 1].endTime)) throw new HttpError(400, 'Fasce orarie sovrapposte');
    }
  }
  await prisma.$transaction([
    prisma.workingHours.deleteMany({ where: { doctorId } }),
    prisma.workingHours.createMany({ data: hours.map((h) => ({ ...h, doctorId })) }),
  ]);
  const saved = await prisma.workingHours.findMany({ where: { doctorId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
  res.json(saved);
}));

// ---- Assenze / ferie ----
const timeOffSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  reason: z.string().nullable().optional(),
}).refine((t) => t.end > t.start, { message: 'La fine deve essere successiva all\'inizio', path: ['end'] });

router.get('/:id/time-off', ah(async (req, res) => {
  const doctorId = Number(req.params.id);
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const items = await prisma.timeOff.findMany({ where: { doctorId, end: { gte: from } }, orderBy: { start: 'asc' } });
  res.json(items);
}));

router.post('/:id/time-off', ah(async (req, res) => {
  const doctorId = Number(req.params.id);
  if (!canManageDoctor(req.user, doctorId)) throw new HttpError(403, 'Permessi insufficienti');
  const data = timeOffSchema.parse(req.body);
  const item = await prisma.timeOff.create({ data: { ...data, doctorId } });
  // segnala gli appuntamenti già presenti nel periodo
  const conflicts = await prisma.appointment.count({
    where: { doctorId, status: { in: ['PRENOTATO', 'CONFERMATO'] }, start: { lt: data.end }, end: { gt: data.start } },
  });
  res.status(201).json({ ...item, conflictingAppointments: conflicts });
}));

router.delete('/:id/time-off/:timeOffId', ah(async (req, res) => {
  const doctorId = Number(req.params.id);
  if (!canManageDoctor(req.user, doctorId)) throw new HttpError(403, 'Permessi insufficienti');
  await prisma.timeOff.deleteMany({ where: { id: Number(req.params.timeOffId), doctorId } });
  res.status(204).end();
}));

module.exports = router;
