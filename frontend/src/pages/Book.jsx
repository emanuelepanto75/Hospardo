import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { DateTime, euro, fmtTime } from '../lib/time';
import { doctorName } from '../lib/constants';

const STRIP_DAYS = 7;

export default function Book() {
  const [info, setInfo] = useState(null);
  const [services, setServices] = useState(null);
  const [service, setService] = useState(null);
  const [doctors, setDoctors] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [from, setFrom] = useState(DateTime.now().startOf('day'));
  const [days, setDays] = useState(null);
  const [day, setDay] = useState(null);
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api('/public/info').then(setInfo);
    api('/public/services').then(setServices);
  }, []);

  useEffect(() => {
    setDoctors(null);
    if (service) api('/public/doctors', { query: { serviceId: service.id } }).then((d) => { setDoctors(d); if (d.length === 1) setDoctor(d[0]); });
  }, [service]);

  useEffect(() => {
    setDays(null);
    if (!service || !doctor) return;
    api('/public/days', { query: { doctorId: doctor.id, serviceId: service.id, from: from.toISODate(), days: STRIP_DAYS } }).then((d) => {
      setDays(d);
      if (!day || !d.some((x) => x.date === day)) setDay(d.find((x) => x.available > 0)?.date || null);
    });
  }, [service, doctor, from]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSlots(null);
    setSlot(null);
    if (service && doctor && day) api('/public/slots', { query: { doctorId: doctor.id, serviceId: service.id, date: day } }).then(setSlots);
  }, [service, doctor, day]);

  const reset = (lvl) => {
    if (lvl <= 1) { setService(null); setDoctor(null); }
    if (lvl <= 2) setDoctor(null);
    setDay(null); setSlot(null); setFrom(DateTime.now().startOf('day'));
  };

  if (done) {
    return (
      <PublicShell info={info}>
        <div className="card success-card">
          <div className="success-icon" aria-hidden>✓</div>
          <h1>Prenotazione registrata</h1>
          <p><b>{service.name}</b> con <b>{doctorName(doctor)}</b></p>
          <p className="big-date">{DateTime.fromISO(slot).toFormat("cccc d LLLL yyyy 'alle' HH:mm")}</p>
          <p className="muted">Ti abbiamo inviato un'email di conferma con il link per gestire o annullare l'appuntamento.</p>
          <Link className="btn" to={`/appuntamento/${done}`}>Vedi il tuo appuntamento</Link>
        </div>
      </PublicShell>
    );
  }

  const today = DateTime.now().startOf('day');

  return (
    <PublicShell info={info}>
      <h1>Prenota una visita</h1>

      <section className="step">
        <div className="step-head"><span className="step-n">1</span> Prestazione {service && <button className="link" onClick={() => reset(1)}>cambia</button>}</div>
        {service ? <div className="step-value">{service.name} <span className="muted">· {service.durationMin} min {service.priceCents != null && `· ${euro(service.priceCents)}`}</span></div> : (
          <div className="option-list">
            {!services && <p className="muted">Caricamento…</p>}
            {services?.length === 0 && <p className="muted">Al momento non ci sono prestazioni prenotabili online.</p>}
            {services?.map((s) => (
              <button key={s.id} className="option" onClick={() => setService(s)}>
                <b>{s.name}</b>
                <span className="muted small">{s.durationMin} min{s.priceCents != null && ` · ${euro(s.priceCents)}`}</span>
                {s.description && <span className="small">{s.description}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {service && (
        <section className="step">
          <div className="step-head"><span className="step-n">2</span> Medico {doctor && doctors?.length > 1 && <button className="link" onClick={() => reset(2)}>cambia</button>}</div>
          {doctor ? <div className="step-value">{doctorName(doctor)} <span className="muted">{doctor.specialty && `· ${doctor.specialty}`}</span></div> : (
            <div className="option-list">
              {!doctors && <p className="muted">Caricamento…</p>}
              {doctors?.map((d) => (
                <button key={d.id} className="option" style={{ borderLeftColor: d.color }} onClick={() => setDoctor(d)}>
                  <b>{doctorName(d)}</b>
                  <span className="muted small">{d.specialty}</span>
                  {d.bio && <span className="small">{d.bio}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {doctor && (
        <section className="step">
          <div className="step-head"><span className="step-n">3</span> Data e ora</div>
          <div className="day-strip">
            <button className="btn btn-icon" disabled={from <= today} onClick={() => setFrom(DateTime.max(today, from.minus({ days: STRIP_DAYS })))} aria-label="Giorni precedenti">‹</button>
            <div className="days">
              {(days || Array.from({ length: STRIP_DAYS }, (_, i) => ({ date: from.plus({ days: i }).toISODate(), available: null }))).map((d) => {
                const dt = DateTime.fromISO(d.date);
                return (
                  <button key={d.date} className={`day ${day === d.date ? 'on' : ''}`} disabled={!d.available} onClick={() => setDay(d.date)}>
                    <span className="small">{dt.toFormat('ccc')}</span>
                    <b>{dt.toFormat('d')}</b>
                    <span className="small">{dt.toFormat('LLL')}</span>
                  </button>
                );
              })}
            </div>
            <button className="btn btn-icon" disabled={days && days.length < STRIP_DAYS} onClick={() => setFrom(from.plus({ days: STRIP_DAYS }))} aria-label="Giorni successivi">›</button>
          </div>
          {days && !days.some((d) => d.available) && <p className="muted">Nessuna disponibilità in questi giorni: prova i giorni successivi.</p>}
          {day && (
            <div className="slot-chips slots-public">
              {!slots && <span className="muted">Caricamento…</span>}
              {slots?.map((s) => <button key={s} className={`chip ${slot === s ? 'chip-on' : ''}`} onClick={() => setSlot(s)}>{fmtTime(s)}</button>)}
            </div>
          )}
        </section>
      )}

      {slot && <BookingForm service={service} doctor={doctor} slot={slot} onDone={setDone} onConflict={() => { setSlot(null); setFrom(from.plus({ seconds: 1 })); }} />}
    </PublicShell>
  );
}

function BookingForm({ service, doctor, slot, onDone, onConflict }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', fiscalCode: '', birthDate: '', notes: '', privacyConsent: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api('/public/book', { method: 'POST', body: { ...f, doctorId: doctor.id, serviceId: service.id, start: slot } });
      onDone(r.token);
    } catch (e2) {
      setErr(errorMessage(e2));
      if (e2.status === 409) onConflict();
    } finally { setBusy(false); }
  }

  return (
    <section className="step">
      <div className="step-head"><span className="step-n">4</span> I tuoi dati</div>
      <div className="step-value">{DateTime.fromISO(slot).toFormat("cccc d LLLL 'alle' HH:mm")}</div>
      <form className="form" onSubmit={submit}>
        <div className="grid2">
          <label>Nome *<input required autoComplete="given-name" value={f.firstName} onChange={set('firstName')} /></label>
          <label>Cognome *<input required autoComplete="family-name" value={f.lastName} onChange={set('lastName')} /></label>
          <label>Email *<input required type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
          <label>Telefono *<input required type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Codice fiscale<input maxLength={16} value={f.fiscalCode} onChange={set('fiscalCode')} style={{ textTransform: 'uppercase' }} /></label>
          <label>Data di nascita<input type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
        </div>
        <label>Note per lo studio<textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Facoltative" /></label>
        <label className="check"><input type="checkbox" required checked={f.privacyConsent} onChange={set('privacyConsent')} /> Acconsento al trattamento dei miei dati personali per la gestione della prenotazione *</label>
        {err && <div className="alert">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Invio…' : 'Conferma prenotazione'}</button>
      </form>
    </section>
  );
}

export function PublicShell({ info, children }) {
  return (
    <div className="public">
      <header className="public-head">
        <div className="public-inner">
          <div className="brand">{info?.clinic?.name || 'Prenotazioni'}</div>
          {info?.clinic && <div className="muted small">{[info.clinic.address, info.clinic.phone].filter(Boolean).join(' · ')}</div>}
        </div>
      </header>
      <main className="public-inner">{children}</main>
    </div>
  );
}
