/**
 * Piani di cura odontoiatrici e preventivi.
 * Accesso: odontoiatri, amministratori e segreteria. Segnare una voce come eseguita
 * (scrive nel diario clinico) è riservato a odontoiatri e amministratori.
 */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { canPlans, canDental, isAdmin } = require('../middleware/auth');
const { ALL_TEETH, TOOTH_STATUS } = require('../lib/teeth');
const { DateTime, TZ } = require('../lib/time');
const { buildPlanPdf } = require('../services/planPdf');

router.use((req, res, next) => (canPlans(req.user) ? next() : next(new HttpError(403, 'Piani di cura riservati a odontoiatri, segreteria e amministratori'))));

const requireDental = (req) => {
  if (!canDental(req.user)) throw new HttpError(403, 'Operazione riservata agli odontoiatri');
};

const doctorSelect = { select: { id: true, title: true, firstName: true, lastName: true, color: true, isDentist: true } };
const planInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, fiscalCode: true, phone: true, email: true, address: true, birthDate: true } },
  doctor: doctorSelect,
  items: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: {
      service: { select: { id: true, name: true } },
      appointment: { select: { id: true, start: true, end: true, status: true, doctorId: true } },
      treatment: { select: { id: true, date: true } },
    },
  },
};

/** totali in centesimi */
function totals(plan) {
  const subtotal = plan.items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const done = plan.items.filter((i) => i.status === 'ESEGUITO').reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  return { subtotalCents: subtotal, totalCents: Math.max(0, subtotal - plan.discountCents), doneCents: done };
}
const withTotals = (plan) => ({ ...plan, code: `${plan.year}/${plan.number}`, ...totals(plan) });

async function loadPlan(id) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: Number(id) }, include: planInclude });
  if (!plan) throw notFound('Piano di cura');
  return plan;
}

/** Il medico odontoiatra vede tutti i piani (i pazienti sono in comune) */
router.get('/', ah(async (req, res) => {
  const q = z.object({
    status: z.enum(['PROPOSTO', 'ACCETTATO', 'COMPLETATO', 'RIFIUTATO']).optional(),
    patientId: z.coerce.number().int().optional(),
    doctorId: z.coerce.number().int().optional(),
  }).parse(req.query);
  const plans = await prisma.treatmentPlan.findMany({
    where: { status: q.status, patientId: q.patientId, doctorId: q.doctorId },
    include: planInclude,
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  });
  res.json(plans.map(withTotals));
}));

/** Prestazioni proponibili con il prezzo del medico (o quello standard) */
router.get('/catalog', ah(async (req, res) => {
  const doctorId = z.coerce.number().int().parse(req.query.doctorId);
  const links = await prisma.doctorService.findMany({ where: { doctorId, service: { active: true } }, include: { service: true } });
  let list = links.map((l) => ({
    id: l.serviceId, name: l.service.name, category: l.service.category,
    priceCents: l.priceCents ?? l.service.priceCents, durationMin: l.durationMin ?? l.service.durationMin,
  }));
  if (!list.length) {
    const services = await prisma.service.findMany({ where: { active: true, category: { equals: 'Odontoiatria', mode: 'insensitive' } } });
    list = services.map((s) => ({ id: s.id, name: s.name, category: s.category, priceCents: s.priceCents, durationMin: s.durationMin }));
  }
  res.json(list.sort((a, b) => a.name.localeCompare(b.name)));
}));

router.get('/:id', ah(async (req, res) => res.json(withTotals(await loadPlan(req.params.id)))));

const itemSchema = z.object({
  id: z.number().int().optional(),
  serviceId: z.number().int().nullable().optional(),
  description: z.string().trim().min(1, 'Descrizione della voce obbligatoria').max(300),
  tooth: z.coerce.number().int().refine((n) => ALL_TEETH.has(n), 'Dente non valido (numerazione FDI)').nullable().optional(),
  surfaces: z.string().toUpperCase().regex(/^[OMDVL]*$/, 'Superfici non valide').max(5).nullable().optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  unitPriceCents: z.number().int().min(0).max(10_000_000),
});
const planSchema = z.object({
  patientId: z.number().int(),
  doctorId: z.number().int(),
  title: z.string().trim().min(1, 'Titolo obbligatorio').max(150),
  discountCents: z.number().int().min(0).default(0),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(itemSchema).min(1, 'Inserisci almeno una voce').max(100),
});

async function checkDentist(doctorId) {
  const d = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!d || !d.isDentist) throw new HttpError(400, 'Il medico indicato non è un odontoiatra');
}

const itemData = (i, position) => ({
  serviceId: i.serviceId ?? null, description: i.description, tooth: i.tooth ?? null,
  surfaces: i.surfaces || null, quantity: i.quantity, unitPriceCents: i.unitPriceCents, position,
});

