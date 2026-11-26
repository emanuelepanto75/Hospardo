import { useEffect, useState } from 'react';
import { APP_VERSION } from '../lib/version';

/**
 * Se sul server è installata una versione diversa da quella aperta nel browser (pagina rimasta aperta
 * dopo un aggiornamento), propone di ricaricare. Controlla ogni 5 minuti e quando si torna sulla scheda.
 */
export default function UpdateNotice() {
  const [server, setServer] = useState(null);
  useEffect(() => {
    const check = () => fetch('/api/version', { cache: 'no-store' }).then((r) => r.json()).then((v) => setServer(v.version)).catch(() => {});
    check();
    const t = setInterval(check, 5 * 60000);
    const onFocus = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, []);
  if (!server || server === APP_VERSION) return null;
  return (
    <div className="update-notice">
      È disponibile la versione <b>{server}</b> (questa pagina è la {APP_VERSION}).
      <button className="btn btn-sm" onClick={() => window.location.reload()}>Ricarica la pagina</button>
    </div>
  );
}
