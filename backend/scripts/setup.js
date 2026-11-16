/**
 * Configurazione guidata per l'uso reale dell'agenda:
 *  - crea backend/.env se manca e genera una JWT_SECRET sicura
 *  - crea (o aggiorna) il tuo utente amministratore
 *  - disattiva gli utenti di prova @studio.local
 * Uso: npm run setup   (dalla cartella backend)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');
const examplePath = path.join(__dirname, '..', '.env.example');

function ensureEnv() {
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('Creato il file backend/.env dal modello.');
  }
  let env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^JWT_SECRET=(.*)$/m);
  const current = m ? m[1].replace(/^"|"$/g, '') : '';
  if (current.length < 32 || current.startsWith('cambia-questa')) {
    const secret = crypto.randomBytes(48).toString('base64url');
    env = m ? env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${secret}"`) : `${env}\nJWT_SECRET="${secret}"\n`;
    fs.writeFileSync(envPath, env);
    console.log('Generata una nuova chiave segreta (JWT_SECRET) in backend/.env.');
  } else {
    console.log('Chiave segreta JWT_SECRET già presente: nessuna modifica.');
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

/** Chiede la password senza mostrarla a schermo */
function askHidden(q) {
  return new Promise((resolve) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.startsWith(q)) write.call(rl, q); else if (s.includes('\n') || s.includes('\r')) write.call(rl, '\n'); else write.call(rl, '*'); };
    rl.question(q, (a) => { rl._writeToOutput = write; resolve(a); });
  });
}

async function main() {
  console.log('\n=== Configurazione di Hospardo ===\n');
  ensureEnv();
  require('dotenv').config({ path: envPath, override: true });

  const bcrypt = require('bcryptjs');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    console.log('\nCrea il tuo utente amministratore.');
    let email = '';
    while (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = (await ask('Email: ')).toLowerCase();
    let name = '';
    while (!name) name = await ask('Nome e cognome: ');
    let password = '';
    for (;;) {
      password = await askHidden('Password (almeno 10 caratteri): ');
      if (password.length < 10) { console.log('Password troppo corta.'); continue; }
      const again = await askHidden('Ripeti la password: ');
      if (again !== password) { console.log('Le password non coincidono.'); continue; }
      break;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    await prisma.user.upsert({
      where: { email },
      update: { name, passwordHash, role: 'ADMIN', active: true },
      create: { email, name, passwordHash, role: 'ADMIN' },
    });
    console.log(existing ? `Utente ${email} aggiornato come amministratore.` : `Utente amministratore ${email} creato.`);

    const demo = await prisma.user.findMany({ where: { email: { endsWith: '@studio.local' }, active: true, NOT: { email } } });
    if (demo.length) {
      const a = (await ask(`\nDisattivare gli utenti di prova (${demo.map((u) => u.email).join(', ')})? [S/n] `)).toLowerCase();
      if (a === '' || a === 's' || a === 'si' || a === 'sì' || a === 'y') {
        await prisma.user.updateMany({ where: { id: { in: demo.map((u) => u.id) } }, data: { active: false } });
        console.log('Utenti di prova disattivati.');
      }
    }
    console.log('\nFatto. Riavvia il server (npm start) per applicare le modifiche.\n');
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

main().catch((e) => { console.error('\nErrore:', e.message); rl.close(); process.exit(1); });
