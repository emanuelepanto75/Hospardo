// Invia subito il riepilogo serale dell'agenda. Uso: npm run report:send [-- indirizzo@email.it]
require('dotenv').config();
const { sendAgendaReport } = require('../src/services/agendaReport');
const prisma = require('../src/lib/prisma');

sendAgendaReport(process.argv[2] ? { to: process.argv[2] } : {})
  .then((r) => console.log(`Inviato a ${r.to} (${r.status}): ${r.appointments} appuntamenti, giorni ${r.days.join(', ')}`))
  .catch((e) => { console.error('Errore:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
