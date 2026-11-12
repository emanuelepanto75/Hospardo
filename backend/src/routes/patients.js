const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, notFound } = require('../lib/errors');

const emptyToNull = (s) => (typeof s === 'string' && s.trim() === '' ? null : s);
const opt = (schema) => z.preprocess(emptyToNull, schema.nullable().optional());

const patientSchema = z.object({
  firstName: z.string().trim().min(1, 'Nome obbligatorio'),
  lastName: z.string().trim().min(1, 'Cognome obbligatorio'),
  fiscalCode: opt(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{16}$/, 'Codice fiscale non valido')),
  birthDate: opt(z.coerce.date()),
  gender: opt(z.enum(['M', 'F', 'A'])),
  email: opt(z.string().trim().email('Email non valida')),
  phone: opt(z.string().trim()),
  address: opt(z.string()),
  notes: opt(z.string()),
  privacyConsent: z.boolean().optional(),
  remindersOptIn: z.boolean().optional(),
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

router.get('/:id', ah(async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      appointments: {
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

module.exports = { router, patientSchema };
