import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { DateTime, fmtDate, fmtDateTime } from '../lib/time';
import { doctorName, isAdmin } from '../lib/constants';

/** Stati del dente: etichetta, colore e sigla mostrata sotto il numero */
export const TOOTH_STATUS = {
  SANO: { label: 'Sano', color: '#ffffff', short: '' },
  CARIE: { label: 'Carie', color: '#fecaca', short: 'C' },
  OTTURATO: { label: 'Otturato', color: '#bfdbfe', short: 'O' },
  DEVITALIZZATO: { label: 'Devitalizzato', color: '#fde68a', short: 'D' },
  CORONA: { label: 'Corona', color: '#fcd34d', short: 'Cr' },
  IMPIANTO: { label: 'Impianto', color: '#c7d2fe', short: 'Imp' },
  PONTE: { label: 'Ponte', color: '#ddd6fe', short: 'P' },
  MANCANTE: { label: 'Mancante', color: '#e5e7eb', short: 'X' },
  DA_ESTRARRE: { label: 'Da estrarre', color: '#fca5a5', short: 'Est' },
};
const SURFACE_STATUS = { CARIE: { label: 'Carie', color: '#dc2626' }, OTTURAZIONE: { label: 'Otturazione', color: '#2563eb' } };
const SURFACE_NAMES = { O: 'Occlusale', M: 'Mesiale', D: 'Distale', V: 'Vestibolare', L: 'Linguale / palatale' };
const nextSurface = { undefined: 'CARIE', CARIE: 'OTTURAZIONE', OTTURAZIONE: undefined };

const PERMANENT = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};
const DECIDUOUS = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};

const S = 34; // lato del dente nel disegno
const GAP = 6;

/**
 * Un dente come quadrato diviso in 5 superfici. In alto la superficie vestibolare (verso le labbra),
 * in basso quella linguale/palatale; mesiale verso il centro dell'arcata.
 */
function Tooth({ n, x, y, data, selected, onSelect, onSurface }) {
  const st = TOOTH_STATUS[data?.status || 'SANO'];
  const surf = data?.surfaces || {};
  const q = Math.floor(n / 10) % 4; // 1,2,3,4 (5→1, 6→2, 7→3, 8→0→4)
  const rightSide = q === 1 || q === 0; // quadranti 1 e 4: lato destro del paziente, a sinistra nel disegno
  const left = rightSide ? 'D' : 'M';
  const right = rightSide ? 'M' : 'D';
  const i = S * 0.3; // margine del quadrato interno
  const fill = (k) => SURFACE_STATUS[surf[k]]?.color || st.color;
  const poly = (k, pts) => (
    <polygon key={k} points={pts} fill={fill(k)} stroke="#64748b" strokeWidth="0.8"
      onClick={(e) => { e.stopPropagation(); onSurface(n, k); }}>
      <title>{`${n} – ${SURFACE_NAMES[k]}${surf[k] ? `: ${SURFACE_STATUS[surf[k]].label}` : ''}`}</title>
    </polygon>
  );
  return (
    <g transform={`translate(${x},${y})`} className="tooth" onClick={() => onSelect(n)} style={{ cursor: 'pointer' }}>
      <text x={S / 2} y={-6} textAnchor="middle" fontSize="11" fontWeight={selected ? 700 : 500} fill={selected ? '#0e7490' : '#334155'}>{n}</text>
      {selected && <rect x={-3} y={-3} width={S + 6} height={S + 6} rx="4" fill="none" stroke="#0e7490" strokeWidth="2" />}
      {poly('V', `0,0 ${S},0 ${S - i},${i} ${i},${i}`)}
      {poly('L', `0,${S} ${S},${S} ${S - i},${S - i} ${i},${S - i}`)}
      {poly(left, `0,0 ${i},${i} ${i},${S - i} 0,${S}`)}
      {poly(right, `${S},0 ${S - i},${i} ${S - i},${S - i} ${S},${S}`)}
      {poly('O', `${i},${i} ${S - i},${i} ${S - i},${S - i} ${i},${S - i}`)}
      {data?.status === 'MANCANTE' && <path d={`M2,2 L${S - 2},${S - 2} M${S - 2},2 L2,${S - 2}`} stroke="#475569" strokeWidth="2.5" pointerEvents="none" />}
      {data?.status === 'DA_ESTRARRE' && <path d={`M2,2 L${S - 2},${S - 2} M${S - 2},2 L2,${S - 2}`} stroke="#dc2626" strokeWidth="2" strokeDasharray="3 2" pointerEvents="none" />}
      {data?.status === 'CORONA' && <circle cx={S / 2} cy={S / 2} r={S / 2 - 1} fill="none" stroke="#b45309" strokeWidth="2.5" pointerEvents="none" />}
      {data?.status === 'IMPIANTO' && <rect x={1} y={1} width={S - 2} height={S - 2} fill="none" stroke="#4338ca" strokeWidth="2.5" pointerEvents="none" />}
      {data?.status === 'DEVITALIZZATO' && <line x1={S / 2} y1={2} x2={S / 2} y2={S - 2} stroke="#b45309" strokeWidth="2.5" pointerEvents="none" />}
      <text x={S / 2} y={S + 13} textAnchor="middle" fontSize="10" fill="#475569">{st.short}</text>
      {data?.note && <circle cx={S - 2} cy={-10} r="3" fill="#0e7490"><title>{data.note}</title></circle>}
    </g>
  );
}

