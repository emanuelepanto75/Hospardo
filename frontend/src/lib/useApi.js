import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Carica dati da un endpoint GET e li ricarica quando cambiano le dipendenze */
export function useApi(path, query, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([path, query]);

  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    setLoading(true);
    return api(path, { query })
      .then((d) => { setData(d); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