router.post('/', ah(async (req, res) => {
  const data = planSchema.parse(req.body);
  await checkDentist(data.doctorId);
  if (!await prisma.patient.findUnique({ where: { id: data.patientId } })) throw notFound('Paziente');
  const year = DateTime.now().setZone(TZ).year;
  // numero progressivo dell'anno; si riprova in caso di salvataggi contemporanei
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const plan = await prisma.$transaction(async (tx) => {
        const last = await tx.treatmentPlan.aggregate({ where: { year }, _max: { number: true } });
        const created = await tx.treatmentPlan.create({
          data: {
            year, number: (last._max.number || 0) + 1, patientId: data.patientId, doctorId: data.doctorId, title: data.title,
            discountCents: data.discountCents, validUntil: data.validUntil || null, notes: data.notes || null, createdById: req.user.id,
            items: { create: data.items.map((i, idx) => itemData(i, idx)) },
          },
          include: planInclude,
        });
        await tx.patient.update({ where: { id: data.patientId }, data: { dentalEnabled: true } });
        return created;
      });
      return res.status(201).json(withTotals(plan));
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
  }
  throw new HttpError(409, 'Riprova: numerazione del preventivo occupata');
}));

/** Modifica: le voci già prenotate o eseguite non si possono togliere */
router.put('/:id', ah(async (req, res) => {
  const current = await loadPlan(req.params.id);
  const data = planSchema.omit({ patientId: true }).parse(req.body);
  await checkDentist(data.doctorId);
  const keep = new Set(data.items.filter((i) => i.id).map((i) => i.id));
  const removed = current.items.filter((i) => !keep.has(i.id));
  const locked = removed.find((i) => i.status !== 'DA_FARE');
  if (locked) throw new HttpError(409, `La voce "${locked.description}" è già prenotata o eseguita: non si può togliere`);
  const own = new Set(current.items.map((i) => i.id));
  if (data.items.some((i) => i.id && !own.has(i.id))) throw new HttpError(400, 'Voce non appartenente al piano');

  const plan = await prisma.$transaction(async (tx) => {
    await tx.treatmentPlanItem.deleteMany({ where: { id: { in: removed.map((i) => i.id) } } });
    for (const [idx, i] of data.items.entries()) {
      if (i.id) await tx.treatmentPlanItem.update({ where: { id: i.id }, data: itemData(i, idx) });
      else await tx.treatmentPlanItem.create({ data: { ...itemData(i, idx), planId: current.id } });
    }
    return tx.treatmentPlan.update({
      where: { id: current.id },
      data: { doctorId: data.doctorId, title: data.title, discountCents: data.discountCents, validUntil: data.validUntil || null, notes: data.notes || null },
      include: planInclude,
    });
  });
  res.json(withTotals(plan));
}));

router.put('/:id/status', ah(async (req, res) => {
  const current = await loadPlan(req.params.id);
  const { status } = z.object({ status: z.enum(['PROPOSTO', 'ACCETTATO', 'COMPLETATO', 'RIFIUTATO']) }).parse(req.body);
  const plan = await prisma.treatmentPlan.update({
    where: { id: current.id },
    data: { status, acceptedAt: status === 'ACCETTATO' ? (current.acceptedAt || new Date()) : status === 'PROPOSTO' || status === 'RIFIUTATO' ? null : current.acceptedAt },
    include: planInclude,
  });
  res.json(withTotals(plan));
}));

router.delete('/:id', ah(async (req, res) => {
  const plan = await loadPlan(req.params.id);
  if (!isAdmin(req.user) && plan.items.some((i) => i.status !== 'DA_FARE')) {
    throw new HttpError(409, 'Il piano ha sedute prenotate o eseguite: può eliminarlo solo un amministratore');
  }
  await prisma.treatmentPlan.delete({ where: { id: plan.id } });
  res.status(204).end();
}));

async function loadItem(req) {
  const plan = await loadPlan(req.params.id);
  const item = plan.items.find((i) => i.id === Number(req.params.itemId));
  if (!item) throw notFound('Voce del piano');
  return { plan, item };
}

/** Collega alla voce l'appuntamento appena prenotato */
router.post('/:id/items/:itemId/book', ah(async (req, res) => {
  const { plan, item } = await loadItem(req);
  const { appointmentId } = z.object({ appointmentId: z.number().int() }).parse(req.body);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientId !== plan.patientId) throw new HttpError(400, 'Appuntamento non valido per questo paziente');
  if (item.status === 'ESEGUITO') throw new HttpError(409, 'Voce già eseguita');
  await prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { appointmentId, status: 'PROGRAMMATO' } });
  res.json(withTotals(await loadPlan(plan.id)));
}));

