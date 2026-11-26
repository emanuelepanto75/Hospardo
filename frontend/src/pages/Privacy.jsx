import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PublicShell } from './Book';

/**
 * Informativa sul trattamento dei dati personali (artt. 13-14 GDPR) per i pazienti.
 * I dati del titolare vengono dalla configurazione (CLINIC_*, PRIVACY_*). Testo da far verificare
 * al consulente privacy dello studio prima dell'uso.
 */
export default function Privacy() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api('/public/info').then(setInfo).catch(() => setInfo({ clinic: {} })); }, []);
  const c = info?.clinic || {};
  const name = c.legalName || c.name || 'lo Studio';
  const contact = [c.privacyEmail && `email ${c.privacyEmail}`, c.pec && `PEC ${c.pec}`, c.phone && `telefono ${c.phone}`].filter(Boolean).join(', ');

  return (
    <PublicShell info={info}>
      <article className="card privacy">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>Informativa sul trattamento dei dati personali</h1>
          <button className="btn btn-sm no-print" onClick={() => window.print()}>Stampa</button>
        </div>
        <p className="muted">ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679 (GDPR)</p>

        <h2>1. Titolare del trattamento</h2>
        <p>
          Titolare è <b>{name}</b>{c.vatNumber && <>, P.IVA {c.vatNumber}</>}{c.address && <>, con sede in {c.address}</>}.
          {contact && <> Per qualsiasi richiesta sui tuoi dati puoi scrivere o telefonare: {contact}.</>}
        </p>
        {c.dpo && <p>Responsabile della protezione dei dati (DPO): {c.dpo}.</p>}

        <h2>2. Quali dati trattiamo</h2>
        <ul>
          <li><b>Dati anagrafici e di contatto</b>: nome, cognome, codice fiscale, data e luogo di nascita, sesso, indirizzo, telefono, email.</li>
          <li><b>Dati sulla salute</b>: prestazioni richieste e prenotate, appuntamenti, note cliniche, cartella e piani di cura (per esempio odontoiatrici), dispositivi impiantati.</li>
          <li><b>Dati tecnici</b> minimi necessari al funzionamento del servizio online (indirizzo IP, data e ora delle richieste), per sicurezza e prevenzione degli abusi. Il sito non usa cookie di profilazione.</li>
        </ul>

        <h2>3. Perché li trattiamo e su quale base</h2>
        <table className="table">
          <thead><tr><th>Finalità</th><th>Base giuridica</th></tr></thead>
          <tbody>
            <tr><td>Gestire richieste di prenotazione, appuntamenti, spostamenti e annullamenti</td><td>Esecuzione di misure precontrattuali e del contratto di cura (art. 6.1.b GDPR)</td></tr>
            <tr><td>Erogare le prestazioni sanitarie e tenere la documentazione clinica</td><td>Finalità di diagnosi, assistenza e terapia sanitaria (art. 9.2.h GDPR) e obblighi di legge (art. 6.1.c)</td></tr>
            <tr><td>Inviare conferme e promemoria degli appuntamenti via email, WhatsApp o telefono</td><td>Esecuzione del contratto; puoi chiedere in qualsiasi momento di non riceverli</td></tr>
            <tr><td>Adempimenti fiscali, contabili e di tracciabilità dei dispositivi medici</td><td>Obblighi di legge (art. 6.1.c GDPR)</td></tr>
            <tr><td>Sicurezza del servizio online e tutela dei diritti dello Studio</td><td>Legittimo interesse (art. 6.1.f GDPR)</td></tr>
          </tbody>
        </table>
        <p>Il conferimento dei dati di contatto è necessario per gestire la prenotazione: senza, non possiamo confermarla. I dati non vengono usati per pubblicità né ceduti a terzi per fini commerciali.</p>

        <h2>4. Chi può vederli</h2>
        <p>
          I dati sono trattati dal personale di segreteria e dai medici dello Studio, ciascuno per quanto necessario al proprio
          compito, con credenziali personali. Possono trattarli per nostro conto, come responsabili del trattamento vincolati da
          contratto, i fornitori dei servizi informatici (gestione del sistema di prenotazione e dei backup, posta elettronica,
          rete e sicurezza del sito) e, se usi WhatsApp, il servizio di messaggistica. Possono essere comunicati ai soggetti
          previsti dalla legge (per esempio Sistema Tessera Sanitaria, autorità sanitarie e fiscali).
        </p>

        <h2>5. Dove e per quanto tempo</h2>
        <p>
          I dati sono conservati su sistemi situati nell'Unione Europea. Alcuni fornitori di servizi di rete o messaggistica
          possono trattare dati anche fuori dall'UE, sempre con le garanzie previste dal GDPR (decisioni di adeguatezza o clausole
          contrattuali standard).
        </p>
        <ul>
          <li>Richieste di prenotazione non confermate: fino a 12 mesi.</li>
          <li>Appuntamenti e anagrafica: per tutta la durata del rapporto di cura e poi per il tempo necessario agli obblighi di legge e alla tutela dei diritti, di regola fino a 10 anni.</li>
          <li>Documentazione clinica: per i tempi previsti dalla normativa sanitaria.</li>
          <li>Copie di sicurezza (backup): cancellate a rotazione entro 30 giorni.</li>
        </ul>

        <h2>6. I tuoi diritti</h2>
        <p>
          Puoi chiedere in ogni momento di accedere ai tuoi dati, di correggerli, di cancellarli (salvo quelli che la legge ci
          obbliga a conservare), di limitarne il trattamento, di opporti e di riceverli in un formato leggibile (portabilità),
          scrivendo ai contatti indicati al punto 1. Se ritieni che il trattamento violi il GDPR puoi presentare reclamo al
          Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">www.garanteprivacy.it</a>).
        </p>

        <h2>7. Decisioni automatizzate</h2>
        <p>Non vengono prese decisioni basate unicamente su trattamenti automatizzati, né viene effettuata profilazione.</p>

        <div className="privacy-sign print-only">
          <p>Il/la sottoscritto/a ______________________________ dichiara di aver ricevuto e letto l'informativa.</p>
          <p>Data ______________ &nbsp;&nbsp;&nbsp; Firma ______________________________</p>
        </div>
      </article>
    </PublicShell>
  );
}
