import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { fmtDateTime } from '../lib/time';
import { STATUS, doctorName, isAdmin } from '../lib/constants';
import PatientForm from '../components/PatientForm';
import AppointmentModal from '../components/AppointmentModal';
import DentalChart from '../components/DentalChart';
import TreatmentPlans from '../components/TreatmentPlans';
import { useAuth } from '../lib/auth';

export default function PatientDetail() {
  const { id } = useParams();
  const { data: p, error, reload } = useApi(`/patients/${id}`);
  const { data: doctors } = useApi('/doctors');
  const { data: services } = useApi('/services');
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const { user } = useAuth();
  const [dentalVersion, setDentalVersion] = useState(0);

  if (error) return <div className="page"><div className="alert">{error.message}</div></div>;
  if (!p) return <div className="page"><p className="muted">Caricamento…</p></div>;

  const now = new Date();
  const upcoming = p.appointments.filter((a) => new Date(a.start) >= now && a.status !== 'ANNULLATO').reverse();
  const past = p.appointments.filter((a) => !upcoming.includes(a));
  const stats = {
    total: p.appointments.filter((a) => a.status === 'COMPLETATO').length,
    noShow: p.appointments.filter((a) => a.status === 'NON_PRESENTATO').length,
  };

  const Row = ({ a }) => (
    <tr>
      <td>{fmtDateTime(a.start)}</td>
      <td><span className="dot" style={{ background: a.doctor.color }} /> {doctorName(a.doctor)}</td>
      <td>{a.service?.name || '—'}</td>
      <td><span className="badge" style={{ background: STATUS[a.status].color }}>{STATUS[a.status].label}</span></td>
      <td className="muted small">{a.notes}</td>
    </tr>
  );

  return (
    <div className="page">
      <Link to="/pazienti" className="small">← Pazienti</Link>
      <div className="page-head">
        <div>
          <h1>{p.lastName} {p.firstName}</h1>
          <div className="muted">{[p.phone, p.email, p.fiscalCode].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="row-end">
          <button className="btn" onClick={() => setEditing(!editing)}>{editing ? 'Chiudi modifica' : 'Modifica dati'}</button>
          <button className="btn btn-primary" disabled={!doctors || !services} onClick={() => setBooking(true)}>+ Prenota</button>
        </div>
      </div>

      {editing ? (
        <div className="card"><PatientForm initial={p} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} /></div>
      ) : (
        <div className="cards3">
          <div className="card"><div className="muted small">Visite completate</div><div className="big">{stats.total}</div></div>
          <div className="card"><div className="muted small">Mancate presentazioni</div><div className="big">{stats.noShow}</div></div>
          <div className="card"><div className="muted small">Note</div><div>{p.notes || <span className="muted">—</span>}</div></div>
        </div>
      )}

      {user.dental && <DentalChart key={dentalVersion} patientId={p.id} user={user} onEnabledChange={reload} />}
      {user.plans && p.dentalEnabled && <TreatmentPlans patient={p} user={user} onChanged={() => { reload(); setDentalVersion((v) => v + 1); }} />}

      <h2>Prossimi appuntamenti</h2>
      {upcoming.length === 0 ? <div className="empty">Nessun appuntamento in programma.</div> : (
        <div className="table-wrap"><table className="table"><tbody>{upcoming.map((a) => <Row key={a.id} a={a} />)}</tbody></table></div>
      )}
      <h2>Storico</h2>
      {past.length === 0 ? <div className="empty">Nessuno storico.</div> : (
        <div className="table-wrap"><table className="table"><tbody>{past.map((a) => <Row key={a.id} a={a} />)}</tbody></table></div>
      )}

      {isAdmin(user) && <DeletePatient patient={p} />}

      {booking && (
        <AppointmentModal draft={{ patient: p }} doctors={doctors} services={services} onClose={() => setBooking(false)} onSaved={() => { setBooking(false); reload(); }} />
      )}
    </div>
  );
}


/** Eliminazione definitiva del paziente (solo amministratori) */
function DeletePatient({ patient }) {
  const nav = useNavigate();
  const [msg, setMsg] = useState(null);
  async function remove() {
    const n = patient.appointments.length;
    const typed = window.prompt(
      `Eliminare DEFINITIVAMENTE ${patient.lastName} ${patient.firstName}?\n\n`
      + `Verranno cancellati anche ${n} appuntamenti con i messaggi inviati, le richieste dal sito, la cartella dentale e i piani di cura. `
      + `Gli impianti applicati restano nel registro del magazzino (tracciabilità obbligatoria).\n\nPer confermare scrivi il cognome del paziente:`,
    );
    if (typed == null) return;
    try {
      await api(`/patients/${patient.id}`, { method: 'DELETE', body: { confirm: typed } });
      nav('/pazienti', { replace: true });
    } catch (e) { setMsg(errorMessage(e)); }
  }
  return (
    <div className="card danger-zone">
      <h3>Eliminazione del paziente</h3>
      <p className="muted small">Da usare per errori di inserimento, doppioni o richiesta di cancellazione del paziente. Non si può annullare.</p>
      {msg && <div className="alert">{msg}</div>}
      <button className="btn btn-danger" onClick={remove}>Elimina paziente</button>
    </div>
  );
}
