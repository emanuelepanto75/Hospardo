import { useApi } from '../lib/useApi';
import { DateTime } from '../lib/time';
import { APP_VERSION } from '../lib/version';

/** Novità: elenco delle versioni con cosa contengono */
export default function Releases() {
  const { data } = useApi('/releases');
  return (
    <div className="page">
      <h1>Novità</h1>
      <p className="muted" style={{ marginTop: -8 }}>Stai usando la versione <b>{APP_VERSION}</b>. Per segnalare un problema indica sempre il numero di versione che vedi in basso nel menu.</p>
      {!data ? <p className="muted">Caricamento…</p> : data.map((r) => (
        <div key={r.version} className={`card release ${r.version === APP_VERSION ? 'current' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Versione {r.version} <span className="muted small">– {r.title}</span></h2>
            <span className="muted small">{DateTime.fromISO(r.date).toFormat('d LLLL yyyy')}{r.version === APP_VERSION && <span className="badge" style={{ background: '#16a34a', marginLeft: 8 }}>in uso</span>}</span>
          </div>
          <ul>{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
