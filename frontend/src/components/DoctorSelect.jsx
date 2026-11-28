import { useEffect, useMemo, useRef, useState } from 'react';
import { doctorName } from '../lib/constants';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Scelta del medico scrivendo le prime lettere (cognome, nome o specializzazione):
 * i medici che corrispondono compaiono subito; frecce ↑↓ e Invio per scegliere, Esc per annullare.
 */
export default function DoctorSelect({ doctors, value, onChange, disabled, placeholder = 'Scrivi il nome del medico…' }) {
  const selected = doctors.find((d) => d.id === Number(value));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = words.length
      ? doctors.filter((d) => {
        const hay = norm(`${d.lastName} ${d.firstName} ${d.specialty || ''}`);
        return words.every((w) => hay.split(/\s+/).some((t) => t.startsWith(w)) || hay.includes(w));
      })
      : doctors;
    // prima chi ha il cognome che inizia con quanto scritto
    const first = norm(q).trim();
    return [...list].sort((a, b) => (norm(b.lastName).startsWith(first) - norm(a.lastName).startsWith(first)) || a.lastName.localeCompare(b.lastName));
  }, [doctors, q]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  function pick(d) {
    onChange(d.id);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { if (open && matches[hi]) { e.preventDefault(); pick(matches[hi]); } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); setQ(''); } }
  }

  return (
    <div className="ac doctor-select">
      <input
        ref={ref}
        disabled={disabled}
        value={open ? q : (selected ? doctorName(selected) : '')}
        placeholder={selected ? doctorName(selected) : placeholder}
        onFocus={(e) => { setOpen(true); setQ(''); e.target.select(); }}
        onBlur={() => setTimeout(() => { setOpen(false); setQ(''); }, 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && !disabled && (
        <div className="ac-list" ref={listRef} role="listbox">
          {matches.length === 0 && <div className="muted small" style={{ padding: 8 }}>Nessun medico per "{q}"</div>}
          {matches.map((d, i) => (
            <button type="button" key={d.id} className={`ac-item ${i === hi ? 'hi' : ''} ${d.id === Number(value) ? 'sel' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => pick(d)} role="option" aria-selected={d.id === Number(value)}>
              <span className="dot" style={{ background: d.color }} /> <b>{d.lastName}</b> {d.firstName}
              {d.specialty && <span className="muted small"> · {d.specialty}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
