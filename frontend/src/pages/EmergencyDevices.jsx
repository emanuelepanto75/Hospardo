import { useState } from 'react';
import { api, errorMessage, getToken } from '../lib/api';
import { useApi } from '../lib/useApi';
import { fmtDateTime } from '../lib/time';

/** Postazioni dello studio autorizzate a scaricare la copia di emergenza (amministratori) */
export default function EmergencyDevices() {
  const { data: devices, reload } = useApi('/emergency/devices');
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const agendaUrl = window.location.origin;
  const command = `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\installa-agenda-emergenza.ps1" -Url ${agendaUrl}`;

  async function create(e) {
    e.preventDefault();
    setMsg(null);
    try {
      setCreated(await api('/emergency/devices', { method: 'POST', body: { name } }));
      setName('');
      setCopied(false);
      reload();
    } catch (e2) { setMsg(errorMessage(e2)); }
  }

  async function revoke(d) {
    if (!window.confirm(`Revocare la chiave di "${d.name}"? Quel PC smetterà di aggiornare la copia di emergenza.`)) return;
    try { await api(`/emergency/devices/${d.id}/revoke`, { method: 'POST' }); reload(); } catch (e) { setMsg(errorMessage(e)); }
  }

  async function preview() {
    const res = await fetch('/api/emergency/preview', { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* copia manuale */ }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Postazioni di emergenza</h1>
          <p className="muted small" style={{ marginTop: -8 }}>
            I PC dello studio scaricano ogni 15 minuti una copia dell'agenda dei prossimi 7 giorni (domenica esclusa), da consultare anche senza internet. La copia è in sola lettura.
          </p>
        </div>
        <button className="btn" onClick={preview}>Anteprima della copia</button>
      </div>

      <div className="card form">
        <h2>Aggiungi un PC</h2>
        <form className="row" onSubmit={create}>
          <input style={{ maxWidth: 320 }} placeholder="Nome, es. PC reception" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn btn-primary">Crea chiave</button>
        </form>
        {msg && <div className="alert">{msg}</div>}
        {created && (
          <div className="key-box">
            <p><b>Chiave per "{created.name}"</b>: copiala ora, non verrà più mostrata.</p>
            <div className="row">
              <code className="key">{created.token}</code>
              <button type="button" className="btn btn-sm" onClick={() => copy(created.token)}>{copied ? 'Copiata ✓' : 'Copia'}</button>
            </div>
            <ol className="small">
              <li>Sul PC dello studio, accedi a Windows con l'utente della segreteria.</li>
              <li>Scarica lo script: <a href="/postazione/installa-agenda-emergenza.ps1" download>installa-agenda-emergenza.ps1</a> (finisce nella cartella Download).</li>
              <li>Apri <b>Windows PowerShell</b> e incolla questo comando:
                <pre className="cmd">{command}</pre>
              </li>
              <li>Quando lo chiede, incolla la chiave qui sopra. Sul Desktop comparirà <b>Agenda di emergenza.html</b>.</li>
            </ol>
          </div>
        )}
      </div>

      <h2>PC autorizzati</h2>
      {!devices ? <p className="muted">Caricamento…</p> : devices.length === 0 ? <div className="empty">Nessuna postazione.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Postazione</th><th>Chiave</th><th>Creata</th><th>Ultimo aggiornamento</th><th>Stato</th><th /></tr></thead>
            <tbody>
              {devices.map((d) => {
                const stale = !d.revokedAt && d.lastUsedAt && Date.now() - new Date(d.lastUsedAt) > 60 * 60 * 1000;
                return (
                  <tr key={d.id} className={d.revokedAt ? 'inactive' : ''}>
                    <td><b>{d.name}</b></td>
                    <td className="mono">{d.tokenPrefix}…</td>
                    <td className="small">{fmtDateTime(d.createdAt)}</td>
                    <td className="small">
                      {d.lastUsedAt ? fmtDateTime(d.lastUsedAt) : <span className="muted">mai</span>}
                      {stale && <div className="muted">da più di un'ora: il PC è spento o senza internet?</div>}
                    </td>
                    <td>{d.revokedAt ? 'Revocata' : 'Attiva'}</td>
                    <td className="right">{!d.revokedAt && <button className="btn btn-danger btn-sm" onClick={() => revoke(d)}>Revoca</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