router.post('/:id/items/:itemId/unbook', ah(async (req, res) => {
  const { plan, item } = await loadItem(req);
  if (item.status === 'ESEGUITO') throw new HttpError(409, 'Voce già eseguita');
  await prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { appointmentId: null, status: 'DA_FARE' } });
  res.json(withTotals(await loadPlan(plan.id)));
}));

/** Voce eseguita: la registra nel diario dei trattamenti e aggiorna (se richiesto) lo stato del dente */
router.post('/:id/items/:itemId/done', ah(async (req, res) => {
  requireDental(req);
  const { plan, item } = await loadItem(req);
  if (item.status === 'ESEGUITO') throw new HttpError(409, 'Voce già eseguita');
  const body = z.object({
    date: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    toothStatus: z.enum(TOOTH_STATUS).nullable().optional(),
  }).parse(req.body || {});
  const appt = item.appointment && !['ANNULLATO', 'NON_PRESENTATO'].includes(item.appointment.status) ? item.appointment : null;
  // chi l'ha eseguita: il dentista dell'appuntamento, altrimenti il medico che l'ha registrata, altrimenti quello del piano
  let doctorId = plan.doctorId;
  if (appt) {
    const d = await prisma.doctor.findUnique({ where: { id: appt.doctorId } });
    if (d?.isDentist) doctorId = d.id;
  } else if (req.user.role === 'MEDICO' && req.user.doctorId) doctorId = req.user.doctorId;
  // giorno locale (Europe/Rome) dell'appuntamento, o di oggi
  const date = body.date || new Date(DateTime.fromJSDate(appt ? appt.start : new Date()).setZone(TZ).toISODate());

  await prisma.$transaction(async (tx) => {
    const t = await tx.dentalTreatment.create({
      data: {
        patientId: plan.patientId, date, tooth: item.tooth, surfaces: item.surfaces, serviceId: item.serviceId,
        doctorId, appointmentId: appt?.id ?? null, description: item.description, notes: body.notes || null, createdById: req.user.id,
      },
    });
    await tx.treatmentPlanItem.update({ where: { id: item.id }, data: { status: 'ESEGUITO', treatmentId: t.id, doneAt: new Date() } });
    if (item.tooth && body.toothStatus) {
      const where = { patientId_tooth: { patientId: plan.patientId, tooth: item.tooth } };
      const cur = await tx.dentalTooth.findUnique({ where });
      const surfaces = { ...(cur?.surfaces || {}) };
      if (body.toothStatus === 'OTTURATO' && item.surfaces) for (const s of item.surfaces) surfaces[s] = 'OTTURAZIONE';
      await tx.dentalTooth.upsert({
        where,
        update: { status: body.toothStatus, surfaces, updatedById: req.user.id },
        create: { patientId: plan.patientId, tooth: item.tooth, status: body.toothStatus, surfaces, updatedById: req.user.id },
      });
    }
    // tutte le voci eseguite: piano completato
    const open = await tx.treatmentPlanItem.count({ where: { planId: plan.id, status: { not: 'ESEGUITO' } } });
    if (!open && plan.status !== 'RIFIUTATO') await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETATO', acceptedAt: plan.acceptedAt || new Date() } });
    else if (plan.status === 'PROPOSTO') await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: 'ACCETTATO', acceptedAt: new Date() } });
  });
  res.json(withTotals(await loadPlan(plan.id)));
}));

/** Annulla "eseguito": toglie anche la registrazione dal diario */
router.post('/:id/items/:itemId/undo', ah(async (req, res) => {
  requireDental(req);
  const { plan, item } = await loadItem(req);
  if (item.status !== 'ESEGUITO') throw new HttpError(409, 'La voce non risulta eseguita');
  await prisma.$transaction(async (tx) => {
    await tx.treatmentPlanItem.update({
      where: { id: item.id },
      data: { status: item.appointmentId ? 'PROGRAMMATO' : 'DA_FARE', treatmentId: null, doneAt: null },
    });
    if (item.treatmentId) await tx.dentalTreatment.deleteMany({ where: { id: item.treatmentId } });
    if (plan.status === 'COMPLETATO') await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: 'ACCETTATO' } });
  });
  res.json(withTotals(await loadPlan(plan.id)));
}));

router.get('/:id/pdf', ah(async (req, res) => {
  const plan = withTotals(await loadPlan(req.params.id));
  const pdf = await buildPlanPdf(plan);
  const slug = `${plan.patient.lastName}-${plan.patient.firstName}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preventivo-${plan.year}-${plan.number}-${slug}.pdf"`);
  res.send(pdf);
}));

module.exports = router;
