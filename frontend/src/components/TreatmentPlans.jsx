import { Fragment, useMemo, useState } from 'react';
import { api, download, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { DateTime, euro, fmtDate, fmtDateTime } from '../lib/time';
import { doctorName, isAdmin } from '../lib/constants';
import AppointmentModal from './AppointmentModal';
import { TOOTH_STATUS } from './DentalChart';

export const PLAN_STATUS = {
  PROPOSTO: { label: 'Proposto', color: '#d97706' },
  ACCETTATO: { label: 'Accettato', color: '#2563eb' },
  COMPLETATO: { label: 'Completato', color: '#16a34a' },
  RIFIUTATO: { label: 'Rifiutato', color: '#6b7280' },
};
const ITEM_STATUS = { DA_FARE: 'Da fare', PROGRAMMATO: 'Prenotato', ESEGUITO: 'Eseguito' };
const LOST = ['ANNULLATO', 'NON_PRESENTATO'];

/** "120,50" → 12050 */
const toCents = (v) => {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const toEuroInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export async function downloadPlanPdf(plan) {
  await download(`/plans/${plan.id}/pdf`, `preventivo-${plan.year}-${plan.number}.pdf`);
}

/** Piani di cura e preventivi del paziente (odontoiatri, segreteria, amministratori) */
export default function TreatmentPlans({ patient, user, onChanged }) {
  const { data: plans, reload } = useApi('/plans', { patientId: patient.id });
  const { data: doctors } = useApi('/doctors');
  const { data: services } = useApi('/services');
  const [editing, setEditing] = useState(null); // null | {} nuovo | piano
  const [msg, setMsg] = useState(null);

  const dentists = useMemo(() => (doctors || []).filter((d) => d.isDentist), [doctors]);
  const refresh = () => { reload(); onChanged?.(); };

  return (
    <section className="plans">
      <div className="page-head" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Piani di cura e preventivi</h2>
        {!editing && <button className="btn btn-primary" disabled={!dentists.length} onClick={() => setEditing({})}>+ Nuovo piano di cura</button>}
      </div>
      {doctors && !dentists.length && <div className="notice">Nessun medico è segnato come odontoiatra.</div>}
      {msg && <div className="alert">{msg}</div>}
      {editing && (
        <PlanForm key={editing.id || 'new'} plan={editing} patient={patient} dentists={dentists} user={user}
          onSaved={() => { setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />
      )}
      {!plans ? <p className="muted">Caricamento…</p> : plans.length === 0 ? (!editing && <div className="empty">Nessun piano di cura.</div>) : (
        plans.map((p) => (
          <PlanCard key={p.id} plan={p} user={user} doctors={doctors || []} services={services || []}
            onEdit={() => setEditing(p)} onChanged={refresh} onError={setMsg} />
        ))
      )}
    </section>
  );
}

function PlanCard({ plan, user, doctors, services, onEdit, onChanged, onError }) {
  const [booking, setBooking] = useState(null); // voce da prenotare
  const [doing, setDoing] = useState(null); // voce da segnare eseguita
  const [open, setOpen] = useState(plan.status !== 'COMPLETATO' && plan.status !== 'RIFIUTATO');
  const st = PLAN_STATUS[plan.status];
  const doneCount = plan.items.filter((i) => i.status === 'ESEGUITO').length;

  const act = async (fn) => { onError(null); try { await fn(); onChanged(); } catch (e) { onError(errorMessage(e)); } };
  const setStatus = (status) => act(() => api(`/plans/${plan.id}/status`, { method: 'PUT', body: { status } }));
  const remove = () => window.confirm(`Eliminare il piano ${plan.code} "${plan.title}"?`) && act(() => api(`/plans/${plan.id}`, { method: 'DELETE' }));
  const unbook = (it) => window.confirm('Scollegare la seduta da questa voce? L\'appuntamento in agenda resta: annullalo dall\'agenda se serve.')
    && act(() => api(`/plans/${plan.id}/items/${it.id}/unbook`, { method: 'POST' }));
  const undo = (it) => window.confirm('Annullare "eseguito"? La registrazione verrà tolta anche dal diario dei trattamenti.')
    && act(() => api(`/plans/${plan.id}/items/${it.id}/undo`, { method: 'POST' }));

  function bookDraft(it) {
    const doc = doctors.find((d) => d.id === plan.doctorId);
    const link = doc?.services?.find((s) => s.serviceId === it.serviceId);
    const svc = services.find((s) => s.id === it.serviceId);
    return {
      patient: plan.patient,
      doctorId: plan.doctorId,
      serviceId: it.serviceId || '',
      durationMin: link?.durationMin ?? link?.defaultDurationMin ?? svc?.durationMin ?? 30,
      notes: `Piano ${plan.code}: ${it.description}${it.tooth ? ` – dente ${it.tooth}${it.surfaces ? ` ${it.surfaces}` : ''}` : ''}`,
    };
  }

  return (
    <div className="card plan-card">
      <div className="plan-head">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-label={open ? 'Chiudi' : 'Apri'}>{open ? '▾' : '▸'}</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div><b>{plan.title}</b> <span className="badge" style={{ background: st.color }}>{st.label}</span></div>
          <div className="muted small">
            Preventivo n. {plan.code} del {fmtDate(plan.createdAt)} · {doctorName(plan.doctor)}
            {plan.validUntil && ` · valido fino al ${DateTime.fromISO(plan.validUntil, { zone: 'utc' }).toFormat('dd/LL/yyyy')}`}
            {' · '}{doneCount}/{plan.items.length} eseguite
          </div>
        </div>
        <div className="plan-total"><div className="big">{euro(plan.totalCents)}</div>{plan.discountCents > 0 && <div className="muted small">sconto {euro(plan.discountCents)}</div>}</div>
      </div>
      {open && <>
        <div className="row-end" style={{ margin: '10px 0' }}>
          <button className="btn btn-sm" onClick={() => act(() => downloadPlanPdf(plan))}>Preventivo PDF</button>
          {plan.status === 'PROPOSTO' && <>
            <button className="btn btn-sm btn-primary" onClick={() => setStatus('ACCETTATO')}>Accettato dal paziente</button>
            <button className="btn btn-sm" onClick={() => setStatus('RIFIUTATO')}>Rifiutato</button>
          </>}
          {(plan.status === 'RIFIUTATO' || (plan.status === 'ACCETTATO' && !doneCount)) && <button className="btn btn-sm" onClick={() => setStatus('PROPOSTO')}>Riporta a proposto</button>}
          {plan.status === 'ACCETTATO' && doneCount > 0 && <button className="btn btn-sm" onClick={() => setStatus('COMPLETATO')}>Chiudi piano</button>}
          {plan.status === 'COMPLETATO' && <button className="btn btn-sm" onClick={() => setStatus('ACCETTATO')}>Riapri</button>}
          <button className="btn btn-sm" onClick={onEdit}>Modifica</button>
          {(isAdmin(user) || plan.items.every((i) => i.status === 'DA_FARE')) && <button className="btn btn-sm btn-danger" onClick={remove}>Elimina</button>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Dente</th><th>Prestazione</th><th className="right">Importo</th><th>Seduta</th><th /></tr></thead>
            <tbody>
              {plan.items.map((it, idx) => {
                const lost = it.status === 'PROGRAMMATO' && (!it.appointment || LOST.includes(it.appointment.status));
                return (
                  <Fragment key={it.id}>
                    <tr className={it.status === 'ESEGUITO' ? 'done' : ''}>
                      <td>{idx + 1}</td>
                      <td className="nowrap">{it.tooth || <span className="muted">—</span>}{it.surfaces && <span className="muted"> {it.surfaces}</span>}</td>
                      <td><b>{it.description}</b>{it.quantity > 1 && <span className="muted"> × {it.quantity}</span>}</td>
                      <td className="right nowrap">{euro(it.quantity * it.unitPriceCents)}</td>
                      <td className="small">
                        {it.status === 'ESEGUITO' && <span className="badge" style={{ background: '#16a34a' }}>Eseguito {it.treatment ? DateTime.fromISO(it.treatment.date, { zone: 'utc' }).toFormat('dd/LL/yyyy') : ''}</span>}
                        {it.status === 'PROGRAMMATO' && !lost && <span>📅 {fmtDateTime(it.appointment.start)}</span>}
                        {lost && <span className="warn-text">Seduta {it.appointment ? 'annullata' : 'eliminata'}: da riprenotare</span>}
                        {it.status === 'DA_FARE' && <span className="muted">{ITEM_STATUS.DA_FARE}</span>}
                      </td>
                      <td className="right nowrap">
                        {plan.status !== 'RIFIUTATO' && it.status !== 'ESEGUITO' && (it.status === 'DA_FARE' || lost) && (
                          <button className="btn btn-sm" onClick={() => setBooking(it)}>Prenota</button>
                        )}
                        {it.status === 'PROGRAMMATO' && <button className="btn btn-sm btn-ghost" onClick={() => unbook(it)}>Scollega</button>}
                        {user.dental && it.status !== 'ESEGUITO' && plan.status !== 'RIFIUTATO' && <button className="btn btn-sm" onClick={() => setDoing(doing?.id === it.id ? null : it)}>Eseguito</button>}
                        {user.dental && it.status === 'ESEGUITO' && <button className="btn btn-sm btn-ghost" onClick={() => undo(it)}>Annulla</button>}
                      </td>
                    </tr>
                    {doing?.id === it.id && (
                      <tr><td colSpan={6}><DoneForm plan={plan} item={it} onDone={() => { setDoing(null); onChanged(); }} onCancel={() => setDoing(null)} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {plan.notes && <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{plan.notes}</p>}
      </>}
      {booking && (
        <AppointmentModal draft={bookDraft(booking)} doctors={doctors} services={services}
          onClose={() => setBooking(null)}
          onSaved={async (saved) => {
            const it = booking;
            setBooking(null);
            await act(() => api(`/plans/${plan.id}/items/${it.id}/book`, { method: 'POST', body: { appointmentId: saved.id } }));
          }} />
      )}
    </div>
  );
}

/** Conferma di esecuzione: registra nel diario e, se indicato, aggiorna lo stato del dente */
function DoneForm({ plan, item, onDone, onCancel }) {
  const apptDay = item.appointment && !LOST.includes(item.appointment.status) ? DateTime.fromISO(item.appointment.start).toISODate() : null;
  const [date, setDate] = useState(apptDay || DateTime.now().toISODate());
  const [toothStatus, setToothStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/plans/${plan.id}/items/${item.id}/done`, { method: 'POST', body: { date, notes: notes || null, toothStatus: toothStatus || null } });
      onDone();
    } catch (e2) { setMsg(errorMessage(e2)); }
  }
  return (
    <form className="form done-form" onSubmit={submit}>
      <div className="grid3">
        <label>Data di esecuzione<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {item.tooth ? (
          <label>Stato del dente {item.tooth} dopo il trattamento
            <select value={toothStatus} onChange={(e) => setToothStatus(e.target.value)}>
              <option value="">— non cambiare —</option>
              {Object.entries(TOOTH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        ) : <div />}
        <label>Note cliniche<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      {msg && <div className="alert">{msg}</div>}
      <div className="row-end">
        <span className="muted small" style={{ marginRight: 'auto' }}>Verrà registrato nel diario dei trattamenti.</span>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Annulla</button>
        <button className="btn btn-sm btn-primary">Conferma eseguito</button>
      </div>
    </form>
  );
}

const emptyItem = () => ({ serviceId: '', description: '', tooth: '', surfaces: '', quantity: 1, price: '' });

function PlanForm({ plan, patient, dentists, user, onSaved, onCancel }) {
  const isNew = !plan.id;
  const firstDentist = user.role === 'MEDICO' && dentists.some((d) => d.id === user.doctorId) ? user.doctorId : dentists.find((d) => d.active)?.id;
  const [f, setF] = useState(() => ({
    doctorId: plan.doctorId || firstDentist || '',
    title: plan.title || 'Piano di cura',
    validUntil: plan.validUntil ? plan.validUntil.slice(0, 10) : DateTime.now().plus({ months: 3 }).toISODate(),
    discount: plan.discountCents ? toEuroInput(plan.discountCents) : '',
    notes: plan.notes || '',
  }));
  const [items, setItems] = useState(() => (plan.items?.length
    ? plan.items.map((i) => ({ id: i.id, status: i.status, serviceId: i.serviceId || '', description: i.description, tooth: i.tooth ?? '', surfaces: i.surfaces || '', quantity: i.quantity, price: toEuroInput(i.unitPriceCents) }))
    : [emptyItem()]));
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data: catalog } = useApi(f.doctorId ? '/plans/catalog' : null, { doctorId: f.doctorId });

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setItem = (idx, patch) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  function pickService(idx, id) {
    const s = catalog?.find((x) => x.id === Number(id));
    const it = items[idx];
    setItem(idx, { serviceId: id, ...(s ? { description: !it.description || catalog.some((c) => c.name === it.description) ? s.name : it.description, price: s.priceCents != null ? toEuroInput(s.priceCents) : it.price } : {}) });
  }
  const subtotal = items.reduce((s, it) => s + toCents(it.price || 0) * (Number(it.quantity) || 0), 0);
  const total = Math.max(0, subtotal - toCents(f.discount || 0));

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    const body = {
      patientId: patient.id, doctorId: Number(f.doctorId), title: f.title, validUntil: f.validUntil || null,
      discountCents: toCents(f.discount || 0), notes: f.notes || null,
      items: items.map((it) => ({
        ...(it.id ? { id: it.id } : {}), serviceId: it.serviceId ? Number(it.serviceId) : null, description: it.description,
        tooth: it.tooth === '' ? null : Number(it.tooth), surfaces: it.surfaces || null, quantity: Number(it.quantity) || 1, unitPriceCents: toCents(it.price || 0),
      })),
    };
    try {
      if (isNew) await api('/plans', { method: 'POST', body });
      else { const { patientId, ...rest } = body; await api(`/plans/${plan.id}`, { method: 'PUT', body: rest }); }
      onSaved();
    } catch (e2) { setMsg(errorMessage(e2)); } finally { setSaving(false); }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h3 style={{ margin: 0 }}>{isNew ? 'Nuovo piano di cura' : `Modifica piano ${plan.code}`}</h3>
      <div className="grid3">
        <label>Titolo *<input required value={f.title} onChange={set('title')} /></label>
        <label>Odontoiatra *
          <select required value={f.doctorId} onChange={set('doctorId')}>
            <option value="">—</option>
            {dentists.map((d) => <option key={d.id} value={d.id}>{doctorName(d)}</option>)}
          </select>
        </label>
        <label>Preventivo valido fino al<input type="date" value={f.validUntil} onChange={set('validUntil')} /></label>
      </div>
      <div className="table-wrap">
        <table className="table plan-items">
          <thead><tr><th>Prestazione</th><th>Descrizione *</th><th>Dente</th><th>Superfici</th><th>Q.tà</th><th>Prezzo €</th><th className="right">Importo</th><th /></tr></thead>
          <tbody>
            {items.map((it, idx) => {
              const locked = it.status && it.status !== 'DA_FARE';
              return (
                <tr key={it.id || `n${idx}`}>
                  <td>
                    <select value={it.serviceId} onChange={(e) => pickService(idx, e.target.value)}>
                      <option value="">—</option>
                      {(catalog || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td><input required value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} /></td>
                  <td><input className="w-tooth" inputMode="numeric" value={it.tooth} onChange={(e) => setItem(idx, { tooth: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></td>
                  <td><input className="w-surf" value={it.surfaces} onChange={(e) => setItem(idx, { surfaces: e.target.value.toUpperCase().replace(/[^OMDVL]/g, '').slice(0, 5) })} /></td>
                  <td><input className="w-qty" type="number" min="1" max="99" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} /></td>
                  <td><input className="w-price" inputMode="decimal" value={it.price} onChange={(e) => setItem(idx, { price: e.target.value })} /></td>
                  <td className="right nowrap">{euro(toCents(it.price || 0) * (Number(it.quantity) || 0))}</td>
                  <td>{locked ? <span className="muted small" title="Voce già prenotata o eseguita">{ITEM_STATUS[it.status]}</span>
                    : items.length > 1 && <button type="button" className="btn btn-ghost btn-sm" title="Togli voce" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-sm" onClick={() => setItems([...items, emptyItem()])}>+ Aggiungi voce</button>
        <div className="plan-sum">
          <span>Totale prestazioni <b>{euro(subtotal)}</b></span>
          <label className="inline">Sconto € <input className="w-price" inputMode="decimal" value={f.discount} onChange={set('discount')} /></label>
          <span>Totale <b className="big-inline">{euro(total)}</b></span>
        </div>
      </div>
      <label>Note stampate sul preventivo (es. modalità di pagamento)<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      {msg && <div className="alert">{msg}</div>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onCancel}>Annulla</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva piano'}</button>
      </div>
    </form>
  );
}
