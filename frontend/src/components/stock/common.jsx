import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { DateTime } from '../../lib/time';

export const qty = (n) => (n == null ? '' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: 3 }));
export const day = (d) => (d ? DateTime.fromISO(d, { zone: 'utc' }).toFormat('dd/LL/yyyy') : '');
export const STOCK_STATUS = {
  OK: { label: 'Disponibile', color: '#16a34a' },
  SOTTOSCORTA: { label: 'Sottoscorta', color: '#d97706' },
  ESAURITO: { label: 'Esaurito', color: '#dc2626' },
};
export const MOVE_TYPE = { CARICO: 'Carico', SCARICO: 'Scarico', RETTIFICA: 'Rettifica' };
export const canManageStock = (user) => ['SUPERADMIN', 'ADMIN', 'SEGRETERIA'].includes(user.role);
/** "18,50" → 1850 */
export const toCents = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const toNumber = (v) => Number(String(v).replace(',', '.'));
export const expiryClass = (d, today = DateTime.now().toISODate()) => {
  if (!d) return '';
  const iso = d.slice(0, 10);
  if (iso < today) return 'exp-past';
  if (iso <= DateTime.fromISO(today).plus({ days: 60 }).toISODate()) return 'exp-soon';
  return '';
};

/**
 * Campo per il lettore di codici a barre: il lettore "digita" il codice e preme Invio.
 * Resta selezionato dopo ogni lettura, così si possono leggere più prodotti di fila.
 */
export function ScanInput({ onScan, placeholder = 'Leggi il codice a barre o scrivi e premi Invio', autoFocus = true }) {
  const [v, setV] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <div className="scan-input">
      <span aria-hidden>▮▯▮▮▯▮</span>
      <input ref={ref} value={v} placeholder={placeholder} autoComplete="off" spellCheck={false}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== 'Tab') return;
          if (!v.trim()) return;
          e.preventDefault();
          const code = v;
          setV('');
          Promise.resolve(onScan(code)).finally(() => ref.current?.focus());
        }} />
    </div>
  );
}

/** Ricerca di un articolo per nome / codice (anche con il lettore) */
export function ItemSearch({ onPick, placeholder = 'Cerca articolo…' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api('/stock/items', { query: { q } }).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="ac">
      <input value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div className="ac-list">
          {res.slice(0, 10).map((i) => (
            <button type="button" key={i.id} className="ac-item" onClick={() => { onPick(i); setQ(''); setRes([]); }}>
              <b>{i.name}</b> <span className="muted small">{[i.category, i.supplier, `giacenza ${qty(i.quantity)} ${i.unit}`].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const emptyItem = { name: '', code: '', category: '', supplier: '', unit: 'pz', price: '', minStock: '0', trackLots: false, isImplant: false, active: true, notes: '' };

/** Anagrafica articolo (nuovo o modifica) */
export function ItemForm({ initial, barcode, onSaved, onCancel, readOnly }) {
  const [f, setF] = useState(() => ({
    ...emptyItem,
    ...(initial ? Object.fromEntries(Object.entries(initial).filter(([k]) => k in emptyItem).map(([k, v]) => [k, v ?? ''])) : {}),
    price: initial?.purchasePriceCents != null ? (initial.purchasePriceCents / 100).toFixed(2).replace('.', ',') : '',
    minStock: initial ? String(initial.minStock).replace('.', ',') : '0',
    packQty: '1',
  }));
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const body = {
      name: f.name, code: f.code || null, category: f.category || null, supplier: f.supplier || null, unit: f.unit || 'pz',
      purchasePriceCents: toCents(f.price), minStock: toNumber(f.minStock || 0) || 0, trackLots: f.trackLots, isImplant: f.isImplant,
      active: f.active, notes: f.notes || null,
      ...(barcode && !initial?.id ? { barcode, packQty: toNumber(f.packQty) || 1 } : {}),
    };
    try {
      const saved = initial?.id ? await api(`/stock/items/${initial.id}`, { method: 'PUT', body }) : await api('/stock/items', { method: 'POST', body });
      onSaved(saved);
    } catch (e2) { setMsg(errorMessage(e2)); }
  }
  return (
    <form className="form" onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <div className="grid3">
          <label style={{ gridColumn: 'span 2' }}>Nome articolo *<input required autoFocus={!initial?.id} value={f.name} onChange={set('name')} /></label>
          <label>Codice interno<input value={f.code} onChange={set('code')} /></label>
          <label>Categoria<input value={f.category} onChange={set('category')} placeholder="es. Conservativa, Implantologia" /></label>
          <label>Fornitore<input value={f.supplier} onChange={set('supplier')} /></label>
          <label>Unità di misura<input value={f.unit} onChange={set('unit')} placeholder="pz, conf, ml…" /></label>
          <label>Prezzo di acquisto €<input inputMode="decimal" value={f.price} onChange={set('price')} /></label>
          <label>Scorta minima<input inputMode="decimal" value={f.minStock} onChange={set('minStock')} /></label>
          {barcode && !initial?.id && <label>Pezzi per lettura del codice<input inputMode="decimal" value={f.packQty} onChange={set('packQty')} title="es. 10 se il codice è sulla scatola da 10" /></label>}
        </div>
        {barcode && !initial?.id && <div className="muted small">Codice a barre: <span className="mono">{barcode}</span></div>}
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.trackLots || f.isImplant} disabled={f.isImplant} onChange={set('trackLots')} /> Gestione per lotti e scadenze</label>
          <label className="check"><input type="checkbox" checked={f.isImplant} onChange={set('isImplant')} /> Impianto / dispositivo da tracciare sul paziente</label>
          {initial?.id && <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Attivo</label>}
        </div>
        <label>Note<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      </fieldset>
      {msg && <div className="alert">{msg}</div>}
      {!readOnly && (
        <div className="row-end">
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Annulla</button>}
          <button className="btn btn-primary">{initial?.id ? 'Salva' : 'Crea articolo'}</button>
        </div>
      )}
    </form>
  );
}
