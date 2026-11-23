/**
 * Importa medici, specializzazioni, prestazioni, durate e tariffe da un file JSON.
 * Uso:  npm run import:tariffario -- percorso/tariffario.json [--prova]
 *   --prova  mostra cosa verrebbe fatto senza modificare nulla
 *
 * Formato: { "doctors": [ { "title", "firstName", "lastName", "specialty", "color",
 *            "services": [ { "category", "name", "durationMin", "priceCents", "description" } ] } ] }
 *
 * Si può rilanciare: i medici sono riconosciuti per nome e cognome, le prestazioni per categoria e nome.
 * Una prestazione condivisa da più medici ha durata/tariffa standard pari a quelle del primo medico;
 * per gli altri vengono salvate come valori personalizzati. Gli orari di lavoro non vengono toccati.
 */
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dryRun = process.argv.includes('--prova');
if (!file) {
  console.error('Uso: npm run import:tariffario -- percorso/tariffario.json [--prova]');
  process.exit(1);
}

const prisma = new PrismaClient();
const norm = (s) => String(s || '').trim().toLowerCase();

async function main() {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stats = { doctorsNew: 0, doctorsUpd: 0, servicesNew: 0, servicesUpd: 0, links: 0 };

  // 1. prestazioni (valori standard = primo medico che la eroga)
  const serviceDefs = new Map();
  for (const d of data.doctors) {
    for (const s of d.services) {
      const key = `${norm(s.category)}|${norm(s.name)}`;
      if (!serviceDefs.has(key)) serviceDefs.set(key, s);
    }
  }
  const existingServices = await prisma.service.findMany();
  const serviceIds = new Map();
  for (const [key, s] of serviceDefs) {
    const found = existingServices.find((x) => `${norm(x.category)}|${norm(x.name)}` === key);
    const values = {
      name: s.name, category: s.category, durationMin: s.durationMin, priceCents: s.priceCents ?? null,
      description: s.description ?? null, active: true, bookableOnline: true,
    };
    if (found) {
      stats.servicesUpd++;
      if (!dryRun) await prisma.service.update({ where: { id: found.id }, data: values });
      serviceIds.set(key, found.id);
    } else {
      stats.servicesNew++;
      const created = dryRun ? { id: -serviceIds.size - 1 } : await prisma.service.create({ data: values });
      serviceIds.set(key, created.id);
    }
  }

  // 2. medici e collegamenti alle prestazioni
  const existingDoctors = await prisma.doctor.findMany();
  for (const d of data.doctors) {
    const found = existingDoctors.find((x) => norm(x.firstName) === norm(d.firstName) && norm(x.lastName) === norm(d.lastName));
    let doctorId;
    if (found) {
      stats.doctorsUpd++;
      doctorId = found.id;
      // il titolo non viene sovrascritto: potresti averlo già corretto a mano
      if (!dryRun) await prisma.doctor.update({ where: { id: found.id }, data: { specialty: d.specialty } });
    } else {
      stats.doctorsNew++;
      if (!dryRun) {
        const created = await prisma.doctor.create({
          data: { title: d.title || 'Dott.', firstName: d.firstName || '', lastName: d.lastName, specialty: d.specialty, color: d.color || '#2563eb' },
        });
        doctorId = created.id;
      }
    }
    const name = `${d.title || 'Dott.'} ${d.firstName} ${d.lastName}`.replace(/\s+/g, ' ').trim();
    console.log(`${found ? 'aggiornato' : 'nuovo     '}  ${name} – ${d.specialty} (${d.services.length} prestazioni)`);
    if (dryRun) { stats.links += d.services.length; continue; }
    for (const s of d.services) {
      const key = `${norm(s.category)}|${norm(s.name)}`;
      const def = serviceDefs.get(key);
      const values = {
        durationMin: s.durationMin !== def.durationMin ? s.durationMin : null,
        priceCents: (s.priceCents ?? null) !== (def.priceCents ?? null) ? s.priceCents ?? null : null,
        bookableOnline: true,
      };
      await prisma.doctorService.upsert({
        where: { doctorId_serviceId: { doctorId, serviceId: serviceIds.get(key) } },
        update: values,
        create: { doctorId, serviceId: serviceIds.get(key), ...values },
      });
      stats.links++;
    }
  }

  console.log(`\n${dryRun ? '[PROVA: nessuna modifica] ' : ''}Medici: ${stats.doctorsNew} nuovi, ${stats.doctorsUpd} aggiornati. `
    + `Prestazioni: ${stats.servicesNew} nuove, ${stats.servicesUpd} aggiornate. Collegamenti medico-prestazione: ${stats.links}.`);
  if (!dryRun) console.log('Ricorda di impostare gli orari di lavoro di ogni medico (Medici e orari): senza orari non ci sono posti liberi.');
}

main().catch((e) => { console.error('Errore:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
