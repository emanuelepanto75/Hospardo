import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { doctorName } from '../../lib/constants';
import { DateTime } from '../../lib/time';
import { day, qty, toNumber } from './common';

/**
 * Materiali da scaricare proposti dai trattamenti registrati: il medico li controlla
 * (quantità, lotto, righe non usate) e li conferma, di solito a fine giornata.
 */
export default function Drafts({ user, onChanged }) {
  const { data, reload } = useApi('/stock/drafts');
  const [edit, setEdit] = useState({}); // id → { quantity, lotId, removed }
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEdit({}); }, [data]);
  const canConfirm = (d) => ['SUPERADMIN', 'ADMIN'].includes(user.role) || (user.role === 'MEDICO' && d.doctorId === user.doctorId);
  const val = (d) => ({ quantity: String(d.quantity).replace('.', ','), lotId: '', removed: false, ...edit[d.id] });
  const set = (d, patch) => setEdit({ ...edit, [d.id]: { ...val(d), ...patch } });

  if (!data) return <p className="muted">Caricamento…</p>;
  if (!data.length) return <div className="empty">Nessun materiale da confermare.</div>;

  const groups = data.reduce((m, d) => { (m[d.date.slice(0, 10)] ||= []).push(d); return m; }, {});
  const today = DateTime.now().toISODate();

  async function confirm(list) {
    setMsg(null);
    setBusy(true);
    const mine = list.filter(canConfirm);
    try {
      const r = await api('/stock/drafts/confirm', {
        method: 'POST',
        body: {
          rows: mine.filter((d) => !val(d).removed).map((d) => ({ id: d.id, quantity: toNumber(val(d).quantity) || 0, lotId: val(d).lotId ? Number(val(d).lotId) : null })),
          remove: mine.filter((d) => val(d).removed).map((d) => d.id),
        },
      });
      setMsg({ ok: true, text: `Scaricati ${r.confirmed} materiali${r.discarded ? `, ${r.discarded} righe scartate` : ''}.` });
      reload(); onChanged?.();
    } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <p className="muted small">Materiali previsti dai trattamenti registrati nel diario. Controlla quantità e lotto, togli quelli non usati e conferma: solo allora vengono scaricati dal magazzino.</p>
      {msg && <div className={msg.ok ? 'notice' : 'alert'}>{msg.text}</div>}
      {Object.entries(groups).map(([date, list]) => (
        <div key={date} className="card draft-day">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{day(date)}{date === today ? ' – oggi' : date < today ? ' – da confermare' : ''}</h3>
            {list.some(canConfirm) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => confirm(list)}>Conferma scarichi del giorno</button>}
          </div>
          <table className="table move-rows">
            <thead><tr><th>Paziente</th><th>Trattamento</th><th>Materiale</th><th>Quantità</th><th>Lotto</th>{user.role !== 'MEDICO' && <th>Medico</th>}<th /></tr></thead>
            <tbody>
              {list.map((d) => {
                const v = val(d);
                const ok = canConfirm(d);
                return (
                  <tr key={d.id} className={v.removed ? 'inactive' : ''}>
                    <td>{d.patient ? <Link to={`/pazienti/${d.patient.id}#odontoiatria`}>{d.patient.lastName} {d.patient.firstName}</Link> : '—'}{d.tooth && <span className="muted"> · dente {d.tooth}</span>}</td>
                    <td className="small">{d.treatment?.description}</td>
                    <td><b>{d.item.name}</b><div className="muted small">giacenza {qty(d.item.quantity)} {d.item.unit}</div></td>
                    <td className="nowrap"><input className="w-qty" inputMode="decimal" disabled={!ok || v.removed} value={v.quantity} onChange={(e) => set(d, { quantity: e.target.value })} /> {d.item.unit}</td>
                    <td>{d.item.trackLots ? (
                      <select value={v.lotId} disabled={!ok || v.removed} onChange={(e) => set(d, { lotId: e.target.value })}>
                        <option value="">automatico (prima scadenza)</option>
                        {d.item.lots.map((l) => <option key={l.id} value={l.id}>{l.lot}{l.expiry ? ` · scad. ${day(l.expiry)}` : ''} · {qty(l.quantity)}</option>)}
                      </select>
                    ) : <span className="muted">—</span>}</td>
                    {user.role !== 'MEDICO' && <td className="small">{doctorName(d.doctor)}</td>}
                    <td className="right">{ok && (
                      <button className="btn btn-ghost btn-sm" title={v.removed ? 'Rimetti' : 'Non usato: non scaricare'} onClick={() => set(d, { removed: !v.removed })}>{v.removed ? '↺' : '✕'}</button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
