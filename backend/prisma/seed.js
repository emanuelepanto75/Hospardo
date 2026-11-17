/**
 * Dati iniziali di esempio. Esegui con: npm run db:seed
 * Crea un amministratore e, se il database è vuoto, medici/prestazioni/pazienti di prova.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { DateTime } = require('luxon');

const prisma = new PrismaClient();
const TZ = process.env.TIMEZONE || 'Europe/Rome';

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@studio.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: 'Amministratore', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  console.log(`Utente amministratore: ${adminEmail} / ${adminPassword}`);

  if ((await prisma.doctor.count()) > 0 || process.env.SEED_DEMO === 'false') return;

  const visita = await prisma.service.create({ data: { name: 'Prima visita', category: 'Visite specialistiche', durationMin: 30, priceCents: 12000, description: 'Visita specialistica completa' } });
  const controllo = await prisma.service.create({ data: { name: 'Visita di controllo', category: 'Visite specialistiche', durationMin: 20, priceCents: 8000 } });
  const ecg = await prisma.service.create({ data: { name: 'Elettrocardiogramma', category: 'Cardiologia', durationMin: 15, priceCents: 5000 } });
  const eco = await prisma.service.create({ data: { name: 'Ecografia addome', category: 'Diagnostica', durationMin: 30, priceCents: 9000, bookableOnline: false } });
  const dental = [];
  for (const [name, durationMin, priceCents, description] of [
    ['Prima visita odontoiatrica', 30, 6000, 'Visita, controllo carie e piano di cura'],
    ['Igiene dentale', 45, 8000, 'Pulizia professionale e lucidatura'],
    ['Otturazione', 45, 12000, null],
    ['Devitalizzazione', 60, 25000, null],
    ['Sbiancamento', 60, 30000, null],
  ]) dental.push(await prisma.service.create({ data: { name, category: 'Odontoiatria', durationMin, priceCents, description } }));

  const rossi = await prisma.doctor.create({
    data: {
      title: 'Dott.ssa', firstName: 'Laura', lastName: 'Rossi', specialty: 'Cardiologia', color: '#2563eb',
      services: { create: [visita, controllo, ecg].map((s) => ({ serviceId: s.id })) },
      workingHours: {
        create: [1, 2, 3, 4, 5].flatMap((weekday) => [
          { weekday, startTime: '09:00', endTime: '13:00' },
          ...(weekday % 2 ? [{ weekday, startTime: '14:30', endTime: '18:30' }] : []),
        ]),
      },
    },
  });
  const bianchi = await prisma.doctor.create({
    data: {
      firstName: 'Marco', lastName: 'Bianchi', specialty: 'Medicina interna', color: '#16a34a',
      services: { create: [visita, controllo, eco].map((s) => ({ serviceId: s.id })) },
      workingHours: { create: [1, 3, 5].map((weekday) => ({ weekday, startTime: '15:00', endTime: '19:00' })).concat([{ weekday: 2, startTime: '09:00', endTime: '13:00' }, { weekday: 4, startTime: '09:00', endTime: '13:00' }]) },
    },
  });

  await prisma.doctor.create({
    data: {
      firstName: 'Paola', lastName: 'Ferri', specialty: 'Odontoiatria', color: '#c2410c', title: 'Dott.ssa',
      // l'igiene con questa dottoressa dura 60 minuti invece dei 45 standard
      services: { create: dental.map((s) => ({ serviceId: s.id, ...(s.name === 'Igiene dentale' ? { durationMin: 60 } : {}) })) },
      workingHours: { create: [2, 4].flatMap((weekday) => [{ weekday, startTime: '09:00', endTime: '13:00' }, { weekday, startTime: '14:00', endTime: '19:00' }]) },
    },
  });

  await prisma.user.create({
    data: { email: 'segreteria@studio.local', name: 'Segreteria', role: 'SEGRETERIA', passwordHash: await bcrypt.hash('segreteria123', 10) },
  });
  await prisma.user.create({
    data: { email: 'rossi@studio.local', name: 'Dott.ssa Laura Rossi', role: 'MEDICO', doctorId: rossi.id, passwordHash: await bcrypt.hash('medico12345', 10) },
  });

  const patients = await Promise.all([
    ['Giulia', 'Verdi', 'giulia.verdi@example.com', '333 1234567'],
    ['Paolo', 'Esposito', 'paolo.esposito@example.com', '347 7654321'],
    ['Anna', 'Romano', null, '320 1112233'],
    ['Luca', 'Colombo', 'luca.colombo@example.com', '339 9988776'],
  ].map(([firstName, lastName, email, phone]) => prisma.patient.create({ data: { firstName, lastName, email, phone, privacyConsent: true } })));

  // qualche appuntamento nei prossimi giorni lavorativi
  let day = DateTime.now().setZone(TZ).startOf('day');
  const created = [];
  while (created.length < 6) {
    day = day.plus({ days: 1 });
    if (day.weekday > 5) continue;
    for (const [hm, doctor, service, p] of [['09:00', rossi, visita, 0], ['10:00', rossi, ecg, 1], [day.weekday % 2 ? '15:00' : '09:30', bianchi, controllo, 2]]) {
      const [h, m] = hm.split(':').map(Number);
      const start = day.set({ hour: h, minute: m });
      created.push(await prisma.appointment.create({
        data: {
          doctorId: doctor.id, patientId: patients[(p + created.length) % patients.length].id, serviceId: service.id,
          start: start.toJSDate(), end: start.plus({ minutes: service.durationMin }).toJSDate(),
          manageToken: crypto.randomBytes(24).toString('base64url'),
        },
      }));
    }
  }
  console.log('Dati di esempio creati (3 medici, 9 prestazioni, 4 pazienti, 6 appuntamenti).');
  console.log('Altri utenti: segreteria@studio.local / segreteria123, rossi@studio.local / medico12345');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