function Odontogram({ teeth, deciduous, selected, onSelect, onSurface }) {
  const map = useMemo(() => Object.fromEntries(teeth.map((t) => [t.tooth, t])), [teeth]);
  const rows = deciduous ? DECIDUOUS : PERMANENT;
  const count = rows.upper.length;
  const mid = count / 2;
  const width = count * (S + GAP) + 24;
  const xOf = (idx) => 4 + idx * (S + GAP) + (idx >= mid ? 16 : 0);
  const rowY = { upper: 18, lower: 18 + S + 44 };
  return (
    <svg className="odontogram" viewBox={`0 0 ${width} ${rowY.lower + S + 20}`} role="img" aria-label="Odontogramma">
      <line x1={xOf(mid) - 10} y1={4} x2={xOf(mid) - 10} y2={rowY.lower + S + 16} stroke="#cbd5e1" strokeDasharray="4 3" />
      <line x1={0} y1={rowY.upper + S + 22} x2={width} y2={rowY.upper + S + 22} stroke="#cbd5e1" strokeDasharray="4 3" />
      {['upper', 'lower'].map((r) => rows[r].map((n, idx) => (
        <Tooth key={n} n={n} x={xOf(idx)} y={rowY[r]} data={map[n]} selected={selected === n} onSelect={onSelect} onSurface={onSurface} />
      )))}
    </svg>
  );
}

