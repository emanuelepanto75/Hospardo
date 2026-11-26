/**
 * Magazzino odontoiatrico: articoli, codici a barre, lotti e scadenze, carichi, scarichi,
 * rettifiche, tracciabilità degli impianti, materiali per prestazione.
 * Consultazione e movimenti: odontoiatri, segreteria, amministratori.
 * Anagrafica articoli e materiali per prestazione: segreteria e amministratori.
 */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, HttpError, notFound } = require('../lib/errors');
const { canPlans, isAdmin } = require('../middleware/auth');
const { ALL_TEETH } = require('../lib/teeth');
const { readBarcode, normalizeCode } = require('../lib/barcode');
const { DateTime, TZ } = require('../lib/time');
const { ensureLot, move, consume, round } = require('../services/stock');

router.use((req, res, next) => (canPlans(req.user) ? next() : next(new HttpError(403, 'Magazzino riservato a odontoiatria, segreteria e amministratori'))));
const requireManage = (req) => {
  if (!(isAdmin(req.user) || req.user.role === 'SEGRETERIA')) throw new HttpError(403, 'Anagrafica del magazzino gestita da segreteria e amministratori');
};

const todayIso = () => DateTime.now().setZone(TZ).toISODate();
const dateOnly = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`) : null);
const itemList = {
  barcodes: { orderBy: { id: 'asc' } },
  lots: { where: { quantity: { not: 0 } }, orderBy: [{ expiry: { sort: 'asc', nulls: 'last' } }, { lot: 'asc' }] },
};

/** stato: ESAURITO, SOTTOSCORTA, OK; prossima scadenza */
function decorate(item) {
  const status = item.quantity <= 0 ? 'ESAURITO' : item.minStock > 0 && item.quantity <= item.minStock ? 'SOTTOSCORTA' : 'OK';
  const nextExpiry = item.lots?.find((l) => l.quantity > 0 && l.expiry)?.expiry || null;
  return { ...item, status, nextExpiry };
}

// ------------------------------------------------------------------ articoli

router.get('/items', ah(async (req, res) => {
  const { q, filter, inactive } = req.query;
  const where = {};
  if (!inactive) where.active = true;
  if (q) {
    const code = normalizeCode(q);
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } },
      { supplier: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } },
      { barcodes: { some: { code } } },
    ];
  }
  let items = (await prisma.stockItem.findMany({ where, include: itemList, orderBy: { name: 'asc' } })).map(decorate);
  if (filter === 'sottoscorta') items = items.filter((i) => i.status !== 'OK');
  res.json(items);
}));

router.get('/summary', ah(async (req, res) => {
  const items = await prisma.stockItem.findMany({ where: { active: true }, select: { quantity: true, minStock: true } });
  const limit = dateOnly(DateTime.now().setZone(TZ).plus({ days: 60 }).toISODate());
  const expiring = await prisma.stockLot.count({ where: { quantity: { gt: 0 }, expiry: { lte: limit }, item: { active: true } } });
  res.json({
    lowStock: items.filter((i) => i.quantity <= 0 || (i.minStock > 0 && i.quantity <= i.minStock)).length,
    expiring,
  });
}));

router.get('/items/:id', ah(async (req, res) => {
  const item = await prisma.stockItem.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      barcodes: { orderBy: { id: 'asc' } },
      lots: { orderBy: [{ expiry: { sort: 'asc', nulls: 'last' } }, { lot: 'asc' }] },
      serviceMaterials: { include: { service: { select: { id: true, name: true } } } },
      movements: {
        orderBy: { createdAt: 'desc' }, take: 100,
        include: { lot: { select: { lot: true, expiry: true } }, patient: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!item) throw notFound('Articolo');
  res.json(decorate(item));
}));

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Nome obbligatorio').max(200),
  code: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  supplier: z.string().trim().max(120).nullable().optional(),
  unit: z.string().trim().min(1).max(20).default('pz'),
  purchasePriceCents: z.number().int().min(0).nullable().optional(),
  minStock: z.number().min(0).default(0),
  trackLots: z.boolean().default(false),
  isImplant: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullable().optional(),
  /// codice a barre letto alla creazione
  barcode: z.string().trim().max(120).optional(),
  packQty: z.number().positive().default(1),
});

const clean = ({ barcode, packQty, ...d }) => ({
  ...d, code: d.code || null, category: d.category || null, supplier: d.supplier || null, notes: d.notes || null,
  // un impianto si traccia sempre per lotto
  trackLots: d.trackLots || d.isImplant,
});

async function addBarcode(tx, itemId, raw, packQty = 1) {
  const code = readBarcode(raw).code;
  if (!code) return null;
  const other = await tx.stockBarcode.findUnique({ where: { code }, include: { item: true } });
  if (other && other.itemId !== itemId) throw new HttpError(409, `Codice a barre già assegnato a "${other.item.name}"`);
  if (other) return other;
  return tx.stockBarcode.create({ data: { itemId, code, packQty } });
}

router.post('/items', ah(async (req, res) => {
  requireManage(req);
  const data = itemSchema.parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.stockItem.create({ data: clean(data) });
    if (data.barcode) await addBarcode(tx, created.id, data.barcode, data.packQty);
    return created;
  }).catch((e) => { if (e.code === 'P2002') throw new HttpError(409, 'Codice interno già usato'); throw e; });
  res.status(201).json(item);
}));

router.put('/items/:id', ah(async (req, res) => {
  requireManage(req);
  const data = itemSchema.parse(req.body);
  const item = await prisma.stockItem.update({ where: { id: Number(req.params.id) }, data: clean(data) })
    .catch((e) => { if (e.code === 'P2002') throw new HttpError(409, 'Codice interno già usato'); if (e.code === 'P2025') throw notFound('Articolo'); throw e; });
  res.json(item);
}));

router.delete('/items/:id', ah(async (req, res) => {
  requireManage(req);
  const id = Number(req.params.id);
  const moves = await prisma.stockMovement.count({ where: { itemId: id } });
  if (moves) {
    await prisma.stockItem.update({ where: { id }, data: { active: false } });
    return res.json({ archived: true });
  }
  await prisma.stockItem.delete({ where: { id } });
  res.status(204).end();
}));

router.post('/items/:id/barcodes', ah(async (req, res) => {
  requireManage(req);
  const { code, packQty } = z.object({ code: z.string().trim().min(1), packQty: z.number().positive().default(1) }).parse(req.body);
  res.status(201).json(await addBarcode(prisma, Number(req.params.id), code, packQty));
}));

router.delete('/barcodes/:id', ah(async (req, res) => {
  requireManage(req);
  await prisma.stockBarcode.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

// ------------------------------------------------------------------ lettura codice

/** Codice letto dal lettore: articolo corrispondente, lotto e scadenza (se GS1) */
router.get('/scan', ah(async (req, res) => {
  const raw = String(req.query.code || '');
  if (!raw.trim()) throw new HttpError(400, 'Codice vuoto');
  const read = readBarcode(raw);
  const bc = await prisma.stockBarcode.findUnique({ where: { code: read.code } });
  let item = null;
  if (bc) item = await prisma.stockItem.findUnique({ where: { id: bc.itemId }, include: itemList });
  else item = await prisma.stockItem.findFirst({ where: { code: { equals: raw.trim(), mode: 'insensitive' } }, include: itemList });
  const lot = item && read.lot ? await prisma.stockLot.findUnique({ where: { itemId_lot: { itemId: item.id, lot: read.lot } } }) : null;
  res.json({ ...read, packQty: bc?.packQty || 1, item: item ? decorate(item) : null, existingLot: lot });
}));

// ------------------------------------------------------------------ movimenti

const lotFields = {
  lot: z.string().trim().max(60).nullable().optional(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
};

/** Carico (arrivo merce): una riga per articolo/lotto */
router.post('/load', ah(async (req, res) => {
  const data = z.object({
    supplier: z.string().trim().max(120).nullable().optional(),
    document: z.string().trim().max(80).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    rows: z.array(z.object({
      itemId: z.number().int(),
      quantity: z.number().positive('Quantità non valida'),
      unitCostCents: z.number().int().min(0).nullable().optional(),
      ...lotFields,
    })).min(1, 'Nessun articolo da caricare'),
  }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const r of data.rows) {
      const item = await tx.stockItem.findUnique({ where: { id: r.itemId } });
      if (!item) throw new HttpError(400, 'Articolo non trovato');
      if (item.trackLots && !r.lot) throw new HttpError(400, `"${item.name}": indica il lotto (articolo gestito a lotti)`);
      const lot = r.lot ? await ensureLot(tx, item.id, r.lot, dateOnly(r.expiry)) : null;
      out.push(await move(tx, {
        itemId: item.id, lotId: lot?.id || null, type: 'CARICO', quantity: r.quantity, unitCostCents: r.unitCostCents ?? null,
        supplier: data.supplier || item.supplier || null, document: data.document || null, note: data.note || null, createdById: req.user.id,
      }));
      if (r.unitCostCents != null) await tx.stockItem.update({ where: { id: item.id }, data: { purchasePriceCents: r.unitCostCents } });
    }
    return out;
  });
  res.status(201).json({ movements: result.length });
}));

/** Scarico manuale: uso in studio, scaduto, rotto; per gli impianti paziente e dente obbligatori */
router.post('/unload', ah(async (req, res) => {
  const data = z.object({
    patientId: z.number().int().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    rows: z.array(z.object({
      itemId: z.number().int(),
      quantity: z.number().positive('Quantità non valida'),
      lotId: z.number().int().nullable().optional(),
      lot: z.string().trim().max(60).nullable().optional(),
      tooth: z.coerce.number().int().refine((n) => ALL_TEETH.has(n), 'Dente non valido (numerazione FDI)').nullable().optional(),
      serial: z.string().trim().max(60).nullable().optional(),
    })).min(1, 'Nessun articolo da scaricare'),
  }).parse(req.body);
  if (data.patientId && !await prisma.patient.findUnique({ where: { id: data.patientId } })) throw notFound('Paziente');
  const result = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const r of data.rows) {
      const item = await tx.stockItem.findUnique({ where: { id: r.itemId } });
      if (!item) throw new HttpError(400, 'Articolo non trovato');
      if (item.isImplant && !data.patientId) throw new HttpError(400, `"${item.name}" è un impianto: indica il paziente`);
      let lotId = r.lotId || null;
      if (!lotId && r.lot) {
        const lot = await tx.stockLot.findUnique({ where: { itemId_lot: { itemId: item.id, lot: r.lot } } });
        if (!lot) throw new HttpError(400, `"${item.name}": il lotto ${r.lot} non risulta caricato`);
        lotId = lot.id;
      }
      if (item.isImplant && !lotId) throw new HttpError(400, `"${item.name}": per la tracciabilità indica il lotto dell'impianto`);
      out.push(...await consume(tx, {
        itemId: item.id, quantity: r.quantity, lotId, patientId: data.patientId || null, tooth: r.tooth ?? null,
        serial: r.serial || null, note: data.note || null, createdById: req.user.id,
      }));
    }
    return out;
  });
  res.status(201).json({ movements: result.length });
}));

