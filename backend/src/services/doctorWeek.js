/**
 * Settimana di un singolo medico, per la stampa e il PDF:
 * appuntamenti giorno per giorno, fasce libere, tariffe e totali.
 */
const PDFDocument = require('pdfkit');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { DateTime, TZ, hmToMin, localToDate, dayBounds } = require('../lib/time');
const { freeIntervals } = require('./agendaReport');
const { effective } = require('./catalog');

const STATUS_LABEL = {
  PRENOTATO: 'Prenotato', CONFERMATO: 'Confermato', IN_ATTESA: 'In attesa',
  COMPLETATO: 'Completato', ANNULLATO: 'Annullato', NON_PRESENTATO: 'Non presentato',
};

const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');
const hm = (date) => DateTime.fromJSDate(date).setZone(TZ).toFormat('HH:mm');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const euro = (cents) => (cents == null ? '' : (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }));

/**
 * @param {number} doctorId
 * @param {string} date  un giorno qualsiasi della settimana (YYYY-MM-DD, ora dello studio)
 */
/**
 * @param {'day'|'week'} period  'day' = solo il giorno indicato; 'week' = lunedì–sabato (domenica se lavorata)
 */
async function buildDoctorWeek(doctorId, date, period = 'week') {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, services: { include: { service: true } } },
  });
  if (!doctor) return null;

  const isDay = period === 'day';
  const monday = isDay ? DateTime.fromISO(date, { zone: TZ }).startOf('day') : DateTime.fromISO(date, { zone: TZ }).startOf('week');
  const nDays = isDay ? 1 : 7;
  const from = monday.toJSDate();
  const to = monday.plus({ days: nDays }).toJSDate();
  const [appointments, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId, start: { gte: from, lt: to }, status: { not: 'ANNULLATO' } },
      include: { patient: true, service: true },
      orderBy: { start: 'asc' },
    }),
    prisma.timeOff.findMany({ where: { doctorId, start: { lt: to }, end: { gt: from } } }),
  ]);

  // tariffa effettiva della prestazione per questo medico (quella del tariffario attuale)
  const priceOf = new Map(doctor.services.map((l) => [l.serviceId, effective(l).priceCents]));
  const servicePrice = (a) => (a.serviceId ? (priceOf.has(a.serviceId) ? priceOf.get(a.serviceId) : a.service?.priceCents ?? null) : null);

  const days = [];
  for (let i = 0; i < nDays; i++) {
    const d = monday.plus({ days: i });
    const iso = d.toISODate();
    const { start, end } = dayBounds(iso);
    const blocks = doctor.workingHours
      .filter((h) => h.weekday === d.weekday)
      .sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime));
    const dayAppts = appointments.filter((a) => a.start >= start && a.start < end);
    if (!isDay && d.weekday === 7 && !blocks.length && !dayAppts.length) continue; // domenica solo se serve

    const absences = timeOff.filter((t) => t.start < end && t.end > start);
    const busy = [...dayAppts.map((a) => [a.start, a.end]), ...absences.map((t) => [t.start, t.end])];
    const free = freeIntervals(blocks.map((b) => [localToDate(iso, b.startTime), localToDate(iso, b.endTime)]), busy);

    const rows = [
      ...dayAppts.map((a) => ({
        type: 'appointment',
        start: a.start,
        end: a.end,
        time: hm(a.start),
        endTime: hm(a.end),
        patient: `${a.patient.lastName} ${a.patient.firstName}`.trim(),
        phone: a.patient.phone || '',
        service: a.service?.name || '',
        status: a.status,
        statusLabel: STATUS_LABEL[a.status],
        online: a.source === 'ONLINE',
        notes: a.notes || '',
        priceCents: a.status === 'NON_PRESENTATO' ? null : servicePrice(a),
      })),
      ...free.map(([s, e]) => ({ type: 'free', start: s, end: e, time: hm(s), endTime: hm(e) })),
    ].sort((x, y) => x.start - y.start || (x.type === 'free' ? 1 : -1));

    const counted = rows.filter((r) => r.type === 'appointment' && r.status !== 'NON_PRESENTATO');
    days.push({
      date: iso,
      label: cap(d.setLocale('it').toFormat('cccc d LLLL')),
      hours: blocks.map((b) => `${b.startTime}–${b.endTime}`).join(', '),
      absences: absences.map((t) => t.reason || 'Assenza'),
      rows,
      count: counted.length,
      amountCents: counted.reduce((s, r) => s + (r.priceCents || 0), 0),
    });
  }

  const last = isDay ? monday : monday.plus({ days: days.some((d) => DateTime.fromISO(d.date).weekday === 7) ? 6 : 5 });
  return {
    period: isDay ? 'day' : 'week',
    title: isDay ? 'Agenda del giorno' : 'Agenda settimanale',
    totalLabel: isDay ? 'Totale giornata' : 'Totale settimana',
    clinic: config.clinic,
    doctor: { id: doctor.id, name: docName(doctor), specialty: doctor.specialty || '' },
    from: monday.toISODate(),
    to: last.toISODate(),
    periodLabel: isDay
      ? cap(monday.setLocale('it').toFormat('cccc d LLLL yyyy'))
      : `${monday.setLocale('it').toFormat('d LLLL')} – ${last.setLocale('it').toFormat('d LLLL yyyy')}`,
    printedAt: DateTime.now().setZone(TZ).setLocale('it').toFormat("d/LL/yyyy 'alle' HH:mm"),
    days,
    totals: {
      count: days.reduce((s, d) => s + d.count, 0),
      amountCents: days.reduce((s, d) => s + d.amountCents, 0),
    },
  };
}

// ---------------------------------------------------------------- PDF (A4 orizzontale)

