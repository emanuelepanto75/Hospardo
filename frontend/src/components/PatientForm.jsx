import { useState } from 'react';
import { api, errorMessage } from '../lib/api';

const empty = { firstName: '', lastName: '', fiscalCode: '', birthDate: '', gender: '', email: '', phone: '', address: '', notes: '', privacyConsent: false, remindersOptIn: true };

export default function PatientForm({ initial, onSaved, onCancel, compact }) {
  const [f, setF] = useState(() => ({
    ...empty,
    ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? empty[k] ?? ''])),
    birthDate: initial?.birthDate ? initial.birthDate.slice(0, 10) : '',
  }));
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = { ...f, gender: f.gender || null };
      delete body.id; delete body.createdAt; delete body.updatedAt; delete body.appointments;
      const saved = initial?.id
        ? await api(`/patients/${initial.id}`, { method: 'PUT', body })
        : await api('/patients', { method: 'POST', body });
      onSaved(saved);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="grid2">
        <label>Cognome *<input required value={f.lastName} onChange={set('lastName')} /></label>
        <label>Nome *<input required value={f.firstName} onChange={set('firstName')} /></label>
        <label>Telefono<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        {!compact && <>
          <label>Codice fiscale<input value={f.fiscalCode} maxLength={16} onChange={set('fiscalCode')} style={{ textTransform: 'uppercase' }} /></label>
          <label>Data di nascita<input type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
          <label>Sesso
            <select value={f.gender} onChange={set('gender')}>
              <option value="">—</option><option value="F">F</option><option value="M">M</option><option value="A">Altro</option>
            </select>
          </label>
          <label>Indirizzo<input value={f.address} onChange={set('address')} /></label>
        </>}
      </div>
      {!compact && <label>Note<textarea rows={3} value={f.notes} onChange={set('notes')} /></label>}
      <label className="check"><input type="checkbox" checked={f.privacyConsent} onChange={set('privacyConsent')} /> Consenso al trattamento dei dati raccolto</label>
      <label className="check"><input type="checkbox" checked={f.remindersOptIn} onChange={set('remindersOptIn')} /> Invia conferme e promemoria via email</label>
      {err && <div className="alert">{err}</div>}
      <div className="row-end">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annulla</button>}
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva paziente'}</button>
      </div>
    </form>
  );
}
