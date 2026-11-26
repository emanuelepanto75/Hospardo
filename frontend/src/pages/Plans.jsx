import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { euro, fmtDate } from '../lib/time';
import { doctorName } from '../lib/constants';
import { PLAN_STATUS, downloadPlanPdf } from '../components/TreatmentPlans';

/** Elenco dei piani di cura / preventivi di tutti i pazienti */
export default function Plans() {
  const [status, setStatus] = useState('PROPOSTO');
  const { data: plans } = useApi('/plans', status ? { status } : undefined);
  const [msg, setMsg] = useState(null);
  const nav = useNavigate();
  const total = (plans || []).reduce((s, p) => s + p.totalCents, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Piani di cura</h1>
          <p className="muted small" style={{ marginTop: -8 }}>Preventivi odontoiatrici. Si creano dalla scheda del paziente.</p>
        </div>
        <div className="segmented">
          {[['PROPOSTO', 'Da confermare'], ['ACCETTATO', 'In corso'], ['COMPLETATO', 'Completati'], ['RIFIUTATO', 'Rifiutati'], ['', 'Tutti']].map(([k, l]) => (
            <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {!plans ? <p className="muted">Caricamento…</p> : plans.length === 0 ? <div className="empty">Nessun piano di cura.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N.</th><th>Data</th><th>Paziente</th><th>Piano</th><th>Odontoiatra</th><th>Stato</th><th>Avanzamento</th><th className="right">Totale</th><th /></tr></thead>
            <tbody>
              {plans.map((p) => {
                const done = p.items.filter((i) => i.status === 'ESEGUITO').length;
                const expired = p.status === 'PROPOSTO' && p.validUntil && p.validUntil.slice(0, 10) < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/pazienti/${p.patient.id}`)}>
                    <td className="nowrap">{p.code}</td>
                    <td className="nowrap">{fmtDate(p.createdAt)}</td>
                    <td><b>{p.patient.lastName} {p.patient.firstName}</b><div className="muted small">{p.patient.phone}</div></td>
                    <td>{p.title}</td>
                    <td>{doctorName(p.doctor)}</td>
                    <td><span className="badge" style={{ background: PLAN_STATUS[p.status].color }}>{PLAN_STATUS[p.status].label}</span>{expired && <div className="warn-text small">scaduto</div>}</td>
                    <td className="small">{done}/{p.items.length} eseguite</td>
                    <td className="right nowrap"><b>{euro(p.totalCents)}</b></td>
                    <td className="right"><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); downloadPlanPdf(p).catch((er) => setMsg(errorMessage(er))); }}>PDF</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={7} className="right muted">{plans.length} piani</td><td className="right nowrap"><b>{euro(total)}</b></td><td /></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
