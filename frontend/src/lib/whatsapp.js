/**
 * Come aprire i messaggi WhatsApp preparati da Hospardo, scelto per ogni PC:
 * - "auto": link wa.me (pagina di WhatsApp che propone app o web)
 * - "app": direttamente l'app WhatsApp / WhatsApp Business installata sul PC
 * - "web": WhatsApp Web nel browser
 */
const KEY = 'hospardo:whatsapp';
export const WA_MODES = { app: 'App WhatsApp sul PC (consigliato)', web: 'WhatsApp Web nel browser', auto: 'Pagina wa.me (chiede ogni volta)' };

export function getWaMode() {
  // predefinito: l'app installata sul PC (si apre direttamente, senza pagine intermedie)
  try { return localStorage.getItem(KEY) || 'app'; } catch { return 'app'; }
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

/** Finestra in cui aprire: l'app non apre schede; web e wa.me riusano sempre la stessa scheda */
export const waTarget = (href) => (href.startsWith('whatsapp:') ? undefined : 'hospardo-whatsapp');

/** Apre la chat con il messaggio pronto (usato dall'invio in sequenza) */
export function openWhatsapp(url) {
  const href = waHref(url);
  if (href.startsWith('whatsapp:')) window.location.href = href;
  else window.open(href, 'hospardo-whatsapp');
}
