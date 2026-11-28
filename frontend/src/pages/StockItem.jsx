import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { ItemForm, STOCK_STATUS, ScanInput, canManageStock, day, expiryClass, qty, toNumber } from '../components/stock/common';
import { MovementsTable } from './Stock';

/** Scheda articolo: anagrafica, codici a barre, lotti, rettifiche e movimenti */
export default function StockItem() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: item, error, reload } = useApi(`/stock/items/${id}`);
  const [msg, setMsg] = useState(null);
  const [adjust, setAdjust] = useState(null); // { lotId, label, current, quantity, note }
  const [pack, setPack] = useState('1');
  const manage = canManageStock(user);

  if (error) return <div className="page"><div className="alert">{error.message}</div></div>;
  if (!item) return <div className="page"><p className="muted">Caricamento…</p></div>;

  const act = async (fn) => { setMsg(null); try { await fn(); reload(); } catch (e) { setMsg(errorMessage(e)); } };
  const addBarcode = (code) => act(async () => { await api(`/stock/items/${item.id}/barcodes`, { method: 'POST', body: { code, packQty: toNumber(pack) || 1 } }); setPack('1'); });
  const removeBarcode = (b) => window.confirm(`Togliere il codice ${b.code}?`) && act(() => api(`/stock/barcodes/${b.id}`, { method: 'DELETE' }));
  async function remove() {
    if (!window.confirm(`Eliminare "${item.name}"? Se ha movimenti verrà solo disattivato.`)) return;
    try { await api(`/stock/items/${item.id}`, { method: 'DELETE' }); nav('/magazzino', { replace: true }); } catch (e) { setMsg(errorMessage(e)); }
  }
  async function saveAdjust(e) {
    e.preventDefault();
    await act(() => api(`/stock/items/${item.id}/adjust`, { method: 'POST', body: { lotId: adjust.lotId || null, quantity: toNumber(adjust.quantity), note: adjust.note || null } }));
    setAdjust(null);
  }
  const undo = (m) => window.confirm('Annullare questo movimento? La giacenza verrà ripristinata.') && act(() => api(`/stock/movements/${m.id}`, { method: 'DELETE' }));
  const st = STOCK_STATUS[item.status];
  const lots = item.lots.filter((l) => l.quantity !== 0);
  const noLot = item.trackLots ? item.quantity - lots.reduce((s, l) => s + l.quantity, 0) : 0;

  return (
    <div className="page">
      <Link to="/magazzino" className="small">← Magazzino</Link>
      <div className="page-head">
        <div>
          <h1>{item.name} {!item.active && <span className="badge badge-outline">disattivato</span>}</h1>
          <div className="muted">{[item.category, item.supplier, item.isImplant && 'impianto tracciato sul paziente'].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="stock-qty">
          <div className="big">{qty(item.quantity)} <small>{item.unit}</small></div>
          <span className="badge" style={{ background: st.color }}>{st.label}</span>
          {item.minStock > 0 && <span className="muted small"> minimo {qty(item.minStock)}</span>}
        </div>
      </div>
      {msg && <div className="alert">{msg}</div>}

      <div className="grid2 align-start">
        <div className="card">
          <h2>{item.trackLots ? 'Lotti in giacenza' : 'Giacenza'}</h2>
          {item.trackLots ? (
            lots.length === 0 && !noLot ? <div className="muted">Nessun lotto in giacenza.</div> : (
              <table className="table">
                <thead><tr><th>Lotto</th><th>Scadenza</th><th className="right">Quantità</th><th /></tr></thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{l.lot}</td>
                      <td className={expiryClass(l.expiry)}>{day(l.expiry) || '—'}</td>
                      <td className="right">{qty(l.quantity)}</td>
                      <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => setAdjust({ lotId: l.id, label: `lotto ${l.lot}`, current: l.quantity, quantity: String(l.quantity).replace('.', ','), note: '' })}>Rettifica</button></td>
                    </tr>
                  ))}
                  {Math.abs(noLot) > 0.0001 && <tr><td colSpan={2} className="muted">senza lotto</td><td className="right">{qty(noLot)}</td><td /></tr>}
                </tbody>
              </table>
            )
          ) : (
            <div className="row">
              <span>Quantità registrata: <b>{qty(item.quantity)} {item.unit}</b></span>
              <button className="btn btn-sm" onClick={() => setAdjust({ lotId: null, label: 'articolo', current: item.quantity, quantity: String(item.quantity).replace('.', ','), note: '' })}>Rettifica inventario</button>
            </div>
          )}
          {adjust && (
            <form className="form done-form" onSubmit={saveAdjust} style={{ marginTop: 10 }}>
              <div className="grid2">
                <label>Quantità contata ({adjust.label})<input autoFocus inputMode="decimal" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} /></label>
                <label>Motivo<input value={adjust.note} placeholder="es. inventario, rottura" onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></label>
              </div>
              <div className="row-end">
                <span className="muted small" style={{ marginRight: 'auto' }}>Registrata ora: {qty(adjust.current)}</span>
                <button type="button" className="btn btn-sm" onClick={() => setAdjust(null)}>Annulla</button>
                <button className="btn btn-sm btn-primary">Salva rettifica</button>
              </div>
            </form>
          )}
        </div>

        <div className="card">
          <h2>Codici a barre</h2>
          {item.barcodes.length === 0 ? <div className="muted small">Nessun codice: leggilo qui sotto per riconoscere l'articolo con il lettore.</div> : (
            <ul className="plain">
              {item.barcodes.map((b) => (
                <li key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span><span className="mono">{b.code}</span>{b.packQty !== 1 && <span className="muted small"> · {qty(b.packQty)} {item.unit} per lettura</span>}</span>
                  {manage && <button className="btn btn-ghost btn-sm" onClick={() => removeBarcode(b)}>✕</button>}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <div className="form" style={{ marginTop: 10 }}>
              <ScanInput autoFocus={false} onScan={addBarcode} placeholder="Leggi un altro codice per questo articolo" />
              <label className="inline small">Pezzi per lettura <input className="w-qty" inputMode="decimal" value={pack} onChange={(e) => setPack(e.target.value)} /> <span className="muted">(es. 10 se il codice è sulla scatola)</span></label>
            </div>
          )}
          {item.serviceMaterials.length > 0 && (
            <>
              <h3>Scaricato in automatico da</h3>
              <ul className="plain small">{item.serviceMaterials.map((m) => <li key={m.serviceId}>{m.service.name}: {qty(m.quantity)} {item.unit}</li>)}</ul>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Dati dell'articolo</h2>
        <ItemForm key={item.updatedAt} initial={item} readOnly={!manage} onSaved={reload} />
        {manage && <div className="row-end" style={{ marginTop: 8 }}><button className="btn btn-danger btn-sm" onClick={remove}>Elimina articolo</button></div>}
      </div>

      <h2>Ultimi movimenti</h2>
      {item.movements.length === 0 ? <div className="empty">Nessun movimento.</div>
        : <MovementsTable movements={item.movements.map((m) => ({ ...m, item }))} user={user} onUndo={undo} showItem={false} />}
    </div>
  );
}
