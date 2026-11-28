import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate } from '../lib/time';
import Modal from '../components/Modal';
import PatientForm from '../components/PatientForm';

export default function Patients() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => api('/patients', { query: { q, limit: 100 } }).then(setList), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Pazienti</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nuovo paziente</button>
      </div>
      <input className="search" placeholder="Cerca per cognome, nome, telefono, email o codice fiscale…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {!list ? <p className="muted">Caricamento…</p> : list.length === 0 ? <div className="empty">Nessun paziente trovato.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Paziente</th><th>Nascita</th><th>Telefono</th><th>Email</th><th>Codice fiscale</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} onClick={() => nav(`/pazienti/${p.id}`)} className="clickable">
                  <td><Link to={`/pazienti/${p.id}`}><b>{p.lastName} {p.firstName}</b></Link></td>
                  <td>{p.birthDate ? fmtDate(p.birthDate) : ''}</td>
                  <td>{p.phone}</td>
                  <td>{p.email}</td>
                  <td className="mono">{p.fiscalCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <Modal title="Nuovo paziente" onClose={() => setCreating(false)} wide>
          <PatientForm onSaved={(p) => nav(`/pazienti/${p.id}`)} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
