import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { DateTime } from '../lib/time';
import { STATUS } from '../lib/constants';
import { PublicShell } from './Book';

/**
 * Pagina aperta dal link nei messaggi: il paziente vede l'appuntamento e può annullarlo
 * (con motivo facoltativo) o chiedere di spostarlo, fino a N ore prima; dopo deve telefonare.
 */
export default function ManageAppointment() {
  const { token } = useParams();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState(null); // null | 'cancel' | 'move'
  const [done, setDone] = useState(null);

  useEffect(() => { api(`/public/appointment/${token}`).then(setA).catch((e) => setErr(errorMessage(e))); }, [token]);
  const phone = a?.clinic?.phone;
  const when = (iso) => DateTime.fromISO(iso).toFormat("cccc d LLLL yyyy 'alle' HH:mm");

  return (
    <PublicShell info={a ? { clinic: a.clinic } : null}>
      <h1>Il tuo appuntamento</h1>
      {err && <div className="alert">{err}</div>}
      {!a && !err && <p className="muted">Caricamento…</p>}
      {a && (
        <div className="card">
          <span className="badge" style={{ background: STATUS[a.status].color }}>{STATUS[a.status].label}</span>
          <p className="big-date">{when(a.start)}</p>
          <p><b>{a.service || 'Visita'}</b> con {a.doctor}</p>
          <p className="muted">Paziente: {a.patient}</p>
          {a.clinic?.address && <p className="muted">{a.clinic.address}</p>}

          {done && <div className="notice">{done}</div>}
          {a.pendingMove && (
            <div className="notice">
              Hai chiesto di spostare questo appuntamento{a.pendingMove.preferredStart ? <> a <b>{when(a.pendingMove.preferredStart)}</b></> : a.pendingMove.preferences ? <> ({a.pendingMove.preferences})</> : ''}.
              Lo studio ti contatterà per confermare; fino ad allora resta valido l'orario qui sopra.
            </div>
          )}
          {a.tooLate && (
            <div className="notice">
              Mancano meno di {a.minHours} ore all'appuntamento: per annullarlo o spostarlo{' '}
              {phone ? <>chiama lo studio al <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}><b>{phone}</b></a></> : 'contatta lo studio'}.
            </div>
          )}

          {!mode && (a.canCancel || a.canMove) && (
            <div className="row" style={{ marginTop: 12 }}>
              {a.canMove && <button className="btn btn-primary" onClick={() => setMode('move')}>Chiedi di spostare</button>}
              {a.canCancel && <button className="btn btn-danger" onClick={() => setMode('cancel')}>Annulla appuntamento</button>}
            </div>
          )}
          {!mode && (a.canCancel || a.canMove) && a.minHours > 0 && (
            <p className="muted small">Puoi annullare o chiedere di spostare online fino a {a.minHours} ore prima dell'appuntamento.</p>
          )}
          {mode === 'cancel' && <CancelForm token={token} onDone={(v) => { setA(v); setMode(null); setDone('Appuntamento annullato. Lo studio è stato avvisato; riceverai anche un\'email di conferma.'); }} onBack={() => setMode(null)} />}
          {mode === 'move' && <MoveForm token={token} onDone={(v) => { setA(v); setMode(null); setDone(null); }} onBack={() => setMode(null)} />}

          {a.status === 'ANNULLATO' && <p><Link to="/prenota">Prenota un nuovo appuntamento →</Link></p>}
        </div>
      )}
    </PublicShell>
  );
}

function CancelForm({ token, onDone, onBack }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onDone(await api(`/public/appointment/${token}/cancel`, { method: 'POST', body: { reason } })); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="form manage-form" onSubmit={submit}>
      <h3>Annullare l'appuntamento?</h3>
      <label>Motivo (facoltativo)<textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. impegno di lavoro, sto meglio…" /></label>
      {err && <div className="alert">{err}</div>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onBack}>Indietro</button>
        <button className="btn btn-danger" disabled={busy}>{busy ? 'Annullamento…' : 'Sì, annulla l\'appuntamento'}</button>
      </div>
    </form>
  );
}

/** Spostamento: scelta di un orario libero dello stesso medico, oppure una preferenza scritta */
function MoveForm({ token, onDone, onBack }) {
  const [date, setDate] = useState(DateTime.now().plus({ days: 1 }).toISODate());
  const [slots, setSlots] = useState(null);
  const [start, setStart] = useState(null);
  const [preferences, setPreferences] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setSlots(null); setStart(null);
    api(`/public/appointment/${token}/slots`, { query: { date } }).then(setSlots).catch(() => setSlots([]));
  }, [date, token]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onDone(await api(`/public/appointment/${token}/move`, { method: 'POST', body: { start: start || undefined, preferences, notes } })); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  }
  const days = Array.from({ length: 14 }, (_, i) => DateTime.now().plus({ days: i + 1 })).filter((d) => d.weekday !== 7);
  return (
    <form className="form manage-form" onSubmit={submit}>
      <h3>Chiedi di spostare l'appuntamento</h3>
      <p className="muted small" style={{ margin: 0 }}>Scegli un orario libero oppure scrivi quando preferisci. Lo studio confermerà; fino ad allora resta valido l'appuntamento attuale.</p>
      <div className="day-strip">
        {days.map((d) => (
          <button type="button" key={d.toISODate()} className={`btn btn-sm ${date === d.toISODate() ? 'btn-primary' : ''}`} onClick={() => setDate(d.toISODate())}>
            {d.toFormat('ccc d')}
          </button>
        ))}
      </div>
      {!slots ? <p className="muted small">Cerco gli orari liberi…</p> : slots.length === 0 ? <p className="muted small">Nessun orario libero in questo giorno.</p> : (
        <div className="slot-list">
          {slots.map((s) => (
            <button type="button" key={s} className={`btn btn-sm ${start === s ? 'btn-primary' : ''}`} onClick={() => setStart(start === s ? null : s)}>{DateTime.fromISO(s).toFormat('HH:mm')}</button>
          ))}
        </div>
      )}
      <label>Oppure scrivi quando preferisci<input value={preferences} maxLength={300} onChange={(e) => setPreferences(e.target.value)} placeholder="es. la settimana prossima, di pomeriggio" /></label>
      <label>Note (facoltative)<input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <div className="alert">{err}</div>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onBack}>Indietro</button>
        <button className="btn btn-primary" disabled={busy || (!start && !preferences.trim())}>
          {busy ? 'Invio…' : start ? `Chiedi ${DateTime.fromISO(start).toFormat("ccc d LLL 'alle' HH:mm")}` : 'Invia la richiesta'}
        </button>
      </div>
    </form>
  );
}
