const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { publicUser } = require('./auth');

router.use(requireRole('ADMIN'));

const ROLES = ['SUPERADMIN', 'ADMIN', 'SEGRETERIA', 'MEDICO'];
const STAFF_ROLES = ['SEGRETERIA', 'MEDICO'];

const userSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  name: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean().optional(),
  doctorId: z.number().int().nullable().optional(),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').optional(),
});

/**
 * L'amministratore principale gestisce tutti; l'amministratore di secondo livello
 * solo segreteria e medici (e il proprio nome/password).
 */
function assertCanManage(actor, target, newRole) {
  if (actor.role === 'SUPERADMIN') return;
  const self = target && target.id === actor.id;
  if (target && !STAFF_ROLES.includes(target.role) && !self) {
    throw new HttpError(403, 'Solo l\'amministratore principale può modificare gli amministratori');
  }
  if (newRole && !STAFF_ROLES.includes(newRole) && !(self && newRole === target.role)) {
    throw new HttpError(403, 'Solo l\'amministratore principale può creare o nominare amministratori');
  }
}

router.get('/', ah(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  res.json(users.map((u) => ({
    ...publicUser(u),
    active: u.active,
    canEdit: req.user.role === 'SUPERADMIN' || STAFF_ROLES.includes(u.role) || u.id === req.user.id,
  })));
}));

router.post('/', ah(async (req, res) => {
  const data = userSchema.parse(req.body);
  assertCanManage(req.user, null, data.role);
  if (!data.password) throw new HttpError(400, 'Password obbligatoria');
  const { password, ...rest } = data;
  const user = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json(publicUser(user));
}));

router.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { password, ...rest } = userSchema.partial().parse(req.body);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'Utente non trovato');
  assertCanManage(req.user, target, rest.role);
  if (id === req.user.id && (rest.active === false || (rest.role && rest.role !== target.role))) {
    throw new HttpError(400, 'Non puoi disattivare o cambiare ruolo al tuo stesso utente');
  }
  // deve sempre restare almeno un amministratore principale attivo
  if (target.role === 'SUPERADMIN' && ((rest.role && rest.role !== 'SUPERADMIN') || rest.active === false)) {
    const others = await prisma.user.count({ where: { role: 'SUPERADMIN', active: true, id: { not: id } } });
    if (!others) throw new HttpError(400, 'Deve restare almeno un amministratore principale attivo');
  }
  const data = { ...rest };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({ where: { id }, data });
  res.json({ ...publicUser(user), active: user.active });
}));

module.exports = router;
