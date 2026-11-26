/**
 * Promemoria ai medici: per ogni medico la prima data utile (da domani in poi) in cui ha appuntamenti,
 * con invio dell'elenco via email o WhatsApp con un clic. Segreteria e amministratori.
 */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { ah, HttpError, notFound } = require('../lib/errors');
const { requireRole } = require('../middleware/auth');
const { DateTime, TZ, dayBounds } = require('../lib/time');
const { normalizePhone } = require('../lib/phone');
const { sendMail, emailEnabled } = require('../services/mailer');

router.use(requireRole('ADMIN', 'SEGRETERIA'));

const ACTIVE = ['PRENOTATO', 'CONFERMATO'];
const LOOKAHEAD_DAYS = 60;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida');
const dateOnly = (iso) => new Date(`${iso}T00:00:00.000Z`);
const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');
const localIso = (d) => DateTime.fromJSDate(d).setZone(TZ).toISODate();
const hm = (d) => DateTime.fromJSDate(d).setZone(TZ).toFormat('HH:mm');
const dayLabel = (iso) => DateTime.fromISO(iso, { zone: TZ }).setLocale('it').toFormat('cccc d LLLL');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function appointmentsOf(doctorId, iso) {
  const { start, end } = dayBounds(iso);
  return prisma.appointment.findMany({
    where: { doctorId, status: { in: ACTIVE }, start: { gte: start, lt: end } },
    include: { patient: { select: { firstName: true, lastName: true, phone: true } }, service: { select: { name: true } } },
    orderBy: { start: 'asc' },
  });
}

/** Testo WhatsApp: per riservatezza solo cognome e iniziale del nome */
function whatsappText(doctor, iso, appts) {
  const lines = appts.map((a) => `• ${hm(a.start)} ${a.patient.lastName} ${a.patient.firstName.charAt(0)}.${a.service ? ` – ${a.service.name}` : ''}`);
  return [
    `Buongiorno ${docName(doctor)}, le ricordiamo gli appuntamenti di ${dayLabel(iso)} presso ${config.clinic.name}:`,
    ...lines,
    `Totale: ${appts.length}. Per variazioni contatti la segreteria.`,
  ].join('\n');
}

