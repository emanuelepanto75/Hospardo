import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { patientName } from '../lib/constants';
import PatientForm from './PatientForm';

/** Ricerca paziente con possibilità di crearne uno nuovo al volo */
export default function PatientPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (value || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => api('/patients', { query: { q, limit: 8 } }).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="picked">
        <div>
          <b>{patientName(value)}</b>
          <div className="muted small">{[value.phone, value.email, value.fiscalCode].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(null); setQ(''); }}>Cambia</button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="subpanel">
        <PatientForm
          initial={{ lastName: q.split(' ')[0] || '', firstName: q.split(' ').slice(1).join(' ') }}
          compact
          onSaved={(p) => { setCreating(false); onChange(p); }}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  return (
    <div className="autocomplete">
      <input autoFocus placeholder="Cerca per cognome, nome, telefono o codice fiscale…" value={q} onChange={(e) => setQ(e.target.value)} />
      {(results.length > 0 || q.trim().length >= 2) && (
        <ul className="ac-list">
          {results.map((p) => (
            <li key={p.id}><button type="button" onClick={() => onChange(p)}>
              <b>{patientName(p)}</b> <span className="muted small">{[p.phone, p.fiscalCode].filter(Boolean).join(' · ')}</span>
            </button></li>
          ))}
          <li><button type="button" className="ac-new" onClick={() => setCreating(true)}>+ Nuovo paziente{q ? ` "${q}"` : ''}</button></li>
        </ul>
      )}
    </div>
  );
}
