import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { DateTime, WEEKDAYS, fmtDateTime } from '../lib/time';
import { doctorName } from '../lib/constants';

const emptyDoctor = { title: 'Dott.', firstName: '', lastName: '', specialty: '', email: '', phone: '', color: '#2563eb', bio: '', active: true, bookableOnline: true, slotStepMin: 15, serviceIds: [] };

export default function DoctorDetail() {
  const { id } = useParams();
  const isNew = id === 'nuovo';
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: services } = useApi('/services');
  const { data: doctor, reload } = useApi(isNew ? null : `/doctors/${id}`);
  const isAdmin = user.role === 'ADMIN';
  const canManage = isAdmin || user.role === 'SEGRETERIA' || user.doctorId === Number(id);

  if (!isNew && !doctor) return <div className="page"><p className="muted">Caricamento…</p></div>;

  return (
    <div className="page">
      <Link to="/medici" className="small">← Medici</Link>
      <h1>{isNew ? 'Nuovo medico' : doctorName(doctor)}</h1>
      <DoctorForm key={doctor?.id || 'new'} initial={doctor || emptyDoctor} services={services || []} readOnly={!isAdmin}
        onSaved={(d) => (isNew ? nav(`/medici/${d.id}`, { replace: true }) : reload())} />
      {!isNew && <>
        <HoursEditor key={`h${doctor.id}`} doctor={doctor} readOnly={!canManage} onSaved={reload} />
        <TimeOffEditor doctorId={doctor.id} readOnly={!canManage} />
      </>}
    </div>
  );
}

function DoctorForm({ initial, services, readOnly, onSaved }) {
  const [f, setF] = useState(() => ({ ...emptyDoctor, ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])) }));
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleService = (sid) => setF({ ...f, serviceIds: f.serviceIds.includes(sid) ? f.serviceIds.filter((x) => x !== sid) : [...f.serviceIds, sid] });

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const body = {
      title: f.title, firstName: f.firstName, lastName: f.lastName, specialty: f.specialty || null, email: f.email || null,
      phone: f.phone || null, color: f.color, bio: f.bio || null, active: f.active, bookableOnline: f.bookableOnline,
      slotStepMin: Number(f.slotStepMin), serviceIds: f.serviceIds,
    };
    try {
      const saved = initial.id ? await api(`/doctors/${initial.id}`, { method: 'PUT', body }) : await api('/doctors', { method: 'POST', body });
      setMsg({ ok: true, text: 'Dati salvati' });
      onSaved(saved);
    } catch (e2) { setMsg({ ok: false, text: errorMessage(e2) }); }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Dati del medico</h2>
      <fieldset disabled={readOnly}>
        <div className="grid3">
          <label>Titolo<select value={f.title} onChange={set('title')}><option>Dott.</option><option>Dott.ssa</option><option>Prof.</option><option>Prof.ssa</option><option value="">—</option></select></label>
          <label>Nome *<input required value={f.firstName} onChange={set('firstName')} /></label>
          <label>Cognome *<input required value={f.lastName} onChange={set('lastName')} /></label>
          <label>Specializzazione<input value={f.specialty} onChange={set('specialty')} /></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
          <label>Telefono<input value={f.phone} onChange={set('phone')} /></label>
          <label>Colore in agenda<input type="color" value={f.color} onChange={set('color')} /></label>
          <label>Intervallo slot (min)
            <select value={f.slotStepMin} onChange={set('slotStepMin')}>{[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        </div>
        <label>Presentazione (visibile nella pagina di prenotazione)<textarea rows={2} value={f.bio} onChange={set('bio')} /></label>
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Attivo</label>
          <label className="check"><input type="checkbox" checked={f.bookableOnline} onChange={set('bookableOnline')} /> Prenotabile online</label>
        </div>
        <div>
          <div className="label">Prestazioni erogate</div>
          <div className="slot-chips">
            {services.map((s) => (
              <button type="button" key={s.id} className={`chip ${f.serviceIds.includes(s.id) ? 'chip-on' : ''}`} onClick={() => toggleService(s.id)}>{s.name}</button>
            ))}
            {services.length === 0 && <span className="muted small">Nessuna prestazione definita</span>}
          </div>
        </div>
      </fieldset>
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
      {!readOnly && <div className="row-end"><button className="btn btn-primary">Salva</button></div>}
    </form>
  );
}

