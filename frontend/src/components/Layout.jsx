import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLES } from '../lib/constants';

export default function Layout() {
  const { user, logout } = useAuth();
  const links = [
    { to: '/agenda', label: 'Agenda', icon: '📅' },
    { to: '/pazienti', label: 'Pazienti', icon: '👤' },
    { to: '/medici', label: 'Medici e orari', icon: '🩺' },
    { to: '/prestazioni', label: 'Prestazioni', icon: '📋' },
    ...(user.role === 'ADMIN' ? [{ to: '/utenti', label: 'Utenti', icon: '🔑' }] : []),
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Hospardo</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden>{l.icon}</span> {l.label}
            </NavLink>
          ))}
          <a href="/prenota" target="_blank" rel="noreferrer"><span aria-hidden>🌐</span> Pagina prenotazioni</a>
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
