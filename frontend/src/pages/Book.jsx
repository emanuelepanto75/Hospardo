import { useEffect, useState } from 'react';
import { titleCase } from '../lib/names';
import { api, errorMessage } from '../lib/api';
import { DateTime, euro, fmtTime } from '../lib/time';
import { doctorName, groupByCategory } from '../lib/constants';

const STRIP_DAYS = 7;

/** "45 min · 120,00 €": mostra solo ciò che lo studio rende pubblico */
function meta(durationMin, priceCents, prefix = '') {
  const parts = [durationMin != null ? `${durationMin} min` : null, priceCents != null ? euro(priceCents) : null].filter(Boolean);
  return parts.length ? prefix + parts.join(' · ') : '';
}

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
  // 'slot' = il paziente sceglie un orario libero; 'any' = indica solo una preferenza
  const [mode, setMode] = useState('slot');
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
          <h1>Richiesta inviata</h1>
          <p><b>{service.name}</b> con <b>{doctorName(doctor)}</b></p>
          <p className="big-date">{done.slot ? DateTime.fromISO(done.slot).toFormat("cccc d LLLL yyyy 'alle' HH:mm") : 'Nessun orario preciso'}</p>
          {done.preferences && <p className="muted">Preferenza: {done.preferences}</p>}
          <p>
            <b>La prenotazione non è ancora confermata.</b> Lo studio controllerà la tua richiesta e ti invierà
            la conferma via email{done.whatsapp ? ' e WhatsApp' : ''}. Ti abbiamo già mandato un'email di riepilogo.
          </p>
          <a className="btn" href={siteHome()}>Torna al sito</a>
        </div>
      </PublicShell>
    );
  }

  const today = DateTime.now().startOf('day');

  return (
    <PublicShell info={info}>
      <h1>Richiedi una prenotazione</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>Scegli prestazione e medico: lo studio ti confermerà l'appuntamento via email e WhatsApp.</p>

      <section className="step">
        <div className="step-head"><span className="step-n">1</span> Prestazione {service && <button className="link" onClick={() => reset(1)}>cambia</button>}</div>
        {service ? <div className="step-value">{service.name} <span className="muted">{meta(doctor?.durationMin ?? service.durationMin, doctor?.priceCents ?? service.priceCents, '· ')}</span></div> : (
          <div>
            {!services && <p className="muted">Caricamento…</p>}
            {services?.length === 0 && <p className="muted">Al momento non ci sono prestazioni prenotabili online.</p>}
            {services && Object.entries(groupByCategory(services)).map(([cat, list]) => (
              <div key={cat} className="option-group">
                {Object.keys(groupByCategory(services)).length > 1 && <div className="option-group-title">{cat}</div>}
                <div className="option-list">
                  {list.map((s) => (
                    <button key={s.id} className="option" onClick={() => setService(s)}>
                      <b>{s.name}</b>
                      {meta(s.durationMin, s.priceCents) && <span className="muted small">{meta(s.durationMin, s.priceCents)}</span>}
                      {s.description && <span className="small">{s.description}</span>}
                    </button>
                  ))}
                </div>
              </div>
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
                  {(d.durationMin !== service.durationMin || d.priceCents !== service.priceCents) && meta(d.durationMin, d.priceCents) && (
                    <span className="small">{meta(d.durationMin, d.priceCents)}</span>
                  )}
                  {d.bio && <span className="small">{d.bio}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {doctor && (
        <section className="step">
          <div className="step-head"><span className="step-n">3</span> Quando preferisci?</div>
          <div className="segmented mode-switch" role="group">
            <button className={mode === 'slot' ? 'on' : ''} onClick={() => setMode('slot')}>Scelgo giorno e orario</button>
            <button className={mode === 'any' ? 'on' : ''} onClick={() => { setMode('any'); setSlot(null); }}>Nessun orario preciso</button>
          </div>
          {mode === 'any' ? (
            <p className="muted small">Nel passaggio successivo puoi indicare giorni o fasce orarie che preferisci: lo studio ti proporrà un appuntamento.</p>
          ) : (<>
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
          </>)}
        </section>
      )}

      {doctor && (slot || mode === 'any') && (
        <BookingForm service={service} doctor={doctor} slot={mode === 'slot' ? slot : null}
          onDone={setDone} onConflict={() => { setSlot(null); setFrom(from.plus({ seconds: 1 })); }} />
      )}
    </PublicShell>
  );
}

function BookingForm({ service, doctor, slot, onDone, onConflict }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', fiscalCode: '', birthDate: '', preferences: '', notes: '', whatsappOptIn: true, privacyConsent: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { ...f, doctorId: doctor.id, serviceId: service.id, start: slot || undefined, preferences: slot ? undefined : f.preferences };
      await api('/public/request', { method: 'POST', body });
      onDone({ slot, preferences: slot ? null : f.preferences, whatsapp: f.whatsappOptIn });
    } catch (e2) {
      setErr(errorMessage(e2));
      if (e2.status === 409) onConflict();
    } finally { setBusy(false); }
  }

  return (
    <section className="step">
      <div className="step-head"><span className="step-n">4</span> I tuoi dati</div>
      {slot && <div className="step-value">{DateTime.fromISO(slot).toFormat("cccc d LLLL 'alle' HH:mm")}</div>}
      <form className="form" onSubmit={submit}>
        {!slot && (
          <label>Giorni o orari preferiti<input value={f.preferences} onChange={set('preferences')} maxLength={300} placeholder="Es. martedì o giovedì pomeriggio, dopo le 17" /></label>
        )}
        <div className="grid2">
          <label>Nome *<input required autoComplete="given-name" value={f.firstName} onChange={set('firstName')} onBlur={() => setF((p) => ({ ...p, firstName: titleCase(p.firstName) }))} /></label>
          <label>Cognome *<input required autoComplete="family-name" value={f.lastName} onChange={set('lastName')} onBlur={() => setF((p) => ({ ...p, lastName: titleCase(p.lastName) }))} /></label>
          <label>Email *<input required type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
          <label>Telefono *<input required type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Codice fiscale<input maxLength={16} value={f.fiscalCode} onChange={set('fiscalCode')} style={{ textTransform: 'uppercase' }} /></label>
          <label>Data di nascita<input type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
        </div>
        <label>Note per lo studio<textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Facoltative" /></label>
        <label className="check"><input type="checkbox" checked={f.whatsappOptIn} onChange={set('whatsappOptIn')} /> Voglio ricevere conferma e promemoria anche su WhatsApp</label>
        <label className="check"><input type="checkbox" required checked={f.privacyConsent} onChange={set('privacyConsent')} /> <span>Ho letto l'<a href="/privacy" target="_blank" rel="noreferrer">informativa privacy</a> e acconsento al trattamento dei miei dati, anche relativi alla salute, per la gestione della prenotazione *</span></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Invio…' : 'Invia la richiesta'}</button>
        <p className="muted small" style={{ textAlign: 'center' }}>La prenotazione sarà valida solo dopo la conferma dello studio.</p>
      </form>
    </section>
  );
}

/** Pagina principale del sito: sul dominio dell'agenda (app.) rimanda al dominio del sito */
export function siteHome() {
  const host = window.location.hostname;
  return host.startsWith('app.') ? `${window.location.protocol}//${host.slice(4)}/` : '/';
}

export function PublicShell({ info, children }) {
  return (
    <div className="public">
      <header className="public-head">
        <div className="public-inner">
          <a className="brand" href={siteHome()} style={{ textDecoration: 'none' }}>{info?.clinic?.name || 'Prenotazioni'}</a>
          {info?.clinic && <div className="muted small">{[info.clinic.address, info.clinic.phone].filter(Boolean).join(' · ')}</div>}
        </div>
      </header>
      <main className="public-inner">{children}</main>
    </div>
  );
}
