import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { DateTime, WEEKDAYS, fmtDateTime, euro } from '../lib/time';
import { doctorName, groupByCategory, isAdmin as isAdminUser } from '../lib/constants';

const emptyDoctor = { title: 'Dott.', firstName: '', lastName: '', specialty: '', email: '', phone: '', color: '#2563eb', bio: '', active: true, bookableOnline: true, slotStepMin: 15 };

export default function DoctorDetail() {
  const { id } = useParams();
  const isNew = id === 'nuovo';
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: services } = useApi('/services');
  const { data: doctor, reload } = useApi(isNew ? null : `/doctors/${id}`);
  const isAdmin = isAdminUser(user);
  const canManage = isAdmin || user.role === 'SEGRETERIA' || user.doctorId === Number(id);

  if (!isNew && !doctor) return <div className="page"><p className="muted">Caricamento…</p></div>;

  return (
    <div className="page">
      <Link to="/medici" className="small">← Medici</Link>
      <h1>{isNew ? 'Nuovo medico' : doctorName(doctor)}</h1>
      {doctor?.archivedAt && (
        <div className="alert">
          Medico archiviato il {fmtDateTime(doctor.archivedAt)}: non compare più in agenda né nelle prenotazioni online. Lo storico degli appuntamenti è conservato.
        </div>
      )}
      <DoctorForm key={doctor?.id || 'new'} initial={doctor || emptyDoctor} readOnly={!isAdmin}
        onSaved={(d) => (isNew ? nav(`/medici/${d.id}`, { replace: true }) : reload())} />
      {!isNew && <>
        <DoctorServices key={`s${doctor.id}-${doctor.services.length}`} doctor={doctor} services={services || []} readOnly={!isAdmin} onSaved={reload} />
        <HoursEditor key={`h${doctor.id}`} doctor={doctor} readOnly={!canManage} onSaved={reload} />
        <TimeOffEditor doctorId={doctor.id} readOnly={!canManage} />
        {isAdmin && <DoctorStatus doctor={doctor} onChanged={reload} onDeleted={() => nav('/medici', { replace: true })} />}
      </>}
    </div>
  );
}

