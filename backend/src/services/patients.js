/**
 * Abbina un paziente esistente (per codice fiscale, altrimenti nome + cognome + email) o ne crea uno nuovo.
 * Dei pazienti esistenti completa solo i recapiti mancanti, senza sovrascrivere l'anagrafica.
 */
async function findOrCreatePatient(tx, data) {
  let patient = null;
  if (data.fiscalCode) patient = await tx.patient.findUnique({ where: { fiscalCode: data.fiscalCode } });
  if (!patient) {
    patient = await tx.patient.findFirst({
      where: {
        firstName: { equals: data.firstName, mode: 'insensitive' },
        lastName: { equals: data.lastName, mode: 'insensitive' },
        email: { equals: data.email, mode: 'insensitive' },
      },
    });
  }
  if (!patient) {
    return tx.patient.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        fiscalCode: data.fiscalCode ?? null,
        birthDate: data.birthDate ?? null,
        privacyConsent: true,
        whatsappOptIn: data.whatsappOptIn ?? true,
      },
    });
  }
  return tx.patient.update({
    where: { id: patient.id },
    data: {
      phone: patient.phone || data.phone,
      email: patient.email || data.email,
      privacyConsent: true,
      ...(data.whatsappOptIn !== undefined ? { whatsappOptIn: data.whatsappOptIn } : {}),
    },
  });
}

module.exports = { findOrCreatePatient };