function buildDoctorWeekPdf(week) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: `Agenda ${week.doctor.name} ${week.periodLabel}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 18;
    // colonne: Ora, Fine, Paziente, Telefono, Prestazione, Stato, Note, Tariffa
    const cols = [42, 38, 140, 82, 170, 70, 150, 0];
    cols[7] = width - cols.slice(0, 7).reduce((a, b) => a + b, 0);
    const xs = cols.map((_, i) => left + cols.slice(0, i).reduce((a, b) => a + b, 0));
    const NAVY = '#0f2f3a'; const TEAL = '#0e7490'; const MUTED = '#6b7280'; const LINE = '#d5dbe3';

    function header() {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text((week.clinic.name || '').toUpperCase(), left, 24, { width: width / 2 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Stampato il ${week.printedAt}`, left + width / 2, 24, { width: width / 2, align: 'right' });
      doc.moveTo(left, 38).lineTo(left + width, 38).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.y = 46;
    }
    function footer() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // scrivere sotto il margine farebbe aggiungere una pagina vuota: margine azzerato per il piè di pagina
        const saved = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fillColor(MUTED).font('Helvetica').fontSize(8)
          .text(`${week.doctor.name} · ${week.periodLabel} · pagina ${i + 1} di ${range.count}`, left, doc.page.height - 28, { width, align: 'right', lineBreak: false });
        doc.page.margins.bottom = saved;
      }
    }
    function ensure(h) {
      if (doc.y + h > bottom()) { doc.addPage(); header(); return true; }
      return false;
    }
    function tableHead() {
      const y = doc.y;
      doc.rect(left, y, width, 16).fill('#e0f2f7');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      ['Ora', 'Fine', 'Paziente', 'Telefono', 'Prestazione', 'Stato', 'Note', 'Tariffa'].forEach((t, i) => {
        doc.text(t, xs[i] + 3, y + 4, { width: cols[i] - 6, align: i === 7 ? 'right' : 'left', lineBreak: false });
      });
      doc.y = y + 18;
    }

    // titolo
    header();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(`${week.title} – ${week.doctor.name}`, left, doc.y);
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text([week.doctor.specialty, week.periodLabel, `${week.totals.count} appuntamenti`, `totale previsto ${euro(week.totals.amountCents)}`].filter(Boolean).join('  ·  '));
    doc.moveDown(0.6);

    // altezza stimata di un giorno, per non spezzarlo tra due pagine quando ci sta intero
    function dayHeight(day) {
      if (!day.rows.length) return 40;
      doc.font('Helvetica').fontSize(8.5);
      return 42 + day.rows.reduce((h, r) => {
        if (r.type === 'free') return h + 14;
        const notes = [r.online ? 'Prenotato online' : '', r.notes].filter(Boolean).join(' – ');
        const cells = [r.patient, r.service, notes];
        const widths = [cols[2], cols[4], cols[6]];
        return h + 7 + Math.max(...cells.map((c, i) => doc.heightOfString(String(c || ''), { width: widths[i] - 6 })));
      }, 0);
    }
    const pageRoom = () => bottom() - 46;

    for (const day of week.days) {
      const need = dayHeight(day);
      if (need <= pageRoom()) ensure(need); else ensure(60);
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(11.5).text(`${day.label}`, left, doc.y, { continued: true })
        .fillColor(MUTED).font('Helvetica').fontSize(9)
        .text(`   ${day.count} appuntamenti${day.amountCents ? ` · ${euro(day.amountCents)}` : ''}${day.hours ? ` · orario ${day.hours}` : ' · non in servizio'}${day.absences.length ? ` · ${day.absences.join(', ')}` : ''}`);
      doc.moveDown(0.25);
      if (!day.rows.length) {
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('Nessun appuntamento', left + 3);
        doc.moveDown(0.8);
        continue;
      }
      tableHead();
      for (const r of day.rows) {
        if (r.type === 'free') {
          if (ensure(16)) tableHead();
          const y = doc.y;
          doc.fillColor('#15803d').font('Helvetica-Oblique').fontSize(8.5)
            .text(`libero ${r.time}–${r.endTime}`, xs[0] + 3, y + 2, { width: width - 6, lineBreak: false });
          doc.y = y + 14;
          doc.moveTo(left, doc.y - 1).lineTo(left + width, doc.y - 1).strokeColor(LINE).lineWidth(0.3).stroke();
          continue;
        }
        const notes = [r.online ? 'Prenotato online' : '', r.notes].filter(Boolean).join(' – ');
        const cells = [r.time, r.endTime, r.patient, r.phone, r.service, r.statusLabel, notes, euro(r.priceCents)];
        doc.font('Helvetica').fontSize(8.5);
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(String(c || ''), { width: cols[i] - 6 }))) + 6;
        if (ensure(h + 2)) tableHead();
        const y = doc.y;
        cells.forEach((c, i) => {
          doc.fillColor(i === 0 ? NAVY : '#1f2937').font(i === 0 || i === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
            .text(String(c || ''), xs[i] + 3, y + 3, { width: cols[i] - 6, align: i === 7 ? 'right' : 'left' });
        });
        doc.y = y + h;
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(LINE).lineWidth(0.3).stroke();
        doc.y += 1;
      }
      doc.moveDown(0.8);
    }

    ensure(30);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(NAVY).lineWidth(0.8).stroke();
    doc.moveDown(0.3);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
      .text(`${week.totalLabel}: ${week.totals.count} appuntamenti · ${euro(week.totals.amountCents)}`, left, doc.y, { width, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
      .text('Tariffe secondo il listino attuale; esclusi annullati e mancate presentazioni.', left, doc.y + 2, { width, align: 'right' });

    footer();
    doc.end();
  });
}

module.exports = { buildDoctorWeek, buildDoctorWeekPdf };
