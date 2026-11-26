import DoctorSelect from '../components/DoctorSelect';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { DateTime, fmtDateTime, fmtTime } from '../lib/time';
import { doctorName, groupByCategory } from '../lib/constants';
import Modal from '../components/Modal';
import WhatsAppButton from '../components/WhatsAppButton';

const TABS = [
  { key: 'NUOVA', label: 'In attesa' },
  { key: 'CONFERMATA', label: 'Confermate' },
  { key: 'RIFIUTATA', label: 'Rifiutate' },
];

/** Richieste di prenotazione arrivate dal sito, da confermare o rifiutare */
export default function Requests() {
  const [tab, setTab] = useState('NUOVA');
  const { data: items, reload } = useApi('/requests', { status: tab });
  const { data: doctors } = useApi('/doctors');
  const [confirming, setConfirming] = useState(null);
  const [msg, setMsg] = useState(null);

  const refresh = () => { reload(); window.dispatchEvent(new Event('hospardo:requests')); };

  async function reject(r) {
    const reason = window.prompt(
      `Rifiutare la richiesta di ${r.lastName} ${r.firstName}?\n\nPuoi scrivere un motivo, che verrà inviato al paziente via email (facoltativo):`,
      '',
    );
    if (reason === null) return;
    try {
      const res = await api(`/requests/${r.id}/reject`, { method: 'POST', body: { reason: reason || undefined } });
      setMsg({ ok: true, text: `Richiesta rifiutata${res.email === 'INVIATO' ? ' e paziente avvisato via email' : ''}.` });
      refresh();
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Richieste di prenotazione</h1>
          <p className="muted small" style={{ marginTop: -8 }}>
            Arrivano dal sito. Diventano appuntamenti solo quando le confermi: il paziente riceve la conferma via email e puoi mandargliela anche su WhatsApp.
          </p>
        </div>
        <div className="segmented">
          {TABS.map((t) => <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
      </div>
      {msg && <div className={msg.ok ? 'notice' : 'alert'} style={{ marginBottom: 12 }}>{msg.text}</div>}
      {!items ? <p className="muted">Caricamento…</p> : items.length === 0 ? (
        <div className="empty">{tab === 'NUOVA' ? 'Nessuna richiesta in attesa.' : 'Nessuna richiesta.'}</div>
      ) : (
        <div className="request-list">
          {items.map((r) => (
            <div key={r.id} className="card request-card" style={{ borderLeftColor: r.doctor.color }}>
              <div className="request-main">
                <div className="request-who">
                  <b>{r.lastName} {r.firstName}</b>
                  <span className="muted small">ricevuta {fmtDateTime(r.createdAt)}</span>
                </div>
                <div className="small">
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a> · <a href={`mailto:${r.email}`}>{r.email}</a>
                  {!r.whatsappOptIn && <span className="muted"> · non vuole WhatsApp</span>}
                </div>
                <div><b>{r.service.name}</b> con {doctorName(r.doctor)}</div>
                <div>
                  {r.preferredStart ? (
                    <>
                      Orario richiesto: <b>{DateTime.fromISO(r.preferredStart).toFormat("cccc d LLLL 'alle' HH:mm")}</b>
                      {tab === 'NUOVA' && (r.slotFree
                        ? <span className="badge" style={{ background: '#16a34a', marginLeft: 8 }}>ancora libero</span>
                        : <span className="badge" style={{ background: '#dc2626', marginLeft: 8 }}>non più libero</span>)}
                    </>
                  ) : <>Nessun orario preciso{r.preferences ? <> – preferenza: <b>{r.preferences}</b></> : ''}</>}
                </div>
                {r.notes && <div className="small muted">Note del paziente: {r.notes}</div>}
                {r.status === 'CONFERMATA' && r.appointment && (
                  <div className="small">Confermata per {DateTime.fromISO(r.appointment.start).toFormat("ccc d LLL 'alle' HH:mm")}</div>
                )}
                {r.status === 'RIFIUTATA' && <div className="small muted">Rifiutata{r.rejectReason ? `: ${r.rejectReason}` : ''}</div>}
              </div>
              {tab === 'NUOVA' && (
                <div className="request-actions">
                  <button className="btn btn-primary" disabled={!doctors} onClick={() => setConfirming(r)}>Conferma…</button>
                  <button className="btn btn-danger" onClick={() => reject(r)}>Rifiuta</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {confirming && (
        <ConfirmModal request={confirming} doctors={doctors || []} onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); refresh(); }} />
      )}
    </div>
  );
}

/** Conferma della richiesta: medico, prestazione, giorno e ora modificabili */
function ConfirmModal({ request, doctors, onClose, onDone }) {
  const start0 = request.preferredStart ? DateTime.fromISO(request.preferredStart) : null;
  const [doctorId, setDoctorId] = useState(request.doctorId);
  const [serviceId, setServiceId] = useState(request.serviceId);
  const [date, setDate] = useState(start0 ? start0.toISODate() : DateTime.now().plus({ days: 1 }).toISODate());
  const [time, setTime] = useState(start0 ? start0.toFormat('HH:mm') : '');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const doctor = doctors.find((d) => d.id === Number(doctorId));
  const doctorServices = useMemo(() => (doctor?.services || [])
    .filter((l) => l.active || l.serviceId === Number(serviceId))
    .map((l) => ({ id: l.serviceId, name: l.name, category: l.category, durationMin: l.durationMin ?? l.defaultDurationMin })), [doctor, serviceId]);
  const svc = doctorServices.find((s) => s.id === Number(serviceId));
  const duration = svc?.durationMin || 30;

  useEffect(() => {
    if (!doctorId || !date) return;
    api('/appointments/availability', { query: { doctorId, date, durationMin: duration } }).then(setSlots).catch(() => setSlots([]));
  }, [doctorId, date, duration]);

  async function confirm(force = false) {
    if (!time) { setErr('Scegli l\'orario'); return; }
    if (!svc) { setErr('Scegli una prestazione erogata da questo medico'); return; }
    setBusy(true);
    setErr(null);
    const start = DateTime.fromISO(`${date}T${time}`);
    try {
      const r = await api(`/requests/${request.id}/confirm`, {
        method: 'POST',
        body: { doctorId: Number(doctorId), serviceId: Number(serviceId), start: start.toUTC().toISO(), end: start.plus({ minutes: duration }).toUTC().toISO(), notes: notes || null, force },
      });
      setResult(r);
    } catch (e) {
      if ((e.status === 422 || e.status === 409) && !force && e.message !== 'Questa richiesta è già stata gestita'
        && window.confirm(`${e.message}.\n\nVuoi confermare comunque l'appuntamento a quell'orario?`)) {
        setBusy(false);
        return confirm(true);
      }
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  }

  if (result) {
    const a = result.appointment;
    return (
      <Modal title="Prenotazione confermata" onClose={onDone}
        footer={<button className="btn btn-primary" onClick={onDone}>Fatto</button>}>
        <div className="form">
          <p><b>{a.patient.lastName} {a.patient.firstName}</b> – {a.service?.name} con {doctorName(a.doctor)}</p>
          <p className="big-date">{DateTime.fromISO(a.start).toFormat("cccc d LLLL yyyy 'alle' HH:mm")}</p>
          <p>
            Email di conferma: {result.email === 'INVIATO' ? <b>inviata</b>
              : result.email === 'SIMULATO' ? <b>non inviata (email non configurata sul server)</b>
                : result.email === 'ERRORE' ? <b>errore di invio</b> : <b>non inviata (nessun indirizzo o consenso)</b>}
          </p>
          <div className="row">
            <span>WhatsApp:</span>
            <WhatsAppButton appointmentId={a.id} link={result.whatsapp} kind="CONFERMA" label="Invia conferma su WhatsApp" optIn={a.patient.whatsappOptIn} small={false} />
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Conferma la richiesta di ${request.lastName} ${request.firstName}`} onClose={onClose} wide
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => confirm()}>{busy ? 'Conferma…' : 'Conferma e avvisa il paziente'}</button>
      </>}>
      <div className="form">
        <div className="muted small">
          {request.preferredStart
            ? <>Il paziente ha chiesto <b>{DateTime.fromISO(request.preferredStart).toFormat("cccc d LLLL 'alle' HH:mm")}</b>.</>
            : <>Nessun orario preciso{request.preferences ? <> – preferenza: <b>{request.preferences}</b></> : ''}. Scegli tu giorno e ora.</>}
          {' '}Puoi cambiare medico, prestazione, giorno e ora prima di confermare.
        </div>
        <div className="grid2">
          <label>Medico
            <DoctorSelect value={doctorId} onChange={setDoctorId} doctors={doctors.filter((d) => (d.active && !d.archivedAt) || d.id === request.doctorId)} />
          </label>
          <label>Prestazione
            <select value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
              {!svc && <option value={serviceId}>— scegli —</option>}
              {Object.entries(groupByCategory(doctorServices)).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>{list.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}</optgroup>
              ))}
            </select>
          </label>
          <label>Giorno<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Ora<input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <div>
          <div className="muted small">Orari liberi il {DateTime.fromISO(date).toFormat('cccc d LLLL')} ({duration} min):</div>
          <div className="slot-chips">
            {slots.length === 0 && <span className="muted small">nessuno</span>}
            {slots.map((s) => {
              const t = fmtTime(s.start);
              return <button type="button" key={s.start} className={`chip ${t === time ? 'chip-on' : ''}`} onClick={() => setTime(t)}>{t}</button>;
            })}
          </div>
        </div>
        <label>Note per lo studio (facoltative)<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {err && <div className="alert">{err}</div>}
      </div>
    </Modal>
  );
}