/** Rettifica inventariale: imposta la quantità reale (dell'articolo o del lotto) */
router.post('/items/:id/adjust', ah(async (req, res) => {
  const data = z.object({
    lotId: z.number().int().nullable().optional(),
    quantity: z.number().min(0),
    note: z.string().trim().max(500).nullable().optional(),
  }).parse(req.body);
  const item = await prisma.stockItem.findUnique({ where: { id: Number(req.params.id) }, include: { lots: true } });
  if (!item) throw notFound('Articolo');
  let current = item.quantity;
  if (data.lotId) {
    const lot = item.lots.find((l) => l.id === data.lotId);
    if (!lot) throw notFound('Lotto');
    current = lot.quantity;
  }
  const diff = round(data.quantity - current);
  if (!diff) return res.json({ unchanged: true });
  await prisma.$transaction((tx) => move(tx, {
    itemId: item.id, lotId: data.lotId || null, type: 'RETTIFICA', quantity: diff, note: data.note || 'Rettifica inventario', createdById: req.user.id,
  }));
  res.status(201).json({ diff });
}));

/** Annulla un movimento manuale (errore di inserimento) */
router.delete('/movements/:id', ah(async (req, res) => {
  const m = await prisma.stockMovement.findUnique({ where: { id: Number(req.params.id) } });
  if (!m) throw notFound('Movimento');
  if (m.auto) throw new HttpError(409, 'Scarico automatico: si annulla modificando o eliminando il trattamento nel diario');
  if (!isAdmin(req.user) && m.createdById !== req.user.id) throw new HttpError(403, 'Può annullarlo solo chi l\'ha registrato o un amministratore');
  await prisma.$transaction(async (tx) => {
    await tx.stockItem.update({ where: { id: m.itemId }, data: { quantity: { decrement: m.quantity } } });
    if (m.lotId) await tx.stockLot.update({ where: { id: m.lotId }, data: { quantity: { decrement: m.quantity } } });
    await tx.stockMovement.delete({ where: { id: m.id } });
  });
  res.status(204).end();
}));

