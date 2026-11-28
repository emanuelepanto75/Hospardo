import { api } from '../lib/api';
import { waHref, waTarget } from '../lib/whatsapp';

/**
 * Apre WhatsApp (app o web) sulla chat del paziente con il messaggio già scritto.
 * L'invio vero lo fa l'operatore premendo Invio in WhatsApp; qui registriamo che il messaggio è stato preparato.
 */
export default function WhatsAppButton({ appointmentId, link, kind, label, optIn = true, onLogged, small = true }) {
  if (!link) return <span className="muted small" title="Inserisci un cellulare nella scheda paziente">Nessun cellulare</span>;
  if (!optIn) return <span className="muted small">Non desidera WhatsApp</span>;
  return (
    <a
      className={`btn btn-wa ${small ? 'btn-sm' : ''}`}
      href={waHref(link.url)}
      target={waTarget(waHref(link.url))}
      rel="noopener noreferrer"
      title={`Apre WhatsApp per ${link.phone} con il messaggio pronto`}
      onClick={() => {
        api(`/appointments/${appointmentId}/whatsapp`, { method: 'POST', body: { kind } })
          .then((r) => onLogged?.(r))
          .catch(() => {});
      }}
    >
      <WaIcon /> {label}
    </a>
  );
}

function WaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3z" />
    </svg>
  );
}
