/** Preventivo / piano di cura in PDF (A4 verticale), con spazio per la firma di accettazione */
const PDFDocument = require('pdfkit');
const config = require('../lib/config');
const { DateTime, TZ } = require('../lib/time');

const NAVY = '#0f2f3a'; const TEAL = '#0e7490'; const MUTED = '#6b7280'; const LINE = '#d5dbe3';
const docName = (d) => [d.title, d.firstName, d.lastName].filter(Boolean).join(' ');
const euro = (cents) => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtDate = (d) => DateTime.fromJSDate(new Date(d)).setZone(TZ).toFormat('dd/LL/yyyy');
// le date "solo giorno" sono salvate a mezzanotte UTC
const fmtDay = (d) => DateTime.fromJSDate(new Date(d), { zone: 'utc' }).toFormat('dd/LL/yyyy');

function buildPlanPdf(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Preventivo ${plan.code}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
    const clinic = config.clinic;

    // intestazione
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(clinic.name || '', left, 48, { width: width * 0.6 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text([clinic.address, clinic.phone && `Tel. ${clinic.phone}`, clinic.email].filter(Boolean).join('\n'), { width: width * 0.6 });
    const headBottom = doc.y;
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13).text(`PREVENTIVO N. ${plan.code}`, left + width * 0.55, 48, { width: width * 0.45, align: 'right' });
    doc.fillColor(NAVY).font('Helvetica').fontSize(9).text(`Data: ${fmtDate(plan.createdAt)}`, { width: width * 0.45, align: 'right' });
    if (plan.validUntil) doc.text(`Valido fino al: ${fmtDay(plan.validUntil)}`, { width: width * 0.45, align: 'right' });
    doc.y = Math.max(doc.y, headBottom) + 14;
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(LINE).lineWidth(1).stroke();
    doc.moveDown(0.8);

    // paziente e medico
    const p = plan.patient;
    const boxTop = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('PAZIENTE', left, boxTop);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(`${p.lastName} ${p.firstName}`);
    doc.font('Helvetica').fontSize(9).fillColor(NAVY).text([
      p.fiscalCode && `C.F. ${p.fiscalCode}`,
      p.birthDate && `Nato/a il ${fmtDay(p.birthDate)}`,
      p.address, p.phone,
    ].filter(Boolean).join('\n'), { width: width / 2 - 10 });
    const leftBottom = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('ODONTOIATRA', left + width / 2, boxTop);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(docName(plan.doctor), left + width / 2, doc.y);
    doc.y = Math.max(leftBottom, doc.y) + 14;

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(12).text(plan.title, left, doc.y, { width });
    doc.moveDown(0.5);

    // tabella delle voci: #, Dente, Prestazione, Q.tà, Prezzo, Importo
    const cols = [24, 50, 0, 36, 72, 76];
    cols[2] = width - cols.reduce((a, b) => a + b, 0);
    const xs = cols.map((_, i) => left + cols.slice(0, i).reduce((a, b) => a + b, 0));
    const head = ['#', 'Dente', 'Prestazione', 'Q.tà', 'Prezzo', 'Importo'];
    const align = ['left', 'left', 'left', 'right', 'right', 'right'];
    function tableHead() {
      const y = doc.y;
      doc.rect(left, y, width, 18).fill('#e0f2f7');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5);
      head.forEach((h, i) => doc.text(h, xs[i] + 4, y + 5, { width: cols[i] - 8, align: align[i] }));
      doc.y = y + 20;
    }
    tableHead();
    plan.items.forEach((it, idx) => {
      doc.font('Helvetica').fontSize(9);
      const desc = it.description + (it.service && it.service.name !== it.description ? `\n${it.service.name}` : '');
      const h = Math.max(doc.heightOfString(desc, { width: cols[2] - 8 }), 11) + 8;
      if (doc.y + h > bottom() - 120) { doc.addPage(); tableHead(); }
      const y = doc.y;
      const cells = [
        String(idx + 1), it.tooth ? `${it.tooth}${it.surfaces ? ` ${it.surfaces}` : ''}` : '—', desc,
        String(it.quantity), euro(it.unitPriceCents), euro(it.quantity * it.unitPriceCents),
      ];
      doc.fillColor(NAVY);
      cells.forEach((c, i) => {
        if (i !== 2) { doc.fillColor(NAVY).font(i === 5 ? 'Helvetica-Bold' : 'Helvetica').text(c, xs[i] + 4, y + 4, { width: cols[i] - 8, align: align[i] }); return; }
        const [main, sub] = c.split('\n');
        doc.fillColor(NAVY).font('Helvetica').text(main, xs[i] + 4, y + 4, { width: cols[i] - 8 });
        if (sub) doc.fillColor(MUTED).fontSize(8).text(sub, { width: cols[i] - 8 }).fontSize(9);
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor(LINE).lineWidth(0.6).stroke();
      doc.y = y + h + 2;
    });

    // totali
    doc.moveDown(0.6);
    const tx = left + width - 230;
    const line = (label, value, bold) => {
      const y = doc.y;
      doc.fillColor(NAVY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11.5 : 9.5);
      doc.text(label, tx, y, { width: 140 });
      doc.text(value, tx + 140, y, { width: 90, align: 'right' });
      doc.moveDown(0.3);
    };
    if (plan.discountCents) {
      line('Totale prestazioni', euro(plan.subtotalCents));
      line('Sconto', `- ${euro(plan.discountCents)}`);
    }
    line('TOTALE', euro(plan.totalCents), true);

    if (plan.notes) {
      doc.moveDown(1);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('NOTE', left, doc.y);
      doc.fillColor(NAVY).font('Helvetica').fontSize(9).text(plan.notes, { width });
    }

    // dichiarazione e firme
    if (doc.y > bottom() - 110) doc.addPage();
    doc.moveDown(1.2);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(
      'Il presente preventivo ha carattere indicativo: il piano di cura potrà essere modificato in base all\'evoluzione clinica, previa comunicazione al paziente.'
      + (plan.validUntil ? ` Validità dell'offerta fino al ${fmtDay(plan.validUntil)}.` : ''),
      left, doc.y, { width },
    );
    doc.moveDown(2.5);
    const sy = doc.y;
    const sw = width / 2 - 30;
    doc.moveTo(left, sy + 24).lineTo(left + sw, sy + 24).strokeColor(NAVY).lineWidth(0.6).stroke();
    doc.moveTo(left + width - sw, sy + 24).lineTo(left + width, sy + 24).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text(`Il medico – ${docName(plan.doctor)}`, left, sy + 28, { width: sw })
      .text('Il paziente, per accettazione', left + width - sw, sy + 28, { width: sw });
    doc.text('Data ____________________', left, sy + 52, { width: sw });

    // piè di pagina
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text(`Preventivo n. ${plan.code} – ${p.lastName} ${p.firstName} – pagina ${i + 1} di ${range.count}`, left, doc.page.height - 34, { width, align: 'center' });
      doc.page.margins.bottom = keep;
    }
    doc.end();
  });
}

module.exports = { buildPlanPdf };
