import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import PatientPicker from './PatientPicker';
import { api, errorMessage } from '../lib/api';
import { DateTime, fmtTime, fmtDateTime } from '../lib/time';
import { STATUS, doctorName, groupByCategory, NOTIFICATION_KIND, NOTIFICATION_STATUS } from '../lib/constants';
import { useAuth } from '../lib/auth';

/**
 * Creazione / modifica di un appuntamento.
 * - appointment: appuntamento esistente (modifica)
 * - draft: { doctorId, start } per un nuovo appuntamento
 */
export default function AppointmentModal({ appointment, draft, doctors, services, onClose, onSaved }) {
  const { user } = useAuth();
  const isNew = !appointment;
  const src = appointment || draft || {};
  const startDt = src.start ? DateTime.fromISO(typeof src.start === 'string' ? src.start : src.start.toISOString()) : DateTime.now().startOf('hour').plus({ hours: 1 });

  const [patient, setPatient] = useState(appointment?.patient || draft?.patient || null);
  const [doctorId, setDoctorId] = useState(src.doctorId || (user.doctorId ?? doctors[0]?.id));
  const [serviceId, setServiceId] = useState(appointment?.serviceId ?? '');
  const [date, setDate] = useState(startDt.toISODate());
  const [time, setTime] = useState(startDt.toFormat('HH:mm'));
  const [duration, setDuration] = useState(appointment ? Math.round((new Date(appointment.end) - new Date(appointment.start)) / 60000) : 30);
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [status, setStatus] = useState(appointment?.status || 'PRENOTATO');
  const [sendEmail, setSendEmail] = useState(true);
  const [slots, setSlots] = useState([]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const doctor = doctors.find((d) => d.id === Number(doctorId));
  // Prestazioni del medico con la durata personalizzata; se il medico non ne ha, tutte quelle attive
  const doctorServices = useMemo(() => {
    const links = doctor?.services || [];
    if (!links.length) return services.filter((s) => s.active);
    return links
      .filter((l) => l.active || l.serviceId === Number(serviceId))
      .map((l) => ({ id: l.serviceId, name: l.name, category: l.category, durationMin: l.durationMin ?? l.defaultDurationMin }));
  }, [services, doctor, serviceId]);
  const serviceGroups = groupByCategory(doctorServices);

  // al cambio prestazione aggiorna la durata
  const onService = (id) => {
    setServiceId(id);
    const s = doctorServices.find((x) => x.id === Number(id));
    if (s) setDuration(s.durationMin);
  };

  useEffect(() => {
    if (!doctorId || !date) return;
    api('/appointments/availability', { query: { doctorId, date, durationMin: duration } })
      .then(setSlots).catch(() => setSlots([]));
  }, [doctorId, date, duration]);

  async function save(force = false, extra = {}) {
    if (!patient && isNew) { setErr('Seleziona o crea un paziente'); return; }
    setSaving(true);
    setErr(null);
    const start = DateTime.fromISO(`${date}T${time}`).toUTC().toISO();
    const end = DateTime.fromISO(`${date}T${time}`).plus({ minutes: Number(duration) }).toUTC().toISO();
    try {
      const saved = isNew
        ? await api('/appointments', { method: 'POST', body: { doctorId: Number(doctorId), patientId: patient.id, serviceId: serviceId ? Number(serviceId) : null, start, end, notes: notes || null, sendEmail, force } })
        : await api(`/appointments/${appointment.id}`, { method: 'PUT', body: { doctorId: Number(doctorId), serviceId: serviceId ? Number(serviceId) : null, start, end, notes: notes || null, status, force, ...extra } });
      onSaved(saved);
    } catch (e) {
      if ((e.status === 422 || e.status === 409) && !force) {
        if (window.confirm(`${e.message}.\n\nVuoi inserire comunque l'appuntamento (es. urgenza / fuori orario)?`)) {
          setSaving(false);
          return save(true, extra);
        }
      }
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(s) {
    if (s === 'ANNULLATO' && !window.confirm('Annullare l\'appuntamento? Il paziente riceverà un\'email di avviso se ha un indirizzo email.')) return;
    setSaving(true);
    try {
      onSaved(await api(`/appointments/${appointment.id}`, { method: 'PUT', body: { status: s } }));
    } catch (e) {
      setErr(errorMessage(e));
      setSaving(false);
    }
  }

  const readOnly = user.role === 'MEDICO' && user.doctorId !== Number(doctorId);

  return (
    <Modal
      title={isNew ? 'Nuovo appuntamento' : 'Appuntamento'}
      onClose={onClose}
      wide
      footer={!readOnly && (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Chiudi</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => save()}>{saving ? 'Salvataggio…' : isNew ? 'Prenota' : 'Salva modifiche'}</button>
        </>
      )}
    >
      {!isNew && (
        <div className="appt-summary">
          <span className="badge" style={{ background: STATUS[appointment.status].color }}>{STATUS[appointment.status].label}</span>
          {appointment.source === 'ONLINE' && <span className="badge badge-outline">Prenotato online</span>}
          <span className="muted small">Inserito il {fmtDateTime(appointment.createdAt)}</span>
          {!readOnly && (
            <div className="quick-actions">
              {appointment.status !== 'CONFERMATO' && appointment.status !== 'COMPLETATO' && <button className="btn btn-sm" onClick={() => quickStatus('CONFERMATO')}>Conferma</button>}
              {appointment.status !== 'IN_ATTESA' && appointment.status !== 'COMPLETATO' && <button className="btn btn-sm" onClick={() => quickStatus('IN_ATTESA')}>Arrivato</button>}
              {appointment.status !== 'COMPLETATO' && <button className="btn btn-sm" onClick={() => quickStatus('COMPLETATO')}>Completato</button>}
              {appointment.status !== 'NON_PRESENTATO' && <button className="btn btn-sm" onClick={() => quickStatus('NON_PRESENTATO')}>Non presentato</button>}
              {appointment.status !== 'ANNULLATO' && <button className="btn btn-sm btn-danger" onClick={() => quickStatus('ANNULLATO')}>Annulla appuntamento</button>}
            </div>
          )}
        </div>
      )}

      <div className="form">
        <label>Paziente</label>
        {isNew ? <PatientPicker value={patient} onChange={setPatient} /> : (
          <div className="picked">
            <div>
              <b>{patient.lastName} {patient.firstName}</b>
              <div className="muted small">{[patient.phone, patient.email].filter(Boolean).join(' · ')}</div>
            </div>
            <Link className="btn btn-ghost btn-sm" to={`/pazienti/${patient.id}`}>Scheda paziente</Link>
          </div>
        )}

        <div className="grid2">
          <label>Medico
            <select value={doctorId} disabled={readOnly} onChange={(e) => setDoctorId(Number(e.target.value))}>
              {doctors.filter((d) => (d.active && !d.archivedAt) || d.id === Number(doctorId)).map((d) => <option key={d.id} value={d.id}>{doctorName(d)}</option>)}
            </select>
          </label>
          <label>Prestazione
            <select value={serviceId} disabled={readOnly} onChange={(e) => onService(e.target.value)}>
              <option value="">— Nessuna —</option>
              {Object.entries(serviceGroups).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>Data<input type="date" value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="grid2 tight">
            <label>Ora<input type="time" step={300} value={time} disabled={readOnly} onChange={(e) => setTime(e.target.value)} /></label>
            <label>Durata (min)<input type="number" min={5} step={5} value={duration} disabled={readOnly} onChange={(e) => setDuration(e.target.value)} /></label>
          </div>
        </div>

        {!readOnly && (
          <div>
            <div className="muted small">Orari liberi il {DateTime.fromISO(date).toFormat('cccc d LLLL')}:</div>
            <div className="slot-chips">
              {slots.length === 0 && <span className="muted small">nessuno slot libero</span>}
              {slots.map((s) => {
                const t = fmtTime(s.start);
                return <button type="button" key={s.start} className={`chip ${t === time ? 'chip-on' : ''}`} onClick={() => setTime(t)}>{t}</button>;
              })}
            </div>
          </div>
        )}

        {!isNew && !readOnly && (
          <label>Stato
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        )}
        <label>Note<textarea rows={3} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} /></label>
        {isNew && <label className="check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Invia conferma al paziente (email e WhatsApp)</label>}
        {!isNew && <NotificationLog appointment={appointment} readOnly={readOnly} />}
        {err && <div className="alert">{err}</div>}
      </div>
    </Modal>
  );
}

/** Storico dei messaggi inviati al paziente per questo appuntamento, con reinvio manuale */
function NotificationLog({ appointment, readOnly }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api(`/appointments/${appointment.id}`).then((a) => setItems(a.notifications || [])).catch(() => setItems([]));
  }, [appointment.id]);

  async function send(kind) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(`/appointments/${appointment.id}/notify`, { method: 'POST', body: { kind } });
      setItems(r.notifications);
      setMsg({ ok: true, text: `Messaggio di ${NOTIFICATION_KIND[kind].toLowerCase()} inviato` });
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); } finally { setBusy(false); }
  }

  const canSend = !readOnly && !['ANNULLATO', 'NON_PRESENTATO', 'COMPLETATO'].includes(appointment.status);

  return (
    <div className="notif-log">
      <div className="page-head">
        <div className="label">Messaggi al paziente</div>
        {canSend && (
          <div className="row">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send('CONFERMA')}>Reinvia conferma</button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send('PROMEMORIA')}>Invia promemoria ora</button>
          </div>
        )}
      </div>
      {!items ? <span className="muted small">Caricamento…</span> : items.length === 0 ? <span className="muted small">Nessun messaggio inviato.</span> : (
        <table className="table table-compact">
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td className="small">{fmtDateTime(n.createdAt)}</td>
                <td className="small">{n.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</td>
                <td className="small">{NOTIFICATION_KIND[n.kind]}</td>
                <td className="small">{n.recipient}</td>
                <td className="small" title={n.error || ''}>
                  <span className="dot" style={{ background: NOTIFICATION_STATUS[n.status].color }} /> {NOTIFICATION_STATUS[n.status].label}
                  {n.error && <div className="muted small">{n.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
    </div>
  );
}
