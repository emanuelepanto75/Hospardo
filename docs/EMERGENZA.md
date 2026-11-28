# Copia di emergenza dell'agenda (PC dello studio senza internet)

I PC dello studio scaricano **ogni 15 minuti** (e all'accesso a Windows) una copia dell'agenda in sola lettura:
il file **Agenda di emergenza.html** sul Desktop, che si apre con il browser anche **senza internet**.

Contiene oggi e i 6 giorni lavorativi successivi (domenica esclusa): per giorno e medico ora, paziente, telefono,
prestazione, stato e note, più le richieste di prenotazione in attesa. Ha una casella di ricerca e mostra in alto
quanto è aggiornata (diventa gialla se ha più di 30 minuti).

## Installare un PC (una volta sola)

1. Nell'agenda, da amministratore: **Postazioni di emergenza** → scrivi il nome del PC → **Crea chiave**.
   Copia la chiave: viene mostrata una sola volta.
2. Sul PC dello studio, con l'utente Windows della segreteria, scarica lo script dal link della stessa pagina
   (`installa-agenda-emergenza.ps1`, nella cartella Download).
3. Apri **Windows PowerShell** e incolla il comando mostrato nella pagina, ad esempio:
   ```
   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\installa-agenda-emergenza.ps1" -Url https://app.hospardo.it
   ```
4. Incolla la chiave quando richiesta. Deve comparire "Fatto" e il file sul Desktop.

Lo script crea l'attività pianificata **Hospardo - agenda di emergenza** e salva la chiave cifrata con le protezioni
di Windows (leggibile solo da quell'utente su quel PC). Registro degli aggiornamenti: `%LOCALAPPDATA%\Hospardo\emergenza.log`.

## Sicurezza

- La chiave permette solo di scaricare la copia: non dà accesso all'agenda né a modifiche.
- Se un PC viene sostituito, perso o rubato: **Postazioni di emergenza** → **Revoca**.
- Il file contiene dati dei pazienti: i PC devono avere l'accesso a Windows con password (meglio con BitLocker).
- Se attivate Cloudflare Access su `app.hospardo.it`, aggiungete un'eccezione **Bypass** per il percorso
  `/api/emergency/snapshot` (è già protetto dalla chiave della postazione).

## Disinstallare

```
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\installa-agenda-emergenza.ps1" -Disinstalla
```
