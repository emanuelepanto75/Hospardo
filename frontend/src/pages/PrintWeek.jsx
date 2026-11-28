import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, download, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DateTime, euro } from '../lib/time';

/**
 * Stampa settimanale di un singolo medico (A4 orizzontale).
 * Il medico vede solo la propria; segreteria e amministratori scelgono il medico.
 */
export default function PrintWeek() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [doctors, setDoctors] = useState(null);
  const [week, setWeek] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const isDoctor = user.role === 'MEDICO';
  const doctorId = isDoctor ? user.doctorId : Number(params.get('doctorId')) || null;
  const date = params.get('date') || DateTime.now().toISODate();
  const period = params.get('period') === 'day' ? 'day' : 'week';

  useEffect(() => {
    if (!isDoctor) api('/doctors').then((list) => setDoctors(list.filter((d) => d.active && !d.archivedAt))).catch(() => setDoctors([]));
  }, [isDoctor]);

  useEffect(() => {
    if (!doctorId) { setWeek(null); return; }
    setErr(null);
    api('/prints/doctor-week', { query: { doctorId, date, period } }).then(setWeek).catch((e) => { setWeek(null); setErr(errorMessage(e)); });
  }, [doctorId, date, period]);

  const set = (patch) => setParams({ ...(doctorId && !isDoctor ? { doctorId } : {}), date, period, ...patch });
  // nel giorno salta la domenica
  const shift = (n) => {
    let d = DateTime.fromISO(date).plus(period === 'day' ? { days: n } : { weeks: n });
    if (period === 'day' && d.weekday === 7) d = d.plus({ days: n });
    set({ date: d.toISODate() });
  };

  async function pdf() {
    setBusy(true);
    try { await download(`/prints/doctor-week.pdf?doctorId=${doctorId}&date=${date}&period=${period}`, 'agenda.pdf'); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  const options = useMemo(() => (doctors || []).slice().sort((a, b) => a.lastName.localeCompare(b.lastName)), [doctors]);

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link to="/agenda" className="btn btn-ghost">← Agenda</Link>
        {!isDoctor && (
          <select value={doctorId || ''} onChange={(e) => set({ doctorId: e.target.value })} aria-label="Medico">
            <option value="">Scegli il medico…</option>
            {options.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}{d.specialty ? ` – ${d.specialty}` : ''}</option>)}
          </select>
        )}
        <div className="segmented" role="group" aria-label="Periodo">
          <button className={period === 'day' ? 'on' : ''} onClick={() => set({ period: 'day' })}>Giorno</button>
          <button className={period === 'week' ? 'on' : ''} onClick={() => set({ period: 'week' })}>Settimana</button>
        </div>
        <div className="toolbar-group">
          <button className="btn btn-icon" onClick={() => shift(-1)} aria-label={period === 'day' ? 'Giorno precedente' : 'Settimana precedente'}>‹</button>
          <input type="date" value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          <button className="btn btn-icon" onClick={() => shift(1)} aria-label={period === 'day' ? 'Giorno successivo' : 'Settimana successiva'}>›</button>
        </div>
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button className="btn" disabled={!week || busy} onClick={pdf}>{busy ? 'Preparazione…' : 'Scarica PDF'}</button>
          <button className="btn btn-primary" disabled={!week} onClick={() => window.print()}>Stampa</button>
        </div>
      </div>

      {err && <div className="alert no-print">{err}</div>}
      {!doctorId && !isDoctor && <div className="empty no-print">Scegli il medico di cui stampare l'agenda.</div>}
      {isDoctor && !doctorId && <div className="empty">Il tuo utente non è collegato a un medico: avvisa l'amministratore.</div>}

      {week && (
        <article className="print-sheet">
          <header className="print-head">
            <span>{week.clinic.name}</span>
            <span>Stampato il {week.printedAt}</span>
          </header>
          <h1>{week.title} – {week.doctor.name}</h1>
          <p className="print-sub">
            {[week.doctor.specialty, week.periodLabel, `${week.totals.count} appuntamenti`, `totale previsto ${euro(week.totals.amountCents)}`].filter(Boolean).join('  ·  ')}
          </p>

          {week.days.map((day) => (
            <section key={day.date} className="print-day">
              <h2>
                {day.label}
                <small>
                  {day.count} appuntamenti{day.amountCents ? ` · ${euro(day.amountCents)}` : ''}
                  {day.hours ? ` · orario ${day.hours}` : ' · non in servizio'}
                  {day.absences.length ? ` · ${day.absences.join(', ')}` : ''}
                </small>
              </h2>
              {day.rows.length === 0 ? <p className="print-none">Nessun appuntamento</p> : (
                <table className="print-table">
                  <colgroup>
                    <col style={{ width: '6%' }} /><col style={{ width: '5%' }} /><col style={{ width: '16%' }} /><col style={{ width: '10%' }} />
                    <col style={{ width: '23%' }} /><col style={{ width: '11%' }} /><col style={{ width: '20%' }} /><col style={{ width: '9%' }} />
                  </colgroup>
                  <thead>
                    <tr><th>Ora</th><th>Fine</th><th>Paziente</th><th>Telefono</th><th>Prestazione</th><th>Stato</th><th>Note</th><th className="right">Tariffa</th></tr>
                  </thead>
                  <tbody>
                    {day.rows.map((r) => (r.type === 'free' ? (
                      <tr key={`f${r.start}`} className="print-free"><td colSpan={8}>libero {r.time}–{r.endTime}</td></tr>
                    ) : (
                      <tr key={`a${r.start}${r.patient}`} className={r.status === 'NON_PRESENTATO' ? 'print-noshow' : ''}>
                        <td><b>{r.time}</b></td>
                        <td>{r.endTime}</td>
                        <td><b>{r.patient}</b></td>
                        <td>{r.phone}</td>
                        <td>{r.service}</td>
                        <td>{r.statusLabel}</td>
                        <td>{[r.online ? 'Prenotato online' : '', r.notes].filter(Boolean).join(' – ')}</td>
                        <td className="right">{euro(r.priceCents)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              )}
            </section>
          ))}

          <footer className="print-total">
            <b>{week.totalLabel}: {week.totals.count} appuntamenti · {euro(week.totals.amountCents)}</b>
            <span>Tariffe secondo il listino attuale; esclusi annullati e mancate presentazioni.</span>
          </footer>
        </article>
      )}
    </div>
  );
}
