const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { getFreeSlots, assertFree, lockDoctor, isWithinWorkingHours } = require('../services/availability');
const { sendAppointmentEmail } = require('../services/mailer');

const include = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, fiscalCode: true, remindersOptIn: true } },
  doctor: { select: { id: true, title: true, firstName: true, lastName: true, color: true } },
  service: { select: { id: true, name: true, durationMin: true, color: true } },
};

const STATUSES = ['PRENOTATO', 'CONFERMATO', 'IN_ATTESA', 'COMPLETATO', 'ANNULLATO', 'NON_PRESENTATO'];

const createSchema = z.object({
  doctorId: z.number().int(),
  patientId: z.number().int(),
  serviceId: z.number().int().nullable().optional(),
  start: z.coerce.date(),
  end: z.coerce.date().optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  sendEmail: z.boolean().optional(),
  /// consente di prenotare fuori orario / sovrapposto (es. urgenze)
  force: z.boolean().optional(),
});

const updateSchema = z.object({
  doctorId: z.number().int().optional(),
  serviceId: z.number().int().nullable().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  force: z.boolean().optional(),
});

/** I medici possono gestire solo la propria agenda */
function assertCanEdit(user, doctorId) {
  if (user.role === 'MEDICO' && user.doctorId !== doctorId) {
    throw new HttpError(403, 'Puoi modificare solo i tuoi appuntamenti');
  }
}

router.get('/', ah(async (req, res) => {
  const { from, to, doctorId, status } = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    doctorId: z.coerce.number().int().optional(),
    status: z.string().optional(),
  }).parse(req.query);
  const where = { start: { lt: to }, end: { gt: from } };
  if (doctorId) where.doctorId = doctorId;
  if (status) where.status = { in: status.split(',') };
  const items = await prisma.appointment.findMany({ where, include, orderBy: { start: 'asc' } });
  res.json(items);
}));

router.get('/availability', ah(async (req, res) => {
  const { doctorId, date, serviceId, durationMin } = z.object({
    doctorId: z.coerce.number().int(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceId: z.coerce.number().int().optional(),
    durationMin: z.coerce.number().int().optional(),
  }).parse(req.query);
  let duration = durationMin;
  if (!duration && serviceId) duration = (await prisma.service.findUnique({ where: { id: serviceId } }))?.durationMin;
  const slots = await getFreeSlots({ doctorId, date, durationMin: duration || 30 });
  res.json(slots);
}));

router.get('/:id', ah(async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!appt) throw notFound('Appuntamento');
  res.json(appt);
}));

router.post('/', ah(async (req, res) => {
  const data = createSchema.parse(req.body);
  assertCanEdit(req.user, data.doctorId);

  let end = data.end;
  if (!end) {
    let duration = data.durationMin;
    if (!duration && data.serviceId) duration = (await prisma.service.findUnique({ where: { id: data.serviceId } }))?.durationMin;
    end = new Date(data.start.getTime() + (duration || 30) * 60000);
  }
  if (end <= data.start) throw new HttpError(400, 'La fine deve essere successiva all\'inizio');

  if (!data.force && !(await isWithinWorkingHours({ doctorId: data.doctorId, start: data.start, end }))) {
    throw new HttpError(422, 'L\'orario è fuori dalla disponibilità del medico', { canForce: true });
  }

  const appt = await prisma.$transaction(async (tx) => {
    await lockDoctor(tx, data.doctorId);
    if (!data.force) await assertFree(tx, { doctorId: data.doctorId, start: data.start, end });
    return tx.appointment.create({
      data: {
        doctorId: data.doctorId,
        patientId: data.patientId,
        serviceId: data.serviceId ?? null,
        start: data.start,
        end,
        notes: data.notes ?? null,
        status: data.status || 'PRENOTATO',
        source: 'INTERNO',
        manageToken: crypto.randomBytes(24).toString('base64url'),
        createdById: req.user.id,
      },
      include,
    });
  });

  if (data.sendEmail !== false) {
    const full = await prisma.appointment.findUnique({ where: { id: appt.id }, include: { patient: true, doctor: true, service: true } });
    if (await sendAppointmentEmail(full, 'conferma')) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { confirmationSentAt: new Date() } });
    }
  }
  res.status(201).json(appt);
}));

router.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const data = updateSchema.parse(req.body);
  const current = await prisma.appointment.findUnique({ where: { id } });
  if (!current) throw notFound('Appuntamento');
  assertCanEdit(req.user, current.doctorId);

  const doctorId = data.doctorId ?? current.doctorId;
  if (doctorId !== current.doctorId) assertCanEdit(req.user, doctorId);
  const start = data.start ?? current.start;
  let end = data.end;
  if (!end) end = data.start ? new Date(start.getTime() + (current.end - current.start)) : current.end;
  if (end <= start) throw new HttpError(400, 'La fine deve essere successiva all\'inizio');

  const moved = doctorId !== current.doctorId || +start !== +current.start || +end !== +current.end;
  const reactivated = ['ANNULLATO', 'NON_PRESENTATO'].includes(current.status) && data.status && !['ANNULLATO', 'NON_PRESENTATO'].includes(data.status);

  if (moved && !data.force && !(await isWithinWorkingHours({ doctorId, start, end }))) {
    throw new HttpError(422, 'L\'orario è fuori dalla disponibilità del medico', { canForce: true });
  }

  const appt = await prisma.$transaction(async (tx) => {
    if (moved || reactivated) {
      await lockDoctor(tx, doctorId);
      if (!data.force) await assertFree(tx, { doctorId, start, end, excludeId: id });
    }
    return tx.appointment.update({
      where: { id },
      data: {
        doctorId,
        start,
        end,
        serviceId: data.serviceId === undefined ? undefined : data.serviceId,
        notes: data.notes === undefined ? undefined : data.notes,
        status: data.status,
        // se l'orario cambia, il promemoria va reinviato
        ...(moved ? { reminderSentAt: null } : {}),
      },
      include,
    });
  });

  if (data.status === 'ANNULLATO' && current.status !== 'ANNULLATO') {
    const full = await prisma.appointment.findUnique({ where: { id }, include: { patient: true, doctor: true, service: true } });
    await sendAppointmentEmail(full, 'annullamento');
  } else if (moved) {
    const full = await prisma.appointment.findUnique({ where: { id }, include: { patient: true, doctor: true, service: true } });
    await sendAppointmentEmail(full, 'conferma');
  }
  res.json(appt);
}));

module.exports = router;