function HoursEditor({ doctor, readOnly, onSaved }) {
  const [rows, setRows] = useState(() => doctor.workingHours.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })));
  const [msg, setMsg] = useState(null);

  const add = (weekday) => {
    const last = rows.filter((r) => r.weekday === weekday).at(-1);
    setRows([...rows, last ? { weekday, startTime: last.endTime < '14:00' ? '14:30' : last.endTime, endTime: '18:30' } : { weekday, startTime: '09:00', endTime: '13:00' }]);
  };
  const update = (idx, k, v) => setRows(rows.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  const remove = (idx) => setRows(rows.filter((_, i) => i !== idx));
  const copyMonday = () => {
    const mon = rows.filter((r) => r.weekday === 1);
    setRows([...mon, ...[2, 3, 4, 5].flatMap((weekday) => mon.map((r) => ({ ...r, weekday }))), ...rows.filter((r) => r.weekday >= 6)]);
  };

  async function save() {
    setMsg(null);
    try {
      await api(`/doctors/${doctor.id}/hours`, { method: 'PUT', body: rows });
      setMsg({ ok: true, text: 'Orari salvati' });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
  }

  return (
    <div className="card form">
      <div className="page-head">
        <h2>Orari settimanali di disponibilità</h2>
        {!readOnly && <button className="btn btn-sm" onClick={copyMonday}>Copia lunedì su lun–ven</button>}
      </div>
      <div className="hours-grid">
        {WEEKDAYS.map((name, i) => {
          const wd = i + 1;
          return (
            <div key={wd} className="hours-day">
              <div className="hours-day-name">{name}</div>
              <div className="hours-day-blocks">
                {rows.map((r, idx) => r.weekday !== wd ? null : (
                  <div key={idx} className="hours-block">
                    <input type="time" value={r.startTime} disabled={readOnly} onChange={(e) => update(idx, 'startTime', e.target.value)} />
                    <span>–</span>
                    <input type="time" value={r.endTime} disabled={readOnly} onChange={(e) => update(idx, 'endTime', e.target.value)} />
                    {!readOnly && <button className="icon-btn" onClick={() => remove(idx)} aria-label="Rimuovi fascia">×</button>}
                  </div>
                ))}
                {!rows.some((r) => r.weekday === wd) && <span className="muted small">Non disponibile</span>}
                {!readOnly && <button className="btn btn-ghost btn-sm" onClick={() => add(wd)}>+ fascia</button>}
              </div>
            </div>
          );
        })}
      </div>
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
      {!readOnly && <div className="row-end"><button className="btn btn-primary" onClick={save}>Salva orari</button></div>}
    </div>
  );
}

function TimeOffEditor({ doctorId, readOnly }) {
  const [items, setItems] = useState(null);
  const today = DateTime.now().toISODate();
  const [f, setF] = useState({ startDate: today, startTime: '00:00', endDate: today, endTime: '23:59', reason: '' });
  const [msg, setMsg] = useState(null);
  const load = () => api(`/doctors/${doctorId}/time-off`).then(setItems);
  useEffect(() => { load(); }, [doctorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api(`/doctors/${doctorId}/time-off`, {
        method: 'POST',
        body: {
          start: DateTime.fromISO(`${f.startDate}T${f.startTime}`).toUTC().toISO(),
          end: DateTime.fromISO(`${f.endDate}T${f.endTime}`).toUTC().toISO(),
          reason: f.reason || null,
        },
      });
      setMsg(r.conflictingAppointments
        ? { ok: false, text: `Assenza salvata. Attenzione: ci sono ${r.conflictingAppointments} appuntamenti già fissati nel periodo, da spostare o annullare.` }
        : { ok: true, text: 'Assenza salvata' });
      load();
    } catch (e2) { setMsg({ ok: false, text: errorMessage(e2) }); }
  }
  async function remove(tid) {
    if (!window.confirm('Eliminare questa assenza?')) return;
    await api(`/doctors/${doctorId}/time-off/${tid}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="card form">
      <h2>Ferie e assenze</h2>
      {items && items.length === 0 && <p className="muted small">Nessuna assenza programmata.</p>}
      {items && items.length > 0 && (
        <table className="table">
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>{fmtDateTime(t.start)} → {fmtDateTime(t.end)}</td>
                <td>{t.reason}</td>
                <td className="right">{!readOnly && <button className="btn btn-ghost btn-sm" onClick={() => remove(t.id)}>Elimina</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!readOnly && (
        <form onSubmit={add} className="timeoff-form">
          <label>Dal<input type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} /></label>
          <label>ore<input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
          <label>Al<input type="date" required value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
          <label>ore<input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
          <label className="grow">Motivo<input placeholder="Ferie, congresso…" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
          <button className="btn">Aggiungi</button>
        </form>
      )}
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
    </div>
  );
}
