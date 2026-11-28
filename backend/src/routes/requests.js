/**
 * Richieste di prenotazione arrivate dal sito: la segreteria (o un amministratore) le conferma,
 * trasformandole in appuntamenti, oppure le rifiuta.
 */
const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { DateTime, TZ } = require('../lib/time');
const { getFreeSlots, assertFree, lockDoctor, isWithinWorkingHours } = require('../services/availability');
const { durationFor } = require('../services/catalog');
const { findOrCreatePatient } = require('../services/patients');
const { notifyAppointment, whatsappLink } = require('../services/notify');
const { sendRequestRejected } = require('../services/requestMail');

router.use(requireRole('ADMIN', 'SEGRETERIA'));

const include = {
  doctor: { select: { id: true, title: true, firstName: true, lastName: true, color: true } },
  service: { select: { id: true, name: true, category: true } },
  appointment: { select: { id: true, start: true, status: true } },
  moveOf: { select: { id: true, start: true, end: true, status: true, serviceId: true, doctorId: true } },
};

router.get('/count', ah(async (req, res) => {
  const [count, cancellations] = await Promise.all([
    prisma.bookingRequest.count({ where: { status: 'NUOVA' } }),
    prisma.appointment.count({ where: { cancelledByPatient: true, cancelSeenAt: null } }),
  ]);
  res.json({ count, cancellations });
}));

// ---- Appuntamenti annullati dai pazienti dal link nel messaggio ----
router.get('/cancellations', ah(async (req, res) => {
  const since = new Date(Date.now() - 60 * 86400000);
  const items = await prisma.appointment.findMany({
    where: { cancelledByPatient: true, OR: [{ cancelSeenAt: null }, { cancelledAt: { gte: since } }] },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, title: true, firstName: true, lastName: true, color: true } },
      service: { select: { name: true } },
    },
    orderBy: [{ cancelledAt: 'desc' }],
    take: 200,
  });
  res.json(items);
}));

router.post('/cancellations/:id/seen', ah(async (req, res) => {
  await prisma.appointment.updateMany({ where: { id: Number(req.params.id), cancelledByPatient: true, cancelSeenAt: null }, data: { cancelSeenAt: new Date() } });
  res.json({ ok: true });
}));

router.post('/cancellations/seen-all', ah(async (req, res) => {
  const r = await prisma.appointment.updateMany({ where: { cancelledByPatient: true, cancelSeenAt: null }, data: { cancelSeenAt: new Date() } });
  res.json({ updated: r.count });
}));

router.get('/', ah(async (req, res) => {
  const status = ['NUOVA', 'CONFERMATA', 'RIFIUTATA'].includes(req.query.status) ? req.query.status : 'NUOVA';
  const items = await prisma.bookingRequest.findMany({
    where: { status },
    include,
    orderBy: status === 'NUOVA' ? { createdAt: 'asc' } : { handledAt: 'desc' },
    take: status === 'NUOVA' ? 500 : 100,
  });
  // per le richieste in attesa con orario: è ancora libero? (ignorando il "posto tenuto" dalla richiesta stessa)
  const out = [];
  for (const r of items) {
    let slotFree = null;
    if (status === 'NUOVA' && r.preferredStart) {
      const duration = Math.round((r.preferredEnd - r.preferredStart) / 60000);
      const date = DateTime.fromJSDate(r.preferredStart).setZone(TZ).toISODate();
      const slots = await getFreeSlots({ doctorId: r.doctorId, date, durationMin: duration, holds: true, excludeRequestId: r.id });
      slotFree = slots.some((s) => +s.start === +r.preferredStart);
    }
    out.push({ ...r, slotFree });
  }
  res.json(out);
}));

const confirmSchema = z.object({
  doctorId: z.number().int(),
  serviceId: z.number().int().nullable(),
  start: z.coerce.date(),
  end: z.coerce.date().optional(),
  notes: z.string().nullable().optional(),
  force: z.boolean().optional(),
});

