/**
 * Prestazioni per medico: un medico può avere durata/prezzo diversi da quelli standard.
 */
const prisma = require('../lib/prisma');

/** Valori effettivi di una prestazione per un medico (link = DoctorService con service incluso) */
function effective(link) {
  return {
    serviceId: link.serviceId,
    durationMin: link.durationMin ?? link.service.durationMin,
    priceCents: link.priceCents ?? link.service.priceCents,
    bookableOnline: link.bookableOnline && link.service.bookableOnline,
  };
}

/** Durata in minuti della prestazione per quel medico (o quella standard se il medico non la eroga) */
async function durationFor(doctorId, serviceId) {
  if (!serviceId) return null;
  const link = await prisma.doctorService.findUnique({
    where: { doctorId_serviceId: { doctorId, serviceId } },
    include: { service: true },
  });
  if (link) return effective(link).durationMin;
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  return service?.durationMin ?? null;
}

module.exports = { effective, durationFor };