function whatsappLinkFor(doctor, iso, appts) {
  const phone = normalizePhone(doctor.phone, config.whatsapp.defaultCountryCode);
  if (!phone) return null;
  const text = whatsappText(doctor, iso, appts);
  return { phone: `+${phone}`, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
}

/** Per ogni medico attivo: prima data utile con appuntamenti, a partire da `from` (default domani) */
router.get('/', ah(async (req, res) => {
  const from = isoDay.optional().parse(req.query.from) || DateTime.now().setZone(TZ).plus({ days: 1 }).toISODate();
  const start = dayBounds(from).start;
  const end = DateTime.fromISO(from, { zone: TZ }).plus({ days: LOOKAHEAD_DAYS }).toJSDate();
  const [doctors, appts] = await Promise.all([
    prisma.doctor.findMany({ where: { active: true, archivedAt: null }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.appointment.findMany({ where: { status: { in: ACTIVE }, start: { gte: start, lt: end } }, select: { doctorId: true, start: true }, orderBy: { start: 'asc' } }),
  ]);
  const firstDate = new Map();
  for (const a of appts) if (!firstDate.has(a.doctorId)) firstDate.set(a.doctorId, localIso(a.start));

  const rows = [];
  for (const d of doctors) {
    const iso = firstDate.get(d.id);
    if (!iso) { rows.push({ doctor: d, date: null }); continue; }
    const list = await appointmentsOf(d.id, iso);
    const sent = await prisma.doctorReminder.findMany({ where: { doctorId: d.id, date: dateOnly(iso) }, orderBy: { createdAt: 'desc' } });
    rows.push({
      doctor: { id: d.id, title: d.title, firstName: d.firstName, lastName: d.lastName, color: d.color, specialty: d.specialty, email: d.email, phone: d.phone },
      date: iso,
      count: list.length,
      first: hm(list[0].start),
      last: hm(list[list.length - 1].end),
      whatsapp: whatsappLinkFor(d, iso, list),
      emailSent: sent.find((s) => s.channel === 'EMAIL' && s.status !== 'ERRORE') || null,
      emailError: sent[0]?.channel === 'EMAIL' && sent[0].status === 'ERRORE' ? sent[0].error : null,
      whatsappSent: sent.find((s) => s.channel === 'WHATSAPP') || null,
    });
  }
  // prima i medici con appuntamenti, in ordine di data
  rows.sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date || '').localeCompare(b.date || ''));
  res.json({ from, emailEnabled: emailEnabled(), rows });
}));

/** Elenco degli appuntamenti del medico in quella data (anteprima) */
router.get('/:doctorId/:date', ah(async (req, res) => {
  const iso = isoDay.parse(req.params.date);
  const list = await appointmentsOf(Number(req.params.doctorId), iso);
  res.json(list.map((a) => ({ id: a.id, time: hm(a.start), end: hm(a.end), patient: `${a.patient.lastName} ${a.patient.firstName}`, phone: a.patient.phone, service: a.service?.name || '', notes: a.notes })));
}));

router.post('/:doctorId/email', ah(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: Number(req.params.doctorId) } });
  if (!doctor) throw notFound('Medico');
  const iso = isoDay.parse(req.body?.date);
  if (!doctor.email) throw new HttpError(400, 'Il medico non ha un indirizzo email: inseriscilo nella sua scheda');
  const list = await appointmentsOf(doctor.id, iso);
  if (!list.length) throw new HttpError(400, 'Nessun appuntamento in quella data');
  const title = `Appuntamenti di ${dayLabel(iso)}`;
  const text = [
    `Buongiorno ${docName(doctor)},`, '', `ecco gli appuntamenti di ${dayLabel(iso)} presso ${config.clinic.name}:`, '',
    ...list.map((a) => `${hm(a.start)}-${hm(a.end)}  ${a.patient.lastName} ${a.patient.firstName}${a.service ? ` – ${a.service.name}` : ''}${a.notes ? ` (${a.notes})` : ''}`),
    '', `Totale: ${list.length}.`, 'Per variazioni contatti la segreteria.', '', config.clinic.name,
  ].join('\n');
  const html = `<p>Buongiorno ${esc(docName(doctor))},</p><p>ecco gli appuntamenti di <b>${esc(dayLabel(iso))}</b> presso ${esc(config.clinic.name)}:</p>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
    <tr style="background:#e0f2f7"><th align="left">Ora</th><th align="left">Paziente</th><th align="left">Prestazione</th><th align="left">Note</th></tr>
    ${list.map((a) => `<tr style="border-bottom:1px solid #e5e7eb"><td><b>${hm(a.start)}</b>–${hm(a.end)}</td><td>${esc(a.patient.lastName)} ${esc(a.patient.firstName)}</td><td>${esc(a.service?.name || '')}</td><td>${esc(a.notes || '')}</td></tr>`).join('')}
    </table><p>Totale: <b>${list.length}</b>. Per variazioni contatti la segreteria.</p><p style="color:#6b7280">${esc(config.clinic.name)}</p>`;
  const base = { doctorId: doctor.id, date: dateOnly(iso), channel: 'EMAIL', recipient: doctor.email, count: list.length, sentById: req.user.id };
  try {
    const r = await sendMail({ to: doctor.email, subject: `${title} – ${config.clinic.name}`, text, html });
    const rec = await prisma.doctorReminder.create({ data: { ...base, status: r.status } });
    res.json(rec);
  } catch (e) {
    await prisma.doctorReminder.create({ data: { ...base, status: 'ERRORE', error: String(e.message || e).slice(0, 500) } });
    throw new HttpError(502, `Email non inviata: ${e.message || e}`);
  }
}));

/** WhatsApp con un clic: registra che la segreteria ha aperto il messaggio */
router.post('/:doctorId/whatsapp', ah(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: Number(req.params.doctorId) } });
  if (!doctor) throw notFound('Medico');
  const iso = isoDay.parse(req.body?.date);
  const count = (await appointmentsOf(doctor.id, iso)).length;
  const rec = await prisma.doctorReminder.create({
    data: { doctorId: doctor.id, date: dateOnly(iso), channel: 'WHATSAPP', status: 'MANUALE', recipient: doctor.phone || '', count, sentById: req.user.id },
  });
  res.json(rec);
}));

module.exports = router;
