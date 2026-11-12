const jwt = require('jsonwebtoken');
const config = require('../lib/config');
const prisma = require('../lib/prisma');
const { HttpError } = require('../lib/errors');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Accesso richiesto');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sessione scaduta, effettua di nuovo l\'accesso');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new HttpError(401, 'Utente non attivo');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Permessi insufficienti'));
  next();
};

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

module.exports = { requireAuth, requireRole, signToken };
