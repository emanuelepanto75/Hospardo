/**
 * Cartella dentale: odontogramma e diario dei trattamenti.
 * Accesso: amministratori e medici odontoiatri (non segreteria né altri medici).
 */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { canDental, isAdmin } = require('../middleware/auth');
const { ALL_TEETH, TOOTH_STATUS, SURFACES, SURFACE_STATUS } = require('../lib/teeth');

router.use((req, res, next) => (canDental(req.user) ? next() : next(new HttpError(403, 'Cartella dentale riservata a odontoiatri e amministratori'))));

const toothNumber = z.coerce.number().int().refine((n) => ALL_TEETH.has(n), 'Dente non valido (numerazione FDI)');
const surfacesSchema = z.record(z.enum(SURFACES), z.enum(SURFACE_STATUS)).default({});
const treatmentInclude = {
  doctor: { select: { id: true, title: true, firstName: true, lastName: true, color: true } },
  service: { select: { id: true, name: true } },
  appointment: { select: { id: true, start: true } },
};

async function patientOr404(id) {
  const p = await prisma.patient.findUnique({ where: { id }, select: { id: true, dentalEnabled: true } });
  if (!p) throw notFound('Paziente');
  return p;
}

/** Registrare qualcosa nella cartella la attiva */
const enable = (tx, patientId) => tx.patient.update({ where: { id: patientId }, data: { dentalEnabled: true } });

/** Attiva / disattiva la cartella dentale del paziente (disattivabile solo se vuota) */
router.put('/patients/:id/enabled', ah(async (req, res) => {
  const patientId = Number(req.params.id);
  await patientOr404(patientId);
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  if (!enabled) {
    const [teeth, treatments] = await Promise.all([
      prisma.dentalTooth.count({ where: { patientId, NOT: { status: 'SANO', surfaces: { equals: {} }, note: null } } }),
      prisma.dentalTreatment.count({ where: { patientId } }),
    ]);
    if (teeth || treatments) throw new HttpError(409, 'La cartella contiene già dati e non può essere disattivata');
    await prisma.dentalTooth.deleteMany({ where: { patientId } });
  }
  await prisma.patient.update({ where: { id: patientId }, data: { dentalEnabled: enabled } });
  res.json({ dentalEnabled: enabled });
}));

