/**
 * Lettura dei codici a barre.
 * I lettori USB "scrivono" il codice come una tastiera e premono Invio.
 * - EAN-8 / UPC / EAN-13 / GTIN-14: identificano il prodotto
 * - GS1-128 / GS1 DataMatrix (dispositivi medici, impianti): contengono più dati,
 *   es. (01) GTIN, (17) scadenza AAMMGG, (10) lotto, (21) numero di serie.
 *   Il lettore può restituirli con le parentesi, con il separatore GS (carattere 29)
 *   oppure senza separatori: si gestiscono tutti e tre i casi.
 */
const GS = '\u001d';
// AI a lunghezza fissa più comuni (lunghezza dei dati, esclusa la sigla)
const FIXED = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
// AI a lunghezza variabile (massimo)
const VARIABLE = { '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '240': 30, '241': 30, '250': 30, '90': 30, '91': 90, '92': 90, '93': 90 };

/** GTIN numerico → 14 cifre; altri codici: maiuscolo senza spazi */
function normalizeCode(code) {
  const c = String(code || '').trim().replace(/\s+/g, '');
  if (/^\d{8}$|^\d{12,14}$/.test(c)) return c.padStart(14, '0');
  return c.toUpperCase();
}

/** AAMMGG → data ISO (giorno 00 = ultimo giorno del mese) */
function gs1Date(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2)); const mm = Number(yymmdd.slice(2, 4)); let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = 2000 + yy; // per i dispositivi medici le date sono sempre in questo secolo
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function readAi(s) {
  for (const len of [2, 3, 4]) {
    const ai = s.slice(0, len);
    if (FIXED[ai] || VARIABLE[ai]) return ai;
  }
  return null;
}

/** Scompone un codice GS1. Restituisce null se non sembra un GS1 */
function parseGs1(input) {
  let s = String(input || '').replace(/^\][A-Za-z]\d/, '').replace(/\r|\n/g, '');
  if (!s) return null;
  const out = {};
  if (s.includes('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m; let any = false;
    while ((m = re.exec(s))) { out[m[1]] = m[2].replace(new RegExp(GS, 'g'), '').trim(); any = true; }
    return any ? out : null;
  }
  // forma "grezza": deve iniziare con un AI noto e contenere almeno un secondo campo
  s = s.replace(/^\u001d/, '');
  // un semplice EAN/GTIN non è un GS1 composto
  if (/^\d{8}$|^\d{12,14}$/.test(s) || s.length < 16) return null;
  if (!/^(01|02|00)\d/.test(s)) return null;
  while (s.length) {
    if (s[0] === GS) { s = s.slice(1); continue; }
    const ai = readAi(s);
    if (!ai) break;
    s = s.slice(ai.length);
    if (FIXED[ai]) {
      out[ai] = s.slice(0, FIXED[ai]);
      s = s.slice(FIXED[ai]);
    } else {
      const end = s.indexOf(GS);
      let val = end >= 0 ? s.slice(0, end) : s;
      // senza separatore: se dopo il lotto compare una data (17/11) con 6 cifre in coda, separala
      if (end < 0) {
        const tail = /(1[17])(\d{6})$/.exec(val);
        if (tail && val.length > 8 && gs1Date(tail[2])) { out[tail[1]] = tail[2]; val = val.slice(0, -8); }
      }
      out[ai] = val.slice(0, VARIABLE[ai]);
      s = end >= 0 ? s.slice(end) : '';
    }
  }
  return Object.keys(out).length > 1 || out['01'] ? out : null;
}

/** Risultato della lettura: codice da cercare + eventuali lotto, scadenza, seriale */
function readBarcode(raw) {
  const text = String(raw || '').trim();
  const gs1 = parseGs1(text);
  if (gs1) {
    return {
      raw: text,
      code: normalizeCode(gs1['01'] || gs1['02'] || text),
      gs1: true,
      lot: gs1['10'] || null,
      expiry: gs1Date(gs1['17'] || '') || null,
      serial: gs1['21'] || null,
      quantity: gs1['30'] || gs1['37'] ? Number(gs1['30'] || gs1['37']) : null,
    };
  }
  return { raw: text, code: normalizeCode(text), gs1: false, lot: null, expiry: null, serial: null, quantity: null };
}

module.exports = { readBarcode, normalizeCode, parseGs1, gs1Date };
