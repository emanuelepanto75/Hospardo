/**
 * Riepilogo serale degli appuntamenti dei prossimi giorni lavorativi (domenica esclusa),
 * inviato via email con un file Excel (una scheda per giorno + riepilogo) e un calendario .ics.
 */
const ExcelJS = require('exceljs');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { DateTime, TZ, hmToMin, localToDate, dayBounds } = require('../lib/time');
const { sendMail } = require('./mailer');

const STATUS_LABEL = {
  PRENOTATO: 'Prenotato', CONFERMATO: 'Confermato', IN_ATTESA: "In sala d'attesa",
  COMPLETATO: 'Completato', ANNULLATO: 'Annullato', NON_PRESENTATO: 'Non presentato',
};
const ACTIVE = ['PRENOTATO', 'CONFERMATO', 'IN_ATTESA', 'COMPLETATO'];
const MIN_FREE_MIN = 15; // fasce libere più corte non vengono riportate

const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');
const hm = (date) => DateTime.fromJSDate(date).setZone(TZ).toFormat('HH:mm');

/** I prossimi `count` giorni a partire da domani, saltando la domenica (date ISO, ora dello studio) */
function reportDays(now = new Date(), count = config.report.days) {
  const days = [];
  let d = DateTime.fromJSDate(now).setZone(TZ).startOf('day');
  while (days.length < count) {
    d = d.plus({ days: 1 });
    if (d.weekday !== 7) days.push(d.toISODate());
  }
  return days;
}

/** Sottrae gli intervalli occupati da quelli di lavoro: restituisce le fasce libere [start, end] in Date */
function freeIntervals(blocks, busy) {
  let free = blocks.map((b) => [b[0], b[1]]);
  for (const [bs, be] of busy) {
    const next = [];
    for (const [fs, fe] of free) {
      if (be <= fs || bs >= fe) { next.push([fs, fe]); continue; }
      if (bs > fs) next.push([fs, bs]);
      if (be < fe) next.push([be, fe]);
    }
    free = next;
  }
  return free.filter(([s, e]) => (e - s) / 60000 >= MIN_FREE_MIN);
}