/** Conferma: crea paziente (se nuovo) e appuntamento confermato, poi avvisa il paziente */
router.post('/:id/confirm', ah(async (req, res) => {
  const id = Number(req.params.id);
  const data = confirmSchema.parse(req.body);
  const request = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Richiesta');
  if (request.status !== 'NUOVA') throw new HttpError(409, 'Questa richiesta è già stata gestita');

  if (request.moveOfId) return confirmMove(req, res, request, data);
  if (!data.serviceId) throw new HttpError(400, 'Scegli la prestazione');
  const end = data.end || new Date(data.start.getTime() + ((await durationFor(data.doctorId, data.serviceId)) || 30) * 60000);
  if (end <= data.start) throw new HttpError(400, 'La fine deve essere successiva all\'inizio');
  if (!data.force && !(await isWithinWorkingHours({ doctorId: data.doctorId, start: data.start, end }))) {
    throw new HttpError(422, 'L\'orario è fuori dalla disponibilità del medico', { canForce: true });
  }

  const appointment = await prisma.$transaction(async (tx) => {
    await lockDoctor(tx, data.doctorId);
    if (!data.force) await assertFree(tx, { doctorId: data.doctorId, start: data.start, end });
    const patient = await findOrCreatePatient(tx, request);
    const notes = [
      request.preferences ? `[Preferenza del paziente] ${request.preferences}` : null,
      request.notes ? `[Nota del paziente] ${request.notes}` : null,
      data.notes || null,
    ].filter(Boolean).join('\n') || null;
    const appt = await tx.appointment.create({
      data: {
        doctorId: data.doctorId,
        patientId: patient.id,
        serviceId: data.serviceId,
        start: data.start,
        end,
        status: 'CONFERMATO',
        source: 'ONLINE',
        notes,
        manageToken: crypto.randomBytes(24).toString('base64url'),
        createdById: req.user.id,
      },
      include: { patient: true, doctor: true, service: true },
    });
    const updated = await tx.bookingRequest.updateMany({
      where: { id, status: 'NUOVA' },
      data: { status: 'CONFERMATA', appointmentId: appt.id, handledById: req.user.id, handledAt: new Date() },
    });
    if (!updated.count) throw new HttpError(409, 'Questa richiesta è già stata gestita');
    return appt;
  });

  const sent = await notifyAppointment(appointment, 'CONFERMA');
  res.json({
    appointment,
    email: sent.email,
    whatsapp: appointment.patient.whatsappOptIn ? whatsappLink(appointment, 'CONFERMA') : null,
  });
}));

/**
 * Conferma di una richiesta di spostamento: si sposta l'appuntamento originale (stesso paziente e storico)
 * al nuovo orario, poi si avvisa il paziente con il messaggio di spostamento.
 */
async function confirmMove(req, res, request, data) {
  const original = await prisma.appointment.findUnique({ where: { id: request.moveOfId } });
  if (!original || !['PRENOTATO', 'CONFERMATO'].includes(original.status)) {
    throw new HttpError(409, 'L\'appuntamento da spostare non è più attivo (annullato o già passato): rifiuta la richiesta o crea un nuovo appuntamento');
  }
  const durationMin = Math.round((original.end - original.start) / 60000);
  const end = data.end || (data.serviceId && data.serviceId !== original.serviceId
    ? new Date(data.start.getTime() + ((await durationFor(data.doctorId, data.serviceId)) || durationMin) * 60000)
    : new Date(data.start.getTime() + durationMin * 60000));
  if (end <= data.start) throw new HttpError(400, 'La fine deve essere successiva all\'inizio');
  if (!data.force && !(await isWithinWorkingHours({ doctorId: data.doctorId, start: data.start, end }))) {
    throw new HttpError(422, 'L\'orario è fuori dalla disponibilità del medico', { canForce: true });
  }
  const appointment = await prisma.$transaction(async (tx) => {
    await lockDoctor(tx, data.doctorId);
    if (!data.force) await assertFree(tx, { doctorId: data.doctorId, start: data.start, end, excludeId: original.id });
    const was = DateTime.fromJSDate(original.start).setZone(TZ).toFormat("dd/LL/yyyy 'alle' HH:mm");
    const appt = await tx.appointment.update({
      where: { id: original.id },
      data: {
        doctorId: data.doctorId,
        serviceId: data.serviceId ?? original.serviceId,
        start: data.start,
        end,
        status: 'CONFERMATO',
        reminderSentAt: null,
        notes: [original.notes, `[Spostato su richiesta del paziente, era il ${was}]`, data.notes || null].filter(Boolean).join('\n'),
      },
      include: { patient: true, doctor: true, service: true },
    });
    const updated = await tx.bookingRequest.updateMany({
      where: { id: request.id, status: 'NUOVA' },
      data: { status: 'CONFERMATA', handledById: req.user.id, handledAt: new Date() },
    });
    if (!updated.count) throw new HttpError(409, 'Questa richiesta è già stata gestita');
    return appt;
  });
  const sent = await notifyAppointment(appointment, 'SPOSTAMENTO');
  res.json({
    appointment,
    moved: true,
    email: sent.email,
    whatsapp: appointment.patient.whatsappOptIn ? whatsappLink(appointment, 'SPOSTAMENTO') : null,
  });
}

/** Rifiuto, con eventuale messaggio al paziente */
router.post('/:id/reject', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, notify } = z.object({ reason: z.string().trim().max(500).optional(), notify: z.boolean().default(true) }).parse(req.body || {});
  const request = await prisma.bookingRequest.findUnique({ where: { id }, include: { doctor: true, service: true, moveOf: true } });
  if (!request) throw notFound('Richiesta');
  if (request.status !== 'NUOVA') throw new HttpError(409, 'Questa richiesta è già stata gestita');
  await prisma.bookingRequest.update({
    where: { id },
    data: { status: 'RIFIUTATA', rejectReason: reason || null, handledById: req.user.id, handledAt: new Date() },
  });
  const email = notify ? await sendRequestRejected(request, reason) : null;
  res.json({ ok: true, email });
}));

module.exports = router;
