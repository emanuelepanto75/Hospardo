/**
 * API pubbliche per la prenotazione online da parte dei pazienti (nessun login).
 */
const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { ah, HttpError, notFound } = require('../lib/errors');
const { getFreeSlots, assertFree, lockDoctor } = require('../services/availability');
const { notifyAppointment } = require('../services/notify');
const { effective } = require('../services/catalog');
const { DateTime, TZ } = require('../lib/time');
const { rateLimit } = require('../lib/rateLimit');

router.get('/info', (req, res) => res.json({ clinic: config.clinic, maxDaysAhead: config.onlineMaxDaysAhead }));

/** Nasconde prezzi (SITE_SHOW_PRICES=false) e durate (SITE_SHOW_DURATIONS=false) nelle risposte pubbliche */
const priceless = (list) => list.map(({ priceCents, durationMin, ...x }) => ({
  ...x,
  ...(config.clinic.showPrices ? { priceCents } : {}),
  ...(config.clinic.showDurations ? { durationMin } : {}),
}));

router.get('/services', ah(async (req, res) => {
  const services = await prisma.service.findMany({
    where: {
      active: true,
      bookableOnline: true,
      doctors: { some: { bookableOnline: true, doctor: { active: true, bookableOnline: true } } },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true, description: true, durationMin: true, priceCents: true },
  });
  res.json(priceless(services));
}));

router.get('/doctors', ah(async (req, res) => {
  const serviceId = req.query.serviceId ? Number(req.query.serviceId) : undefined;
  const doctors = await prisma.doctor.findMany({
    where: {
      active: true,
      bookableOnline: true,
      ...(serviceId ? { services: { some: { serviceId, bookableOnline: true } } } : {}),
    },
    orderBy: { lastName: 'asc' },
    select: {
      id: true, title: true, firstName: true, lastName: true, specialty: true, bio: true, color: true,
      services: serviceId ? { where: { serviceId }, include: { service: true } } : false,
    },
  });
  res.json(priceless(doctors.map(({ services, ...d }) => {
    if (!services?.length) return d;
    const e = effective(services[0]);
    return { ...d, durationMin: e.durationMin, priceCents: e.priceCents };
  })));
}));

async function loadBookable(doctorId, serviceId) {
  const link = await prisma.doctorService.findUnique({
    where: { doctorId_serviceId: { doctorId, serviceId } },
    include: { doctor: true, service: true },
  });
  if (!link || !link.doctor.active || !link.doctor.bookableOnline || !link.service.active || !effective(link).bookableOnline) {
    throw new HttpError(400, 'Prestazione non prenotabile online con questo medico');
  }
  return { ...link, durationMin: effective(link).durationMin };
}

function bookingWindow() {
  const notBefore = new Date(Date.now() + config.onlineMinLeadMin * 60000);
  const lastDay = DateTime.now().setZone(TZ).plus({ days: config.onlineMaxDaysAhead }).toISODate();
  return { notBefore, lastDay };
}

