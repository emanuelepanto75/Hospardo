const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, notFound, HttpError } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { titleCase } = require('../lib/names');
const { searchPlaces, computeFiscalCode } = require('../lib/codiceFiscale');

const emptyToNull = (s) => (typeof s === 'string' && s.trim() === '' ? null : s);
const opt = (schema) => z.preprocess(emptyToNull, schema.nullable().optional());

const patientSchema = z.object({
  firstName: z.string().trim().min(1, 'Nome obbligatorio').transform(titleCase),
  lastName: z.string().trim().min(1, 'Cognome obbligatorio').transform(titleCase),
  fiscalCode: opt(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{16}$/, 'Codice fiscale non valido')),
  birthDate: opt(z.coerce.date()),
  birthPlace: opt(z.string().trim().max(100)),
  gender: opt(z.enum(['M', 'F', 'A'])),
  email: opt(z.string().trim().email('Email non valida')),
  phone: opt(z.string().trim()),
  address: opt(z.string()),
  notes: opt(z.string()),
  privacyConsent: z.boolean().optional(),
  remindersOptIn: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
});

router.get('/', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const terms = q.split(/\s+/).filter(Boolean);
  const where = terms.length
    ? {
        AND: terms.map((t) => ({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' } },
            { lastName: { contains: t, mode: 'insensitive' } },
            { fiscalCode: { contains: t, mode: 'insensitive' } },
            { phone: { contains: t } },
            { email: { contains: t, mode: 'insensitive' } },
          ],
        })),
      }
    : {};
  const patients = await prisma.patient.findMany({ where, take, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  res.json(patients);
}));

/** Suggerimenti per il luogo di nascita (comuni, anche soppressi, e stati esteri) */
router.get('/places', ah(async (req, res) => {
  res.json(searchPlaces(String(req.query.q || '')));
}));

/** Calcolo del codice fiscale dai dati anagrafici */
router.post('/fiscal-code', ah(async (req, res) => {
  const b = req.body || {};
  const r = computeFiscalCode({
    lastName: b.lastName, firstName: b.firstName, gender: b.gender, birthPlace: b.birthPlace,
    birthDate: typeof b.birthDate === 'string' ? b.birthDate.slice(0, 10) : '',
  });
  if (r.missing) throw new HttpError(400, `Per calcolarlo servono: ${r.missing.join(', ')}`);
  if (r.error) throw new HttpError(400, r.error);
  res.json({ fiscalCode: r.code });
}));

router.get('/:id', ah(async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      appointments: {
        // il medico vede solo gli appuntamenti con sé
        where: req.user.role === 'MEDICO' ? { doctorId: req.user.doctorId ?? -1 } : undefined,
        orderBy: { start: 'desc' },
        include: { doctor: { select: { id: true, title: true, firstName: true, lastName: true, color: true } }, service: { select: { id: true, name: true } } },
      },
    },
  });
  if (!patient) throw notFound('Paziente');
  res.json(patient);
}));

router.post('/', ah(async (req, res) => {
  const patient = await prisma.patient.create({ data: patientSchema.parse(req.body) });
  res.status(201).json(patient);
}));

router.put('/:id', ah(async (req, res) => {
  const patient = await prisma.patient.update({ where: { id: Number(req.params.id) }, data: patientSchema.partial().parse(req.body) });
  res.json(patient);
}));

/**
 * Eliminazione definitiva (solo amministratori): paziente, appuntamenti, messaggi, richieste,
 * cartella dentale e piani di cura. Per la tracciabilità obbligatoria degli impianti il movimento
 * di magazzino resta, con nome e codice fiscale del paziente nella nota.
 */
router.delete('/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw notFound('Paziente');
  const confirm = String(req.body?.confirm || '').trim().toLowerCase();
  if (confirm !== patient.lastName.trim().toLowerCase()) throw new HttpError(400, 'Per confermare scrivi il cognome del paziente');
  const appts = await prisma.appointment.findMany({ where: { patientId: id }, select: { id: true } });
  const apptIds = appts.map((a) => a.id);
  const who = `${patient.lastName} ${patient.firstName}${patient.fiscalCode ? `, C.F. ${patient.fiscalCode}` : ''}`;
  await prisma.$transaction(async (tx) => {
    const implants = await tx.stockMovement.findMany({ where: { patientId: id, item: { isImplant: true } } });
    for (const m of implants) {
      await tx.stockMovement.update({ where: { id: m.id }, data: { note: [m.note, `Paziente eliminato dall'anagrafica: ${who}`].filter(Boolean).join(' – ') } });
    }
    await tx.bookingRequest.deleteMany({ where: { appointmentId: { in: apptIds } } });
    await tx.appointment.deleteMany({ where: { patientId: id } });
    await tx.patient.delete({ where: { id } });
  });
  res.json({ deleted: true, appointments: apptIds.length });
}));

module.exports = { router, patientSchema };
