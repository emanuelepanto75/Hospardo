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

  // menu ridotto alle sole icone (preferenza salvata sul PC)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('hospardo:menu') === 'icone'; } catch { return false; } });
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('hospardo:menu', c ? 'esteso' : 'icone'); } catch { /* ignora */ } return !c; });

  // articoli sottoscorta + lotti in scadenza
  const [stockAlerts, setStockAlerts] = useState(0);
  useEffect(() => {
    if (!user.plans) return undefined;
    const load = () => api('/stock/summary').then((r) => setStockAlerts(user.role === 'MEDICO' ? r.drafts : r.lowStock + r.expiring + r.drafts)).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60000);
    window.addEventListener('hospardo:stock', load);
    return () => { clearInterval(t); window.removeEventListener('hospardo:stock', load); };
  }, [user.plans]);

  const links = [
    { to: '/agenda', label: 'Agenda', icon: '📅' },
    ...(canHandleRequests ? [{ to: '/richieste', label: 'Richieste', icon: '📥', badge: pending }] : []),
    { to: '/promemoria', label: 'Promemoria', icon: '💬' },
    { to: '/pazienti', label: 'Pazienti', icon: '👤' },
    ...(user.plans ? [{ to: '/piani', label: 'Piani di cura', icon: '🦷' }, { to: '/magazzino', label: 'Magazzino', icon: '📦', badge: stockAlerts, warn: true }] : []),
    { to: '/medici', label: 'Medici e orari', icon: '🩺' },
    { to: '/prestazioni', label: 'Prestazioni', icon: '📋' },
    ...(isAdmin(user) ? [{ to: '/utenti', label: 'Utenti', icon: '🔑' }, { to: '/postazioni', label: 'Postazioni emergenza', icon: '🛟' }] : []),
  ];
  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <span className="nav-label">Hospardo</span>
          <button className="collapse-btn" onClick={toggle} title={collapsed ? 'Espandi il menu' : 'Riduci il menu alle icone'} aria-label={collapsed ? 'Espandi il menu' : 'Riduci il menu'}>{collapsed ? '»' : '«'}</button>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} title={collapsed ? l.label : undefined} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden className="nav-icon">{l.icon}</span> <span className="nav-label">{l.label}</span>
              {l.badge > 0 && <span className={`nav-badge ${l.warn ? 'nav-badge-warn' : ''}`}>{l.badge}</span>}
            </NavLink>
          ))}
          <a href={`${siteHome()}prenota`} target="_blank" rel="noreferrer" title={collapsed ? 'Pagina prenotazioni' : undefined}><span aria-hidden className="nav-icon">🌐</span> <span className="nav-label">Pagina prenotazioni</span></a>
        </nav>
        <div className="sidebar-user">
          <div className="nav-label"><b>{user.name}</b></div>
          <div className="muted small nav-label">{ROLES[user.role]}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Esci">{collapsed ? '⏻' : 'Esci'}</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
