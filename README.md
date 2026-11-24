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
- `/prenota`: **richiesta** di prenotazione: prestazione → medico → orario libero oppure preferenza libera → dati
  e consenso privacy. Il paziente riceve un'email di ricevuta, lo studio un avviso; l'orario scelto resta "tenuto".
  La segreteria la conferma (anche cambiando giorno, ora o medico) o la rifiuta dalla pagina **Richieste**:
  alla conferma partono l'email e il pulsante WhatsApp
- `/appuntamento/<codice>`: riepilogo e annullamento dal link ricevuto via email

**Messaggi ai pazienti**: email automatiche (conferma, promemoria il giorno prima, spostamento, annullamento)
e WhatsApp **con un clic** dal numero dello studio, gratuito: avviso dopo ogni prenotazione e pagina
**Promemoria** con i pazienti del giorno dopo. WhatsApp completamente automatico è attivabile
con Meta o Twilio. Registro degli invii per ogni appuntamento. Dettagli: [docs/whatsapp.md](docs/whatsapp.md).

**Riepilogo serale via email**: ogni sera (default 22:00) un'email all'indirizzo `REPORT_EMAIL` con
gli appuntamenti dei prossimi 6 giorni lavorativi, domenica esclusa:
- file **Excel** con una scheda di riepilogo (appuntamenti per giorno e medico, assenze) e una scheda per giorno
  (ora, fine, medico, paziente, telefono, prestazione, stato, note, orari ancora liberi di ogni medico);
- file **calendario .ics** da importare in Outlook o Google Calendar.

Lo stesso Excel si scarica dall'agenda con il pulsante **Excel 6 giorni**.

## Aggiornare un'installazione esistente

Con Docker bastano `git pull` e `docker compose up -d --build`. Senza Docker:

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

## Avvio con Docker (consigliato)

Database e agenda girano in background, ripartono da soli se si bloccano e all'avvio di Docker.
Serve solo Docker (su Windows: Docker Desktop, con "Start Docker Desktop when you sign in" attivo).

```bash
cp backend/.env.example backend/.env
```
```bash
docker compose up -d --build
```
```bash
docker compose run --rm app npm run setup
```
```bash
docker compose restart app
```

L'agenda è su <http://localhost:4100> (porta modificabile con la variabile `HOSPARDO_PORT`).
Il database viene aggiornato automaticamente a ogni avvio.

| Operazione | Comando |
| --- | --- |
| Aggiornare dopo un `git pull` | `docker compose up -d --build` |
| Vedere i log | `docker compose logs -f app` |
| Fermare / riavviare | `docker compose stop` / `docker compose start` |
| Dati di esempio | `docker compose run --rm app npm run db:seed` |
| Backup immediato (oltre a quello automatico notturno) | `docker compose exec backup sh /backup.sh now` |

**Backup automatico**: il servizio `backup` salva il database ogni notte alle 02:30 nella cartella `backups`
del progetto e cancella i backup più vecchi di 30 giorni. Si configura nel file `.env` della cartella principale
(non in `backend`):

```
BACKUP_TIME=02:30
BACKUP_KEEP_DAYS=30
BACKUP_DIR=C:/Users/nome/OneDrive/backup-hospardo
```

Con `BACKUP_DIR` in una cartella sincronizzata (OneDrive, Google Drive, Dropbox) si ha anche una copia fuori dal PC.

Elenco completo dei comandi, con ripristino del backup e soluzione dei problemi: [docs/Hospardo-comandi.docx](docs/Hospardo-comandi.docx).

I dati stanno nel volume Docker `pgdata` e restano anche dopo `docker compose down`
(non usare `docker compose down -v`, che li cancella).

## Avvio in locale senza Docker (sviluppo)

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

Come per CivicAlerts: pagina web pubblica su `https://DOMINIO` (cartella `site`), agenda su
`https://app.DOMINIO`, smistati da Caddy e pubblicati con un tunnel Cloudflare dedicato (servizi `caddy`
e `cloudflared` di docker-compose). Guida passo passo: [docs/PUBBLICAZIONE.md](docs/PUBBLICAZIONE.md).

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
- Registro delle modifiche (audit)
- Fatturazione / ricevute e statistiche
