import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Luogo di nascita: comuni italiani (anche soppressi) e stati esteri, con suggerimenti */
export default function PlaceInput({ value, onChange, apiBase = '/patients' }) {
  const [q, setQ] = useState(value || '');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    if (!open || q.trim().length < 2 || q === value) { setList([]); return undefined; }
    const t = setTimeout(() => api(`${apiBase}/places`, { query: { q } }).then(setList).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ac">
      <input value={q} placeholder="Comune o stato estero" autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); if (q !== value) onChange(q.trim() ? q : ''); }, 150)}
        onChange={(e) => setQ(e.target.value)} />
      {open && list.length > 0 && (
        <div className="ac-list">
          {list.map((p) => (
            <button type="button" key={`${p.code}-${p.label}`} className="ac-item" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(p.label); setQ(p.label); setList([]); setOpen(false); }}>
              {p.label}{p.foreign && <span className="muted small"> estero</span>}{p.historic && <span className="muted small"> comune non più esistente</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
