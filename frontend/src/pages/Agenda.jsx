import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { DateTime, hmToMin, minToHm } from '../lib/time';
import { STATUS, doctorName } from '../lib/constants';
import AppointmentModal from '../components/AppointmentModal';

const PX_PER_MIN = 1.3;
const SNAP = 15;

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writePref(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Distribuisce gli appuntamenti sovrapposti su più corsie */
function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of group) {
      let lane = lanes.findIndex((end) => end <= it.startMin);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = it.endMin;
      it.lane = lane;
    }
    group.forEach((it) => { it.lanes = lanes.length; out.push(it); });
    group = [];
  };
  for (const it of sorted) {
    if (it.startMin >= groupEnd && group.length) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length) flush();
  return out;
}

export default function Agenda() {
  const { user } = useAuth();
  const [view, setView] = useState(() => readPref('agenda.view', 'day'));
  const [date, setDate] = useState(() => DateTime.now().startOf('day'));
  const [selected, setSelected] = useState(() => readPref('agenda.doctors', null));
  const [weekDoctor, setWeekDoctor] = useState(() => readPref('agenda.weekDoctor', user.doctorId ?? null));
  const [showCancelled, setShowCancelled] = useState(false);
  const [modal, setModal] = useState(null);
  const [now, setNow] = useState(DateTime.now());

  const { data: doctors } = useApi('/doctors');
  const { data: services } = useApi('/services');

  useEffect(() => { writePref('agenda.view', view); }, [view]);
  useEffect(() => { if (selected) writePref('agenda.doctors', selected); }, [selected]);
  useEffect(() => { if (weekDoctor) writePref('agenda.weekDoctor', weekDoctor); }, [weekDoctor]);
  useEffect(() => { const t = setInterval(() => setNow(DateTime.now()), 60000); return () => clearInterval(t); }, []);

  const activeDoctors = useMemo(() => (doctors || []).filter((d) => d.active), [doctors]);
  const dayDoctors = useMemo(() => {
    const ids = selected ?? (user.doctorId ? [user.doctorId] : activeDoctors.map((d) => d.id));
    const list = activeDoctors.filter((d) => ids.includes(d.id));
    return list.length ? list : activeDoctors;
  }, [selected, activeDoctors, user.doctorId]);
  const weekDoc = activeDoctors.find((d) => d.id === weekDoctor) || activeDoctors[0];

  const rangeStart = view === 'day' ? date : date.startOf('week');
  const rangeEnd = view === 'day' ? date.plus({ days: 1 }) : rangeStart.plus({ days: 7 });

  const query = useMemo(() => ({
    from: rangeStart.toUTC().toISO(),
    to: rangeEnd.toUTC().toISO(),
    doctorId: view === 'week' ? weekDoc?.id : undefined,
  }), [rangeStart.toMillis(), rangeEnd.toMillis(), view, weekDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: appointments, reload } = useApi(doctors ? '/appointments' : null, query);
  const { data: timeOff } = useApi('/doctors/time-off', { from: query.from, to: query.to });

  // Colonne della griglia
  const columns = useMemo(() => {
    if (!doctors) return [];
    if (view === 'day') return dayDoctors.map((d) => ({ key: `d${d.id}`, date, doctor: d, title: doctorName(d), sub: d.specialty }));
    if (!weekDoc) return [];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = rangeStart.plus({ days: i });
      if (day.weekday === 7 && !weekDoc.workingHours.some((h) => h.weekday === 7)) continue;
      days.push({ key: day.toISODate(), date: day, doctor: weekDoc, title: day.toFormat('ccc d'), sub: day.toFormat('LLLL') });
    }
    return days;
  }, [doctors, view, dayDoctors, weekDoc, date, rangeStart.toMillis()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fascia oraria visibile: dagli orari di lavoro, con margine
  const [minMin, maxMin] = useMemo(() => {
    let lo = 8 * 60;
    let hi = 19 * 60;
    for (const c of columns) {
      for (const h of c.doctor.workingHours) {
        lo = Math.min(lo, hmToMin(h.startTime));
        hi = Math.max(hi, hmToMin(h.endTime));
      }
    }
    for (const a of appointments || []) {
      const s = DateTime.fromISO(a.start);
      const e = DateTime.fromISO(a.end);
      lo = Math.min(lo, s.hour * 60 + s.minute);
      hi = Math.max(hi, e.hasSame(s, 'day') ? e.hour * 60 + e.minute : 24 * 60);
    }
    return [Math.max(0, Math.floor(lo / 60) * 60 - 60), Math.min(24 * 60, Math.ceil(hi / 60) * 60 + 60)];
  }, [columns, appointments]);
  const height = (maxMin - minMin) * PX_PER_MIN;
  const y = (m) => (m - minMin) * PX_PER_MIN;

  const visibleAppts = (appointments || []).filter((a) => showCancelled || a.status !== 'ANNULLATO');

  function columnItems(col) {
    const dayStart = col.date.startOf('day');
    const dayEnd = dayStart.plus({ days: 1 });
    const items = visibleAppts
      .filter((a) => a.doctorId === col.doctor.id && DateTime.fromISO(a.start) < dayEnd && DateTime.fromISO(a.end) > dayStart)
      .map((a) => {
        const s = DateTime.fromISO(a.start);
        const e = DateTime.fromISO(a.end);
        return { a, startMin: Math.max(0, s.diff(dayStart, 'minutes').minutes), endMin: Math.min(24 * 60, e.diff(dayStart, 'minutes').minutes) };
      });
    return layoutLanes(items);
  }

  function columnOff(col) {
    const dayStart = col.date.startOf('day');
    const dayEnd = dayStart.plus({ days: 1 });
    return (timeOff || [])
      .filter((t) => t.doctorId === col.doctor.id && DateTime.fromISO(t.start) < dayEnd && DateTime.fromISO(t.end) > dayStart)
      .map((t) => ({
        ...t,
        startMin: Math.max(minMin, DateTime.fromISO(t.start).diff(dayStart, 'minutes').minutes),
        endMin: Math.min(maxMin, DateTime.fromISO(t.end).diff(dayStart, 'minutes').minutes),
      }));
  }

  function onColumnClick(e, col) {
    if (e.target !== e.currentTarget && !e.target.classList.contains('work-block')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const m = Math.floor((e.clientY - rect.top) / PX_PER_MIN / SNAP) * SNAP + minMin;
    if (user.role === 'MEDICO' && user.doctorId !== col.doctor.id) return;
    setModal({ draft: { doctorId: col.doctor.id, start: col.date.startOf('day').plus({ minutes: m }).toISO() } });
  }

  const move = (dir) => setDate(date.plus(view === 'day' ? { days: dir } : { weeks: dir }));
  const toggleDoctor = (id) => {
    const cur = dayDoctors.map((d) => d.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSelected(next.length ? next : cur);
  };

  if (!doctors || !services) return <div className="page"><p className="muted">Caricamento…</p></div>;
  if (activeDoctors.length === 0) {
    return <div className="page"><h1>Agenda</h1><div className="empty">Nessun medico attivo. Aggiungi un medico e i suoi orari dalla sezione <b>Medici e orari</b>.</div></div>;
  }

  const hours = [];
  for (let m = minMin; m < maxMin; m += 60) hours.push(m);
  const isToday = (d) => d.hasSame(now, 'day');
  const count = visibleAppts.filter((a) => a.status !== 'ANNULLATO').length;

  return (
    <div className="page page-agenda">
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={() => setDate(DateTime.now().startOf('day'))}>Oggi</button>
          <button className="btn btn-icon" onClick={() => move(-1)} aria-label="Precedente">‹</button>
          <button className="btn btn-icon" onClick={() => move(1)} aria-label="Successivo">›</button>
          <input type="date" value={date.toISODate()} onChange={(e) => e.target.value && setDate(DateTime.fromISO(e.target.value))} />
          <h1 className="agenda-title">
            {view === 'day' ? date.toFormat('cccc d LLLL yyyy') : `${rangeStart.toFormat('d LLL')} – ${rangeEnd.minus({ days: 1 }).toFormat('d LLL yyyy')}`}
          </h1>
        </div>
        <div className="toolbar-group">
          <span className="muted small">{count} appuntamenti</span>
          <label className="check small"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> annullati</label>
          <div className="segmented">
            <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Giorno</button>
            <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Settimana</button>
          </div>
          <button className="btn btn-primary" onClick={() => setModal({ draft: { doctorId: view === 'week' ? weekDoc?.id : dayDoctors[0]?.id, start: date.set({ hour: 9 }).toISO() } })}>+ Appuntamento</button>
        </div>
      </div>

      <div className="doctor-filter">
        {view === 'day'
          ? activeDoctors.map((d) => (
            <button key={d.id} className={`chip ${dayDoctors.some((x) => x.id === d.id) ? 'chip-on' : ''}`} style={{ '--c': d.color }} onClick={() => toggleDoctor(d.id)}>
              <span className="dot" /> {doctorName(d)}
            </button>
          ))
          : activeDoctors.map((d) => (
            <button key={d.id} className={`chip ${weekDoc?.id === d.id ? 'chip-on' : ''}`} style={{ '--c': d.color }} onClick={() => setWeekDoctor(d.id)}>
              <span className="dot" /> {doctorName(d)}
            </button>
          ))}
      </div>

      <div className="calendar" style={{ '--cols': columns.length }}>
        <div className="cal-head">
          <div className="cal-gutter" />
          {columns.map((c) => (
            <div key={c.key} className={`cal-col-head ${view === 'week' && isToday(c.date) ? 'today' : ''}`} style={{ borderTopColor: c.doctor.color }}>
              <div className="cal-col-title">{c.title}</div>
              {c.sub && <div className="muted small">{c.sub}</div>}
            </div>
          ))}
        </div>
        <div className="cal-body">
          <div className="cal-gutter" style={{ height }}>
            {hours.map((m) => <div key={m} className="hour-label" style={{ top: y(m) }}>{minToHm(m)}</div>)}
          </div>
          {columns.map((c) => {
            const blocks = c.doctor.workingHours.filter((h) => h.weekday === c.date.weekday);
            const nowMin = now.hour * 60 + now.minute;
            return (
              <div key={c.key} className="cal-col" style={{ height }} onClick={(e) => onColumnClick(e, c)}>
                {hours.map((m) => <div key={m} className="hour-line" style={{ top: y(m) }} />)}
                {blocks.map((b) => (
                  <div key={b.id} className="work-block" style={{ top: y(hmToMin(b.startTime)), height: (hmToMin(b.endTime) - hmToMin(b.startTime)) * PX_PER_MIN }} />
                ))}
                {columnOff(c).map((t) => (
                  <div key={t.id} className="off-block" style={{ top: y(t.startMin), height: (t.endMin - t.startMin) * PX_PER_MIN }} title={t.reason || 'Assenza'}>
                    <span>{t.reason || 'Assenza'}</span>
                  </div>
                ))}
                {columnItems(c).map(({ a, startMin, endMin, lane, lanes }) => {
                  const h = Math.max((endMin - startMin) * PX_PER_MIN, 18);
                  const st = STATUS[a.status];
                  return (
                    <button
                      key={a.id}
                      className={`appt ${a.status === 'ANNULLATO' ? 'appt-cancelled' : ''} ${h < 34 ? 'appt-compact' : ''}`}
                      style={{
                        top: y(startMin), height: h,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
                        '--doc': a.doctor.color, '--st': st.color,
                      }}
                      onClick={(e) => { e.stopPropagation(); setModal({ appointment: a }); }}
                      title={`${DateTime.fromISO(a.start).toFormat('HH:mm')} ${a.patient.lastName} ${a.patient.firstName} – ${a.service?.name || ''} (${st.label})`}
                    >
                      <div className="appt-line">
                        <b>{DateTime.fromISO(a.start).toFormat('HH:mm')}</b> {a.patient.lastName} {a.patient.firstName}
                        {a.source === 'ONLINE' && <span className="appt-tag" title="Prenotato online">web</span>}
                      </div>
                      {h >= 34 && <div className="appt-sub">{a.service?.name || 'Appuntamento'} · {st.label}</div>}
                    </button>
                  );
                })}
                {isToday(c.date) && nowMin >= minMin && nowMin <= maxMin && <div className="now-line" style={{ top: y(nowMin) }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="legend">
        {Object.values(STATUS).map((s) => <span key={s.label}><span className="dot" style={{ background: s.color }} /> {s.label}</span>)}
        <span><span className="swatch-off" /> Assenza</span>
        <span><span className="swatch-closed" /> Fuori orario</span>
      </div>

      {modal && (
        <AppointmentModal
          {...modal}
          doctors={doctors}
          services={services}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}
    </div>
  );
}

