# Pubblicare Hospardo su internet (tunnel Cloudflare dal server di casa)

Stessa impostazione di CivicAlerts, con un **tunnel dedicato** a Hospardo:

| Indirizzo | Cosa mostra |
|---|---|
| `https://DOMINIO` | la pagina web pubblica (cartella `site`) |
| `https://www.DOMINIO` | rimanda a `https://DOMINIO` |
| `https://DOMINIO/prenota` | la richiesta di prenotazione per i pazienti (confermata poi dallo studio) |
| `https://app.DOMINIO` | l'agenda: area riservata per segreteria e medici |

Nei comandi e negli esempi sostituisci `DOMINIO` con il vostro dominio (es. `hospardo.it`).
Il dominio deve essere già **attivo** nel tuo account Cloudflare (name server Cloudflare).
Nessuna porta da aprire sul router; HTTPS e certificati li gestisce Cloudflare.

---

## 1. Crea il tunnel (pannello Cloudflare)

1. dash.cloudflare.com › **Zero Trust** › **Networks** › **Tunnels** › **Create a tunnel**.
2. Tipo **Cloudflared**, nome `hospardo-casa`, **Save tunnel**.
3. Nella pagina "Install and run connectors" scegli **Docker** e copia il comando: contiene
   `--token eyJ...`. Il token è la parte dopo `--token`: non condividerlo con nessuno.
   Non eseguire il comando: il tunnel lo avvia Hospardo.

## 2. Configura Hospardo sul server

In PowerShell:

```powershell
cd C:\progetti\Hospardo
git pull
```

**a) File `.env` della cartella principale** (non quello in `backend`). Se non esiste crealo dal modello:

```powershell
copy .env.example .env
notepad .env
```

Imposta:

```
HOSPARDO_DOMAIN=DOMINIO
COMPOSE_PROFILES=tunnel
CLOUDFLARE_TUNNEL_TOKEN=eyJ...   (il token copiato)
```

**b) File `backend\.env`**:

```powershell
notepad backend\.env
```

```
FRONTEND_URL="https://app.DOMINIO"
PUBLIC_URL="https://DOMINIO"
REQUESTS_EMAIL="segreteria@..."     (riceve l'avviso di nuova richiesta)
CLINIC_NAME="Nome dello studio"
CLINIC_ADDRESS="Via ..., Città"
CLINIC_PHONE="..."
CLINIC_EMAIL="..."
CLINIC_HOURS="Lunedì–Venerdì 9:00–19:00, Sabato 9:00–13:00"
CLINIC_DESCRIPTION="Breve presentazione mostrata nella pagina web"
SITE_SHOW_PRICES=true
```

**c) Avvia:**

```powershell
docker compose up -d --build
docker compose ps
```

Devono risultare **Up** `app`, `backup`, `caddy`, `cloudflared` e `db`.
Nel pannello Cloudflare il connettore del tunnel `hospardo-casa` deve diventare **Healthy** (verde).

Anteprima della pagina web dal server: <http://localhost:4180>. L'agenda resta su <http://localhost:4100>.

## 3. Collega i nomi al tunnel

1. In Cloudflare › il vostro dominio › **DNS › Records**: se ci sono già record **A**, **AAAA** o **CNAME**
   per `DOMINIO`, `www` o `app` (pagina di parcheggio del registrar), **eliminali**.
   Non toccare i record **MX** e **TXT** della posta, se ci sono.
2. Zero Trust › **Networks › Tunnels** › `hospardo-casa` › **Public Hostname**
   (o "Published application routes") › aggiungi tre voci, tutte con **Service: HTTP** e **URL: `caddy:80`**:

   | Subdomain | Domain | Service |
   |---|---|---|
   | *(vuoto)* | DOMINIO | HTTP `caddy:80` |
   | `www` | DOMINIO | HTTP `caddy:80` |
   | `app` | DOMINIO | HTTP `caddy:80` |

   Cloudflare crea da solo i record DNS che puntano al tunnel.
3. In Cloudflare › il vostro dominio › **SSL/TLS › Edge Certificates** attiva **Always Use HTTPS**.

> Se in precedenza avevi aggiunto un indirizzo per Hospardo nel tunnel di CivicAlerts, toglilo:
> quel tunnel gira nel progetto CivicAlerts e non raggiunge Hospardo.

## 4. Prova da fuori

Dal telefono **con il Wi-Fi spento**:

- `https://DOMINIO` → pagina web con prestazioni, medici e contatti;
- `https://www.DOMINIO` → porta alla stessa pagina;
- `https://DOMINIO/prenota` → richiesta di prenotazione dei pazienti;
- `https://app.DOMINIO` → accesso all'agenda.

Fai una richiesta di prova, confermala dalla pagina **Richieste** dell'agenda e controlla che il link
nell'email porti a `https://DOMINIO/appuntamento/...`.

## 5. Protezione in più per l'area riservata (consigliata)

Con **Cloudflare Access** (gratuito fino a 50 utenti) chi apre l'area riservata deve prima inserire un codice
ricevuto via email, oltre alla password di Hospardo. I pazienti continuano a prenotare liberamente.

1. Zero Trust › **Access › Applications** › **Add an application** › **Self-hosted**.
2. Nome `Hospardo agenda`, dominio `app.DOMINIO`.
3. Regola **Allow** con le email del personale (o `Emails ending in` per il dominio dello studio).
4. Non servono eccezioni: le pagine dei pazienti (prenotazione e gestione dell'appuntamento) stanno su
   `https://DOMINIO`, che resta libero.

## Comandi utili

| Per… | Comando |
|---|---|
| Stato dei servizi | `docker compose ps` |
| Log del tunnel | `docker compose logs --tail 30 cloudflared` |
| Log di Caddy | `docker compose logs --tail 30 caddy` |
| Riavviare il tunnel | `docker compose restart cloudflared` |
| Togliere Hospardo da internet | `docker compose stop cloudflared`, poi in `.env` togli la riga `COMPOSE_PROFILES=tunnel` (così non riparte) |

## Aggiornare la pagina web

I testi di presentazione, contatti e orari si cambiano in `backend\.env` (poi `docker compose restart app`);
prestazioni e medici dall'agenda. La grafica è in `site\index.html`: le modifiche sono online subito.
Dettagli in `site\LEGGIMI.md`.

## Sicurezza

- Da internet sono raggiungibili solo la pagina web e l'agenda con il suo login (e, se attivato, Cloudflare Access).
- La pagina web legge dall'agenda solo i dati pubblici (contatti, prestazioni, medici).
- Il server deve restare acceso: se è spento, pagina e agenda non rispondono. Il backup notturno resta attivo.
