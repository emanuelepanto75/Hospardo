import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { WEEKDAYS } from '../lib/time';
import { doctorName } from '../lib/constants';

export default function Doctors() {
  const { user } = useAuth();
  const { data: doctors } = useApi('/doctors');
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="page-head">
        <h1>Medici e orari</h1>
        {user.role === 'ADMIN' && <button className="btn btn-primary" onClick={() => nav('/medici/nuovo')}>+ Nuovo medico</button>}
      </div>
      {!doctors ? <p className="muted">Caricamento…</p> : doctors.length === 0 ? <div className="empty">Nessun medico inserito.</div> : (
        <div className="doctor-cards">
          {doctors.map((d) => (
            <Link key={d.id} to={`/medici/${d.id}`} className={`card doctor-card ${d.active ? '' : 'inactive'}`} style={{ borderLeftColor: d.color }}>
              <div className="doctor-card-head">
                <b>{doctorName(d)}</b>
                {!d.active && <span className="badge badge-outline">non attivo</span>}
                {d.active && d.bookableOnline && <span className="badge badge-outline">online</span>}
              </div>
              <div className="muted small">{d.specialty}</div>
              <ul className="hours-summary">
                {WEEKDAYS.map((name, i) => {
                  const h = d.workingHours.filter((x) => x.weekday === i + 1);
                  if (!h.length) return null;
                  return <li key={i}><span>{name.slice(0, 3)}</span> {h.map((x) => `${x.startTime}–${x.endTime}`).join(', ')}</li>;
                })}
                {d.workingHours.length === 0 && <li className="muted">Orari non impostati</li>}
              </ul>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