const movementInclude = {
  item: { select: { id: true, name: true, unit: true, isImplant: true } },
  lot: { select: { lot: true, expiry: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
  treatment: { select: { id: true, date: true, description: true } },
};

router.get('/movements', ah(async (req, res) => {
  const q = z.object({
    type: z.enum(['CARICO', 'SCARICO', 'RETTIFICA']).optional(),
    itemId: z.coerce.number().int().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(req.query);
  const createdAt = {};
  if (q.from) createdAt.gte = DateTime.fromISO(q.from, { zone: TZ }).startOf('day').toJSDate();
  if (q.to) createdAt.lt = DateTime.fromISO(q.to, { zone: TZ }).plus({ days: 1 }).startOf('day').toJSDate();
  const list = await prisma.stockMovement.findMany({
    where: { type: q.type, itemId: q.itemId, ...(q.from || q.to ? { createdAt } : {}) },
    include: movementInclude, orderBy: { createdAt: 'desc' }, take: 500,
  });
  res.json(list);
}));

/** Lotti in scadenza (o scaduti) con giacenza */
router.get('/expiring', ah(async (req, res) => {
  const days = z.coerce.number().int().min(0).max(730).default(90).parse(req.query.days ?? 90);
  const limit = dateOnly(DateTime.now().setZone(TZ).plus({ days }).toISODate());
  const lots = await prisma.stockLot.findMany({
    where: { quantity: { gt: 0 }, expiry: { lte: limit }, item: { active: true } },
    include: { item: { select: { id: true, name: true, unit: true, supplier: true } } },
    orderBy: { expiry: 'asc' },
  });
  res.json({ today: todayIso(), lots });
}));

/** Tracciabilità: impianti (e dispositivi) applicati ai pazienti; ricerca per lotto, paziente, articolo */
router.get('/implants', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = { type: 'SCARICO', patientId: { not: null }, item: { isImplant: true } };
  if (req.query.patientId) where.patientId = Number(req.query.patientId);
  if (q) {
    where.OR = [
      { lot: { lot: { contains: q, mode: 'insensitive' } } },
      { serial: { contains: q, mode: 'insensitive' } },
      { item: { name: { contains: q, mode: 'insensitive' } } },
      { patient: { lastName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const list = await prisma.stockMovement.findMany({ where, include: movementInclude, orderBy: { createdAt: 'desc' }, take: 500 });
  res.json(list);
}));

// ------------------------------------------------------------------ materiali per prestazione

router.get('/materials', ah(async (req, res) => {
  const rows = await prisma.serviceMaterial.findMany({
    include: { item: { select: { id: true, name: true, unit: true, active: true } }, service: { select: { id: true, name: true } } },
    orderBy: [{ serviceId: 'asc' }],
  });
  res.json(rows);
}));

router.put('/materials/:serviceId', ah(async (req, res) => {
  requireManage(req);
  const serviceId = Number(req.params.serviceId);
  if (!await prisma.service.findUnique({ where: { id: serviceId } })) throw notFound('Prestazione');
  const { items } = z.object({ items: z.array(z.object({ itemId: z.number().int(), quantity: z.number().positive() })).max(50) }).parse(req.body);
  await prisma.$transaction([
    prisma.serviceMaterial.deleteMany({ where: { serviceId } }),
    prisma.serviceMaterial.createMany({ data: items.map((i) => ({ serviceId, itemId: i.itemId, quantity: i.quantity })), skipDuplicates: true }),
  ]);
  res.json({ ok: true });
}));

module.exports = router;