function DoctorForm({ initial, readOnly, onSaved }) {
  const [f, setF] = useState(() => ({ ...emptyDoctor, ...Object.fromEntries(Object.entries(initial).filter(([k]) => k in emptyDoctor).map(([k, v]) => [k, v ?? ''])) }));
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const body = {
      title: f.title, firstName: f.firstName, lastName: f.lastName, specialty: f.specialty || null, email: f.email || null,
      phone: f.phone || null, color: f.color, bio: f.bio || null, active: f.active, bookableOnline: f.bookableOnline,
      slotStepMin: Number(f.slotStepMin),
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
          <label>Nome<input value={f.firstName} onChange={set('firstName')} /></label>
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

/** Tabella delle prestazioni erogate dal medico, con durata/prezzo personalizzabili */
function DoctorServices({ doctor, services, readOnly, onSaved }) {
  const [rows, setRows] = useState(() => doctor.services.map((s) => ({
    serviceId: s.serviceId,
    durationMin: s.durationMin ?? '',
    price: s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '',
    bookableOnline: s.bookableOnline,
  })));
  const [adding, setAdding] = useState('');
  const [msg, setMsg] = useState(null);
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));
  const available = services.filter((s) => s.active && !rows.some((r) => r.serviceId === s.id));
  const groups = groupByCategory(available);

  const update = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = (id) => {
    if (!id) return;
    setRows([...rows, { serviceId: Number(id), durationMin: '', price: '', bookableOnline: true }]);
    setAdding('');
  };
  const addCategory = (cat) => setRows([...rows, ...groups[cat].map((s) => ({ serviceId: s.id, durationMin: '', price: '', bookableOnline: true }))]);

  async function save() {
    setMsg(null);
    try {
      await api(`/doctors/${doctor.id}/services`, {
        method: 'PUT',
        body: rows.map((r) => ({
          serviceId: r.serviceId,
          durationMin: r.durationMin === '' ? null : Number(r.durationMin),
          priceCents: r.price === '' ? null : Math.round(Number(String(r.price).replace(',', '.')) * 100),
          bookableOnline: r.bookableOnline,
        })),
      });
      setMsg({ ok: true, text: 'Prestazioni salvate' });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
  }

  const sorted = rows.map((r, i) => ({ r, i, s: byId[r.serviceId] })).filter((x) => x.s)
    .sort((a, b) => (a.s.category || '').localeCompare(b.s.category || '') || a.s.name.localeCompare(b.s.name));

  return (
    <div className="card form">
      <h2>Prestazioni erogate</h2>
      <p className="muted small">Lascia vuoti durata e prezzo per usare quelli standard della prestazione.</p>
      {rows.length === 0 ? <div className="empty">Nessuna prestazione associata a questo medico.</div> : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr><th>Prestazione</th><th>Durata (min)</th><th>Prezzo (€)</th><th>Online</th><th /></tr></thead>
            <tbody>
              {sorted.map(({ r, i, s }) => (
                <tr key={r.serviceId} className={s.active ? '' : 'inactive'}>
                  <td><b>{s.name}</b><div className="muted small">{s.category || '—'}{!s.active && ' · disattivata'}</div></td>
                  <td><input type="number" min={5} step={5} className="input-sm" disabled={readOnly} placeholder={String(s.durationMin)} value={r.durationMin} onChange={(e) => update(i, 'durationMin', e.target.value)} /></td>
                  <td><input inputMode="decimal" className="input-sm" disabled={readOnly} placeholder={s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '—'} value={r.price} onChange={(e) => update(i, 'price', e.target.value)} /></td>
                  <td>
                    <input type="checkbox" disabled={readOnly || !s.bookableOnline} checked={r.bookableOnline && s.bookableOnline} onChange={(e) => update(i, 'bookableOnline', e.target.checked)}
                      title={s.bookableOnline ? 'Prenotabile online con questo medico' : 'Prestazione non prenotabile online (impostazione generale)'} />
                  </td>
                  <td className="right">{!readOnly && <button className="icon-btn" aria-label={`Rimuovi ${s.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && (
        <div className="row">
          <select value={adding} onChange={(e) => add(e.target.value)} style={{ maxWidth: 360 }}>
            <option value="">+ Aggiungi prestazione…</option>
            {Object.entries(groups).map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min{s.priceCents != null ? `, ${euro(s.priceCents)}` : ''})</option>)}
              </optgroup>
            ))}
          </select>
          {Object.keys(groups).filter((c) => c !== 'Senza categoria').map((cat) => (
            <button key={cat} type="button" className="btn btn-ghost btn-sm" onClick={() => addCategory(cat)}>+ tutte {cat}</button>
          ))}
        </div>
      )}
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
      {!readOnly && <div className="row-end"><button className="btn btn-primary" onClick={save}>Salva prestazioni</button></div>}
    </div>
  );
}

/** Archiviazione / eliminazione del medico */
function DoctorStatus({ doctor, onChanged, onDeleted }) {
  const { user } = useAuth();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); } };

  const archive = () => run(async () => {
    let cancelFuture = false;
    if (doctor.futureAppointments > 0) {
      if (!window.confirm(`Il medico ha ancora ${doctor.futureAppointments} appuntamenti futuri.\n\nVuoi annullarli tutti? I pazienti riceveranno un avviso di annullamento.\n\n(Se preferisci spostarli su un altro medico, premi Annulla e modificali prima dall'agenda.)`)) return;
      cancelFuture = true;
    } else if (!window.confirm('Archiviare il medico? Non comparirà più in agenda né nelle prenotazioni online; lo storico resta consultabile.')) return;
    await api(`/doctors/${doctor.id}/archive`, { method: 'POST', body: { cancelFuture } });
    onChanged();
  });
  const restore = () => run(async () => { await api(`/doctors/${doctor.id}/restore`, { method: 'POST' }); onChanged(); });
  const remove = () => run(async () => {
    if (!window.confirm(`Eliminare definitivamente ${doctorName(doctor)}? L'operazione non si può annullare.`)) return;
    await api(`/doctors/${doctor.id}`, { method: 'DELETE' });
    onDeleted();
  });
  // solo amministratore principale: elimina anche tutti gli appuntamenti del medico (es. dati di prova)
  const removeWithHistory = () => run(async () => {
    const typed = window.prompt(
      `ATTENZIONE: verranno eliminati definitivamente ${doctorName(doctor)} e tutti i suoi ${doctor.appointmentsTotal} appuntamenti, `
      + `che spariranno anche dalle schede dei pazienti. L'operazione non si può annullare.\n\nPer confermare scrivi il cognome del medico: ${doctor.lastName}`,
    );
    if (typed === null) return;
    await api(`/doctors/${doctor.id}`, { method: 'DELETE', query: { withHistory: 1, confirm: typed } });
    onDeleted();
  });
  const inactive = !!doctor.archivedAt || !doctor.active;

  return (
    <div className="card form danger-zone">
      <h2>Medico non più in servizio</h2>
      {inactive ? (
        <>
          <p className="small">
            Il medico è {doctor.archivedAt ? 'archiviato' : 'disattivato'}. Puoi riattivarlo se torna a lavorare nella struttura
            (ricorda di controllare orari e prenotabilità online).
            {doctor.appointmentsTotal > 0 && <> Ha {doctor.appointmentsTotal} appuntamenti nello storico.</>}
          </p>
          {doctor.appointmentsTotal > 0 && user.role === 'SUPERADMIN' && (
            <p className="small muted">
              Se si tratta di un medico di prova puoi eliminarlo insieme ai suoi appuntamenti. Non farlo per un medico reale:
              lo storico delle visite dei pazienti andrebbe perso.
            </p>
          )}
          <div className="row-end">
            {doctor.appointmentsTotal === 0 && <button className="btn btn-danger" disabled={busy} onClick={remove}>Elimina medico</button>}
            {doctor.appointmentsTotal > 0 && user.role === 'SUPERADMIN' && (
              <button className="btn btn-danger" disabled={busy} onClick={removeWithHistory}>Elimina con lo storico</button>
            )}
            <button className="btn" disabled={busy} onClick={restore}>Riattiva medico</button>
          </div>
        </>
      ) : doctor.appointmentsTotal > 0 ? (
        <>
          <p className="small">
            Il medico ha {doctor.appointmentsTotal} appuntamenti nello storico{doctor.futureAppointments > 0 && <>, di cui <b>{doctor.futureAppointments} futuri</b></>}:
            per conservare la cartella dei pazienti non può essere eliminato, ma può essere <b>archiviato</b>.
            Sparirà dall'agenda e dalle prenotazioni online e il suo eventuale accesso verrà disattivato.
          </p>
          <div className="row-end"><button className="btn btn-danger" disabled={busy} onClick={archive}>Archivia medico</button></div>
        </>
      ) : (
        <>
          <p className="small">Il medico non ha appuntamenti: puoi eliminarlo definitivamente.</p>
          <div className="row-end"><button className="btn btn-danger" disabled={busy} onClick={remove}>Elimina medico</button></div>
        </>
      )}
      {msg && <div className="alert">{msg}</div>}
    </div>
  );
}