/** Pannello del dente selezionato: stato, superfici, nota e trattamenti eseguiti su quel dente */
function ToothPanel({ tooth, data, treatments, onSaved, onClose, onAddTreatment }) {
  const [status, setStatus] = useState(data?.status || 'SANO');
  const [surfaces, setSurfaces] = useState(data?.surfaces || {});
  const [note, setNote] = useState(data?.note || '');
  const [msg, setMsg] = useState(null);
  const history = treatments.filter((t) => t.tooth === tooth);

  async function save() {
    setMsg(null);
    try {
      await api(`${onSaved.base}/teeth/${tooth}`, { method: 'PUT', body: { status, surfaces, note: note || null } });
      onSaved();
    } catch (e) { setMsg(errorMessage(e)); }
  }

  return (
    <div className="card tooth-panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Dente {tooth}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div className="form">
        <label>Stato
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(TOOTH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <div className="label">Superfici <span className="muted small">(clic: carie → otturazione → nessuna)</span></div>
        <div className="surface-grid">
          {Object.entries(SURFACE_NAMES).map(([k, name]) => (
            <button type="button" key={k} className="btn btn-sm" title={name}
              style={surfaces[k] ? { background: SURFACE_STATUS[surfaces[k]].color, color: '#fff', borderColor: SURFACE_STATUS[surfaces[k]].color } : undefined}
              onClick={() => { const v = nextSurface[surfaces[k]]; const s = { ...surfaces }; if (v) s[k] = v; else delete s[k]; setSurfaces(s); }}>
              {k} {surfaces[k] ? `· ${SURFACE_STATUS[surfaces[k]].label}` : ''}
            </button>
          ))}
        </div>
        <label>Nota<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {msg && <div className="alert">{msg}</div>}
        <div className="row-end">
          <button className="btn" onClick={() => onAddTreatment(tooth, Object.keys(surfaces).join(''))}>+ Trattamento su questo dente</button>
          <button className="btn btn-primary" onClick={save}>Salva dente</button>
        </div>
        {data?.updatedAt && <div className="muted small">Ultima modifica: {fmtDateTime(data.updatedAt)}</div>}
      </div>
      <h4>Trattamenti sul dente</h4>
      {history.length === 0 ? <div className="muted small">Nessuno.</div> : (
        <ul className="plain small">
          {history.map((t) => <li key={t.id}><b>{fmtDate(t.date)}</b> – {t.description}{t.surfaces ? ` (${t.surfaces})` : ''} · {doctorName(t.doctor)}</li>)}
        </ul>
      )}
    </div>
  );
}

const today = () => DateTime.now().toISODate();

function TreatmentForm({ base, initial, dentists, services, appointments, defaultDoctorId, onSaved, onCancel }) {
  const [f, setF] = useState(() => ({
    date: initial?.date ? initial.date.slice(0, 10) : today(),
    doctorId: initial?.doctorId || defaultDoctorId || dentists.find((d) => d.active)?.id || '',
    tooth: initial?.tooth ?? '',
    surfaces: initial?.surfaces || '',
    serviceId: initial?.serviceId || '',
    appointmentId: initial?.appointmentId || '',
    description: initial?.description || '',
    notes: initial?.notes || '',
    toothStatus: '',
  }));
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pickService(e) {
    const id = e.target.value;
    const s = services.find((x) => x.id === Number(id));
    setF({ ...f, serviceId: id, description: f.description || s?.name || '' });
  }
  function pickAppointment(e) {
    const id = e.target.value;
    const a = appointments.find((x) => x.id === Number(id));
    setF({ ...f, appointmentId: id, ...(a ? { date: DateTime.fromISO(a.start).toISODate(), doctorId: a.doctorId } : {}) });
  }

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const body = {
      date: f.date, doctorId: Number(f.doctorId), tooth: f.tooth === '' ? null : Number(f.tooth),
      surfaces: f.surfaces || null, serviceId: f.serviceId ? Number(f.serviceId) : null,
      appointmentId: f.appointmentId ? Number(f.appointmentId) : null, description: f.description,
      notes: f.notes || null, toothStatus: f.toothStatus || null,
    };
    try {
      await api(initial?.id ? `${base}/treatments/${initial.id}` : `${base}/treatments`, { method: initial?.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e2) { setMsg(errorMessage(e2)); }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h3 style={{ margin: 0 }}>{initial?.id ? 'Modifica trattamento' : 'Nuovo trattamento'}</h3>
      <div className="grid3">
        <label>Data *<input type="date" required value={f.date} onChange={set('date')} /></label>
        <label>Odontoiatra *
          <select required value={f.doctorId} onChange={set('doctorId')}>
            <option value="">—</option>
            {dentists.map((d) => <option key={d.id} value={d.id}>{doctorName(d)}{d.active ? '' : ' (non attivo)'}</option>)}
          </select>
        </label>
        <label>Appuntamento collegato
          <select value={f.appointmentId} onChange={pickAppointment}>
            <option value="">—</option>
            {appointments.map((a) => <option key={a.id} value={a.id}>{fmtDateTime(a.start)}{a.service ? ` · ${a.service.name}` : ''}</option>)}
          </select>
        </label>
        <label>Dente (FDI)<input inputMode="numeric" placeholder="es. 36, vuoto = generale" value={f.tooth} onChange={set('tooth')} /></label>
        <label>Superfici<input placeholder="es. OM" maxLength={5} value={f.surfaces} onChange={(e) => setF({ ...f, surfaces: e.target.value.toUpperCase().replace(/[^OMDVL]/g, '') })} /></label>
        <label>Prestazione
          <select value={f.serviceId} onChange={pickService}>
            <option value="">—</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <label>Descrizione *<input required value={f.description} onChange={set('description')} placeholder="es. Otturazione in composito" /></label>
      <label>Note cliniche<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      {f.tooth !== '' && (
        <label style={{ maxWidth: 320 }}>Aggiorna lo stato del dente a
          <select value={f.toothStatus} onChange={set('toothStatus')}>
            <option value="">— non cambiare —</option>
            {Object.entries(TOOTH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      )}
      {msg && <div className="alert">{msg}</div>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onCancel}>Annulla</button>
        <button className="btn btn-primary">Salva</button>
      </div>
    </form>
  );
}

/** Sezione Odontoiatria della scheda paziente (odontoiatri e amministratori) */
export default function DentalChart({ patientId, user, onEnabledChange }) {
  const base = `/dental/patients/${patientId}`;
  const { data, error, reload } = useApi(base);
  const [deciduous, setDeciduous] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null); // null | {} nuovo | trattamento da modificare
  const [msg, setMsg] = useState(null);
  const ref = useRef(null);
  const loaded = !!data;
  useEffect(() => {
    if (loaded && window.location.hash === '#odontoiatria') ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loaded]);

  if (error) return <div className="alert">{error.message}</div>;
  if (!data) return <p className="muted">Caricamento cartella dentale…</p>;

  const toothData = (n) => data.teeth.find((t) => t.tooth === n);
  const canEdit = (t) => isAdmin(user) || t.createdById === user.id;
  const save = Object.assign(() => reload(), { base });

  async function cycleSurface(n, k) {
    const cur = toothData(n);
    const surfaces = { ...(cur?.surfaces || {}) };
    const v = nextSurface[surfaces[k]];
    if (v) surfaces[k] = v; else delete surfaces[k];
    setSelected(n);
    try {
      await api(`${base}/teeth/${n}`, { method: 'PUT', body: { status: cur?.status || 'SANO', surfaces, note: cur?.note || null } });
      reload();
    } catch (e) { setMsg(errorMessage(e)); }
  }

  async function remove(t) {
    if (!window.confirm(`Eliminare il trattamento del ${fmtDate(t.date)} "${t.description}"?`)) return;
    try { await api(`${base}/treatments/${t.id}`, { method: 'DELETE' }); reload(); } catch (e) { setMsg(errorMessage(e)); }
  }

  const defaultDoctorId = user.role === 'MEDICO' ? user.doctorId : undefined;

  async function setEnabled(enabled) {
    if (!enabled && !window.confirm('Disattivare la cartella dentale di questo paziente? Potrai riattivarla in qualsiasi momento.')) return;
    setMsg(null);
    try { await api(`${base}/enabled`, { method: 'PUT', body: { enabled } }); setSelected(null); setForm(null); reload(); onEnabledChange?.(); } catch (e) { setMsg(errorMessage(e)); }
  }

  if (!data.dentalEnabled) {
    return (
      <section className="dental" id="odontoiatria" ref={ref}>
        <div className="card row dental-off">
          <div style={{ flex: 1 }}>
            <b>Cartella dentale non attiva</b>
            <div className="muted small">Attivala se il paziente è seguito dall'odontoiatria: comparirà l'odontogramma con il diario dei trattamenti.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setEnabled(true)}>Attiva cartella dentale</button>
        </div>
        {msg && <div className="alert">{msg}</div>}
      </section>
    );
  }
  const empty = !data.treatments.length && !data.teeth.some((t) => t.status !== 'SANO' || t.note || Object.keys(t.surfaces || {}).length);

  return (
    <section className="dental" id="odontoiatria" ref={ref}>
      <div className="page-head" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Odontoiatria</h2>
        <div className="row-end">
          {empty && <button className="btn btn-ghost btn-sm" title="Possibile solo finché la cartella è vuota" onClick={() => setEnabled(false)}>Disattiva cartella</button>}
          <div className="segmented">
            <button className={!deciduous ? 'on' : ''} onClick={() => { setDeciduous(false); setSelected(null); }}>Permanenti</button>
            <button className={deciduous ? 'on' : ''} onClick={() => { setDeciduous(true); setSelected(null); }}>Da latte</button>
          </div>
        </div>
      </div>
      {msg && <div className="alert">{msg}</div>}
      <div className="dental-layout">
        <div className="card odontogram-card">
          <Odontogram teeth={data.teeth} deciduous={deciduous} selected={selected} onSelect={setSelected} onSurface={cycleSurface} />
          <div className="legend small">
            {Object.entries(TOOTH_STATUS).filter(([k]) => k !== 'SANO').map(([k, v]) => (
              <span key={k}><i style={{ background: v.color }} />{v.short} {v.label}</span>
            ))}
            {Object.entries(SURFACE_STATUS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label} (superficie)</span>)}
          </div>
          <div className="muted small">Clic su un dente per stato e note; clic su una superficie per segnare carie / otturazione. Destra del paziente a sinistra; in alto il lato vestibolare.</div>
        </div>
        {selected && (
          <ToothPanel key={`${selected}-${toothData(selected)?.updatedAt || ''}`} tooth={selected} data={toothData(selected)}
            treatments={data.treatments} onSaved={save} onClose={() => setSelected(null)}
            onAddTreatment={(tooth, surfaces) => setForm({ tooth, surfaces })} />
        )}
      </div>

      <div className="page-head">
        <h3 style={{ margin: 0 }}>Diario dei trattamenti</h3>
        {!form && <button className="btn btn-primary" disabled={!data.dentists.length} onClick={() => setForm({ tooth: selected ?? '' })}>+ Trattamento</button>}
      </div>
      {!data.dentists.length && <div className="notice">Nessun medico è segnato come odontoiatra: spunta "Odontoiatra" nella scheda del medico.</div>}
      {form && (
        <TreatmentForm key={form.id || `n${form.tooth}`} base={base} initial={form} dentists={data.dentists} services={data.services}
          appointments={data.appointments} defaultDoctorId={defaultDoctorId}
          onSaved={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
      )}
      {data.treatments.length === 0 ? <div className="empty">Nessun trattamento registrato.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Dente</th><th>Trattamento</th><th>Odontoiatra</th><th>Note</th><th /></tr></thead>
            <tbody>
              {data.treatments.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{fmtDate(t.date)}{t.appointment && <div className="muted small">da appuntamento</div>}</td>
                  <td>{t.tooth ? <button className="link" onClick={() => { setDeciduous(t.tooth > 50); setSelected(t.tooth); }}>{t.tooth}</button> : <span className="muted">—</span>}{t.surfaces ? <span className="muted"> {t.surfaces}</span> : ''}</td>
                  <td><b>{t.description}</b>{t.service && t.service.name !== t.description && <div className="muted small">{t.service.name}</div>}</td>
                  <td><span className="dot" style={{ background: t.doctor.color }} /> {doctorName(t.doctor)}</td>
                  <td className="small" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</td>
                  <td className="right nowrap">
                    {canEdit(t) && <>
                      <button className="btn btn-sm" onClick={() => setForm(t)}>Modifica</button>{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => remove(t)}>Elimina</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
