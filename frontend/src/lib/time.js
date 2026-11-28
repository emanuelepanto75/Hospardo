import { DateTime, Settings } from 'luxon';

// Tutte le date sono mostrate nel fuso orario dello studio
export const TZ = 'Europe/Rome';
Settings.defaultZone = TZ;
Settings.defaultLocale = 'it';

export { DateTime };

export const fromISO = (s) => DateTime.fromISO(s);
export const fmtTime = (s) => DateTime.fromISO(s).toFormat('HH:mm');
export const fmtDate = (s) => DateTime.fromISO(s).toFormat('ccc d LLL yyyy');
export const fmtDateTime = (s) => DateTime.fromISO(s).toFormat("ccc d LLL yyyy, HH:mm");
export const fmtLongDate = (s) => DateTime.fromISO(s).toFormat('cccc d LLLL yyyy');
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const minToHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const euro = (cents) => (cents == null ? '' : (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }));

export const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
