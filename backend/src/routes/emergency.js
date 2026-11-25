/**
 * Copia di emergenza per i PC dello studio.
 *  - publicRouter: GET /snapshot con la chiave della postazione (nessun login). Serve SOLO la copia.
 *  - adminRouter:  gestione delle postazioni e anteprima (amministratori).
 */
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { rateLimit } = require('../lib/rateLimit');
const { buildSnapshotHtml } = require('../services/emergencySnapshot');

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function sendSnapshot(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

// ---- download con la chiave della postazione
const publicRouter = express.Router();
publicRouter.get('/snapshot', rateLimit({ max: 30, windowMs: 15 * 60 * 1000, message: 'Troppe richieste dalla postazione' }), ah(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-hospardo-token'] || '').trim();
  if (!token) throw new HttpError(401, 'Chiave della postazione mancante');
  const device = await prisma.emergencyDevice.findUnique({ where: { tokenHash: hash(token) } });
  if (!device || device.revokedAt) throw new HttpError(401, 'Chiave della postazione non valida o revocata');
  await prisma.emergencyDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date(), lastIp: req.ip } });
  sendSnapshot(res, await buildSnapshotHtml());
}));

// ---- gestione postazioni (amministratori)
const adminRouter = express.Router();
adminRouter.use(requireRole('ADMIN'));

const out = (d) => ({
  id: d.id, name: d.name, tokenPrefix: d.tokenPrefix, createdAt: d.createdAt,
  lastUsedAt: d.lastUsedAt, lastIp: d.lastIp, revokedAt: d.revokedAt,
});

adminRouter.get('/devices', ah(async (req, res) => {
  const list = await prisma.emergencyDevice.findMany({ orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }] });
  res.json(list.map(out));
}));

/** Crea una postazione: la chiave in chiaro viene restituita una sola volta */
adminRouter.post('/devices', ah(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, 'Nome della postazione obbligatorio').max(60) }).parse(req.body);
  const token = `hosp_${crypto.randomBytes(24).toString('base64url')}`;
  const device = await prisma.emergencyDevice.create({
    data: { name, tokenHash: hash(token), tokenPrefix: token.slice(0, 9), createdById: req.user.id },
  });
  res.status(201).json({ ...out(device), token });
}));

adminRouter.post('/devices/:id/revoke', ah(async (req, res) => {
  const d = await prisma.emergencyDevice.update({ where: { id: Number(req.params.id) }, data: { revokedAt: new Date() } });
  res.json(out(d));
}));

/** Anteprima della copia, come la vedranno i PC dello studio */
adminRouter.get('/preview', ah(async (req, res) => sendSnapshot(res, await buildSnapshotHtml())));

module.exports = { publicRouter, adminRouter };
