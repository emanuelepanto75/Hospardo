import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { DateTime, fmtTime } from '../lib/time';
import { doctorName, NOTIFICATION_STATUS } from '../lib/constants';
import WhatsAppButton from '../components/WhatsAppButton';
import { WA_MODES, getWaMode, setWaMode } from '../lib/whatsapp';

/**
 * Promemoria WhatsApp con un clic: i pazienti del giorno scelto (default il prossimo giorno lavorativo),
 * ognuno con il pulsante che apre WhatsApp con il messaggio già scritto.
 */
export default function Reminders() {
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = (d) => api('/appointments/reminders', { query: { date: d || undefined } })
    .then((r) => { setData(r); setDate(r.date); setErr(null); })
    .catch((e) => setErr(errorMessage(e)));
  useEffect(() => { load(''); }, []);

  const markSent = (id) => setData((d) => ({ ...d, items: d.items.map((a) => (a.id === id ? { ...a, whatsappSentAt: new Date().toISOString() } : a)) }));
  const shift = (days) => {
    let d = DateTime.fromISO(date).plus({ days });
    if (d.weekday === 7) d = d.plus({ days: days > 0 ? 1 : -1 });
    load(d.toISODate());
  };

  const items = data?.items || [];
  const sendable = items.filter((a) => a.whatsapp && a.patient.whatsappOptIn);
  const sent = sendable.filter((a) => a.whatsappSentAt).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Promemoria WhatsApp</h1>
          <p className="muted small" style={{ marginTop: -8 }}>
            Premi il pulsante verde: si apre WhatsApp con il messaggio già scritto, tu premi Invio. La spunta resta salvata.
          </p>
        </div>
        <div className="toolbar-group">
          <button className="btn btn-icon" onClick={() => shift(-1)} aria-label="Giorno precedente">‹</button>
          <input type="date" value={date} onChange={(e) => e.target.value && load(e.target.value)} />
          <button className="btn btn-icon" onClick={() => shift(1)} aria-label="Giorno successivo">›</button>
        </div>
      </div>
      <WaModePicker />
      {err && <div className="alert">{err}</div>}
      {data && (
        <>
          <h2 className="agenda-title" style={{ margin: '0 0 10px' }}>{DateTime.fromISO(data.date).toFormat('cccc d LLLL yyyy')}</h2>
          <div className="cards3" style={{ marginBottom: 14 }}>
            <div className="card"><div className="muted small">Appuntamenti</div><div className="big">{items.length}</div></div>
            <div className="card"><div className="muted small">Promemoria WhatsApp inviati</div><div className="big">{sent} / {sendable.length}</div></div>
            <div className="card"><div className="muted small">Senza WhatsApp</div><div className="big">{items.length - sendable.length}</div>
              <div className="muted small">nessun cellulare o non lo desiderano: chiamali</div></div>
          </div>
          {items.length === 0 ? <div className="empty">Nessun appuntamento da ricordare per questo giorno.</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Ora</th><th>Medico</th><th>Paziente</th><th>Telefono</th><th>Prestazione</th><th>Email</th><th>WhatsApp</th></tr></thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className={a.whatsappSentAt ? 'row-done' : ''}>
                      <td><b>{fmtTime(a.start)}</b></td>
                      <td><span className="dot" style={{ background: a.doctor.color }} /> {doctorName(a.doctor)}</td>
                      <td>{a.patient.lastName} {a.patient.firstName}</td>
                      <td>{a.patient.phone || <span className="muted">—</span>}</td>
                      <td className="small">{a.service?.name || '—'}</td>
                      <td className="small">
                        {a.emailReminder ? <><span className="dot" style={{ background: NOTIFICATION_STATUS[a.emailReminder].color }} /> {a.emailReminder === 'INVIATO' ? 'inviata' : 'non inviata'}</>
                          : a.patient.email ? <span className="muted">in programma</span> : <span className="muted">nessuna email</span>}
                      </td>
                      <td>
                        {a.whatsappSentAt
                          ? <span className="wa-done">✓ inviato alle {fmtTime(a.whatsappSentAt)} <WhatsAppButton appointmentId={a.id} link={a.whatsapp} kind="PROMEMORIA" label="di nuovo" optIn={a.patient.whatsappOptIn} /></span>
                          : <WhatsAppButton appointmentId={a.id} link={a.whatsapp} kind="PROMEMORIA" label="Invia promemoria" optIn={a.patient.whatsappOptIn} onLogged={() => markSent(a.id)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Scelta, per questo PC, di dove aprire i messaggi: app WhatsApp Business, WhatsApp Web o wa.me */
function WaModePicker() {
  const [mode, setMode] = useState(getWaMode());
  return (
    <div className="row small wa-mode">
      <span>Apri i messaggi con:</span>
      <select value={mode} onChange={(e) => { setWaMode(e.target.value); setMode(e.target.value); }} style={{ width: 'auto' }}>
        {Object.entries(WA_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <span className="muted">(impostazione di questo PC)</span>
    </div>
  );
}
