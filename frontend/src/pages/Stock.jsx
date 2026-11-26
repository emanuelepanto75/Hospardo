import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { DateTime, euro, fmtDateTime } from '../lib/time';
import { groupByCategory } from '../lib/constants';
import MovementForm from '../components/stock/MovementForm';
import Modal from '../components/Modal';
import {
  ItemForm, ItemSearch, MOVE_TYPE, STOCK_STATUS, ScanInput, canManageStock, day, expiryClass, qty, toNumber,
} from '../components/stock/common';

const TABS = [
  ['giacenze', 'Giacenze'], ['carico', 'Carico'], ['scarico', 'Scarico'], ['scadenze', 'Scadenze'],
  ['impianti', 'Impianti'], ['movimenti', 'Movimenti'], ['materiali', 'Materiali per prestazione'],
];

/** Magazzino odontoiatrico */
export default function Stock() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'giacenze';
  const { data: summary, reload: reloadSummary } = useApi('/stock/summary');
  const changed = () => { reloadSummary(); window.dispatchEvent(new Event('hospardo:stock')); };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Magazzino</h1>
        {summary && (
          <div className="row small">
            {summary.lowStock > 0 && <button className="link" onClick={() => setParams({ tab: 'giacenze', filtro: 'sottoscorta' })}>⚠ {summary.lowStock} articoli sottoscorta o esauriti</button>}
            {summary.expiring > 0 && <button className="link" onClick={() => setParams({ tab: 'scadenze' })}>⌛ {summary.expiring} lotti in scadenza</button>}
          </div>
        )}
      </div>
      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      {tab === 'giacenze' && <Inventory user={user} filter={params.get('filtro') || ''} setFilter={(f) => setParams(f ? { tab, filtro: f } : { tab })} />}
      {tab === 'carico' && <MovementForm key="load" mode="load" user={user} onDone={changed} />}
      {tab === 'scarico' && <MovementForm key="unload" mode="unload" user={user} onDone={changed} />}
      {tab === 'scadenze' && <Expiring onChanged={changed} />}
      {tab === 'impianti' && <Implants />}
      {tab === 'movimenti' && <Movements user={user} onChanged={changed} />}
      {tab === 'materiali' && <Materials user={user} />}
    </div>
  );
}

function Inventory({ user, filter, setFilter }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data: items, reload } = useApi('/stock/items', { q: query || undefined, filter: filter || undefined });
  const [creating, setCreating] = useState(null);
  const nav = useNavigate();
  useEffect(() => { const t = setTimeout(() => setQuery(q), 300); return () => clearTimeout(t); }, [q]);

  // lettura con il lettore nella casella di ricerca: apre direttamente l'articolo
  async function onKey(e) {
    if (e.key !== 'Enter' || !q.trim()) return;
    const r = await api('/stock/scan', { query: { code: q } }).catch(() => null);
    if (r?.item) nav(`/magazzino/articoli/${r.item.id}`);
    else if (r && /\d{6,}/.test(q) && canManageStock(user)) { setCreating(q.trim()); setQ(''); }
  }
  const value = (items || []).reduce((s, i) => s + (i.quantity > 0 && i.purchasePriceCents ? i.quantity * i.purchasePriceCents : 0), 0);

  return (
    <>
      <div className="toolbar">
        <input className="search" value={q} placeholder="Cerca per nome, fornitore, categoria o leggi il codice a barre" onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus />
        <div className="segmented">
          <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>Tutti</button>
          <button className={filter === 'sottoscorta' ? 'on' : ''} onClick={() => setFilter('sottoscorta')}>Da riordinare</button>
        </div>
        {canManageStock(user) && <button className="btn btn-primary" onClick={() => setCreating('')}>+ Nuovo articolo</button>}
      </div>
      {!items ? <p className="muted">Caricamento…</p> : items.length === 0 ? <div className="empty">{q || filter ? 'Nessun articolo trovato.' : 'Nessun articolo. Crealo con "+ Nuovo articolo" o leggendo il codice nella scheda Carico.'}</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Articolo</th><th>Fornitore</th><th className="right">Giacenza</th><th className="right">Minimo</th><th>Stato</th><th>Prossima scadenza</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => nav(`/magazzino/articoli/${i.id}`)}>
                  <td><b>{i.name}</b>{i.isImplant && <span className="badge badge-outline">impianto</span>}<div className="muted small">{[i.category, i.code, i.barcodes.length ? `${i.barcodes.length} codici a barre` : 'nessun codice a barre'].filter(Boolean).join(' · ')}</div></td>
                  <td>{i.supplier}</td>
                  <td className="right nowrap"><b>{qty(i.quantity)}</b> {i.unit}</td>
                  <td className="right">{i.minStock ? qty(i.minStock) : <span className="muted">—</span>}</td>
                  <td><span className="badge" style={{ background: STOCK_STATUS[i.status].color }}>{STOCK_STATUS[i.status].label}</span></td>
                  <td className={expiryClass(i.nextExpiry)}>{day(i.nextExpiry)}</td>
                </tr>
              ))}
            </tbody>
            {value > 0 && <tfoot><tr><td colSpan={6} className="right muted small">Valore della giacenza al prezzo di acquisto: <b>{euro(Math.round(value))}</b></td></tr></tfoot>}
          </table>
        </div>
      )}
      {creating != null && (
        <Modal title="Nuovo articolo" wide onClose={() => setCreating(null)}>
          <ItemForm barcode={creating || undefined} onCancel={() => setCreating(null)} onSaved={(it) => { setCreating(null); reload(); nav(`/magazzino/articoli/${it.id}`); }} />
        </Modal>
      )}
    </>
  );
}

