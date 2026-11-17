import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try { await login(email, password); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-lg">Hospardo</div>
        <p className="muted">Agenda dello studio – accesso riservato al personale</p>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Accesso…' : 'Accedi'}</button>
        <a className="small" href="/prenota">Sei un paziente? Prenota online →</a>
      </form>
    </div>
  );
}
