import { Fragment, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { DateTime, fmtTime } from '../lib/time';
import { doctorName, NOTIFICATION_STATUS } from '../lib/constants';
import WhatsAppButton from '../components/WhatsAppButton';
import { useAuth } from '../lib/auth';
import { waHref } from '../lib/whatsapp';
import { WA_MODES, getWaMode, setWaMode } from '../lib/whatsapp';

/**
 * Promemoria WhatsApp con un clic: i pazienti del giorno scelto (default il prossimo giorno lavorativo),
 * ognuno con il pulsante che apre WhatsApp con il messaggio già scritto.
 */
export default function Reminders() {
  const { user } = useAuth();
  const canDoctors = ['SUPERADMIN', 'ADMIN', 'SEGRETERIA'].includes(user.role);
  const [tab, setTab] = useState('pazienti');
  if (canDoctors && tab === 'medici') return <DoctorReminders onTab={setTab} />;
  return <PatientReminders onTab={canDoctors ? setTab : null} />;
}

function ReminderTabs({ tab, onTab }) {
  if (!onTab) return null;
  return (
    <div className="tabs">
      <button className={tab === 'pazienti' ? 'on' : ''} onClick={() => onTab('pazienti')}>Pazienti</button>
      <button className={tab === 'medici' ? 'on' : ''} onClick={() => onTab('medici')}>Medici</button>
    </div>
  );
}

function PatientReminders({ onTab }) {
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
      <ReminderTabs tab="pazienti" onTab={onTab} />
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

/**
 * Promemoria ai medici: per ognuno la prima data utile con appuntamenti (da domani in poi),
 * con invio dell'elenco via email o WhatsApp. Es. il lunedì si avvisa il medico che ha visite il mercoledì.
 */
function DoctorReminders({ onTab }) {
  const [from, setFrom] = useState(DateTime.now().plus({ days: 1 }).toISODate());
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({}); // doctorId → elenco appuntamenti
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api('/doctor-reminders', { query: { from } }).then(setData).catch((e) => setMsg({ ok: false, text: errorMessage(e) }));
  useEffect(() => { load(); }, [from]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(r) {
    if (open[r.doctor.id]) { setOpen({ ...open, [r.doctor.id]: null }); return; }
    const list = await api(`/doctor-reminders/${r.doctor.id}/${r.date}`);
    setOpen({ ...open, [r.doctor.id]: list });
  }
  async function email(r) {
    setMsg(null); setBusy(r.doctor.id);
    try {
      const rec = await api(`/doctor-reminders/${r.doctor.id}/email`, { method: 'POST', body: { date: r.date } });
      setMsg({ ok: true, text: rec.status === 'SIMULATO' ? `Email non configurata: messaggio per ${doctorName(r.doctor)} solo registrato` : `Email inviata a ${doctorName(r.doctor)} (${r.doctor.email})` });
      load();
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); load(); } finally { setBusy(null); }
  }
  const logWhatsapp = (r) => api(`/doctor-reminders/${r.doctor.id}/whatsapp`, { method: 'POST', body: { date: r.date } }).then(load).catch(() => {});

  const withAppts = data?.rows.filter((r) => r.date) || [];
  const without = data?.rows.filter((r) => !r.date) || [];
  const day = (iso) => DateTime.fromISO(iso).toFormat('cccc d LLLL');
  const sentAt = (rec) => rec && `${rec.status === 'SIMULATO' ? 'registrata' : 'inviato'} il ${DateTime.fromISO(rec.createdAt).toFormat("dd/LL 'alle' HH:mm")}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Promemoria ai medici</h1>
          <p className="muted small" style={{ marginTop: -8 }}>Per ogni medico la prima data utile con appuntamenti a partire dal giorno scelto: mandagli l'elenco via email o WhatsApp.</p>
        </div>
        <label className="inline small">Dal <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
      </div>
      <ReminderTabs tab="medici" onTab={onTab} />
      <WaModePicker />
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
      {data && !data.emailEnabled && <div className="notice">Email non configurata sul server: i promemoria via email vengono solo registrati.</div>}
      {!data ? <p className="muted">Caricamento…</p> : withAppts.length === 0 ? <div className="empty">Nessun medico ha appuntamenti nei prossimi 60 giorni.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Medico</th><th>Prima data utile</th><th>Appuntamenti</th><th>Email</th><th>WhatsApp</th></tr></thead>
            <tbody>
              {withAppts.map((r) => (
                <Fragment key={r.doctor.id}>
                  <tr>
                    <td><span className="dot" style={{ background: r.doctor.color }} /> <b>{doctorName(r.doctor)}</b><div className="muted small">{r.doctor.specialty}</div></td>
                    <td><b>{day(r.date)}</b><div className="muted small">dalle {r.first} alle {r.last}</div></td>
                    <td><button className="link" onClick={() => toggle(r)}>{r.count} {r.count === 1 ? 'appuntamento' : 'appuntamenti'} {open[r.doctor.id] ? '▾' : '▸'}</button></td>
                    <td>
                      {r.doctor.email
                        ? <button className="btn btn-sm" disabled={busy === r.doctor.id} onClick={() => email(r)}>{r.emailSent ? 'Reinvia email' : 'Invia email'}</button>
                        : <span className="muted small">nessuna email</span>}
                      {r.emailSent && <div className="muted small">✓ {sentAt(r.emailSent)}</div>}
                      {r.emailError && <div className="small" style={{ color: 'var(--danger)' }}>errore: {r.emailError}</div>}
                    </td>
                    <td>
                      {r.whatsapp
                        ? <a className="btn btn-wa btn-sm" href={waHref(r.whatsapp.url)} target={waHref(r.whatsapp.url).startsWith('whatsapp:') ? undefined : '_blank'} rel="noopener noreferrer" onClick={() => logWhatsapp(r)}>WhatsApp</a>
                        : <span className="muted small">nessun cellulare</span>}
                      {r.whatsappSent && <div className="muted small">✓ aperto il {DateTime.fromISO(r.whatsappSent.createdAt).toFormat("dd/LL 'alle' HH:mm")}</div>}
                    </td>
                  </tr>
                  {open[r.doctor.id] && (
                    <tr><td colSpan={5} className="subrow">
                      <table className="table compact"><tbody>
                        {open[r.doctor.id].map((a) => <tr key={a.id}><td className="nowrap"><b>{a.time}</b>–{a.end}</td><td>{a.patient}</td><td>{a.service}</td><td className="muted small">{a.notes}</td></tr>)}
                      </tbody></table>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {without.length > 0 && <p className="muted small">Senza appuntamenti nei prossimi 60 giorni: {without.map((r) => doctorName(r.doctor)).join(', ')}.</p>}
      <p className="muted small">Su WhatsApp, per riservatezza, i pazienti sono indicati con cognome e iniziale del nome; nell'email con nome completo e note. L'email e il cellulare del medico si inseriscono nella sua scheda.</p>
    </div>
  );
}
