const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { getFreeSlots, assertFree, lockDoctor, isWithinWorkingHours } = require('../services/availability');
const { notifyAppointment, whatsappLink, log: logNotification } = require('../services/notify');
const { DateTime, TZ, dayBounds } = require('../lib/time');
const { durationFor } = require('../services/catalog');

const include = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, fiscalCode: true, remindersOptIn: true, whatsappOptIn: true } },
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

const WA_KINDS = ['CONFERMA', 'PROMEMORIA', 'SPOSTAMENTO', 'ANNULLAMENTO'];
/** Link WhatsApp "con un clic" per ogni tipo di messaggio (null se il paziente non ha un cellulare valido) */
function whatsappLinks(appt) {
  const out = {};
  for (const k of WA_KINDS) out[k] = whatsappLink(appt, k);
  return out;
}

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
  if (!duration && serviceId) duration = await durationFor(doctorId, serviceId);
  const slots = await getFreeSlots({ doctorId, date, durationMin: duration || 30 });
  res.json(slots);
}));

/** Elenco per i promemoria WhatsApp con un clic: appuntamenti di un giorno (default: il prossimo giorno lavorativo) */
router.get('/reminders', ah(async (req, res) => {
  let date = req.query.date;
  if (!date) {
    let d = DateTime.now().setZone(TZ).plus({ days: 1 });
    if (d.weekday === 7) d = d.plus({ days: 1 }); // la domenica lo studio è chiuso
    date = d.toISODate();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Data non valida');
  const { start, end } = dayBounds(date);
  const items = await prisma.appointment.findMany({
    where: {
      start: { gte: start, lt: end },
      status: { in: ['PRENOTATO', 'CONFERMATO'] },
      ...(req.user.role === 'MEDICO' && req.query.mine === '1' ? { doctorId: req.user.doctorId } : {}),
    },
    include: {
      ...include,
      notifications: { where: { kind: 'PROMEMORIA', status: { in: ['INVIATO', 'MANUALE', 'SIMULATO'] } }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: [{ start: 'asc' }],
  });
  res.json({
    date,
    items: items.map(({ notifications, ...a }) => ({
      ...a,
      whatsapp: whatsappLink({ ...a, doctor: a.doctor, patient: a.patient }, 'PROMEMORIA'),
      whatsappSentAt: notifications.find((n) => n.channel === 'WHATSAPP' && n.status !== 'SIMULATO')?.createdAt ?? null,
      emailReminder: notifications.find((n) => n.channel === 'EMAIL')?.status ?? null,
    })),
  });
}));

router.get('/:id', ah(async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: Number(req.params.id) },
    include: { ...include, notifications: { orderBy: { createdAt: 'desc' } } },
  });
  if (!appt) throw notFound('Appuntamento');
  res.json({ ...appt, whatsappLinks: whatsappLinks(appt) });
}));

router.post('/', ah(async (req, res) => {
  const data = createSchema.parse(req.body);
  assertCanEdit(req.user, data.doctorId);

  let end = data.end;
  if (!end) {
    let duration = data.durationMin;
    if (!duration && data.serviceId) duration = await durationFor(data.doctorId, data.serviceId);
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

  if (data.sendEmail !== false) await notifyAppointment(appt.id, 'CONFERMA');
  res.status(201).json({ ...appt, whatsappLinks: whatsappLinks(appt) });
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
    await notifyAppointment(id, 'ANNULLAMENTO');
  } else if (moved && !['ANNULLATO', 'NON_PRESENTATO', 'COMPLETATO'].includes(appt.status)) {
    await notifyAppointment(id, 'SPOSTAMENTO');
  }
  res.json({ ...appt, whatsappLinks: whatsappLinks(appt) });
}));

/** Registra che la segreteria ha aperto WhatsApp con il messaggio pronto (invio con un clic) */
router.post('/:id/whatsapp', ah(async (req, res) => {
  const { kind } = z.object({ kind: z.enum(WA_KINDS) }).parse(req.body);
  const appt = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) }, include: { patient: true, doctor: true, service: true } });
  if (!appt) throw notFound('Appuntamento');
  assertCanEdit(req.user, appt.doctorId);
  const link = whatsappLink(appt, kind);
  if (!link) throw new HttpError(400, 'Il paziente non ha un numero di cellulare valido');
  await logNotification(appt.id, 'WHATSAPP', kind, link.phone, { status: 'MANUALE' });
  const notifications = await prisma.notification.findMany({ where: { appointmentId: appt.id }, orderBy: { createdAt: 'desc' } });
  res.json({ notifications });
}));

/** Invio manuale di un messaggio al paziente (es. reinvio conferma o promemoria) */
router.post('/:id/notify', ah(async (req, res) => {
  const { kind } = z.object({ kind: z.enum(['CONFERMA', 'PROMEMORIA']) }).parse(req.body);
  const appt = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!appt) throw notFound('Appuntamento');
  assertCanEdit(req.user, appt.doctorId);
  if (['ANNULLATO', 'NON_PRESENTATO'].includes(appt.status)) throw new HttpError(400, 'Appuntamento annullato: nessun messaggio inviato');
  const result = await notifyAppointment(appt.id, kind);
  if (!result.email && !result.whatsapp) throw new HttpError(400, 'Nessun messaggio automatico inviato: il paziente non ha email (o l\'ha rifiutata) e WhatsApp automatico non è attivo. Usa il pulsante WhatsApp.');
  const notifications = await prisma.notification.findMany({ where: { appointmentId: appt.id }, orderBy: { createdAt: 'desc' } });
  res.json({ result, notifications });
}));

module.exports = router;
