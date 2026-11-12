import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { euro } from '../lib/time';
import { doctorName } from '../lib/constants';
import Modal from '../components/Modal';

export default function Services() {
  const { user } = useAuth();
  const { data: services, reload } = useApi('/services');
  const { data: doctors } = useApi('/doctors');
  const [edit, setEdit] = useState(null);
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="page">
      <div className="page-head">
        <h1>Prestazioni</h1>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit({})}>+ Nuova prestazione</button>}
      </div>
      {!services || !doctors ? <p className="muted">Caricamento…</p> : services.length === 0 ? <div className="empty">Nessuna prestazione definita.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Prestazione</th><th>Durata</th><th>Prezzo</th><th>Medici</th><th>Online</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className={`${isAdmin ? 'clickable' : ''} ${s.active ? '' : 'inactive'}`} onClick={() => isAdmin && setEdit(s)}>
                  <td><b>{s.name}</b>{!s.active && <span className="badge badge-outline">disattivata</span>}<div className="muted small">{s.description}</div></td>
                  <td>{s.durationMin} min</td>
                  <td>{euro(s.priceCents)}</td>
                  <td className="small">{doctors.filter((d) => s.doctorIds.includes(d.id)).map(doctorName).join(', ') || <span className="muted">—</span>}</td>
                  <td>{s.bookableOnline ? 'Sì' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ServiceModal service={edit} doctors={doctors || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function ServiceModal({ service, doctors, onClose, onSaved }) {
  const [f, setF] = useState({
    name: service.name || '', description: service.description || '', durationMin: service.durationMin || 30,
    price: service.priceCents != null ? (service.priceCents / 100).toFixed(2) : '', bookableOnline: service.bookableOnline ?? true,
    active: service.active ?? true, doctorIds: service.doctorIds || [],
  });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    setErr(null);
    const body = {
      name: f.name, description: f.description || null, durationMin: Number(f.durationMin),
      priceCents: f.price === '' ? null : Math.round(Number(String(f.price).replace(',', '.')) * 100),
      bookableOnline: f.bookableOnline, active: f.active, doctorIds: f.doctorIds,
    };
    try {
      if (service.id) await api(`/services/${service.id}`, { method: 'PUT', body });
      else await api('/services', { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
  }

  return (
    <Modal title={service.id ? 'Modifica prestazione' : 'Nuova prestazione'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Annulla</button><button className="btn btn-primary" onClick={save}>Salva</button></>}>
      <div className="form">
        <label>Nome *<input value={f.name} onChange={set('name')} autoFocus /></label>
        <label>Descrizione<textarea rows={2} value={f.description} onChange={set('description')} /></label>
        <div className="grid2">
          <label>Durata (minuti)<input type="number" min={5} step={5} value={f.durationMin} onChange={set('durationMin')} /></label>
          <label>Prezzo (€)<input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="es. 80,00" /></label>
        </div>
        <div>
          <div className="label">Medici che la erogano</div>
          <div className="slot-chips">
            {doctors.map((d) => (
              <button type="button" key={d.id} className={`chip ${f.doctorIds.includes(d.id) ? 'chip-on' : ''}`}
                onClick={() => setF({ ...f, doctorIds: f.doctorIds.includes(d.id) ? f.doctorIds.filter((x) => x !== d.id) : [...f.doctorIds, d.id] })}>
                {doctorName(d)}
              </button>
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={f.bookableOnline} onChange={set('bookableOnline')} /> Prenotabile online dai pazienti</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Attiva</label>
        {err && <div className="alert">{err}</div>}
      </div>
    </Modal>
  );
}
