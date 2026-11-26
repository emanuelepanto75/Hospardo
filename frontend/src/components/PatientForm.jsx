import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { titleCase } from '../lib/names';
import PlaceInput from './PlaceInput';

const empty = { firstName: '', lastName: '', fiscalCode: '', birthDate: '', birthPlace: '', gender: '', email: '', phone: '', address: '', notes: '', privacyConsent: false, remindersOptIn: true, whatsappOptIn: true };

export default function PatientForm({ initial, onSaved, onCancel, compact }) {
  const [f, setF] = useState(() => ({
    ...empty,
    ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? empty[k] ?? ''])),
    birthDate: initial?.birthDate ? initial.birthDate.slice(0, 10) : '',
  }));
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cfMsg, setCfMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // iniziale maiuscola appena si esce dal campo
  const cap = (k) => () => setF((prev) => ({ ...prev, [k]: titleCase(prev[k]) }));

  async function calcFiscalCode(data = f, silent = false) {
    setCfMsg(null);
    try {
      const r = await api('/patients/fiscal-code', { method: 'POST', body: { lastName: data.lastName, firstName: data.firstName, birthDate: data.birthDate, gender: data.gender, birthPlace: data.birthPlace } });
      if (data.fiscalCode && data.fiscalCode.toUpperCase() !== r.fiscalCode) {
        setCfMsg({ ok: false, text: `Dai dati risulta ${r.fiscalCode}: controlla (può differire in caso di omocodia).` });
        if (silent) return;
      }
      setF((prev) => ({ ...prev, fiscalCode: r.fiscalCode }));
    } catch (e) { if (!silent) setCfMsg({ ok: false, text: errorMessage(e) }); }
  }
  // calcolo automatico quando i dati sono completi e il codice fiscale è vuoto
  const autoCalc = (patch) => {
    const next = { ...f, ...patch };
    setF(next);
    if (!next.fiscalCode && next.lastName && next.firstName && next.birthDate && ['M', 'F'].includes(next.gender) && next.birthPlace) calcFiscalCode(next, true);
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = { ...f, firstName: titleCase(f.firstName), lastName: titleCase(f.lastName), gender: f.gender || null, birthPlace: f.birthPlace || null };
      delete body.id; delete body.createdAt; delete body.updatedAt; delete body.appointments; delete body.notifications;
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
        <label>Cognome *<input required value={f.lastName} onChange={set('lastName')} onBlur={cap('lastName')} /></label>
        <label>Nome *<input required value={f.firstName} onChange={set('firstName')} onBlur={cap('firstName')} /></label>
        <label>Telefono<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        {!compact && <>
          <label>Data di nascita<input type="date" value={f.birthDate} onChange={(e) => autoCalc({ birthDate: e.target.value })} /></label>
          <label>Luogo di nascita<PlaceInput value={f.birthPlace} onChange={(v) => autoCalc({ birthPlace: v })} /></label>
          <label>Sesso
            <select value={f.gender} onChange={(e) => autoCalc({ gender: e.target.value })}>
              <option value="">—</option><option value="F">F</option><option value="M">M</option><option value="A">Altro</option>
            </select>
          </label>
          <label>Codice fiscale
            <span className="input-with-btn">
              <input value={f.fiscalCode} maxLength={16} onChange={(e) => setF({ ...f, fiscalCode: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} />
              <button type="button" className="btn btn-sm" title="Calcola da nome, cognome, sesso, data e luogo di nascita" onClick={() => calcFiscalCode({ ...f, fiscalCode: '' })}>Calcola</button>
            </span>
          </label>
          <label>Indirizzo<input value={f.address} onChange={set('address')} /></label>
        </>}
      </div>
      {!compact && <label>Note<textarea rows={3} value={f.notes} onChange={set('notes')} /></label>}
      <label className="check"><input type="checkbox" checked={f.privacyConsent} onChange={set('privacyConsent')} /> <span>Informativa consegnata e consenso al trattamento dei dati raccolto (<a href="/privacy" target="_blank" rel="noreferrer">stampa l'informativa</a>)</span></label>
      <label className="check"><input type="checkbox" checked={f.remindersOptIn} onChange={set('remindersOptIn')} /> Invia conferme e promemoria via email</label>
      <label className="check"><input type="checkbox" checked={f.whatsappOptIn} onChange={set('whatsappOptIn')} /> Invia conferme e promemoria su WhatsApp (al numero di telefono)</label>
      {cfMsg && <div className={cfMsg.ok ? 'notice' : 'alert'}>{cfMsg.text}</div>}
      {err && <div className="alert">{err}</div>}
      <div className="row-end">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annulla</button>}
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva paziente'}</button>
      </div>
    </form>
  );
}
