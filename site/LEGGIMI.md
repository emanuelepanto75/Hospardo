# Pagina web pubblica di Hospardo

Pagina statica servita da Caddy su `https://DOMINIO` (nessun cookie, nessun dato raccolto).
Nome dello studio, contatti, orari, presentazione, prestazioni e medici vengono letti dall'agenda,
quindi si aggiornano da soli:

| Cosa | Dove si cambia |
| --- | --- |
| Nome, indirizzo, telefono, email, orari, testo di presentazione | `backend\.env`: `CLINIC_NAME`, `CLINIC_ADDRESS`, `CLINIC_PHONE`, `CLINIC_EMAIL`, `CLINIC_HOURS`, `CLINIC_DESCRIPTION` (poi `docker compose restart app`) |
| Mostrare o nascondere prezzi e durate | `backend\.env`: `SITE_SHOW_PRICES` e `SITE_SHOW_DURATIONS` = `true` / `false` |
| Prestazioni e medici | Dall'agenda: compaiono quelli attivi e prenotabili online |
| Grafica e testi fissi | `site\index.html` (le modifiche sono online subito, senza riavviare) |

Anteprima dal PC del server: <http://localhost:4180>.
