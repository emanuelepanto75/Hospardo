/**
 * Copia di emergenza dell'agenda: un unico file HTML autosufficiente (stili e ricerca inclusi)
 * che i PC dello studio scaricano periodicamente e aprono anche senza internet. Sola lettura.
 */
const prisma = require('../lib/prisma');
const config = require('../lib/config');
const { DateTime, TZ, dayBounds } = require('../lib/time');

const DAYS = 7; // oggi + i giorni successivi, domenica esclusa
const STATUS = {
  PRENOTATO: 'Prenotato', CONFERMATO: 'Confermato', IN_ATTESA: 'In sala d\'attesa',
  COMPLETATO: 'Completato', NON_PRESENTATO: 'Non presentato',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');
const hm = (d) => DateTime.fromJSDate(d).setZone(TZ).toFormat('HH:mm');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function snapshotDays(now = new Date()) {
  const out = [];
  let d = DateTime.fromJSDate(now).setZone(TZ).startOf('day');
  while (out.length < DAYS) {
    if (d.weekday !== 7) out.push(d.toISODate());
    d = d.plus({ days: 1 });
  }
  return out;
}

async function buildSnapshotHtml(now = new Date()) {
  const days = snapshotDays(now);
  const from = dayBounds(days[0]).start;
  const to = dayBounds(days[days.length - 1]).end;
  const [appointments, requests] = await Promise.all([
    prisma.appointment.findMany({
      where: { start: { gte: from, lt: to }, status: { not: 'ANNULLATO' } },
      include: { patient: true, doctor: true, service: true },
      orderBy: [{ start: 'asc' }],
    }),
    prisma.bookingRequest.findMany({
      where: { status: 'NUOVA' },
      include: { doctor: true, service: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const generated = DateTime.fromJSDate(now).setZone(TZ).setLocale('it');
  const daySections = days.map((iso) => {
    const { start, end } = dayBounds(iso);
    const appts = appointments.filter((a) => a.start >= start && a.start < end);
    const label = cap(DateTime.fromISO(iso, { zone: TZ }).setLocale('it').toFormat('cccc d LLLL yyyy'));
    if (!appts.length) {
      return `<section class="day"><h2>${esc(label)} <small>nessun appuntamento</small></h2></section>`;
    }
    const byDoctor = new Map();
    for (const a of appts) {
      if (!byDoctor.has(a.doctorId)) byDoctor.set(a.doctorId, { doctor: a.doctor, items: [] });
      byDoctor.get(a.doctorId).items.push(a);
    }
    const doctors = [...byDoctor.values()].sort((x, y) => x.doctor.lastName.localeCompare(y.doctor.lastName));
    return `<section class="day"><h2>${esc(label)} <small>${appts.length} appuntamenti</small></h2>${doctors.map(({ doctor, items }) => `
      <div class="doc"><h3><span class="dot" style="background:${esc(doctor.color)}"></span>${esc(docName(doctor))}${doctor.specialty ? ` <small>${esc(doctor.specialty)}</small>` : ''}</h3>
      <table><thead><tr><th>Ora</th><th>Fine</th><th>Paziente</th><th>Telefono</th><th>Prestazione</th><th>Stato</th><th>Note</th></tr></thead><tbody>
      ${items.map((a) => `<tr class="row"><td><b>${hm(a.start)}</b></td><td>${hm(a.end)}</td><td><b>${esc(a.patient.lastName)} ${esc(a.patient.firstName)}</b></td>`
        + `<td>${a.patient.phone ? `<a href="tel:${esc(a.patient.phone.replace(/[^\d+]/g, ''))}">${esc(a.patient.phone)}</a>` : ''}</td>`
        + `<td>${esc(a.service?.name || '')}</td><td>${esc(STATUS[a.status] || a.status)}</td>`
        + `<td>${esc([a.source === 'ONLINE' ? 'Prenotato online' : '', a.notes].filter(Boolean).join(' – '))}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}</section>`;
  }).join('');

  const requestSection = requests.length ? `<section class="day"><h2>Richieste di prenotazione in attesa <small>${requests.length}</small></h2>
    <table><thead><tr><th>Ricevuta</th><th>Paziente</th><th>Telefono</th><th>Prestazione</th><th>Medico</th><th>Orario richiesto</th></tr></thead><tbody>
    ${requests.map((r) => `<tr class="row"><td>${esc(DateTime.fromJSDate(r.createdAt).setZone(TZ).toFormat('dd/LL HH:mm'))}</td>`
      + `<td><b>${esc(r.lastName)} ${esc(r.firstName)}</b></td><td><a href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a></td>`
      + `<td>${esc(r.service.name)}</td><td>${esc(docName(r.doctor))}</td>`
      + `<td>${r.preferredStart ? esc(DateTime.fromJSDate(r.preferredStart).setZone(TZ).setLocale('it').toFormat("ccc d LLL 'alle' HH:mm")) : esc(r.preferences || 'nessuna preferenza')}</td></tr>`).join('')}
    </tbody></table></section>` : '';

  const periodo = `${cap(DateTime.fromISO(days[0]).setLocale('it').toFormat('cccc d LLLL'))} – ${DateTime.fromISO(days[days.length - 1]).setLocale('it').toFormat('cccc d LLLL yyyy')}`;

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="hospardo-snapshot" content="${esc(generated.toISO())}">
<title>Agenda di emergenza – ${esc(config.clinic.name)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2937;background:#f4f6f9;font-size:14px}
  header{position:sticky;top:0;z-index:2;background:#7c2d12;color:#fff;padding:10px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  header b{font-size:16px} header .age{background:rgba(255,255,255,.15);padding:3px 10px;border-radius:99px}
  header .age.old{background:#fde68a;color:#7c2d12;font-weight:700}
  header input{margin-left:auto;padding:7px 10px;border-radius:6px;border:0;min-width:260px;font:inherit}
  main{max-width:1200px;margin:0 auto;padding:16px 20px 40px}
  .note{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;margin-bottom:14px}
  .day{background:#fff;border:1px solid #e3e7ee;border-radius:8px;padding:12px 16px;margin-bottom:14px}
  h2{margin:0 0 8px;font-size:17px;color:#0e7490} h2 small,h3 small{color:#6b7280;font-weight:400;font-size:13px;margin-left:8px}
  h3{margin:12px 0 6px;font-size:14px;display:flex;align-items:center;gap:8px} .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  table{width:100%;border-collapse:collapse} th{text-align:left;background:#e0f2f7;padding:5px 8px;font-size:12px} td{padding:5px 8px;border-bottom:1px solid #eef1f5;vertical-align:top}
  a{color:#0e7490} .hidden{display:none} #none{display:none;color:#6b7280;padding:20px;text-align:center}
  @media print{header{position:static;background:#fff;color:#000;border-bottom:2px solid #000} header input{display:none} body{background:#fff}}
</style></head>
<body>
<header>
  <b>COPIA DI EMERGENZA – SOLA LETTURA</b>
  <span>${esc(config.clinic.name)} · ${esc(periodo)}</span>
  <span class="age" id="age">aggiornata il ${esc(generated.toFormat("d LLLL 'alle' HH:mm"))}</span>
  <input id="q" type="search" placeholder="Cerca paziente, telefono, medico…" autofocus>
</header>
<main>
  <div class="note">Questa copia serve solo per consultare l'agenda quando manca il collegamento. <b>Non si possono fare modifiche</b>:
  annota su carta nuovi appuntamenti e spostamenti e inseriscili nell'agenda appena torna la linea.</div>
  ${daySections}
  ${requestSection}
  <div id="none">Nessun risultato.</div>
</main>
<script>
(function () {
  var gen = new Date(${JSON.stringify(generated.toISO())});
  var age = document.getElementById('age');
  function tick() {
    var min = Math.round((Date.now() - gen.getTime()) / 60000);
    var when = min < 1 ? 'meno di un minuto fa' : min < 60 ? min + ' minuti fa' : Math.round(min / 60) + ' ore fa';
    age.textContent = 'aggiornata ' + when + ' (' + gen.toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ')';
    age.className = 'age' + (min > 30 ? ' old' : '');
  }
  tick(); setInterval(tick, 30000);
  var q = document.getElementById('q');
  q.addEventListener('input', function () {
    var t = q.value.trim().toLowerCase(), any = false;
    document.querySelectorAll('tr.row').forEach(function (r) {
      var ok = !t || r.textContent.toLowerCase().indexOf(t) >= 0; r.classList.toggle('hidden', !ok); if (ok) any = true;
    });
    document.querySelectorAll('.doc').forEach(function (d) { d.classList.toggle('hidden', !!t && !d.querySelector('tr.row:not(.hidden)')); });
    document.getElementById('none').style.display = t && !any ? 'block' : 'none';
  });
})();
</script>
</body></html>`;
}

module.exports = { buildSnapshotHtml, snapshotDays };
