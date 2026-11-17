const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/errors');
const { requireAuth, signToken } = require('../middleware/auth');
const { rateLimit } = require('../lib/rateLimit');

// Protezione dai tentativi ripetuti di indovinare la password
const loginLimiter = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  onlyFailures: true,
  message: 'Troppi tentativi di accesso. Riprova tra 15 minuti.',
});
const loginIpLimiter = rateLimit({ max: 50, windowMs: 15 * 60 * 1000, keyFn: (req) => `ip:${req.ip}`, message: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' });

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, doctorId: u.doctorId });

router.post('/login', loginIpLimiter, loginLimiter, ah(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Email o password errati');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

router.post('/change-password', requireAuth, loginLimiter, ah(async (req, res) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'La nuova password deve avere almeno 8 caratteri'),
  }).parse(req.body);
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) throw new HttpError(400, 'Password attuale errata');
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.json({ ok: true });
}));

module.exports = { router, publicUser };
