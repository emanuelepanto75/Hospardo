const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { publicUser } = require('./auth');

router.use(requireRole('ADMIN'));

const userSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'SEGRETERIA', 'MEDICO']),
  active: z.boolean().optional(),
  doctorId: z.number().int().nullable().optional(),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').optional(),
});

router.get('/', ah(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  res.json(users.map((u) => ({ ...publicUser(u), active: u.active })));
}));

router.post('/', ah(async (req, res) => {
  const data = userSchema.parse(req.body);
  if (!data.password) throw new HttpError(400, 'Password obbligatoria');
  const { password, ...rest } = data;
  const user = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json(publicUser(user));
}));

router.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { password, ...rest } = userSchema.partial().parse(req.body);
  if (id === req.user.id && (rest.active === false || (rest.role && rest.role !== 'ADMIN'))) {
    throw new HttpError(400, 'Non puoi disattivare o declassare il tuo stesso utente');
  }
  const data = { ...rest };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({ where: { id }, data });
  res.json({ ...publicUser(user), active: user.active });
}));

module.exports = router;
