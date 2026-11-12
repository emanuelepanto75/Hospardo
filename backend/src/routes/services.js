const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');

const serviceSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  durationMin: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).nullable().optional(),
  color: z.string().nullable().optional(),
  bookableOnline: z.boolean().optional(),
  active: z.boolean().optional(),
  doctorIds: z.array(z.number().int()).optional(),
});

const withDoctors = { doctors: { select: { doctorId: true } } };
const out = (s) => ({ ...s, doctors: undefined, doctorIds: s.doctors.map((d) => d.doctorId) });

router.get('/', ah(async (req, res) => {
  const services = await prisma.service.findMany({ orderBy: { name: 'asc' }, include: withDoctors });
  res.json(services.map(out));
}));

router.post('/', requireRole('ADMIN'), ah(async (req, res) => {
  const { doctorIds = [], ...data } = serviceSchema.parse(req.body);
  const service = await prisma.service.create({
    data: { ...data, doctors: { create: doctorIds.map((doctorId) => ({ doctorId })) } },
    include: withDoctors,
  });
  res.status(201).json(out(service));
}));

router.put('/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const { doctorIds, ...data } = serviceSchema.partial().parse(req.body);
  const service = await prisma.$transaction(async (tx) => {
    if (doctorIds) {
      await tx.doctorService.deleteMany({ where: { serviceId: id } });
      await tx.doctorService.createMany({ data: doctorIds.map((doctorId) => ({ doctorId, serviceId: id })) });
    }
    return tx.service.update({ where: { id }, data, include: withDoctors });
  });
  res.json(out(service));
}));

module.exports = router;
