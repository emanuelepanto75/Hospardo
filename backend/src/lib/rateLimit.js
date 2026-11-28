const { HttpError } = require('./errors');

/**
 * Limitatore di richieste in memoria (per singola istanza del server).
 * keyFn: funzione (req) => chiave; di default IP + percorso.
 * onlyFailures: conta solo le richieste che finiscono con errore (es. password errata).
 */
function rateLimit({ max, windowMs, keyFn, onlyFailures = false, message = 'Troppe richieste, riprova più tardi' }) {
  const hits = new Map();
  // pulizia periodica per non far crescere la mappa all'infinito
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    hits.set(key, arr);
    if (arr.length >= max) return next(new HttpError(429, message));
    if (onlyFailures) {
      res.on('finish', () => { if (res.statusCode >= 400 && res.statusCode !== 429) arr.push(Date.now()); });
    } else {
      arr.push(now);
    }
    next();
  };
}

module.exports = { rateLimit };
