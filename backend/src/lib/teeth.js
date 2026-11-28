/** Numerazione FDI dei denti e valori ammessi per la cartella dentale */
const PERMANENT = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
const DECIDUOUS = [51, 52, 53, 54, 55, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 81, 82, 83, 84, 85];
const ALL_TEETH = new Set([...PERMANENT, ...DECIDUOUS]);
const TOOTH_STATUS = ['SANO', 'CARIE', 'OTTURATO', 'DEVITALIZZATO', 'CORONA', 'IMPIANTO', 'PONTE', 'MANCANTE', 'DA_ESTRARRE'];
/** O occlusale/incisale, M mesiale, D distale, V vestibolare, L linguale/palatale */
const SURFACES = ['O', 'M', 'D', 'V', 'L'];
const SURFACE_STATUS = ['CARIE', 'OTTURAZIONE'];

module.exports = { PERMANENT, DECIDUOUS, ALL_TEETH, TOOTH_STATUS, SURFACES, SURFACE_STATUS };
