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
  services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
  workingHours: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
};
const out = (d) => ({
  ...d,
  serviceIds: d.services.map((s) => s.serviceId),
  services: d.services.map((s) => ({
    serviceId: s.serviceId,
    name: s.service.name,
    category: s.service.category,
    active: s.service.active,
    // valori personalizzati per il medico (null = standard)
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    bookableOnline: s.bookableOnline,
    // valori standard della prestazione
    defaultDurationMin: s.service.durationMin,
    defaultPriceCents: s.service.priceCents,
    serviceBookableOnline: s.service.bookableOnline,
  })),
});

/** Il medico può modificare solo i propri orari/assenze; admin e segreteria tutti */
function canManageDoctor(user, doctorId) {
  return user.role === 'ADMIN' || user.role === 'SEGRETERIA' || user.doctorId === doctorId;
}

/** Aggiorna l'elenco delle prestazioni di un medico mantenendo le personalizzazioni esistenti */
async function syncDoctorServices(tx, doctorId, serviceIds) {
  await tx.doctorService.deleteMany({ where: { doctorId, serviceId: { notIn: serviceIds } } });
  await tx.doctorService.createMany({ data: serviceIds.map((serviceId) => ({ doctorId, serviceId })), skipDuplicates: true });
}

const ACTIVE_FUTURE = (doctorId) => ({ doctorId, status: { in: ['PRENOTATO', 'CONFERMATO', 'IN_ATTESA'] }, start: { gte: new Date() } });

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
  const id = Number(req.params.id);
  const doctor = await prisma.doctor.findUnique({ where: { id }, include });
  if (!doctor) throw notFound('Medico');
  const [appointmentsTotal, futureAppointments] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: id } }),
    prisma.appointment.count({ where: ACTIVE_FUTURE(id) }),
  ]);
  res.json({ ...out(doctor), appointmentsTotal, futureAppointments });
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
    if (serviceIds) await syncDoctorServices(tx, id, serviceIds);
    return tx.doctor.update({ where: { id }, data, include });
  });
  res.json(out(doctor));
}));

// ---- Prestazioni erogate dal medico (con durata/prezzo personalizzati) ----
const doctorServicesSchema = z.array(z.object({
  serviceId: z.number().int(),
  durationMin: z.number().int().min(5).max(480).nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  bookableOnline: z.boolean().optional(),
}));

router.put('/:id/services', requireRole('ADMIN'), ah(async (req, res) => {
  const doctorId = Number(req.params.id);
  const items = doctorServicesSchema.parse(req.body);
  if (new Set(items.map((i) => i.serviceId)).size !== items.length) throw new HttpError(400, 'Prestazione ripetuta');
  await prisma.$transaction(async (tx) => {
    await tx.doctorService.deleteMany({ where: { doctorId, serviceId: { notIn: items.map((i) => i.serviceId) } } });
    for (const i of items) {
      const values = { durationMin: i.durationMin ?? null, priceCents: i.priceCents ?? null, bookableOnline: i.bookableOnline ?? true };
      await tx.doctorService.upsert({
        where: { doctorId_serviceId: { doctorId, serviceId: i.serviceId } },
        update: values,
        create: { doctorId, serviceId: i.serviceId, ...values },
      });
    }
  });
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include });
  res.json(out(doctor));
}));

// ---- Medico che non presta più servizio ----

/** Archivia: il medico sparisce da agenda e prenotazioni online, lo storico resta */
router.post('/:id/archive', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const { cancelFuture } = z.object({ cancelFuture: z.boolean().optional() }).parse(req.body || {});
  const future = await prisma.appointment.findMany({ where: ACTIVE_FUTURE(id), select: { id: true } });
  if (future.length && !cancelFuture) {
    throw new HttpError(409, `Il medico ha ancora ${future.length} appuntamenti futuri: spostali o annullali prima di archiviarlo`, { futureAppointments: future.length });
  }
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { id: { in: future.map((f) => f.id) } }, data: { status: 'ANNULLATO' } }),
    prisma.doctor.update({ where: { id }, data: { active: false, bookableOnline: false, archivedAt: new Date() } }),
    // l'eventuale account del medico non può più accedere
    prisma.user.updateMany({ where: { doctorId: id }, data: { active: false } }),
  ]);
  // avvisa i pazienti degli appuntamenti annullati
  const { notifyAppointment } = require('../services/notify');
  for (const f of future) await notifyAppointment(f.id, 'ANNULLAMENTO');
  const doctor = await prisma.doctor.findUnique({ where: { id }, include });
  res.json({ ...out(doctor), cancelledAppointments: future.length });
}));

router.post('/:id/restore', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const doctor = await prisma.doctor.update({ where: { id }, data: { active: true, bookableOnline: true, archivedAt: null }, include });
  res.json(out(doctor));
}));

/** Eliminazione definitiva: consentita solo se il medico non ha mai avuto appuntamenti */
router.delete('/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const count = await prisma.appointment.count({ where: { doctorId: id } });
  if (count) {
    throw new HttpError(409, `Il medico ha ${count} appuntamenti nello storico: non può essere eliminato, ma puoi archiviarlo`);
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { doctorId: id }, data: { doctorId: null, active: false } }),
    prisma.doctor.delete({ where: { id } }),
  ]);
  res.status(204).end();
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
