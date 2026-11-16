# Hospardo – Agenda per studio medico

Gestionale web per l'agenda di uno studio medico con più medici, anagrafica pazienti,
prestazioni, orari di disponibilità, promemoria via email e **prenotazione online per i pazienti**.

## Funzionalità (v0.1)

**Area riservata (segreteria, medici, amministratori)**
- **Agenda** giornaliera (una colonna per medico) e settimanale (per singolo medico)
  - fasce di disponibilità evidenziate, ferie/assenze tratteggiate, linea dell'ora attuale
  - clic su uno spazio vuoto → nuovo appuntamento; clic su un appuntamento → dettaglio
  - stati: Prenotato, Confermato, In sala d'attesa, Completato, Annullato, Non presentato
  - suggerimento degli orari liberi, blocco delle sovrapposizioni (forzabile per urgenze)
- **Pazienti**: ricerca rapida (nome, cognome, telefono, email, codice fiscale), scheda con
  dati anagrafici, consensi, storico e prossimi appuntamenti, creazione al volo dall'agenda
- **Medici e orari**: dati del medico, colore in agenda, orari settimanali con più fasce al giorno,
  ferie e assenze (con avviso se ci sono appuntamenti nel periodo)
  - tabella **Prestazioni erogate** per medico, con durata e prezzo personalizzabili
  - medico non più in servizio: **eliminazione** (se senza storico) o **archiviazione**, con annullamento
    e avviso ai pazienti degli appuntamenti futuri
- **Prestazioni**: categoria (es. Odontoiatria), durata, prezzo, medici abilitati, prenotabilità online
- **Utenti e ruoli**: Amministratore, Segreteria, Medico (il medico modifica solo la propria agenda)

**Area pubblica (pazienti, senza login)**
- `/prenota`: scelta prestazione → medico → giorno → orario → dati e consenso privacy
- `/appuntamento/<codice>`: riepilogo e annullamento dal link ricevuto via email

**Messaggi automatici via email e WhatsApp**: conferma della prenotazione, promemoria il giorno prima
della visita, avviso di spostamento o annullamento, con registro degli invii per ogni appuntamento.
Configurazione: [docs/whatsapp.md](docs/whatsapp.md).

## Aggiornare un'installazione esistente

```bash
git pull
```
```bash
npm run install:all
```
```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```
```bash
cd .. && npm run build && npm start
```

## Tecnologie

- Backend: Node.js, Express, Prisma, PostgreSQL, JWT, Zod, Nodemailer, node-cron, Luxon
- Frontend: React 18, Vite, React Router, Luxon

## Avvio in locale

Prerequisiti: Node.js 20+ e PostgreSQL 14+ (oppure Docker).

```bash
docker compose up -d
```

```bash
npm run install:all
```

```bash
cp backend/.env.example backend/.env
```

```bash
cd backend && npx prisma generate && npx prisma migrate deploy && npm run db:seed
```

Poi, in due terminali separati:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Apri <http://localhost:5173>. Utenti di prova creati dal seed:

| Ruolo          | Email                   | Password      |
|----------------|-------------------------|---------------|
| Amministratore | admin@studio.local      | admin12345    |
| Segreteria     | segreteria@studio.local | segreteria123 |
| Medico         | rossi@studio.local      | medico12345   |

La pagina di prenotazione pazienti è su <http://localhost:5173/prenota>.

> Prima di usarlo con dati reali esegui `npm run setup` nella cartella `backend`:
> crea il tuo amministratore, genera `JWT_SECRET` e disattiva gli utenti di prova.
> Per creare solo l'amministratore senza dati di esempio: `SEED_DEMO=false npm run db:seed`.

### Su Windows (PowerShell)

- Se `npm` dà l'errore "L'esecuzione di script è disabilitata", esegui una volta
  `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, oppure usa `npm.cmd`.
- Windows PowerShell 5 non accetta `&&`: esegui i comandi uno per riga.
- Se la porta 4000 è già occupata, cambia `PORT` e `FRONTEND_URL` in `backend/.env`.

## Accesso da internet

Guida passo passo: [docs/pubblicazione-cloudflare.md](docs/pubblicazione-cloudflare.md)
(Cloudflare Tunnel, creazione del tuo amministratore con `npm run setup`, sicurezza).

## Produzione

```bash
npm run build && NODE_ENV=production npm start
```

Il backend serve anche il frontend compilato (`frontend/dist`) sulla stessa porta.
Variabili principali in `backend/.env.example` (database, SMTP, dati dello studio, fuso orario,
anticipo minimo e finestra massima per le prenotazioni online).

## Struttura

```
backend/
  prisma/schema.prisma     modello dati
  prisma/seed.js           dati iniziali
  src/routes/              API (auth, users, doctors, services, patients, appointments, public)
  src/services/            calcolo disponibilità, email, promemoria
frontend/
  src/pages/               Agenda, Pazienti, Medici, Prestazioni, Utenti, Prenota
  src/components/          modale appuntamento, ricerca paziente, layout
```

## Prossimi passi possibili

- Promemoria via SMS / WhatsApp
- Trascinamento degli appuntamenti nell'agenda, vista mensile, stampa giornaliera
- Lista d'attesa e appuntamenti ricorrenti
- Registro delle modifiche (audit) e backup automatici
- Fatturazione / ricevute e statistiche
