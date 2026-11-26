/**
 * Movimenti di magazzino: aggiornano insieme la giacenza dell'articolo e quella del lotto.
 * Gli scarichi senza lotto indicato prendono prima i lotti che scadono prima (FEFO).
 */
const { HttpError } = require('../lib/errors');

const round = (n) => Math.round(n * 1000) / 1000;

async function ensureLot(tx, itemId, lot, expiry) {
  const code = String(lot).trim();
  const existing = await tx.stockLot.findUnique({ where: { itemId_lot: { itemId, lot: code } } });
  if (existing) {
    if (expiry && !existing.expiry) return tx.stockLot.update({ where: { id: existing.id }, data: { expiry } });
    return existing;
  }
  return tx.stockLot.create({ data: { itemId, lot: code, expiry: expiry || null } });
}

/** Registra un movimento (quantity con segno) e aggiorna le giacenze */
async function move(tx, data) {
  const q = round(data.quantity);
  const m = await tx.stockMovement.create({ data: { ...data, quantity: q } });
  await tx.stockItem.update({ where: { id: data.itemId }, data: { quantity: { increment: q } } });
  if (data.lotId) await tx.stockLot.update({ where: { id: data.lotId }, data: { quantity: { increment: q } } });
  return m;
}

/** Scarico di una quantità positiva, ripartita sui lotti se l'articolo è gestito a lotti */
async function consume(tx, { itemId, quantity, lotId, ...rest }) {
  const item = await tx.stockItem.findUnique({ where: { id: itemId } });
  if (!item) throw new HttpError(400, 'Articolo non trovato');
  if (lotId || !item.trackLots) return [await move(tx, { itemId, lotId: lotId || null, quantity: -quantity, type: 'SCARICO', ...rest })];
  const lots = await tx.stockLot.findMany({
    where: { itemId, quantity: { gt: 0 } },
    orderBy: [{ expiry: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  const out = [];
  let left = round(quantity);
  for (const lot of lots) {
    if (left <= 0) break;
    const take = round(Math.min(left, lot.quantity));
    out.push(await move(tx, { itemId, lotId: lot.id, quantity: -take, type: 'SCARICO', ...rest }));
    left = round(left - take);
  }
  // giacenza insufficiente: il resto si scarica senza lotto (la giacenza va in negativo e si vede)
  if (left > 0) out.push(await move(tx, { itemId, lotId: null, quantity: -left, type: 'SCARICO', ...rest }));
  return out;
}

/**
 * Materiali previsti dalla prestazione del trattamento: non si scaricano subito,
 * vanno nella lista "da confermare" del medico (di solito a fine giornata).
 */
async function applyTreatmentMaterials(tx, treatment) {
  if (!treatment.serviceId) return [];
  const materials = await tx.serviceMaterial.findMany({ where: { serviceId: treatment.serviceId, item: { active: true } } });
  if (!materials.length) return [];
  await tx.stockUnloadDraft.createMany({
    data: materials.map((m) => ({
      itemId: m.itemId, quantity: m.quantity, doctorId: treatment.doctorId, patientId: treatment.patientId,
      tooth: treatment.tooth, treatmentId: treatment.id, date: treatment.date,
    })),
  });
  return materials;
}

/** Annulla gli scarichi automatici di un trattamento (modifica o eliminazione): bozze e scarichi già confermati */
async function reverseTreatmentMaterials(tx, treatmentId) {
  await tx.stockUnloadDraft.deleteMany({ where: { treatmentId } });
  const moves = await tx.stockMovement.findMany({ where: { treatmentId, auto: true } });
  for (const m of moves) {
    await tx.stockItem.update({ where: { id: m.itemId }, data: { quantity: { decrement: m.quantity } } });
    if (m.lotId) await tx.stockLot.update({ where: { id: m.lotId }, data: { quantity: { decrement: m.quantity } } });
  }
  await tx.stockMovement.deleteMany({ where: { id: { in: moves.map((m) => m.id) } } });
}

module.exports = { ensureLot, move, consume, applyTreatmentMaterials, reverseTreatmentMaterials, round };
