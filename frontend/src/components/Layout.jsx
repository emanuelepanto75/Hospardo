import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { siteHome } from '../pages/Book';
import { ROLES, isAdmin } from '../lib/constants';

export default function Layout() {
  const { user, logout } = useAuth();
  const canHandleRequests = isAdmin(user) || user.role === 'SEGRETERIA';
  // numero di richieste di prenotazione in attesa, aggiornato ogni minuto
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!canHandleRequests) return undefined;
    const load = () => api('/requests/count').then((r) => setPending(r.count)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('hospardo:requests', load);
    return () => { clearInterval(t); window.removeEventListener('hospardo:requests', load); };
  }, [canHandleRequests]);

  const links = [
    { to: '/agenda', label: 'Agenda', icon: '📅' },
    ...(canHandleRequests ? [{ to: '/richieste', label: 'Richieste', icon: '📥', badge: pending }] : []),
    { to: '/promemoria', label: 'Promemoria', icon: '💬' },
    { to: '/pazienti', label: 'Pazienti', icon: '👤' },
    ...(user.plans ? [{ to: '/piani', label: 'Piani di cura', icon: '🦷' }] : []),
    { to: '/medici', label: 'Medici e orari', icon: '🩺' },
    { to: '/prestazioni', label: 'Prestazioni', icon: '📋' },
    ...(isAdmin(user) ? [{ to: '/utenti', label: 'Utenti', icon: '🔑' }, { to: '/postazioni', label: 'Postazioni di emergenza', icon: '🛟' }] : []),
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Hospardo</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden>{l.icon}</span> {l.label}
              {l.badge > 0 && <span className="nav-badge">{l.badge}</span>}
            </NavLink>
          ))}
          <a href={`${siteHome()}prenota`} target="_blank" rel="noreferrer"><span aria-hidden>🌐</span> Pagina prenotazioni</a>
        </nav>
        <div className="sidebar-user">
          <div><b>{user.name}</b></div>
          <div className="muted small">{ROLES[user.role]}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Esci</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
