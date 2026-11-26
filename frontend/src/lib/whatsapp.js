/**
 * Come aprire i messaggi WhatsApp preparati da Hospardo, scelto per ogni PC:
 * - "auto": link wa.me (pagina di WhatsApp che propone app o web)
 * - "app": direttamente l'app WhatsApp / WhatsApp Business installata sul PC
 * - "web": WhatsApp Web nel browser
 */
const KEY = 'hospardo:whatsapp';
export const WA_MODES = { auto: 'Chiedi ogni volta (wa.me)', app: 'App WhatsApp Business sul PC', web: 'WhatsApp Web nel browser' };

export function getWaMode() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
export function setWaMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* preferenza non salvabile */ }
}

/** Converte il link wa.me nel formato scelto */
export function waHref(url, mode = getWaMode()) {
  const m = /^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/.exec(url || '');
  if (!m || mode === 'auto') return url;
  const text = m[2] ? `&text=${m[2]}` : '';
  return mode === 'app' ? `whatsapp://send?phone=${m[1]}${text}` : `https://web.whatsapp.com/send?phone=${m[1]}${text}`;
}
