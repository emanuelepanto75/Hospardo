import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { ROLES, doctorName } from '../lib/constants';
import { useAuth } from '../lib/auth';
import Modal from '../components/Modal';

export default function Users() {
  const { data: users, reload } = useApi('/users');
  const { data: doctors } = useApi('/doctors');
  const [edit, setEdit] = useState(null);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Utenti</h1>
        <button className="btn btn-primary" onClick={() => setEdit({})}>+ Nuovo utente</button>
      </div>
      {!users || !doctors ? <p className="muted">Caricamento…</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Medico collegato</th><th>Stato</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`${u.canEdit ? 'clickable' : ''} ${u.active ? '' : 'inactive'}`} onClick={() => u.canEdit && setEdit(u)}
                  title={u.canEdit ? '' : 'Solo l\'amministratore principale può modificare gli amministratori'}>
                  <td><b>{u.name}</b></td><td>{u.email}</td><td>{ROLES[u.role]}{!u.canEdit && <span className="muted small"> 🔒</span>}</td>
                  <td>{doctorName(doctors.find((d) => d.id === u.doctorId)) || '—'}</td>
                  <td>{u.active ? 'Attivo' : 'Disattivato'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <UserModal user={edit} doctors={doctors || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function UserModal({ user, doctors, onClose, onSaved }) {
  const { user: me } = useAuth();
  // l'amministratore di secondo livello può assegnare solo i ruoli Segreteria e Medico
  const roleOptions = Object.entries(ROLES).filter(([k]) => me.role === 'SUPERADMIN' || ['SEGRETERIA', 'MEDICO'].includes(k) || k === user.role);
  const isSelf = user.id === me.id;
  const [f, setF] = useState({ name: user.name || '', email: user.email || '', role: user.role || 'SEGRETERIA', doctorId: user.doctorId ?? '', active: user.active ?? true, password: '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function remove() {
    if (!window.confirm(`Eliminare definitivamente l'utente ${user.name} (${user.email})?`)) return;
    setErr(null);
    try { await api(`/users/${user.id}`, { method: 'DELETE' }); onSaved(); } catch (e) { setErr(errorMessage(e)); }
  }

  async function save() {
    setErr(null);
    const body = { name: f.name, email: f.email, role: f.role, active: f.active, doctorId: f.role === 'MEDICO' && f.doctorId ? Number(f.doctorId) : null };
    if (f.password) body.password = f.password;
    try {
      if (user.id) await api(`/users/${user.id}`, { method: 'PUT', body });
      else await api('/users', { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
  }

  return (
    <Modal title={user.id ? 'Modifica utente' : 'Nuovo utente'} onClose={onClose}
      footer={<>
        {user.id && !user.active && !isSelf && (
          <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Elimina utente</button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button><button className="btn btn-primary" onClick={save}>Salva</button>
      </>}>
      <div className="form">
        <label>Nome<input value={f.name} onChange={set('name')} autoFocus /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        <div className="grid2">
          <label>Ruolo<select value={f.role} disabled={isSelf} onChange={set('role')}>{roleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.role === 'MEDICO' && (
            <label>Medico<select value={f.doctorId} onChange={set('doctorId')}><option value="">—</option>{doctors.filter((d) => !d.archivedAt || d.id === Number(f.doctorId)).map((d) => <option key={d.id} value={d.id}>{doctorName(d)}</option>)}</select></label>
          )}
        </div>
        <label>{user.id ? 'Nuova password (lascia vuoto per non cambiarla)' : 'Password (min. 8 caratteri)'}<input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></label>
        <label className="check"><input type="checkbox" disabled={isSelf} checked={f.active} onChange={set('active')} /> Utente attivo</label>
        {err && <div className="alert">{err}</div>}
      </div>
    </Modal>
  );
}
