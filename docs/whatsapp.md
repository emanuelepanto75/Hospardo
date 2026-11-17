# Messaggi WhatsApp ed email ai pazienti

Hospardo invia al paziente, via **email** e **WhatsApp**:

| Quando                                         | Messaggio      |
|------------------------------------------------|----------------|
| alla prenotazione (interna o online)           | Conferma       |
| il giorno prima della visita (default ore 10)  | Promemoria     |
| se l'appuntamento viene spostato               | Spostamento    |
| se l'appuntamento viene annullato              | Annullamento   |

Ogni invio compare nella scheda dell'appuntamento, sezione **Messaggi al paziente**, con l'esito
(Inviato / Non inviato perché il canale non è configurato / Errore). Da lì si possono anche
reinviare la conferma o mandare subito un promemoria.

Il paziente riceve i messaggi solo se ha dato il consenso: nella sua scheda ci sono le opzioni
"Invia conferme e promemoria via email" e "… su WhatsApp". Nella prenotazione online lo sceglie lui.

## WhatsApp con un clic (gratuito, attivo di default)

Finché WhatsApp automatico non è configurato, Hospardo prepara i messaggi e la segreteria li invia
dal numero WhatsApp dello studio (app WhatsApp o WhatsApp Business su PC o telefono):

- **dopo ogni prenotazione, spostamento o annullamento** compare in agenda un avviso con il pulsante verde
  per mandare subito il messaggio;
- nella scheda dell'appuntamento ci sono i pulsanti WhatsApp **Conferma**, **Promemoria** e **Avvisa spostamento**
  (o **Avvisa annullamento**);
- la pagina **Promemoria** elenca i pazienti del giorno lavorativo successivo, ciascuno con il pulsante
  **Invia promemoria** e la spunta "inviato alle …".

Il pulsante apre `https://wa.me/<numero>` con il testo già scritto: basta premere Invio in WhatsApp.
È la funzione ufficiale "click to chat": nessun costo e nessun rischio di blocco del numero.
Nello storico dell'appuntamento l'invio compare come "Aperto in WhatsApp dalla segreteria".

## Orario del promemoria

In `backend/.env`:

```
REMINDER_MODE=day_before
REMINDER_TIME="10:00"
```

Il giorno prima della visita, dalle 10:00 in poi, partono i promemoria email (e WhatsApp, se automatico) per gli appuntamenti del giorno dopo.
Prima di quell'ora non si invia niente, così nessuno riceve messaggi di notte.
Chi ha prenotato da meno di 6 ore non riceve il promemoria, perché ha appena ricevuto la conferma.

## Email

Imposta i dati SMTP della tua casella in `backend/.env`. Ad esempio, per un account Gmail con
[password per le app](https://myaccount.google.com/apppasswords):

```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="tuoindirizzo@gmail.com"
SMTP_PASS="password-per-le-app"
MAIL_FROM="Studio Medico <tuoindirizzo@gmail.com>"
```

## WhatsApp automatico (a pagamento)

WhatsApp permette a un'azienda di scrivere per prima a un cliente solo con **modelli di messaggio
approvati** (template). Servono quindi un account WhatsApp Business API e 3–4 modelli approvati.
Ci sono due modi per averlo.

### Opzione A – Meta WhatsApp Cloud API (direttamente da Meta)

1. Crea un account su [business.facebook.com](https://business.facebook.com) (Meta Business Suite).
2. Su [developers.facebook.com](https://developers.facebook.com) crea un'app di tipo **Business** e aggiungi il prodotto **WhatsApp**.
3. Collega un **numero di telefono** dello studio. Il numero non deve essere già usato con l'app WhatsApp
   normale; puoi usare un numero nuovo o una linea fissa, che verrà verificata con una chiamata.
4. Crea un **token di accesso permanente**: Impostazioni business → Utenti di sistema → Genera token,
   con il permesso `whatsapp_business_messaging`.
5. In **WhatsApp Manager → Modelli di messaggio** crea i modelli qui sotto, categoria **Utility**, lingua **Italiano**.
6. Copia nel file `backend/.env`:

```
WHATSAPP_PROVIDER="meta"
WHATSAPP_META_TOKEN="EAAG..."
WHATSAPP_META_PHONE_NUMBER_ID="123456789012345"
WHATSAPP_TEMPLATE_CONFERMA="conferma_appuntamento"
WHATSAPP_TEMPLATE_PROMEMORIA="promemoria_appuntamento"
WHATSAPP_TEMPLATE_ANNULLAMENTO="annullamento_appuntamento"
WHATSAPP_TEMPLATE_SPOSTAMENTO="spostamento_appuntamento"
```

Costi: Meta addebita ogni messaggio "Utility" inviato (in Italia pochi centesimi l'uno; vedi il listino
aggiornato su developers.facebook.com). Serve un metodo di pagamento nell'account.

### Opzione B – Twilio

Più semplice da attivare, con un piccolo sovrapprezzo per messaggio.

1. Crea un account su [twilio.com](https://www.twilio.com) e attiva un **WhatsApp Sender** con il numero dello studio.
2. In **Content Template Builder** crea i modelli qui sotto e inviali all'approvazione WhatsApp.
3. In `backend/.env`:

```
WHATSAPP_PROVIDER="twilio"
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_WHATSAPP_FROM="whatsapp:+39..."
WHATSAPP_TEMPLATE_CONFERMA="HX..."      # Content SID del modello
WHATSAPP_TEMPLATE_PROMEMORIA="HX..."
WHATSAPP_TEMPLATE_ANNULLAMENTO="HX..."
WHATSAPP_TEMPLATE_SPOSTAMENTO="HX..."
```

### Testo dei modelli

Hospardo passa sempre queste variabili, in quest'ordine:
`{{1}}` nome del paziente · `{{2}}` prestazione · `{{3}}` medico · `{{4}}` data e ora · `{{5}}` link per gestire o annullare.

Testi suggeriti (sostituisci "Studio Medico" con il nome dello studio):

**conferma_appuntamento**
> Gentile {{1}}, la sua prenotazione presso Studio Medico è confermata.
> Prestazione: {{2}}
> Medico: {{3}}
> Data: {{4}}
> Per visualizzare o annullare l'appuntamento: {{5}}

**promemoria_appuntamento**
> Gentile {{1}}, le ricordiamo l'appuntamento presso Studio Medico.
> Prestazione: {{2}}
> Medico: {{3}}
> Data: {{4}}
> Se non può venire, la preghiamo di annullare qui: {{5}}

**spostamento_appuntamento**
> Gentile {{1}}, il suo appuntamento presso Studio Medico è stato spostato.
> Prestazione: {{2}}
> Medico: {{3}}
> Nuova data: {{4}}
> Dettagli: {{5}}

**annullamento_appuntamento**
> Gentile {{1}}, il suo appuntamento presso Studio Medico per {{2}} con {{3}} del {{4}} è stato annullato.
> Per prenotare di nuovo: {{5}}

Il modello di annullamento usa `{{5}}` come link: punta alla pagina dell'appuntamento, da cui il paziente
può aprire una nuova prenotazione. Se `WHATSAPP_TEMPLATE_SPOSTAMENTO` è vuoto si usa quello di conferma.

Dopo aver modificato `.env` riavvia il server (`npm start`).
Finché `WHATSAPP_PROVIDER` è vuoto resta attivo l'invio con un clic descritto sopra.
