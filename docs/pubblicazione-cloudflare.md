# Pubblicare l'agenda su internet con Cloudflare Tunnel

L'agenda resta sul tuo PC/server: il tunnel Cloudflare la rende raggiungibile da fuori
con un indirizzo `https://`, senza aprire porte sul router.

Comandi pensati per Windows PowerShell, da eseguire nella cartella del progetto (`C:\progetti\Hospardo`).

## 1. Aggiorna il progetto e prepara la sicurezza

```powershell
git pull
```
```powershell
npm run install:all
```
```powershell
cd backend
```
```powershell
npx prisma migrate deploy
```
```powershell
npm run setup
```

`npm run setup`:
- genera una chiave segreta (`JWT_SECRET`) in `backend\.env`
- crea il **tuo** utente amministratore (email + password di almeno 10 caratteri)
- disattiva gli utenti di prova `@studio.local`

Senza questo passaggio il server **rifiuta di partire** con un indirizzo pubblico.

## 2. Imposta la porta e l'indirizzo pubblico

Apri `backend\.env` con il Blocco note (`notepad .env`) e imposta:

```
PORT=4100
FRONTEND_URL="https://agenda.tuodominio.it"
```

`FRONTEND_URL` è l'indirizzo pubblico: viene usato nei link delle email ai pazienti.
Scegli una porta libera (la 4000 sul tuo PC è già usata da un'altra applicazione).

Poi compila l'interfaccia e avvia:

```powershell
cd ..
```
```powershell
npm run build
```
```powershell
npm start
```

Deve comparire `Hospardo in ascolto su http://localhost:4100`. Lascia aperta questa finestra.

## 3A. Hai già un tunnel Cloudflare "con nome" (dominio su Cloudflare)

È il caso migliore: si aggiunge l'agenda allo stesso tunnel con un indirizzo fisso.

**Tunnel gestito dalla dashboard** (lo hai creato da one.dash.cloudflare.com):
1. Vai su **Zero Trust → Networks → Tunnels**, apri il tunnel esistente
2. Scheda **Public Hostname → Add a public hostname**
3. Subdomain: `agenda` · Domain: il tuo dominio · Type: `HTTP` · URL: `localhost:4100`
4. Salva: dopo pochi secondi `https://agenda.tuodominio.it` è attivo

**Tunnel gestito con file `config.yml`** (sul PC, di solito in `C:\Users\<utente>\.cloudflared\`):
aggiungi una regola **prima** della riga finale `- service: http_status:404`:

```yaml
ingress:
  - hostname: altraapp.tuodominio.it      # regola già esistente
    service: http://localhost:4000
  - hostname: agenda.tuodominio.it        # nuova regola
    service: http://localhost:4100
  - service: http_status:404
```

Poi crea il record DNS e riavvia il tunnel:

```powershell
cloudflared tunnel route dns NOME_TUNNEL agenda.tuodominio.it
```

Infine riavvia il servizio `cloudflared` (da Servizi di Windows, o chiudendo e rilanciando il comando del tunnel).

## 3B. Non hai un dominio: tunnel rapido (solo per prove)

```powershell
cloudflared tunnel --url http://localhost:4100
```

Stampa un indirizzo tipo `https://parole-casuali.trycloudflare.com`.
Limiti: l'indirizzo **cambia a ogni riavvio** (va riscritto ogni volta in `FRONTEND_URL`),
e Cloudflare non garantisce continuità del servizio. Per l'uso reale serve un dominio (~10 €/anno).

## 4. Accedi da fuori

Apri l'indirizzo pubblico da telefono o da un altro PC ed entra con l'utente creato da `npm run setup`.
La pagina per i pazienti è `https://…/prenota`.

## Sicurezza: cosa è già attivo

- Accesso con password; dopo 10 tentativi errati sullo stesso utente blocco di 15 minuti
- Chiave segreta obbligatoria quando l'agenda è pubblica
- Intestazioni di sicurezza (CSP, HSTS, anti-iframe)
- Le pagine pubbliche espongono solo prestazioni, medici e orari liberi: nessun dato dei pazienti

## Consigli

- **Protezione extra (consigliata con dati sanitari)**: con Cloudflare Access puoi chiedere un codice via
  email prima ancora del login. Crea un'applicazione Access su `agenda.tuodominio.it` e aggiungi una regola
  *Bypass* per i percorsi pubblici: `/prenota`, `/appuntamento/*`, `/api/public/*`, `/assets/*`.
- **Backup** del database regolarmente, ad esempio:
  `docker exec hospardo-db-1 pg_dump -U postgres hospardo > backup.sql`
  (il nome del container si vede con `docker ps`).
- Il PC deve restare acceso e con `npm start` in esecuzione: per l'avvio automatico all'accensione
  si può installare il server come servizio di Windows (es. con NSSM).