function Expiring({ onChanged }) {
  const [days, setDays] = useState(90);
  const { data, reload } = useApi('/stock/expiring', { days });
  const [msg, setMsg] = useState(null);
  async function discard(l) {
    if (!window.confirm(`Scaricare ${qty(l.quantity)} ${l.item.unit} di "${l.item.name}" (lotto ${l.lot}) come scaduti?`)) return;
    try {
      await api('/stock/unload', { method: 'POST', body: { note: 'Scaduto', rows: [{ itemId: l.item.id, lotId: l.id, quantity: l.quantity }] } });
      reload(); onChanged();
    } catch (e) { setMsg(errorMessage(e)); }
  }
  return (
    <>
      <div className="toolbar">
        <span>Lotti con giacenza che scadono entro</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
          {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} giorni</option>)}
        </select>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {!data ? <p className="muted">Caricamento…</p> : data.lots.length === 0 ? <div className="empty">Nessun lotto in scadenza.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Scadenza</th><th>Articolo</th><th>Lotto</th><th className="right">Quantità</th><th>Fornitore</th><th /></tr></thead>
            <tbody>
              {data.lots.map((l) => (
                <tr key={l.id}>
                  <td className={`nowrap ${expiryClass(l.expiry, data.today)}`}>{day(l.expiry)}{l.expiry.slice(0, 10) < data.today && ' (scaduto)'}</td>
                  <td><Link to={`/magazzino/articoli/${l.item.id}`}>{l.item.name}</Link></td>
                  <td className="mono">{l.lot}</td>
                  <td className="right nowrap">{qty(l.quantity)} {l.item.unit}</td>
                  <td>{l.item.supplier}</td>
                  <td className="right"><button className="btn btn-sm" onClick={() => discard(l)}>Scarica come scaduto</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Tracciabilità impianti: ricerca per lotto (anche leggendo il codice), paziente, articolo */
function Implants() {
  const [q, setQ] = useState('');
  const { data } = useApi('/stock/implants', { q: q || undefined });
  async function onScan(raw) {
    const r = await api('/stock/scan', { query: { code: raw } }).catch(() => null);
    setQ(r?.lot || r?.serial || raw.trim());
  }
  return (
    <>
      <p className="muted small">Impianti applicati ai pazienti. Per un richiamo del produttore, leggi il codice della confezione o scrivi il lotto: compaiono tutti i pazienti coinvolti.</p>
      <div className="grid2">
        <ScanInput onScan={onScan} placeholder="Leggi il codice o scrivi lotto / paziente / articolo e premi Invio" />
        {q && <div className="row"><span>Filtro: <b className="mono">{q}</b></span><button className="btn btn-sm" onClick={() => setQ('')}>Mostra tutti</button></div>}
      </div>
      {!data ? <p className="muted">Caricamento…</p> : data.length === 0 ? <div className="empty">Nessun impianto registrato{q ? ' per questa ricerca' : ''}.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Paziente</th><th>Dente</th><th>Impianto</th><th>Lotto</th><th>Scadenza</th><th>Seriale</th></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{m.treatment ? day(m.treatment.date) : DateTime.fromISO(m.createdAt).toFormat('dd/LL/yyyy')}</td>
                  <td><Link to={`/pazienti/${m.patient.id}#odontoiatria`}>{m.patient.lastName} {m.patient.firstName}</Link></td>
                  <td>{m.tooth || '—'}</td>
                  <td>{m.item.name}{Math.abs(m.quantity) !== 1 && <span className="muted"> × {qty(-m.quantity)}</span>}</td>
                  <td className="mono">{m.lot?.lot || '—'}</td>
                  <td>{day(m.lot?.expiry)}</td>
                  <td className="mono">{m.serial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function MovementsTable({ movements, user, onUndo, showItem = true }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Data</th>{showItem && <th>Articolo</th>}<th>Tipo</th><th className="right">Quantità</th><th>Lotto</th><th>Dettagli</th><th /></tr></thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td className="nowrap small">{fmtDateTime(m.createdAt)}</td>
              {showItem && <td><Link to={`/magazzino/articoli/${m.item.id}`}>{m.item.name}</Link></td>}
              <td>{MOVE_TYPE[m.type]}{m.auto && <div className="muted small">automatico</div>}</td>
              <td className={`right nowrap ${m.quantity < 0 ? 'neg' : 'pos'}`}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity)}</td>
              <td className="mono small">{m.lot?.lot}{m.lot?.expiry && <div className="muted">scad. {day(m.lot.expiry)}</div>}</td>
              <td className="small">
                {[m.supplier, m.document, m.unitCostCents != null && `${euro(m.unitCostCents)} cad.`].filter(Boolean).join(' · ')}
                {m.patient && <div><Link to={`/pazienti/${m.patient.id}`}>{m.patient.lastName} {m.patient.firstName}</Link>{m.tooth ? ` · dente ${m.tooth}` : ''}{m.serial ? ` · s/n ${m.serial}` : ''}</div>}
                {m.treatment && <div className="muted">{m.treatment.description}</div>}
                {m.note && <div className="muted">{m.note}</div>}
              </td>
              <td className="right">{onUndo && !m.auto && (['SUPERADMIN', 'ADMIN'].includes(user.role) || m.createdById === user.id) && (
                <button className="btn btn-ghost btn-sm" title="Annulla il movimento (errore di inserimento)" onClick={() => onUndo(m)}>Annulla</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Movements({ user, onChanged }) {
  const [f, setF] = useState({ type: '', from: DateTime.now().minus({ days: 30 }).toISODate(), to: '' });
  const query = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const { data, reload } = useApi('/stock/movements', query);
  const [msg, setMsg] = useState(null);
  async function undo(m) {
    if (!window.confirm('Annullare questo movimento? La giacenza verrà ripristinata.')) return;
    try { await api(`/stock/movements/${m.id}`, { method: 'DELETE' }); reload(); onChanged(); } catch (e) { setMsg(errorMessage(e)); }
  }
  return (
    <>
      <div className="toolbar">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={{ width: 'auto' }}>
          <option value="">Tutti i movimenti</option>
          {Object.entries(MOVE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="inline">dal <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="inline">al <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {!data ? <p className="muted">Caricamento…</p> : data.length === 0 ? <div className="empty">Nessun movimento nel periodo.</div>
        : <MovementsTable movements={data} user={user} onUndo={undo} />}
    </>
  );
}

/** Materiali consumati da ogni prestazione: scaricati in automatico quando il trattamento è registrato */
function Materials({ user }) {
  const { data: rows, reload } = useApi('/stock/materials');
  const { data: services } = useApi('/services');
  const [edit, setEdit] = useState(null); // { service, items: [{item, quantity}] }
  const [msg, setMsg] = useState(null);
  const manage = canManageStock(user);
  const dental = (services || []).filter((s) => s.active && (/odont/i.test(s.category || '') || rows?.some((r) => r.serviceId === s.id)));
  const byService = (id) => (rows || []).filter((r) => r.serviceId === id);

  async function save() {
    setMsg(null);
    try {
      await api(`/stock/materials/${edit.service.id}`, { method: 'PUT', body: { items: edit.items.map((i) => ({ itemId: i.item.id, quantity: toNumber(i.quantity) })) } });
      setEdit(null); reload();
    } catch (e) { setMsg(errorMessage(e)); }
  }
  const add = (item) => !edit.items.some((i) => i.item.id === item.id) && setEdit({ ...edit, items: [...edit.items, { item, quantity: '1' }] });

  return (
    <>
      <p className="muted small">Quando un odontoiatra registra un trattamento nel diario (anche da piano di cura) con una di queste prestazioni, i materiali indicati vengono scaricati in automatico dai lotti che scadono prima. Se il trattamento viene eliminato, tornano in giacenza.</p>
      {!services || !rows ? <p className="muted">Caricamento…</p> : dental.length === 0 ? <div className="empty">Nessuna prestazione di categoria Odontoiatria.</div> : (
        Object.entries(groupByCategory(dental)).map(([cat, list]) => (
          <div key={cat}>
            <h3>{cat}</h3>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id}>
                      <td style={{ width: '35%' }}><b>{s.name}</b></td>
                      <td>{byService(s.id).length ? byService(s.id).map((r) => `${r.item.name} × ${qty(r.quantity)} ${r.item.unit}`).join(' · ') : <span className="muted">nessun materiale</span>}</td>
                      <td className="right">{manage && <button className="btn btn-sm" onClick={() => setEdit({ service: s, items: byService(s.id).map((r) => ({ item: r.item, quantity: String(r.quantity).replace('.', ',') })) })}>Modifica</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {edit && (
        <Modal title={`Materiali – ${edit.service.name}`} wide onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Annulla</button><button className="btn btn-primary" onClick={save}>Salva</button></>}>
          <div className="form">
            <ScanInput onScan={async (raw) => { const r = await api('/stock/scan', { query: { code: raw } }).catch(() => null); if (r?.item) add(r.item); else setMsg(`Codice ${raw} non associato a nessun articolo`); }} />
            <ItemSearch onPick={add} />
            {msg && <div className="alert">{msg}</div>}
            {edit.items.length === 0 ? <div className="muted">Nessun materiale: leggi un codice o cerca un articolo.</div> : (
              <table className="table">
                <tbody>
                  {edit.items.map((i, idx) => (
                    <tr key={i.item.id}>
                      <td>{i.item.name}</td>
                      <td className="nowrap"><input className="w-qty" inputMode="decimal" value={i.quantity} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === idx ? { ...x, quantity: e.target.value } : x)) })} /> {i.item.unit}</td>
                      <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== idx) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