/** Cartella completa: denti con stato diverso da "sano" + diario + dati utili al form */
router.get('/patients/:id', ah(async (req, res) => {
  const patientId = Number(req.params.id);
  const patient = await patientOr404(patientId);
  const [teeth, treatments, dentists, services, appointments] = await Promise.all([
    prisma.dentalTooth.findMany({ where: { patientId }, orderBy: { tooth: 'asc' } }),
    prisma.dentalTreatment.findMany({ where: { patientId }, include: treatmentInclude, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    prisma.doctor.findMany({ where: { isDentist: true }, select: { id: true, title: true, firstName: true, lastName: true, active: true }, orderBy: { lastName: 'asc' } }),
    // prestazioni erogate dai dentisti (o nella categoria Odontoiatria)
    prisma.service.findMany({
      where: { OR: [{ category: { equals: 'Odontoiatria', mode: 'insensitive' } }, { doctors: { some: { doctor: { isDentist: true } } } }] },
      select: { id: true, name: true, category: true, active: true }, orderBy: { name: 'asc' },
    }),
    prisma.appointment.findMany({
      where: { patientId, doctor: { isDentist: true }, status: { not: 'ANNULLATO' } },
      select: { id: true, start: true, doctorId: true, service: { select: { name: true } } }, orderBy: { start: 'desc' }, take: 50,
    }),
  ]);
  res.json({ dentalEnabled: patient.dentalEnabled, teeth, treatments, dentists, services, appointments });
}));

/** Stato di un dente (stato generale, superfici, nota) */
router.put('/patients/:id/teeth/:tooth', ah(async (req, res) => {
  const patientId = Number(req.params.id);
  const tooth = toothNumber.parse(req.params.tooth);
  await patientOr404(patientId);
  const data = z.object({
    status: z.enum(TOOTH_STATUS),
    surfaces: surfacesSchema,
    note: z.string().trim().max(500).nullable().optional(),
  }).parse(req.body);
  const values = { status: data.status, surfaces: data.surfaces, note: data.note || null, updatedById: req.user.id };
  const [saved] = await prisma.$transaction([
    prisma.dentalTooth.upsert({
      where: { patientId_tooth: { patientId, tooth } },
      update: values,
      create: { patientId, tooth, ...values },
    }),
    enable(prisma, patientId),
  ]);
  res.json(saved);
}));

const treatmentSchema = z.object({
  date: z.coerce.date(),
  tooth: toothNumber.nullable().optional(),
  surfaces: z.string().toUpperCase().regex(/^[OMDVL]*$/, 'Superfici non valide').max(5).nullable().optional(),
  serviceId: z.number().int().nullable().optional(),
  doctorId: z.number().int(),
  appointmentId: z.number().int().nullable().optional(),
  description: z.string().trim().min(1, 'Descrizione obbligatoria').max(300),
  notes: z.string().trim().max(2000).nullable().optional(),
  /// aggiorna anche lo stato del dente (facoltativo)
  toothStatus: z.enum(TOOTH_STATUS).nullable().optional(),
});

async function checkDentist(doctorId) {
  const d = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!d || !d.isDentist) throw new HttpError(400, 'Il medico indicato non è un odontoiatra');
}

async function applyToothStatus(tx, patientId, data, userId) {
  if (!data.tooth || !data.toothStatus) return;
  const surfaces = {};
  // un'otturazione registrata su superfici le segna come otturate
  if (data.surfaces && ['OTTURATO'].includes(data.toothStatus)) for (const s of data.surfaces) surfaces[s] = 'OTTURAZIONE';
  const current = await tx.dentalTooth.findUnique({ where: { patientId_tooth: { patientId, tooth: data.tooth } } });
  const merged = { ...(current?.surfaces || {}), ...surfaces };
  await tx.dentalTooth.upsert({
    where: { patientId_tooth: { patientId, tooth: data.tooth } },
    update: { status: data.toothStatus, surfaces: merged, updatedById: userId },
    create: { patientId, tooth: data.tooth, status: data.toothStatus, surfaces: merged, updatedById: userId },
  });
}

router.post('/patients/:id/treatments', ah(async (req, res) => {
  const patientId = Number(req.params.id);
  await patientOr404(patientId);
  const { toothStatus, ...data } = treatmentSchema.parse(req.body);
  await checkDentist(data.doctorId);
  const t = await prisma.$transaction(async (tx) => {
    const created = await tx.dentalTreatment.create({
      data: { ...data, patientId, surfaces: data.surfaces || null, notes: data.notes || null, createdById: req.user.id },
      include: treatmentInclude,
    });
    await applyToothStatus(tx, patientId, { ...data, toothStatus }, req.user.id);
    await enable(tx, patientId);
    return created;
  });
  res.status(201).json(t);
}));

/** Modifica/eliminazione: chi l'ha registrato o un amministratore */
async function ownTreatment(req) {
  const t = await prisma.dentalTreatment.findUnique({ where: { id: Number(req.params.tid) } });
  if (!t || t.patientId !== Number(req.params.id)) throw notFound('Trattamento');
  if (!isAdmin(req.user) && t.createdById !== req.user.id) throw new HttpError(403, 'Può modificarlo solo chi l\'ha registrato o un amministratore');
  return t;
}

router.put('/patients/:id/treatments/:tid', ah(async (req, res) => {
  const current = await ownTreatment(req);
  const { toothStatus, ...data } = treatmentSchema.parse(req.body);
  await checkDentist(data.doctorId);
  const t = await prisma.$transaction(async (tx) => {
    const updated = await tx.dentalTreatment.update({
      where: { id: current.id },
      data: { ...data, surfaces: data.surfaces || null, notes: data.notes || null },
      include: treatmentInclude,
    });
    await applyToothStatus(tx, current.patientId, { ...data, toothStatus }, req.user.id);
    return updated;
  });
  res.json(t);
}));

router.delete('/patients/:id/treatments/:tid', ah(async (req, res) => {
  const t = await ownTreatment(req);
  await prisma.dentalTreatment.delete({ where: { id: t.id } });
  res.status(204).end();
}));

module.exports = router;
