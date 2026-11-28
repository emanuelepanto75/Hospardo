import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { patientName } from '../../lib/constants';
import PatientPicker from '../PatientPicker';
import { ItemForm, ItemSearch, ScanInput, canManageStock, day, qty, toCents, toNumber } from './common';

const looksLikeCode = (s) => /^[\x1d\]()A-Za-z0-9+\-./]*\d{4,}[\x1d()A-Za-z0-9+\-./]*$/.test(s.trim()) && !/\s/.test(s.trim());

/**
 * Carico (mode="load") o scarico (mode="unload") con il lettore di codici a barre.
 * Ogni lettura aggiunge una riga (o aumenta la quantità se articolo e lotto sono già in elenco).
 */
export default function MovementForm({ mode, user, onDone }) {
  const load = mode === 'load';
  const [rows, setRows] = useState([]);
  const [head, setHead] = useState({ supplier: '', document: '', note: '' });
  const [patient, setPatient] = useState(null);
  const [unknown, setUnknown] = useState(null); // codice letto non associato
  const [msg, setMsg] = useState(null);
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const manage = canManageStock(user);

  function addRow(item, info = {}) {
    setOk(null);
    if (!load && info.lot && !item.lots?.some((l) => l.lot === info.lot && l.quantity > 0)) {
      setMsg(`Attenzione: il lotto ${info.lot} di "${item.name}" non risulta in giacenza (non caricato o già esaurito).`);
    }
    setRows((prev) => {
      const lotId = !load && info.lot ? item.lots?.find((l) => l.lot === info.lot)?.id ?? '' : '';
      const idx = prev.findIndex((r) => r.item.id === item.id && (r.lot || '') === (info.lot || '') && (!info.serial || r.serial === info.serial));
      const add = info.packQty || 1;
      if (idx >= 0 && !info.serial) return prev.map((r, i) => (i === idx ? { ...r, quantity: String(toNumber(r.quantity) + add).replace('.', ',') } : r));
      return [...prev, {
        key: `${item.id}-${Date.now()}`, item, quantity: String(add).replace('.', ','),
        lot: info.lot || '', expiry: info.expiry || '', serial: info.serial || '', lotId, tooth: '',
        cost: load && item.purchasePriceCents != null ? (item.purchasePriceCents / 100).toFixed(2).replace('.', ',') : '',
      }];
    });
  }

  async function onScan(raw) {
    setMsg(null);
    setUnknown(null);
    if (!looksLikeCode(raw)) {
      // testo libero: cerca per nome
      const found = await api('/stock/items', { query: { q: raw } }).catch(() => []);
      if (found.length === 1) addRow(found[0]);
      else setMsg(found.length ? `Più articoli corrispondono a "${raw}": sceglilo dalla ricerca qui sotto.` : `Nessun articolo per "${raw}".`);
      return;
    }
    setBusy(true);
    try {
      const r = await api('/stock/scan', { query: { code: raw } });
      if (r.item) {
        if (!r.item.active) setMsg(`Attenzione: "${r.item.name}" è disattivato.`);
        addRow(r.item, r);
      } else setUnknown(r);
    } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  }

  async function linkToExisting(item) {
    try {
      await api(`/stock/items/${item.id}/barcodes`, { method: 'POST', body: { code: unknown.code, packQty: 1 } });
      const full = await api(`/stock/items/${item.id}`);
      addRow(full, unknown);
      setUnknown(null);
    } catch (e) { setMsg(errorMessage(e)); }
  }

  const upd = (i, patch) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit() {
    setMsg(null);
    setBusy(true);
    try {
      if (load) {
        await api('/stock/load', {
          method: 'POST',
          body: {
            supplier: head.supplier || null, document: head.document || null, note: head.note || null,
            rows: rows.map((r) => ({ itemId: r.item.id, quantity: toNumber(r.quantity), lot: r.lot || null, expiry: r.expiry || null, unitCostCents: toCents(r.cost) })),
          },
        });
      } else {
        await api('/stock/unload', {
          method: 'POST',
          body: {
            patientId: patient?.id || null, note: head.note || null,
            rows: rows.map((r) => ({
              itemId: r.item.id, quantity: toNumber(r.quantity), lotId: r.lotId ? Number(r.lotId) : null,
              lot: !r.lotId && r.lot ? r.lot : null, tooth: r.tooth ? Number(r.tooth) : null, serial: r.serial || null,
            })),
          },
        });
      }
      setOk(`${load ? 'Carico' : 'Scarico'} registrato: ${rows.length} ${rows.length === 1 ? 'riga' : 'righe'}.`);
      setRows([]);
      setHead({ supplier: '', document: '', note: '' });
      setPatient(null);
      onDone?.();
    } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  }

  const needsPatient = !load && rows.some((r) => r.item.isImplant);

  return (
    <div className="card form">
      <h2>{load ? 'Carico merce' : 'Scarico'}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {load
          ? 'Leggi i codici dei prodotti arrivati: ogni lettura aggiunge una riga. Dai codici GS1 (impianti, dispositivi) lotto e scadenza si compilano da soli.'
          : 'Leggi i codici dei prodotti usati, scaduti o danneggiati. Per gli impianti indica paziente, dente e lotto: restano tracciati nella scheda del paziente.'}
      </p>
      <ScanInput onScan={onScan} busy={busy} />
      <ItemSearch onPick={(i) => addRow(i)} placeholder="…oppure cerca l'articolo per nome" />

      {unknown && (
        <div className="notice unknown-code">
          <b>Codice non riconosciuto:</b> <span className="mono">{unknown.raw}</span>
          {unknown.lot && <span> · lotto {unknown.lot}</span>}{unknown.expiry && <span> · scadenza {day(unknown.expiry)}</span>}
          {manage ? (
            <div className="grid2" style={{ marginTop: 10 }}>
              <div>
                <div className="label">Associa il codice a un articolo esistente</div>
                <ItemSearch onPick={linkToExisting} />
              </div>
              <div>
                <div className="label">Oppure crea un nuovo articolo</div>
                <button type="button" className="btn btn-sm" onClick={() => setUnknown({ ...unknown, creating: true })}>+ Nuovo articolo con questo codice</button>
              </div>
            </div>
          ) : <div className="small">Chiedi alla segreteria di registrare l'articolo.</div>}
          {unknown.creating && (
            <div className="card" style={{ marginTop: 10 }}>
              <ItemForm barcode={unknown.raw} initial={unknown.isImplant ? { isImplant: true } : undefined}
                onCancel={() => setUnknown({ ...unknown, creating: false })}
                onSaved={async (item) => { const full = await api(`/stock/items/${item.id}`); addRow(full, unknown); setUnknown(null); }} />
            </div>
          )}
        </div>
      )}
      {msg && <div className="alert">{msg}</div>}
      {ok && <div className="notice">{ok}</div>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table move-rows">
            <thead>
              <tr>
                <th>Articolo</th><th>Lotto</th>{load ? <th>Scadenza</th> : <th>Dente</th>}<th>Quantità</th>
                {load ? <th>Costo unit. €</th> : <th>Seriale</th>}<th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const lots = (r.item.lots || []).filter((l) => l.quantity > 0);
                return (
                  <tr key={r.key}>
                    <td><b>{r.item.name}</b>{r.item.isImplant && <span className="badge badge-outline">impianto</span>}<div className="muted small">giacenza {qty(r.item.quantity)} {r.item.unit}</div></td>
                    <td>
                      {load ? <input className="w-lot" value={r.lot} required={r.item.trackLots} placeholder={r.item.trackLots ? 'obbligatorio' : ''} onChange={(e) => upd(i, { lot: e.target.value })} />
                        : r.item.trackLots ? (
                          <select value={r.lotId} onChange={(e) => upd(i, { lotId: e.target.value })}>
                            <option value="">{r.item.isImplant ? '— scegli il lotto —' : 'automatico (prima scadenza)'}</option>
                            {lots.map((l) => <option key={l.id} value={l.id}>{l.lot}{l.expiry ? ` · scad. ${day(l.expiry)}` : ''} · {qty(l.quantity)}</option>)}
                          </select>
                        ) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {load ? <input type="date" value={r.expiry} onChange={(e) => upd(i, { expiry: e.target.value })} />
                        : <input className="w-tooth" inputMode="numeric" value={r.tooth} placeholder={patient ? '' : '—'} disabled={!patient} onChange={(e) => upd(i, { tooth: e.target.value.replace(/\D/g, '').slice(0, 2) })} />}
                    </td>
                    <td className="nowrap"><input className="w-qty" inputMode="decimal" value={r.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /> <span className="muted small">{r.item.unit}</span></td>
                    <td>{load ? <input className="w-price" inputMode="decimal" value={r.cost} onChange={(e) => upd(i, { cost: e.target.value })} />
                      : <input className="w-lot" value={r.serial} onChange={(e) => upd(i, { serial: e.target.value })} />}</td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows(rows.filter((_, x) => x !== i))}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {load ? (
            <div className="grid3">
              <label>Fornitore<input value={head.supplier} onChange={(e) => setHead({ ...head, supplier: e.target.value })} /></label>
              <label>Documento (DDT / fattura)<input value={head.document} onChange={(e) => setHead({ ...head, document: e.target.value })} /></label>
              <label>Note<input value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} /></label>
            </div>
          ) : (
            <div className="grid2">
              <div>
                <div className="label">Paziente {needsPatient ? '*' : '(facoltativo)'}</div>
                <PatientPicker value={patient} onChange={setPatient} autoFocus={false} />
              </div>
              <label>Motivo / note<input value={head.note} placeholder="es. uso in studio, scaduto, danneggiato" onChange={(e) => setHead({ ...head, note: e.target.value })} /></label>
            </div>
          )}
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setRows([])}>Svuota</button>
            <button type="button" className="btn btn-primary" disabled={busy || (needsPatient && !patient)} onClick={submit}>
              {load ? 'Registra carico' : `Registra scarico${patient ? ` per ${patientName(patient)}` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
