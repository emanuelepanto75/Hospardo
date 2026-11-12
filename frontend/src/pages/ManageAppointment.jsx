import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { DateTime } from '../lib/time';
import { STATUS } from '../lib/constants';
import { PublicShell } from './Book';

export default function ManageAppointment() {
  const { token } = useParams();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/public/appointment/${token}`).then(setA).catch((e) => setErr(errorMessage(e))); }, [token]);

  async function cancel() {
    if (!window.confirm('Vuoi davvero annullare l\'appuntamento?')) return;
    setBusy(true);
    try { setA(await api(`/public/appointment/${token}/cancel`, { method: 'POST' })); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <PublicShell info={a ? { clinic: a.clinic } : null}>
      <h1>Il tuo appuntamento</h1>
      {err && <div className="alert">{err}</div>}
      {!a && !err && <p className="muted">Caricamento…</p>}
      {a && (
        <div className="card">
          <span className="badge" style={{ background: STATUS[a.status].color }}>{STATUS[a.status].label}</span>
          <p className="big-date">{DateTime.fromISO(a.start).toFormat("cccc d LLLL yyyy 'alle' HH:mm")}</p>
          <p><b>{a.service || 'Visita'}</b> con {a.doctor}</p>
          <p className="muted">Paziente: {a.patient}</p>
          {a.clinic?.address && <p className="muted">{a.clinic.address}</p>}
          {a.canCancel && <button className="btn btn-danger" disabled={busy} onClick={cancel}>Annulla appuntamento</button>}
          {a.status === 'ANNULLATO' && <p><Link to="/prenota">Prenota un nuovo appuntamento →</Link></p>}
        </div>
      )}
    </PublicShell>
  );
}