/** Raccoglie i dati del periodo */
async function collect(days) {
  const from = dayBounds(days[0]).start;
  const to = dayBounds(days[days.length - 1]).end;
  const [doctors, appointments, timeOff] = await Promise.all([
    prisma.doctor.findMany({
      where: { active: true, archivedAt: null },
      include: { workingHours: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.appointment.findMany({
      where: { start: { gte: from, lt: to } },
      include: { patient: true, doctor: true, service: true },
      orderBy: [{ start: 'asc' }],
    }),
    prisma.timeOff.findMany({ where: { start: { lt: to }, end: { gt: from } } }),
  ]);

  const perDay = days.map((date) => {
    const { start, end } = dayBounds(date);
    const weekday = DateTime.fromISO(date, { zone: TZ }).weekday;
    const appts = appointments.filter((a) => a.start >= start && a.start < end && ACTIVE.includes(a.status));
    const doctorsInfo = doctors.map((d) => {
      const blocks = d.workingHours
        .filter((h) => h.weekday === weekday)
        .sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime))
        .map((h) => [localToDate(date, h.startTime), localToDate(date, h.endTime)]);
      const absences = timeOff.filter((t) => t.doctorId === d.id && t.start < end && t.end > start);
      const busy = [
        ...appts.filter((a) => a.doctorId === d.id).map((a) => [a.start, a.end]),
        ...absences.map((t) => [t.start, t.end]),
      ];
      return {
        doctor: d,
        works: blocks.length > 0,
        absences,
        free: freeIntervals(blocks, busy),
        count: appts.filter((a) => a.doctorId === d.id).length,
      };
    });
    return { date, appts, doctorsInfo };
  });

  const cancelled = appointments.filter((a) => !ACTIVE.includes(a.status));
  return { days, perDay, doctors, appointments, cancelled };
}

function dayLabel(date, fmt = 'cccc d LLLL yyyy') {
  return DateTime.fromISO(date, { zone: TZ }).setLocale('it').toFormat(fmt);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Descrizione degli orari liberi di un medico in un giorno */
function freeText(info) {
  if (info.absences.length && !info.free.length) return `Assente${info.absences[0].reason ? ` (${info.absences[0].reason})` : ''}`;
  if (!info.works) return 'Non in servizio';
  if (!info.free.length) return 'Completo';
  return info.free.map(([s, e]) => `${hm(s)}–${hm(e)}`).join(', ');
}

// ---------------------------------------------------------------- Excel

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F7' } };
const TITLE_FONT = { bold: true, size: 14, color: { argb: 'FF0F2F3A' } };
const thin = { style: 'thin', color: { argb: 'FFD5DBE3' } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

function styleHeader(row) {
  row.eachCell((c) => { c.font = { bold: true }; c.fill = HEADER_FILL; c.border = BORDER; c.alignment = { vertical: 'middle' }; });
  row.height = 20;
}

async function buildXlsx(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.clinic.name;
  wb.created = new Date();
  const first = data.days[0];
  const last = data.days[data.days.length - 1];

  // --- Riepilogo ---
  const ws = wb.addWorksheet('Riepilogo', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.addRow([`${config.clinic.name} – Appuntamenti dal ${dayLabel(first, 'd LLLL')} al ${dayLabel(last, 'd LLLL yyyy')}`]).font = TITLE_FONT;
  ws.addRow([`Generato il ${DateTime.now().setZone(TZ).setLocale('it').toFormat("d LLLL yyyy 'alle' HH:mm")}. Domenica esclusa; appuntamenti annullati non conteggiati.`]).font = { italic: true, color: { argb: 'FF6B7280' } };
  ws.addRow([]);
  const header = ws.addRow(['Giorno', ...data.doctors.map(docName), 'Totale']);
  styleHeader(header);
  const totals = new Array(data.doctors.length).fill(0);
  for (const day of data.perDay) {
    const counts = day.doctorsInfo.map((i) => i.count);
    counts.forEach((c, i) => { totals[i] += c; });
    const r = ws.addRow([cap(dayLabel(day.date, 'ccc d/LL')), ...counts.map((c, i) => (day.doctorsInfo[i].works || c ? c : '–')), day.appts.length]);
    r.eachCell((c) => { c.border = BORDER; });
    r.getCell(data.doctors.length + 2).font = { bold: true };
  }
  const tr = ws.addRow(['Totale', ...totals, totals.reduce((a, b) => a + b, 0)]);
  tr.eachCell((c) => { c.font = { bold: true }; c.border = BORDER; });
  ws.getColumn(1).width = 14;
  data.doctors.forEach((_, i) => { ws.getColumn(i + 2).width = 22; ws.getColumn(i + 2).alignment = { horizontal: 'center' }; });
  ws.getColumn(data.doctors.length + 2).width = 10;
  ws.getColumn(data.doctors.length + 2).alignment = { horizontal: 'center' };

  const absences = data.perDay.flatMap((d) => d.doctorsInfo.filter((i) => i.absences.length).map((i) => [cap(dayLabel(d.date, 'ccc d/LL')), docName(i.doctor), i.absences.map((a) => a.reason || 'Assenza').join(', ')]));
  if (absences.length) {
    ws.addRow([]);
    ws.addRow(['Assenze e ferie']).font = { bold: true };
    absences.forEach((a) => ws.addRow(a));
  }
  if (data.cancelled.length) {
    ws.addRow([]);
    ws.addRow([`Appuntamenti annullati nel periodo: ${data.cancelled.length} (vedi il calendario allegato)`]).font = { italic: true, color: { argb: 'FF6B7280' } };
  }

  // --- Un foglio per giorno ---
  for (const day of data.perDay) {
    const name = cap(dayLabel(day.date, 'ccc d-LL'));
    const s = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    s.addRow([`${cap(dayLabel(day.date))} – ${day.appts.length} appuntamenti`]).font = TITLE_FONT;
    s.addRow([]);
    const h = s.addRow(['Ora', 'Fine', 'Medico', 'Paziente', 'Telefono', 'Prestazione', 'Stato', 'Note']);
    styleHeader(h);
    if (!day.appts.length) s.addRow(['', '', '', 'Nessun appuntamento']).font = { italic: true, color: { argb: 'FF6B7280' } };
    for (const a of day.appts) {
      const notes = [a.source === 'ONLINE' ? 'Prenotato online' : null, a.notes].filter(Boolean).join(' – ');
      const r = s.addRow([hm(a.start), hm(a.end), docName(a.doctor), `${a.patient.lastName} ${a.patient.firstName}`, a.patient.phone || '', a.service?.name || '', STATUS_LABEL[a.status], notes]);
      r.eachCell({ includeEmpty: true }, (c) => { c.border = BORDER; c.alignment = { vertical: 'top', wrapText: true }; });
    }
    if (day.appts.length) s.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + day.appts.length, column: 8 } };

    s.addRow([]);
    const fh = s.addRow(['Orari liberi', '', 'Medico', 'Fasce libere']);
    styleHeader(fh);
    for (const info of day.doctorsInfo) {
      const r = s.addRow(['', '', docName(info.doctor), freeText(info)]);
      s.mergeCells(r.number, 4, r.number, 8);
      r.getCell(3).border = BORDER;
      r.getCell(4).border = BORDER;
      r.getCell(4).alignment = { wrapText: true };
    }
    [7, 7, 22, 24, 15, 24, 15, 40].forEach((w, i) => { s.getColumn(i + 1).width = w; });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- Calendario .ics

const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Righe ICS lunghe al massimo 75 byte (RFC 5545) */
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function buildIcs(data) {
  const host = (() => { try { return new URL(config.frontendUrl).hostname; } catch { return 'hospardo'; } })();
  const stamp = icsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hospardo//Agenda studio//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`${config.clinic.name} – Appuntamenti`)}`, `X-WR-TIMEZONE:${TZ}`,
  ];
  for (const a of data.appointments) {
    const status = a.status === 'ANNULLATO' || a.status === 'NON_PRESENTATO' ? 'CANCELLED' : a.status === 'PRENOTATO' ? 'TENTATIVE' : 'CONFIRMED';
    const desc = [
      `Medico: ${docName(a.doctor)}`,
      a.service ? `Prestazione: ${a.service.name}` : null,
      a.patient.phone ? `Telefono: ${a.patient.phone}` : null,
      `Stato: ${STATUS_LABEL[a.status]}`,
      a.source === 'ONLINE' ? 'Prenotato online' : null,
      a.notes ? `Note: ${a.notes}` : null,
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:hospardo-appt-${a.id}@${host}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${icsDate(a.updatedAt)}`,
      // cresce a ogni modifica, così i calendari aggiornano l'evento importato in precedenza
      `SEQUENCE:${Math.max(0, Math.floor((a.updatedAt.getTime() - Date.UTC(2025, 0, 1)) / 60000))}`,
      `DTSTART:${icsDate(a.start)}`,
      `DTEND:${icsDate(a.end)}`,
      `SUMMARY:${icsEscape(`${a.patient.lastName} ${a.patient.firstName}${a.service ? ` – ${a.service.name}` : ''} (${a.doctor.lastName})`)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      config.clinic.address ? `LOCATION:${icsEscape(config.clinic.address)}` : null,
      `CATEGORIES:${icsEscape(docName(a.doctor))}`,
      `STATUS:${status}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- Email

function buildEmail(data) {
  const first = data.days[0];
  const last = data.days[data.days.length - 1];
  const subject = `Agenda ${dayLabel(first, 'd/LL')}–${dayLabel(last, 'd/LL')} – ${config.clinic.name}`;
  const rows = data.perDay.map((d) => {
    const perDoc = d.doctorsInfo.filter((i) => i.count).map((i) => `${i.doctor.lastName} ${i.count}`).join(', ');
    return { day: cap(dayLabel(d.date, 'cccc d LLLL')), total: d.appts.length, perDoc };
  });
  const text = [
    `Appuntamenti previsti dal ${dayLabel(first, 'd LLLL')} al ${dayLabel(last, 'd LLLL yyyy')} (domenica esclusa):`,
    '',
    ...rows.map((r) => `${r.day}: ${r.total}${r.perDoc ? ` (${r.perDoc})` : ''}`),
    '',
    'In allegato il file Excel (una scheda per giorno, con gli orari ancora liberi) e il calendario da importare in Outlook o Google Calendar.',
    '',
    `${config.clinic.name} – messaggio automatico di Hospardo`,
  ].join('\n');
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
    <p>Appuntamenti previsti dal <b>${esc(dayLabel(first, 'd LLLL'))}</b> al <b>${esc(dayLabel(last, 'd LLLL yyyy'))}</b> (domenica esclusa):</p>
    <table style="border-collapse:collapse">
      ${rows.map((r) => `<tr><td style="padding:4px 14px 4px 0">${esc(r.day)}</td><td style="padding:4px 14px 4px 0;text-align:right"><b>${r.total}</b></td><td style="color:#6b7280">${esc(r.perDoc)}</td></tr>`).join('')}
    </table>
    <p>In allegato il file Excel (una scheda per giorno, con gli orari ancora liberi) e il calendario da importare in Outlook o Google Calendar.</p>
    <p style="color:#6b7280">${esc(config.clinic.name)} – messaggio automatico di Hospardo</p></div>`;
  return { subject, text, html };
}

/** Prepara gli allegati del riepilogo per i giorni indicati (default: i prossimi giorni lavorativi) */
async function buildReport(now = new Date()) {
  const data = await collect(reportDays(now));
  const [xlsx, ics] = [await buildXlsx(data), buildIcs(data)];
  const base = `agenda-${data.days[0]}_${data.days[data.days.length - 1]}`;
  return { data, xlsx, ics, filenames: { xlsx: `${base}.xlsx`, ics: `${base}.ics` } };
}

/** Invia il riepilogo agli indirizzi configurati (REPORT_EMAIL) o a quelli indicati */
async function sendAgendaReport({ to = config.report.email, now = new Date() } = {}) {
  if (!to) throw new Error('Nessun destinatario: imposta REPORT_EMAIL in backend/.env');
  const { data, xlsx, ics, filenames } = await buildReport(now);
  const result = await sendMail({
    to,
    ...buildEmail(data),
    attachments: [
      { filename: filenames.xlsx, content: xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { filename: filenames.ics, content: ics, contentType: 'text/calendar; charset=utf-8' },
    ],
  });
  console.log(`Riepilogo agenda ${filenames.xlsx} → ${to}: ${result.status}`);
  return { ...result, to, days: data.days, appointments: data.perDay.reduce((n, d) => n + d.appts.length, 0) };
}

function startReportScheduler() {
  if (!config.report.email) {
    console.log('Riepilogo serale disattivato (REPORT_EMAIL non impostato)');
    return;
  }
  const [h, m] = config.report.time.split(':').map(Number);
  cron.schedule(`${m} ${h} * * *`, () => {
    sendAgendaReport().catch((e) => console.error('Errore invio riepilogo agenda:', e.message));
  }, { timezone: TZ });
  console.log(`Riepilogo serale attivo: ogni giorno alle ${config.report.time} a ${config.report.email}`);
}

module.exports = { reportDays, freeIntervals, collect, buildXlsx, buildIcs, buildReport, sendAgendaReport, startReportScheduler };