router.get('/slots', ah(async (req, res) => {
  const { doctorId, serviceId, date } = z.object({
    doctorId: z.coerce.number().int(),
    serviceId: z.coerce.number().int(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(req.query);
  const { durationMin } = await loadBookable(doctorId, serviceId);
  const { notBefore, lastDay } = bookingWindow();
  if (date > lastDay) return res.json([]);
  const slots = await getFreeSlots({ doctorId, date, durationMin, notBefore });
  res.json(slots.map((s) => s.start));
}));

/** Prossimi giorni con almeno uno slot libero (per evidenziare il calendario) */
router.get('/days', ah(async (req, res) => {
  const { doctorId, serviceId, from, days } = z.object({
    doctorId: z.coerce.number().int(),
    serviceId: z.coerce.number().int(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.coerce.number().int().min(1).max(42).default(14),
  }).parse(req.query);
  const { durationMin } = await loadBookable(doctorId, serviceId);
  const { notBefore, lastDay } = bookingWindow();
  const result = [];
  let d = DateTime.fromISO(from, { zone: TZ });
  for (let i = 0; i < days; i++, d = d.plus({ days: 1 })) {
    const date = d.toISODate();
    if (date > lastDay) break;
    const slots = await getFreeSlots({ doctorId, date, durationMin, notBefore });
    result.push({ date, available: slots.length });
  }
  res.json(result);
}));

const emptyToUndef = (s) => (typeof s === 'string' && s.trim() === '' ? undefined : s);
const bookSchema = z.object({
  doctorId: z.number().int(),
  serviceId: z.number().int(),
  start: z.coerce.date(),
  firstName: z.string().trim().min(1, 'Nome obbligatorio'),
  lastName: z.string().trim().min(1, 'Cognome obbligatorio'),
  email: z.string().trim().email('Email non valida'),
  phone: z.string().trim().min(6, 'Telefono obbligatorio'),
  fiscalCode: z.preprocess(emptyToUndef, z.string().trim().toUpperCase().regex(/^[A-Z0-9]{16}$/, 'Codice fiscale non valido').optional()),
  birthDate: z.preprocess(emptyToUndef, z.coerce.date().optional()),
  notes: z.string().max(1000).optional(),
  whatsappOptIn: z.boolean().optional(),
  privacyConsent: z.literal(true, { errorMap: () => ({ message: 'Il consenso privacy è obbligatorio' }) }),
});

router.post('/book', rateLimit({ max: 10, windowMs: 60 * 60 * 1000 }), ah(async (req, res) => {
  const data = bookSchema.parse(req.body);
  const { durationMin } = await loadBookable(data.doctorId, data.serviceId);
  const { notBefore } = bookingWindow();
  const end = new Date(data.start.getTime() + durationMin * 60000);

  // lo slot deve essere tra quelli effettivamente proposti
  const date = DateTime.fromJSDate(data.start).setZone(TZ).toISODate();
  const slots = await getFreeSlots({ doctorId: data.doctorId, date, durationMin, notBefore });
  if (!slots.some((s) => +s.start === +data.start)) throw new HttpError(409, 'L\'orario scelto non è più disponibile');

  const appt = await prisma.$transaction(async (tx) => {
    await lockDoctor(tx, data.doctorId);
    await assertFree(tx, { doctorId: data.doctorId, start: data.start, end });

    // Abbina un paziente esistente: per codice fiscale, altrimenti nome+cognome+email
    let patient = null;
    if (data.fiscalCode) patient = await tx.patient.findUnique({ where: { fiscalCode: data.fiscalCode } });
    if (!patient) {
      patient = await tx.patient.findFirst({
        where: {
          firstName: { equals: data.firstName, mode: 'insensitive' },
          lastName: { equals: data.lastName, mode: 'insensitive' },
          email: { equals: data.email, mode: 'insensitive' },
        },
      });
    }
    if (!patient) {
      patient = await tx.patient.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          fiscalCode: data.fiscalCode ?? null,
          birthDate: data.birthDate ?? null,
          privacyConsent: true,
          whatsappOptIn: data.whatsappOptIn ?? true,
        },
      });
    } else {
      // aggiorna solo i recapiti mancanti, senza sovrascrivere i dati in anagrafica
      await tx.patient.update({
        where: { id: patient.id },
        data: {
          phone: patient.phone || data.phone,
          email: patient.email || data.email,
          privacyConsent: true,
          ...(data.whatsappOptIn !== undefined ? { whatsappOptIn: data.whatsappOptIn } : {}),
        },
      });
    }

    return tx.appointment.create({
      data: {
        doctorId: data.doctorId,
        patientId: patient.id,
        serviceId: data.serviceId,
        start: data.start,
        end,
        notes: data.notes ? `[Nota del paziente] ${data.notes}` : null,
        source: 'ONLINE',
        manageToken: crypto.randomBytes(24).toString('base64url'),
      },
      include: { patient: true, doctor: true, service: true },
    });
  });

  await notifyAppointment(appt, 'CONFERMA');
  res.status(201).json({ token: appt.manageToken });
}));

// ---- Gestione appuntamento tramite link ricevuto via email ----
async function byToken(token) {
  const appt = await prisma.appointment.findUnique({ where: { manageToken: token }, include: { patient: true, doctor: true, service: true } });
  if (!appt) throw notFound('Appuntamento');
  return appt;
}

const publicView = (a) => ({
  start: a.start,
  end: a.end,
  status: a.status,
  service: a.service?.name ?? null,
  doctor: [a.doctor.title, a.doctor.firstName, a.doctor.lastName].filter(Boolean).join(' '),
  patient: `${a.patient.firstName} ${a.patient.lastName}`,
  canCancel: ['PRENOTATO', 'CONFERMATO'].includes(a.status) && a.start > new Date(),
  clinic: config.clinic,
});

router.get('/appointment/:token', ah(async (req, res) => res.json(publicView(await byToken(req.params.token)))));

router.post('/appointment/:token/cancel', rateLimit({ max: 20, windowMs: 60 * 60 * 1000 }), ah(async (req, res) => {
  const appt = await byToken(req.params.token);
  if (!publicView(appt).canCancel) throw new HttpError(400, 'Questo appuntamento non può essere annullato online');
  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: 'ANNULLATO', notes: [appt.notes, '[Annullato dal paziente online]'].filter(Boolean).join('\n') },
    include: { patient: true, doctor: true, service: true },
  });
  await notifyAppointment(updated, 'ANNULLAMENTO');
  res.json(publicView(updated));
}));

module.exports = router;
